import type { ParsedRecipe } from "@ladlelink/types";
import { parseJsonLd } from "./jsonld.js";
import { parseMicrodata } from "./microdata.js";
import { parseHeuristic } from "./heuristic.js";
import { cleanRecipeText, parseIngredientLine } from "./ingredient-line.js";

export {
  parseIngredientLine,
  cleanRecipeText,
  decodeHtmlEntities,
  formatStepsForEditor,
  parseStepsFromEditor,
  stripStepNumber,
} from "./ingredient-line.js";
export { parseJsonLd } from "./jsonld.js";
export { parseMicrodata } from "./microdata.js";
export { parseHeuristic } from "./heuristic.js";
export {
  parseRecipeText,
  repairOcrLine,
  isNoiseLine,
  looksLikeIngredientLine,
  scoreParsedRecipe,
} from "./plaintext.js";

export const USER_AGENT =
  "LadleLink/0.1 (+local; user-initiated recipe import; not a crawler)";

export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export interface FetchPageOptions {
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchRecipePage(
  url: string,
  options: FetchPageOptions = {}
): Promise<{ html: string; finalUrl: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const userAgent = options.userAgent ?? USER_AGENT;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("fetch is not available in this environment");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch recipe page: HTTP ${response.status}`);
    }
    const html = await response.text();
    return { html, finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

export function parseRecipeHtml(html: string, sourceUrl: string): ParsedRecipe {
  const parsed =
    parseJsonLd(html, sourceUrl) ||
    parseMicrodata(html, sourceUrl) ||
    parseHeuristic(html, sourceUrl);

  if (!parsed) {
    throw new Error("Could not extract a recipe from this page");
  }

  // Drop empty ingredient rows; decode entities in free text fields
  parsed.ingredients = parsed.ingredients.filter((i) => i.name.trim().length > 0);
  if (!parsed.ingredients.length) {
    throw new Error("Could not extract ingredients from this page");
  }
  parsed.title = cleanRecipeText(parsed.title);
  parsed.steps = parsed.steps.map(cleanRecipeText).filter(Boolean);
  if (parsed.notes) parsed.notes = cleanRecipeText(parsed.notes);
  return parsed;
}

export async function importRecipeFromUrl(
  url: string,
  options: FetchPageOptions = {}
): Promise<ParsedRecipe> {
  const { html, finalUrl } = await fetchRecipePage(url, options);
  return parseRecipeHtml(html, finalUrl);
}

export function parseIngredientLines(lines: string[]) {
  return lines.map(parseIngredientLine);
}
