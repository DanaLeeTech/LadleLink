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
    const mode = req.query.mode === "replace" ? "replace" : "merge";
    const result = store.importAll(payload, mode);
    res.json(result);
  });

  return router;
}
