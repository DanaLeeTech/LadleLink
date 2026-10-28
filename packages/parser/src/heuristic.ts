import * as cheerio from "cheerio";
import type { ParsedRecipe, RecipeSection } from "@ladlelink/types";
import { parseIngredientLine, parseServings } from "./ingredient-line.js";
import { looksLikeIngredientLine } from "./plaintext.js";

/** Page chrome that never holds recipe content. */
const CHROME = "script, style, noscript, nav, header, footer, aside, [role='navigation']";

const INGREDIENTS_HEADER = /^ingredients?\b/i;
const STEPS_HEADER = /^(instructions?|directions?|method|steps?)\b/i;
/** Headings that end a recipe region rather than group it ("For the icing"). */
const REGION_END =
  /^(ingredients?|method|instructions?|directions?|steps?|notes?|tips?|nutrition|equipment|reviews?|comments?|related|more recipes|you may also|subscribe|share|print)\b/i;
/** A real ingredient line carries an amount or a unit. */
const LOOKS_MEASURED = /\d|(?<![a-z])(?:cups?|tsp|tbsp|g|kg|ml|l|oz|lb|pinch|clove)s?(?![a-z])/i;

type Region = { items: string[]; sections: RecipeSection[] };

function text($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

function listItems($: cheerio.CheerioAPI, $list: cheerio.Cheerio<any>): string[] {
  return $list
    .find("li")
    .toArray()
    .map((el) => text($(el)))
    .filter(Boolean);
}

/** Menu and tag clouds are lists of links, not ingredient lists. */
function isMostlyLinks($: cheerio.CheerioAPI, $list: cheerio.Cheerio<any>): boolean {
  const items = $list.find("li").toArray();
  if (!items.length) return true;
  const linked = items.filter((el) => $(el).find("a").length > 0).length;
  return linked / items.length >= 0.5;
}

/** Collect the lists and subheadings after a region heading ("Ingredients", "Method"). */
function collectRegion(
  $: cheerio.CheerioAPI,
  $heading: cheerio.Cheerio<any>,
  kind: RecipeSection["kind"]
): Region {
  const items: string[] = [];
  const sections: RecipeSection[] = [];
  let title: string | null = null;

  const addList = ($list: cheerio.Cheerio<any>) => {
    if (isMostlyLinks($, $list)) return;
    const lines = listItems($, $list);
    if (!lines.length) return;
    if (title) {
      sections.push({ kind, at: items.length, title });
      title = null;
    }
    items.push(...lines);
  };

  /** Plain `<p>` lines used as a list; prose and nav text never counts. */
  const addParagraph = ($p: cheerio.Cheerio<any>) => {
    const line = text($p);
    if (!line) return;
    if (kind === "ingredients" ? !looksLikeIngredientLine(line) : line.length <= 20) return;
    if (title) {
      sections.push({ kind, at: items.length, title });
      title = null;
    }
    items.push(line);
  };

  /** Walk descendants of a wrapper element so headings inside divs still group lists. */
  function scanInto($container: cheerio.Cheerio<any>): void {
    $container.children().each((_, child) => {
      const $child = $(child);
      if ($child.is("h1")) return false;
      if ($child.is("h2") && REGION_END.test(text($child))) return false;
      if ($child.is("h2, h3, h4, h5, h6, legend")) {
        const heading = text($child);
        if (heading && heading.length <= 60) title = heading;
      } else if ($child.is("ul, ol")) {
        addList($child);
      } else if ($child.is("p")) {
        addParagraph($child);
      } else {
        scanInto($child);
      }
      return undefined;
    });
  }

  let $el = $heading.next();
  while ($el.length) {
    if ($el.is("h1")) break;
    if ($el.is("h2") && REGION_END.test(text($el))) break;
    if ($el.is("h2, h3, h4, h5, h6, legend")) {
      const heading = text($el);
      if (heading && heading.length <= 60) title = heading;
    } else if ($el.is("ul, ol")) {
      addList($el);
    } else if ($el.is("p")) {
      addParagraph($el);
    } else {
      scanInto($el);
    }
    $el = $el.next();
  }

  return { items, sections };
}

/** First "Serves 4" / "4 servings" on the page, including split label/value markup. */
function findServingsText($: cheerio.CheerioAPI): string {
  const candidates = $("*")
    .filter((_, el) => {
      const t = text($(el));
      return t.length > 0 && t.length < 80 && /(?:servings?|serves|yield|makes)/i.test(t);
    })
    .toArray();

  for (const el of candidates) {
    const t = text($(el));
    const after = t.match(/(?:servings?|serves|yield|makes)\s*:?\s*(\d+(?:\.\d+)?)/i);
    if (after) return after[1];
    const before = t.match(/(\d+(?:\.\d+)?)\s*(?:servings?|serves|people)\b/i);
    if (before) return before[1];
  }
  return "";
}

/** Last resort: the list that looks most like ingredients, skipping menus. */
function bestIngredientList($: cheerio.CheerioAPI): string[] {
  let best: string[] = [];
  let bestScore = 0;
  $("ul, ol").each((_, el) => {
    const $list = $(el);
    if (isMostlyLinks($, $list)) return;
    const items = listItems($, $list);
    const score = items.filter((t) => LOOKS_MEASURED.test(t)).length;
    if (score > bestScore) {
      best = items;
      bestScore = score;
    }
  });
  return best;
}

export function parseHeuristic(html: string, sourceUrl: string): ParsedRecipe | null {
  const $ = cheerio.load(html);
  $(CHROME).remove();

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").text().trim() ||
    "Untitled recipe";

  const ingredientHeader = $("h2, h3, h4, legend")
    .filter((_, el) => INGREDIENTS_HEADER.test(text($(el))))
    .first();

  let ingredients: Region = ingredientHeader.length
    ? collectRegion($, ingredientHeader, "ingredients")
    : { items: [], sections: [] };

  if (!ingredients.items.length) {
    ingredients = { items: bestIngredientList($), sections: [] };
  }

  const stepsHeader = $("h2, h3, h4, legend")
    .filter((_, el) => STEPS_HEADER.test(text($(el))))
    .first();

  let steps: Region = stepsHeader.length
    ? collectRegion($, stepsHeader, "steps")
    : { items: [], sections: [] };

  if (!steps.items.length && stepsHeader.length) {
    steps = {
      items: stepsHeader
        .nextUntil("h1, h2")
        .filter("p")
        .toArray()
        .map((el) => text($(el)))
        .filter((t) => t.length > 20),
      sections: [],
    };
  }

  // A title alone is not a recipe: demand several measured ingredient lines plus steps.
  const measured = ingredients.items.filter((line) => LOOKS_MEASURED.test(line)).length;
  if (measured < 3 || !steps.items.length) return null;

  const photoUrl =
    $('meta[property="og:image"]').attr("content") ||
    $("article img, .recipe img, img").first().attr("src") ||
    null;

  const sections = [...ingredients.sections, ...steps.sections].filter(
    (section) => section.at <= (section.kind === "ingredients" ? ingredients.items.length : steps.items.length)
  );

  const recipe: ParsedRecipe = {
    title,
    servings: parseServings(findServingsText($) || 1),
    ingredients: ingredients.items.map(parseIngredientLine),
    steps: steps.items,
    photoUrl,
    sourceUrl,
  };
  if (sections.length) recipe.sections = sections;
  return recipe;
}
