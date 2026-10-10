import * as cheerio from "cheerio";
import type { ParsedRecipe } from "@ladlelink/types";
import { parseIngredientLine, parseServings } from "./ingredient-line.js";

export function parseHeuristic(html: string, sourceUrl: string): ParsedRecipe | null {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").text().trim() ||
    "Untitled recipe";

  const servingsText =
    $("*:contains('Servings'), *:contains('Serves'), *:contains('Yield')")
      .filter((_, el) => {
        const t = $(el).clone().children().remove().end().text();
        return /servings?|serves|yield/i.test(t) && t.length < 80;
      })
      .first()
      .text() || "";

  function listAfter($: cheerio.CheerioAPI, $header: cheerio.Cheerio<any>): string[] {
    if (!$header.length) return [];
    let $el = $header.next();
    while ($el.length) {
      if ($el.is("ul, ol")) {
        return $el
          .find("li")
          .toArray()
          .map((el) => $(el).text().replace(/\s+/g, " ").trim())
          .filter(Boolean);
      }
      const nested = $el.find("ul, ol").first();
      if (nested.length) {
        return nested
          .find("li")
          .toArray()
          .map((el) => $(el).text().replace(/\s+/g, " ").trim())
          .filter(Boolean);
      }
      if ($el.is("h1, h2, h3, h4")) break;
      $el = $el.next();
    }
    return [];
  }

  let ingredientLines: string[] = [];
  const ingredientHeader = $("h2, h3, h4, legend")
    .filter((_, el) => /^ingredients?$/i.test($(el).text().trim()))
    .first();

  ingredientLines = listAfter($, ingredientHeader);

  if (!ingredientLines.length) {
    let best: string[] = [];
    $("ul, ol").each((_, el) => {
      const items = $(el)
        .find("li")
        .toArray()
        .map((li) => $(li).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const score = items.filter((t) => /\d|cup|tsp|tbsp|g\b|ml\b|oz/i.test(t)).length;
      if (score > best.length && score >= 2) best = items;
    });
    ingredientLines = best;
  }

  let steps: string[] = [];
  const stepsHeader = $("h2, h3, h4, legend")
    .filter((_, el) => /^(instructions?|directions?|method|steps?)$/i.test($(el).text().trim()))
    .first();

  steps = listAfter($, stepsHeader);

  if (!steps.length && stepsHeader.length) {
    steps = stepsHeader
      .nextUntil("h1, h2, h3, h4")
      .filter("p")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 20);
  }

  const photoUrl =
    $('meta[property="og:image"]').attr("content") ||
    $("article img, .recipe img, img").first().attr("src") ||
    null;

  if (!ingredientLines.length) return null;

  return {
    title,
    servings: parseServings(servingsText || 1),
    ingredients: ingredientLines.map(parseIngredientLine),
    steps,
    photoUrl,
    sourceUrl,
  };
}
