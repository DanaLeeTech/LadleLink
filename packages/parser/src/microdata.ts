import * as cheerio from "cheerio";
import type { ParsedRecipe } from "@ladlelink/types";
import { parseIngredientLine, parseServings } from "./ingredient-line.js";
import { resolvePhotoUrl } from "./photo-url.js";

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

  const steps: string[] = [];
  const sections: ParsedRecipe["sections"] = [];
  const seen = new Set<string>();
  let currentTitle: string | null = null;

  const instructionEls = recipeEl
    .find('[itemprop="recipeInstructions"] [itemprop="text"], [itemprop="recipeInstructions"] li')
    .toArray();

  for (const el of instructionEls) {
    const $el = $(el);
    // Wrapper nodes (a section or list) are represented by their children.
    if ($el.find('[itemprop="text"], li').length) continue;
    const stepText = $el.text().replace(/\s+/g, " ").trim();
    if (!stepText || stepText.length >= 2000 || seen.has(stepText)) continue;

    // Group steps under their HowToSection name ("For the icing").
    const $section = $el.parents('[itemtype*="HowToSection"]').first();
    if ($section.length) {
      const title =
        $section.find('[itemprop="name"]').first().text().replace(/\s+/g, " ").trim() ||
        $section.find("h1, h2, h3, h4, h5, h6").first().text().replace(/\s+/g, " ").trim();
      if (title && title !== currentTitle) {
        sections.push({ kind: "steps", at: steps.length, title });
        currentTitle = title;
      }
    }

    seen.add(stepText);
    steps.push(stepText);
  }

  if (!instructionEls.length) {
    const whole = recipeEl
      .find('[itemprop="recipeInstructions"]')
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (whole && whole.length < 2000) steps.push(whole);
  }

  const yieldText = recipeEl.find('[itemprop="recipeYield"]').first().text();
  const photoUrl = resolvePhotoUrl(
    recipeEl.find('[itemprop="image"]').attr("src") ||
      recipeEl.find('[itemprop="image"]').attr("content"),
    sourceUrl
  );

  if (!ingredients.length) return null;

  return {
    title,
    servings: parseServings(yieldText || 1),
    ingredients,
    steps,
    ...(sections.length ? { sections } : {}),
    photoUrl,
    sourceUrl,
  };
}
