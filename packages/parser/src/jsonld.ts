import * as cheerio from "cheerio";
import type { ParsedRecipe } from "@ladlelink/types";
import { asStringArray, parseIngredientLine, parseServings } from "./ingredient-line.js";

function isRecipeType(type: unknown): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => String(t).toLowerCase().includes("recipe"));
}

function unwrapGraph(data: unknown): unknown[] {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap(unwrapGraph);
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (obj["@graph"]) return unwrapGraph(obj["@graph"]);
    return [data];
  }
  return [];
}

function recipeFromJsonLd(obj: Record<string, unknown>, sourceUrl: string): ParsedRecipe | null {
  if (!isRecipeType(obj["@type"])) return null;

  const ingredientLines = asStringArray(obj.recipeIngredient ?? obj.ingredients);
  const steps = asStringArray(obj.recipeInstructions ?? obj.instructions);
  const image = obj.image;
  let photoUrl: string | null = null;
  if (typeof image === "string") photoUrl = image;
  else if (Array.isArray(image) && typeof image[0] === "string") photoUrl = image[0];
  else if (image && typeof image === "object" && "url" in image) {
    photoUrl = String((image as { url: unknown }).url);
  }

  const title = String(obj.name ?? obj.headline ?? "Untitled recipe").trim();

  return {
    title,
    servings: parseServings(obj.recipeYield ?? obj.yield ?? 1),
    ingredients: ingredientLines.map(parseIngredientLine),
    steps,
    tags: asStringArray(obj.keywords ?? obj.recipeCategory),
    notes: typeof obj.description === "string" ? obj.description : null,
    photoUrl,
    sourceUrl,
  };
}

export function parseJsonLd(html: string, sourceUrl: string): ParsedRecipe | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    const raw = $(el).html();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw.replace(/[\u0000-\u0019]+/g, " "));
      for (const node of unwrapGraph(parsed)) {
        if (node && typeof node === "object") {
          const recipe = recipeFromJsonLd(node as Record<string, unknown>, sourceUrl);
          if (recipe && recipe.ingredients.length) return recipe;
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null;
}
