import type { ExportPayload, Ingredient, Recipe, RecipeSection } from "@ladlelink/types";
import { splitTags } from "../lib/recipe-form";

/** One line for any file that is not a LadleLink backup at all. */
export const NOT_A_BACKUP = "That file isn't a LadleLink backup.";

/**
 * Guard for recipes that come from outside the app (JSON backup import) or from
 * damaged storage. Returns a renderable Recipe, or null when a required field is
 * missing or the wrong type. Invalid optional fields are dropped, never saved.
 */
export function sanitizeRecipe(value: unknown): Recipe | null {
  if (!isRecord(value)) return null;
  const { id, title, servings, steps, ingredients, tags, createdAt, updatedAt } = value;
  if (typeof id !== "string" || !id.trim()) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (typeof servings !== "number" || !Number.isFinite(servings) || servings <= 0) return null;
  if (typeof createdAt !== "string" || typeof updatedAt !== "string") return null;
  if (!Array.isArray(steps) || !steps.every((s) => typeof s === "string")) return null;
  if (!Array.isArray(ingredients)) return null;

  const safeIngredients: Ingredient[] = [];
  for (const raw of ingredients) {
    const ingredient = sanitizeIngredient(raw);
    // One bad row would leave the recipe half-imported: reject the whole recipe.
    if (!ingredient) return null;
    safeIngredients.push(ingredient);
  }

  const recipe: Recipe = {
    id,
    title,
    servings,
    steps: [...steps],
    ingredients: safeIngredients,
    tags: Array.isArray(tags)
      ? splitTags(tags.filter((t): t is string => typeof t === "string"))
      : [],
    createdAt,
    updatedAt,
  };
  for (const key of ["notes", "photoPath", "imageUrl", "sourceUrl"] as const) {
    const field = value[key];
    if (typeof field === "string" || field === null) recipe[key] = field;
  }
  if (Array.isArray(value.sections)) {
    const sections = value.sections
      .map(sanitizeSection)
      .filter((s): s is RecipeSection => s !== null);
    if (sections.length) recipe.sections = sections;
  }
  return recipe;
}

/** Split a backup's recipes into importable ones and one reason per skipped entry. */
export function validateImportRecipes(values: unknown[]): { recipes: Recipe[]; reasons: string[] } {
  const recipes: Recipe[] = [];
  const reasons: string[] = [];
  values.forEach((value, index) => {
    const recipe = sanitizeRecipe(value);
    // A recipe with no ingredients and no steps renders as a blank page.
    if (recipe && recipe.ingredients.length > 0 && recipe.steps.length > 0) {
      recipes.push(recipe);
      return;
    }
    const named =
      isRecord(value) && typeof value.title === "string" && value.title.trim()
        ? `“${value.title.trim()}”`
        : `#${index + 1}`;
    reasons.push(
      `Skipped ${named}: id, title, servings, ingredients, steps or dates are missing or invalid.`
    );
  });
  return { recipes, reasons };
}

/**
 * Result line for a backup import. An all-skipped file is a failure, not a
 * success with a zero in it.
 */
export function importSummary(result: {
  imported: number;
  skipped?: number;
  reasons?: string[];
}): { ok: boolean; message: string } {
  const details = result.reasons?.length ? ` ${result.reasons.join(" ")}` : "";
  if (!result.imported) {
    return {
      ok: false,
      message: `No recipes were imported — nothing was saved. Skipped ${result.skipped ?? 0} damaged recipe(s).${details}`,
    };
  }
  return {
    ok: true,
    message:
      `Imported ${result.imported} recipes.` +
      (result.skipped ? ` Skipped ${result.skipped} damaged recipe(s):${details}` : ""),
  };
}

/** Parse a backup file; anything that is not JSON gets the same plain-English error. */
export function parseBackupPayload(text: string): ExportPayload {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  return checkBackupPayload(value);
}

/** Envelope guard: a null or foreign JSON file must never reach the import loop. */
export function checkBackupPayload(value: unknown): ExportPayload {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.recipes)) {
    throw new Error(NOT_A_BACKUP);
  }
  return value as unknown as ExportPayload;
}

function sanitizeIngredient(value: unknown): Ingredient | null {
  if (!isRecord(value)) return null;
  const { quantity, unit, name } = value;
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return null;
  if (typeof unit !== "string" || typeof name !== "string" || !name.trim()) return null;

  const ingredient: Ingredient = { quantity, unit, name };
  const quantityMax = value.quantityMax;
  if (typeof quantityMax === "number" && Number.isFinite(quantityMax)) {
    ingredient.quantityMax = quantityMax;
  }
  const size = value.size;
  if (size === "small" || size === "medium" || size === "large") ingredient.size = size;
  if (typeof value.notes === "string") ingredient.notes = value.notes;
  if (typeof value.conversionKey === "string") ingredient.conversionKey = value.conversionKey;
  const kind = value.kind;
  if (kind === "dry" || kind === "wet" || kind === "other") ingredient.kind = kind;
  const density = value.densityGPerMl;
  if (typeof density === "number" && Number.isFinite(density)) ingredient.densityGPerMl = density;
  if (typeof value.displayUnit === "string") ingredient.displayUnit = value.displayUnit;
  return ingredient;
}

function sanitizeSection(value: unknown): RecipeSection | null {
  if (!isRecord(value)) return null;
  const { kind, at, title } = value;
  if (kind !== "ingredients" && kind !== "steps") return null;
  if (typeof at !== "number" || !Number.isInteger(at) || at < 0) return null;
  if (typeof title !== "string") return null;
  return { kind, at, title };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
