import * as cheerio from "cheerio";
import type { ParsedRecipe } from "@ladlelink/types";
import { parseIngredientLine, parseServings } from "./ingredient-line.js";

export function parseMicrodata(html: string, sourceUrl: string): ParsedRecipe | null {
  const $ = cheerio.load(html);
  const recipeEl = $('[itemtype*="schema.org/Recipe"], [itemtype*="schema.org/recipe"]').first();
  if (!recipeEl.length) return null;

  const title =
    recipeEl.find('[itemprop="name"]').first().text().trim() ||
    $("h1").first().text().trim() ||
    "Untitled recipe";

  const ingredients = recipeEl
    .find('[itemprop="recipeIngredient"], [itemprop="ingredients"]')
    .toArray()
    .map((el) => parseIngredientLine($(el).text()));

  const steps = recipeEl
    .find('[itemprop="recipeInstructions"] [itemprop="text"], [itemprop="recipeInstructions"] li, [itemprop="recipeInstructions"]')
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Avoid duplicating wrapper text when nested text nodes exist
  const uniqueSteps = [...new Set(steps)].filter((s) => s.length < 2000);

  const yieldText = recipeEl.find('[itemprop="recipeYield"]').first().text();
  const photoUrl =
    recipeEl.find('[itemprop="image"]').attr("src") ||
    recipeEl.find('[itemprop="image"]').attr("content") ||
    null;

  if (!ingredients.length) return null;

  return {
    title,
    servings: parseServings(yieldText || 1),
    ingredients,
    steps: uniqueSteps,
    photoUrl,
    sourceUrl,
  };
}
