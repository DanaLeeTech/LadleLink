/**
 * Demo URL import with no server of ours.
 *
 * A browser cannot read a recipe site's page directly (CORS), so the page is
 * fetched through public reader services — r.jina.ai first, the others as
 * fallbacks — and our Cloudflare Worker (deploy/worker) is the last resort. The
 * recipe is then extracted in the visitor's browser by the same parser the
 * server would have used.
 */
import { NotARecipeError, parseRecipeHtml, parseRecipeText } from "@ladlelink/parser";
import type { ParsedRecipe } from "@ladlelink/types";

const SOURCE_TIMEOUT_MS = 6000;
const MAX_HTML_CHARS = 3 * 1024 * 1024;

export interface ImportProgressOptions {
  /** Aborts every in-flight request (Cancel button). */
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

const READERS: Array<(target: string) => { url: string; headers?: Record<string, string> }> = [
  (target) => ({
    url: `https://r.jina.ai/${target}`,
    headers: { "X-Return-Format": "html" },
  }),
  (target) => ({
    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  }),
  (target) => ({
    url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  }),
];

/**
 * Last resort: our Cloudflare Worker (deploy/worker). The Pages workflow injects
 * it from the IMPORT_WORKER_URL repo secret; empty means readers only.
 */
declare const __IMPORT_WORKER_URL__: string;

export const IMPORT_WORKER_URL =
  typeof __IMPORT_WORKER_URL__ !== "undefined" ? __IMPORT_WORKER_URL__ : "";

function assertHttpUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https recipe links can be imported");
  }
  return parsed.toString();
}

/** Page chrome, 404s and challenge screens that must never pass as a recipe. */
const JUNK_TITLE =
  /^(?:untitled recipe|(?:404|403|500)\b|not found|page not found|access denied|forbidden|just a moment|attention required|verify you are human|checking your browser|error\b)/i;

/** Below this, a response is a shell (blank, JS app, rate-limit notice), not a page. */
const MIN_PAGE_CHARS = 200;

/** Blocking interstitials only — a reader may still get past these. */
const CHALLENGE_TITLE =
  /^(?:just a moment|attention required|verify you are human|checking your browser|access denied|forbidden|403\b)/i;

/**
 * Whether a reader returned a real page or a challenge/blank shell. Any page
 * with a normal body counts as real — a site's own 404 is still that site
 * answering, so every reader would return the same thing. Only a challenge
 * screen or an empty shell means another reader is worth a try.
 */
export function looksLikeRealPage(html: string): boolean {
  if (html.trim().length < MIN_PAGE_CHARS) return false;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  return !CHALLENGE_TITLE.test(title);
}

/**
 * Acceptance gate for the markdown fallback — the same shape the HTML heuristic
 * demands: a real recipe title, a measured ingredient list and some steps.
 */
function isUsableRecipe(parsed: ParsedRecipe): boolean {
  if (!parsed.title.trim() || JUNK_TITLE.test(parsed.title)) return false;
  if (!parsed.steps.length) return false;
  return parsed.ingredients.filter((ingredient) => ingredient.quantity > 0).length >= 3;
}

async function fetchHtml(
  source: { url: string; headers?: Record<string, string> },
  fetchImpl: typeof fetch,
  outer?: AbortSignal
): Promise<string> {
  if (outer?.aborted) throw new Error("Import cancelled");
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, SOURCE_TIMEOUT_MS);
  outer?.addEventListener("abort", abort);
  try {
    const response = await fetchImpl(source.url, {
      headers: source.headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (html.length > MAX_HTML_CHARS) throw new Error("Page too large");
    return html;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}

export async function importRecipeInBrowser(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  options: ImportProgressOptions = {}
): Promise<ParsedRecipe> {
  const target = assertHttpUrl(url);
  const { signal, onProgress } = options;

  const candidates = READERS.map((build) => build(target));
  if (IMPORT_WORKER_URL) {
    candidates.push({
      url: `${IMPORT_WORKER_URL}?url=${encodeURIComponent(target)}`,
    });
  }

  onProgress?.("Fetching…");
  for (const source of candidates) {
    if (signal?.aborted) throw new Error("Import cancelled");
    let html: string;
    try {
      html = await fetchHtml(source, fetchImpl, signal);
    } catch {
      if (signal?.aborted) throw new Error("Import cancelled");
      // Blocked or timed out — another reader may still get through.
      continue;
    }

    onProgress?.("Reading recipe…");
    try {
      const parsed = parseRecipeHtml(html, target);
      if (parsed.title.trim()) return parsed;
    } catch (err) {
      // Cancel wins over anything the parser says.
      if (signal?.aborted) throw new Error("Import cancelled");
      // An unexpected parser failure says nothing about the page — try a reader.
      if (!(err instanceof NotARecipeError)) continue;
    }
    // The page came back but holds no recipe. A real page means every reader
    // returns the same thing, so retrying them only wastes the visitor's time; a
    // challenge, blank or very short shell means another reader may get through.
    if (looksLikeRealPage(html)) break;
  }

  // JS-rendered and Cloudflare-protected pages have no recipe in their raw HTML.
  // r.jina.ai renders them; its markdown default is parsed as plain text.
  try {
    const markdown = await fetchHtml({ url: `https://r.jina.ai/${target}` }, fetchImpl, signal);
    // Raw HTML means the reader didn't render the page — nothing new to parse.
    if (/^\s*<(?:!doctype|html)\b/i.test(markdown)) {
      throw new Error("Not a reader view");
    }
    const parsed = parseRecipeText(markdown);
    if (isUsableRecipe(parsed)) return { ...parsed, sourceUrl: target };
  } catch {
    if (signal?.aborted) throw new Error("Import cancelled");
  }

  throw new Error(
    "No recipe found on that page — it may not be a recipe page, or the site blocks automated requests."
  );
}
