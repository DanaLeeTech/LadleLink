/**
 * Demo URL import with no server of ours.
 *
 * A browser cannot read a recipe site's page directly (CORS), so the page is
 * fetched through public reader services — started in random order so the demo
 * spreads its traffic — and our Cloudflare Worker (deploy/worker) is the last
 * resort. The recipe is then extracted in the visitor's browser by the same
 * parser the server would have used.
 */
import { parseRecipeHtml } from "@ladlelink/parser";
import type { ParsedRecipe } from "@ladlelink/types";

const SOURCE_TIMEOUT_MS = 8000;
const MAX_HTML_CHARS = 3 * 1024 * 1024;

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

async function fetchHtml(
  source: { url: string; headers?: Record<string, string> },
  fetchImpl: typeof fetch
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
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
  }
}

export async function importRecipeInBrowser(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<ParsedRecipe> {
  const target = assertHttpUrl(url);

  const candidates = READERS.map((build) => build(target));
  // Random start order so no single reader absorbs all the demo's traffic.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  if (IMPORT_WORKER_URL) {
    candidates.push({
      url: `${IMPORT_WORKER_URL}?url=${encodeURIComponent(target)}`,
    });
  }

  for (const source of candidates) {
    try {
      const html = await fetchHtml(source, fetchImpl);
      const parsed = parseRecipeHtml(html, target);
      if (parsed.title.trim()) return parsed;
    } catch {
      // Source blocked us, timed out, or found no recipe — try the next one.
    }
  }

  throw new Error(
    "Could not import a recipe from that page. The site may block automated requests, or no recipe was found."
  );
}
