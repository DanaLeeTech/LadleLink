import { Router } from "express";
import type { Ingredient, MeasurementPrefs, Recipe } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { scaleRecipe } from "@ladlelink/scaling";
import { convertIngredient } from "@ladlelink/units";
import type { RecipeStore } from "../db/store.js";

export function utilRouter(store: RecipeStore): Router {
  const router = Router();

  router.post("/scale", (req, res) => {
    const recipe = req.body?.recipe as Pick<Recipe, "servings" | "ingredients"> | undefined;
    const targetServings = Number(req.body?.targetServings);
    const prefs = {
      ...store.getMeasurementPrefs(),
      ...(req.body?.prefs ?? {}),
    } as MeasurementPrefs;
    const applyPreferredUnits = Boolean(req.body?.applyPreferredUnits);
    const unitOverrides = req.body?.unitOverrides as Record<number, string> | undefined;

    if (!recipe || !Array.isArray(recipe.ingredients) || !(recipe.servings > 0)) {
      res.status(400).json({ error: "recipe with servings and ingredients is required" });
      return;
    }
    if (!(targetServings > 0)) {
      res.status(400).json({ error: "targetServings must be > 0" });
      return;
    }

    const result = scaleRecipe(recipe, targetServings, {
      prefs,
      applyPreferredUnits,
      unitOverrides,
    });
    res.json(result);
  });

  router.post("/convert", (req, res) => {
    const ingredient = req.body?.ingredient as Ingredient | undefined;
    const targetUnit = req.body?.targetUnit as string | undefined;
    const prefs = {
      ...store.getMeasurementPrefs(),
      ...(req.body?.prefs ?? {}),
    } as MeasurementPrefs;

    if (!ingredient || typeof ingredient.name !== "string") {
      res.status(400).json({ error: "ingredient is required" });
      return;
    }
    if (!targetUnit) {
      res.status(400).json({ error: "targetUnit is required" });
      return;
    }

    const result = convertIngredient(ingredient, targetUnit, prefs);
    res.json(result);
  });

  router.get("/settings/measurement", (_req, res) => {
    res.json(store.getMeasurementPrefs());
  });

  router.put("/settings/measurement", (req, res) => {
    const body = req.body as Partial<MeasurementPrefs>;
    const current = store.getMeasurementPrefs();
    const next: MeasurementPrefs = {
      ...DEFAULT_MEASUREMENT_PREFS,
      ...current,
      ...body,
    };
    res.json(store.setMeasurementPrefs(next));
  });

  router.get("/export", (_req, res) => {
    const payload = store.exportAll();
    res.setHeader("Content-Disposition", 'attachment; filename="ladlelink-export.json"');
    res.json(payload);
  });

  router.post("/import", (req, res) => {
    const payload = req.body;
    if (!payload || payload.version !== 1 || !Array.isArray(payload.recipes)) {
      res.status(400).json({ error: "Invalid export payload" });
      return;
    }
    // Same rules as the browser import: skip rows that would render a blank page.
    const sanitized = payload.recipes.map((value: unknown) => sanitizeImportedRecipe(value));
    const recipes = sanitized.filter((recipe: Recipe | null): recipe is Recipe => recipe !== null);
    const reasons = sanitized.flatMap((recipe: Recipe | null, index: number) =>
      recipe ? [] : [`Skipped #${index + 1}: missing or invalid fields.`]
    );
    const mode = req.query.mode === "replace" ? "replace" : "merge";
    // Never wipe the library for a file with nothing importable in it.
    const result =
      mode === "replace" && !recipes.length
        ? { imported: 0 }
        : store.importAll({ ...payload, recipes }, mode);
    res.json({ ...result, skipped: reasons.length, reasons });
  });

  return router;
}

/** Required fields, non-blank title and ingredient names, and something to render. */
function isImportableRecipe(value: unknown): value is Recipe {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Partial<Recipe>;
  return (
    typeof r.id === "string" &&
    r.id.trim() !== "" &&
    typeof r.title === "string" &&
    r.title.trim() !== "" &&
    typeof r.servings === "number" &&
    Number.isFinite(r.servings) &&
    r.servings > 0 &&
    typeof r.createdAt === "string" &&
    typeof r.updatedAt === "string" &&
    Array.isArray(r.steps) &&
    r.steps.length > 0 &&
    r.steps.every((step) => typeof step === "string") &&
    Array.isArray(r.ingredients) &&
    r.ingredients.length > 0 &&
    r.ingredients.every(
      (ingredient) =>
        typeof ingredient === "object" &&
        ingredient !== null &&
        typeof ingredient.quantity === "number" &&
        Number.isFinite(ingredient.quantity) &&
        typeof ingredient.name === "string" &&
        ingredient.name.trim() !== "" &&
        typeof ingredient.unit === "string"
    )
  );
}

const OPTIONAL_TEXT_FIELDS = ["notes", "photoPath", "imageUrl", "sourceUrl"] as const;

/**
 * Same as the browser import: drop junk optional fields rather than storing them.
 * Required fields stay untouched so isImportableRecipe decides validity.
 */
function sanitizeImportedRecipe(value: unknown): Recipe | null {
  if (!isImportableRecipe(value)) return null;
  const recipe: Recipe = {
    ...value,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag: unknown) => typeof tag === "string")
      : [],
  };
  if (!Array.isArray(value.sections)) delete recipe.sections;
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const fieldValue = recipe[field];
    if (fieldValue !== undefined && fieldValue !== null && typeof fieldValue !== "string") {
      delete recipe[field];
    }
  }
  return recipe;
}
