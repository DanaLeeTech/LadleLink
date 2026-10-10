import type {
  Ingredient,
  MeasurementPrefs,
  ProduceSize,
  Recipe,
} from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import {
  applyDisplayPrefs,
  canonicalizeUnit,
  convertIngredient,
  formatQuantityRange,
  resolvePieceGrams,
  roundQuantity,
  unitFamily,
} from "@ladlelink/units";

export interface ScaleOptions {
  prefs?: MeasurementPrefs;
  /** Convert to displayUnit / dry-wet defaults after scaling. Default false (keep authored units). */
  applyPreferredUnits?: boolean;
  /** Override target unit per ingredient index (reader per-ingredient switches). */
  unitOverrides?: Record<number, string>;
  /**
   * Override produce size per ingredient index. When the authored ingredient has a size,
   * quantity is mass-preserved (authored qty × authored size grams) across size/unit views.
   */
  sizeOverrides?: Record<number, ProduceSize>;
}

export interface ScaledIngredient extends Ingredient {
  displayQuantity: string;
  needsDensity?: boolean;
  needsWeight?: boolean;
}

export function scaleFactor(baseServings: number, targetServings: number): number {
  const base = baseServings > 0 ? baseServings : 1;
  const target = targetServings > 0 ? targetServings : base;
  return target / base;
}

export function scaleIngredient(
  ingredient: Ingredient,
  factor: number,
  prefs: MeasurementPrefs = DEFAULT_MEASUREMENT_PREFS,
  targetUnit?: string,
  displaySize?: ProduceSize
): ScaledIngredient {
  const unit = canonicalizeUnit(ingredient.unit);
  const authoredSize = ingredient.size;

  let quantity = ingredient.quantity;
  let quantityMax = ingredient.quantityMax;
  if (unit !== "to_taste" && unit !== "garnish") {
    quantity = ingredient.quantity * factor;
    if (quantityMax != null) quantityMax = quantityMax * factor;
  }

  // Sized produce: preserve mass from authored size, then express as size count or unit.
  if (authoredSize) {
    const perAuthored = resolvePieceGrams({
      ...ingredient,
      quantity: 1,
      unit: "",
      size: authoredSize,
    });
    if (perAuthored != null && perAuthored > 0) {
      const baseGrams = quantity * perAuthored;
      const baseGramsMax =
        quantityMax != null ? quantityMax * perAuthored : undefined;

      if (targetUnit) {
        const asGrams: Ingredient = {
          ...ingredient,
          quantity: baseGrams,
          unit: "g",
          size: authoredSize,
        };
        if (baseGramsMax != null) asGrams.quantityMax = baseGramsMax;
        else delete asGrams.quantityMax;

        const converted = convertIngredient(asGrams, targetUnit, prefs);
        const result: ScaledIngredient = {
          ...ingredient,
          quantity: converted.quantity,
          unit: converted.unit,
          size: authoredSize,
          kind: converted.kind ?? ingredient.kind,
          displayQuantity: converted.displayQuantity,
          needsDensity: converted.needsDensity,
          needsWeight: converted.needsWeight,
        };
        if (converted.quantityMax != null) result.quantityMax = converted.quantityMax;
        else delete result.quantityMax;
        // When showing mass/volume, drop size from the row label (dropdown shows unit).
        if (
          unitFamily(converted.unit) === "mass" ||
          unitFamily(converted.unit) === "volume"
        ) {
          delete result.size;
        }
        return result;
      }

      const size = displaySize ?? authoredSize;
      const perDisplay = resolvePieceGrams({
        ...ingredient,
        quantity: 1,
        unit: "",
        size,
      });
      if (perDisplay != null && perDisplay > 0) {
        const count = baseGrams / perDisplay;
        const countMax =
          baseGramsMax != null ? baseGramsMax / perDisplay : undefined;
        const rounded = roundQuantity(count, "piece");
        const roundedMax =
          countMax != null ? roundQuantity(countMax, "piece") : undefined;
        const result: ScaledIngredient = {
          ...ingredient,
          quantity: rounded,
          unit: "",
          size,
          displayQuantity: formatQuantityRange(rounded, "piece", roundedMax),
        };
        if (roundedMax != null) result.quantityMax = roundedMax;
        else delete result.quantityMax;
        return result;
      }
    }
  }

  const scaled: Ingredient = {
    ...ingredient,
    quantity: roundQuantity(quantity, unit || "piece"),
    unit,
  };
  if (displaySize) scaled.size = displaySize;
  if (quantityMax != null) {
    scaled.quantityMax = roundQuantity(quantityMax, unit || "piece");
  } else {
    delete scaled.quantityMax;
  }

  if (targetUnit) {
    const converted = convertIngredient(scaled, targetUnit, prefs);
    return {
      ...scaled,
      quantity: converted.quantity,
      quantityMax: converted.quantityMax,
      unit: converted.unit,
      kind: converted.kind ?? scaled.kind,
      displayQuantity: converted.displayQuantity,
      needsDensity: converted.needsDensity,
      needsWeight: converted.needsWeight,
    };
  }

  return {
    ...scaled,
    displayQuantity: formatQuantityRange(
      scaled.quantity,
      scaled.unit || "piece",
      scaled.quantityMax
    ),
  };
}

export function scaleRecipeIngredients(
  ingredients: Ingredient[],
  baseServings: number,
  targetServings: number,
  options: ScaleOptions = {}
): ScaledIngredient[] {
  const prefs = options.prefs ?? DEFAULT_MEASUREMENT_PREFS;
  const factor = scaleFactor(baseServings, targetServings);

  const scaled = ingredients.map((ing, index) => {
    const override = options.unitOverrides?.[index];
    const sizeOverride = options.sizeOverrides?.[index];
    return scaleIngredient(ing, factor, prefs, override, sizeOverride);
  });

  if (options.applyPreferredUnits) {
    return applyDisplayPrefs(scaled, prefs, { applyDefaults: true }).map((ing) => ({
      ...ing,
      displayQuantity: ing.displayQuantity,
    }));
  }

  return scaled;
}

export function scaleRecipe(
  recipe: Pick<Recipe, "servings" | "ingredients">,
  targetServings: number,
  options: ScaleOptions = {}
): { servings: number; ingredients: ScaledIngredient[]; factor: number } {
  const factor = scaleFactor(recipe.servings, targetServings);
  return {
    servings: targetServings,
    factor,
    ingredients: scaleRecipeIngredients(
      recipe.ingredients,
      recipe.servings,
      targetServings,
      options
    ),
  };
}
