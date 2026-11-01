import * as cheerio from "cheerio";
import type { ParsedRecipe, RecipeSection } from "@ladlelink/types";
import {
  asStringArray,
  cleanRecipeText,
  parseIngredientLine,
  parseServings,
} from "./ingredient-line.js";
import { resolvePhotoUrls } from "./photo-url.js";

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

/**
 * Flatten `recipeInstructions` into steps, keeping HowToSection headings as
 * section rows ("For the icing").
 */
export function instructionsWithSections(value: unknown): {
  steps: string[];
  sections: RecipeSection[];
} {
  const steps: string[] = [];
  const sections: RecipeSection[] = [];

  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      steps.push(...asStringArray(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    const children = obj.itemListElement ?? obj.steps;
    if (children) {
      const name = typeof obj.name === "string" ? cleanRecipeText(obj.name) : "";
      if (name) sections.push({ kind: "steps", at: steps.length, title: name });
      walk(children);
      return;
    }
    if (typeof obj.text === "string") {
      steps.push(...asStringArray(obj.text));
      return;
    }
    if (typeof obj.name === "string") steps.push(...asStringArray(obj.name));
  };

  walk(value);
  return { steps, sections };
}

/** Every usable image URL from a string, ImageObject, or any nesting of them. */
function imageUrlsFrom(value: unknown): string[] {
  if (typeof value === "string") {
    const url = value.trim();
    return url ? [url] : [];
  }
  if (Array.isArray(value)) return value.flatMap(imageUrlsFrom);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return imageUrlsFrom(obj.url ?? obj.contentUrl ?? obj["@graph"]);
  }
  return [];
}

function recipeFromJsonLd(
  obj: Record<string, unknown>,
  sourceUrl: string,
  fallbackImages: string[]
): ParsedRecipe | null {
  if (!isRecipeType(obj["@type"])) return null;

  const ingredientLines = asStringArray(obj.recipeIngredient ?? obj.ingredients);
  const { steps, sections } = instructionsWithSections(obj.recipeInstructions ?? obj.instructions);
  const photoUrlCandidates = resolvePhotoUrls(
    [...imageUrlsFrom(obj.image), ...fallbackImages],
    sourceUrl
  );
  const photoUrl = photoUrlCandidates[0] ?? null;

  const title = String(obj.name ?? obj.headline ?? "Untitled recipe").trim();

  return {
    title,
    servings: parseServings(obj.recipeYield ?? obj.yield ?? 1),
    ingredients: ingredientLines.map(parseIngredientLine),
    steps,
    ...(sections.length ? { sections } : {}),
    tags: asStringArray(obj.keywords ?? obj.recipeCategory),
    notes: typeof obj.description === "string" ? obj.description : null,
    photoUrl,
    ...(photoUrlCandidates.length ? { photoUrlCandidates } : {}),
    sourceUrl,
  };
}

/** All og:image tags; many pages list several crops of the same photo. */
function ogImages($: cheerio.CheerioAPI): string[] {
  return $('meta[property="og:image"]')
    .toArray()
    .map((el) => $(el).attr("content")?.trim() || "")
    .filter(Boolean);
}

export function parseJsonLd(html: string, sourceUrl: string): ParsedRecipe | null {
  const $ = cheerio.load(html);
  // Many sites only publish the hero image as og:image, not in the JSON-LD.
  const fallbackImages = ogImages($);
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    const raw = $(el).html();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw.replace(/[\u0000-\u0019]+/g, " "));
      for (const node of unwrapGraph(parsed)) {
        if (node && typeof node === "object") {
          const recipe = recipeFromJsonLd(
            node as Record<string, unknown>,
            sourceUrl,
            fallbackImages
          );
          if (recipe && recipe.ingredients.length) return recipe;
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null;
}
