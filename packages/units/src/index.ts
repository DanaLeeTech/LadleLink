import type {
  CanonicalUnit,
  ConvertResult,
  Ingredient,
  IngredientKind,
  MeasurementPrefs,
} from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import {
  canonicalizeUnit,
  gramsToMassUnit,
  massUnitToGrams,
  mlToVolumeUnit,
  unitFamily,
  volumeUnitToMl,
} from "./cups.js";
import {
  conversionCatalogLabels,
  conversionKeyDiffersFromName,
  inferConversionKey,
  resolveConversionName,
  suggestConversionKey,
} from "./conversion-key.js";
import { resolveDensity } from "./density.js";
import { formatQuantity, roundQuantity } from "./format.js";
import { formatQuantityRange } from "./format-range.js";
import { resolvePieceGrams } from "./piece-weights.js";

export {
  canonicalizeUnit,
  mlPerCup,
  normalizeUnitToken,
  unitFamily,
  volumeUnitToMl,
  mlToVolumeUnit,
  massUnitToGrams,
  gramsToMassUnit,
} from "./cups.js";
export {
  ALL_UNITS,
  ALL_UNIT_SET,
  COMMON_UNITS,
  CONVERTIBLE_UNITS,
  COUNTABLE_UNITS,
  COUNTABLE_UNIT_SET,
  MASS_UNITS,
  PORTION_UNITS,
  PRODUCE_UNITS,
  PRODUCE_UNIT_SET,
  UNIT_ALIASES,
  UNIT_ALIAS_GROUPS,
  VOLUME_UNITS,
  isKnownUnit,
  unitLabel,
  unitPatternAlternation,
} from "./catalog.js";
export { DENSITY_TABLE, lookupDensity, resolveDensity } from "./density.js";
export { expandNameVariants, wordForms } from "./name-variants.js";
export { formatQuantity, roundQuantity } from "./format.js";
export { formatQuantityRange } from "./format-range.js";
export { pluralUnitLabel, pluralProduceName, singularizeName } from "./pluralize.js";
export { defaultProduceSize, isProduceIngredient } from "./produce.js";
export {
  resolvePieceGrams,
  lookupPieceWeight,
  GENERATED_PIECE_WEIGHTS,
} from "./piece-weights.js";
export { GENERATED_DENSITY_TABLE } from "./generated/density.generated.js";
export {
  conversionCatalogLabels,
  conversionKeyDiffersFromName,
  conversionMatchIndexBuildCount,
  formatConversionLabel,
  inferConversionKey,
  isSingleIngredientLabel,
  matchingConversionLabels,
  resolveConversionName,
  suggestConversionKey,
} from "./conversion-key.js";

export function inferKind(ingredient: Ingredient): IngredientKind {
  if (ingredient.kind) return ingredient.kind;
  const density = resolveDensity(
    resolveConversionName(ingredient),
    ingredient.densityGPerMl
  );
  if (density) return density.kind;
  const family = unitFamily(ingredient.unit);
  if (family === "volume") return "wet";
  if (family === "mass") return "dry";
  return "other";
}

export function preferredUnitFor(
  ingredient: Ingredient,
  prefs: MeasurementPrefs = DEFAULT_MEASUREMENT_PREFS
): CanonicalUnit {
  if (ingredient.displayUnit) return canonicalizeUnit(ingredient.displayUnit);
  const kind = inferKind(ingredient);
  if (kind === "dry") return canonicalizeUnit(prefs.dryPreferredUnit);
  if (kind === "wet") return canonicalizeUnit(prefs.wetPreferredUnit);
  return canonicalizeUnit(ingredient.unit);
}

function withRange(
  result: ConvertResult,
  quantityMax: number | undefined,
  convertMax: (q: number) => number | null
): ConvertResult {
  if (quantityMax == null || !Number.isFinite(quantityMax)) return result;
  const maxConverted = convertMax(quantityMax);
  if (maxConverted == null) return result;
  const roundedMax = roundQuantity(maxConverted, result.unit);
  return {
    ...result,
    quantityMax: roundedMax,
    displayQuantity: formatQuantityRange(result.quantity, result.unit, roundedMax),
  };
}

/** Australian spoon/pint sizes. On unless the user picked US measures. */
export function usesAustralianMeasures(
  prefs: MeasurementPrefs = DEFAULT_MEASUREMENT_PREFS
): boolean {
  return prefs.australianMeasures ?? prefs.cupStandard !== "us";
}

/**
 * Convert an ingredient quantity to a target unit.
 * Volume↔mass requires known density; countable↔mass uses piece weights.
 */
export function convertIngredient(
  ingredient: Ingredient,
  targetUnit: CanonicalUnit,
  prefs: MeasurementPrefs = DEFAULT_MEASUREMENT_PREFS
): ConvertResult {
  const au = usesAustralianMeasures(prefs);
  const fromUnit = canonicalizeUnit(ingredient.unit);
  const toUnit = canonicalizeUnit(targetUnit);
  const kind = inferKind(ingredient);
  const qty = ingredient.quantity;
  const qtyMax = ingredient.quantityMax;

  if (fromUnit === "to_taste" || fromUnit === "garnish") {
    return {
      quantity: qty,
      unit: fromUnit,
      displayQuantity: formatQuantity(qty, fromUnit),
      kind,
    };
  }

  if (fromUnit === toUnit) {
    const rounded = roundQuantity(qty, toUnit || "piece");
    const base: ConvertResult = {
      quantity: rounded,
      unit: toUnit,
      displayQuantity: formatQuantityRange(rounded, toUnit || "piece", qtyMax),
      kind,
    };
    if (qtyMax != null) {
      base.quantityMax = roundQuantity(qtyMax, toUnit || "piece");
      base.displayQuantity = formatQuantityRange(
        rounded,
        toUnit || "piece",
        base.quantityMax
      );
    }
    return base;
  }

  const fromFamily = unitFamily(fromUnit);
  const toFamily = unitFamily(toUnit);

  // Countable (incl. empty unit) ↔ mass via piece weights
  if (fromFamily === "countable" || toFamily === "countable") {
    if (fromFamily === "countable" && toFamily === "mass") {
      const perPiece = resolvePieceGrams(ingredient);
      if (perPiece != null) {
        const grams = qty * perPiece;
        const converted = gramsToMassUnit(grams, toUnit);
        if (converted != null) {
          const rounded = roundQuantity(converted, toUnit);
          return withRange(
            {
              quantity: rounded,
              unit: toUnit,
              displayQuantity: formatQuantityRange(rounded, toUnit),
              kind,
            },
            qtyMax,
            (max) => {
              const g = max * perPiece;
              return gramsToMassUnit(g, toUnit);
            }
          );
        }
      }
      return {
        quantity: qty,
        quantityMax: qtyMax,
        unit: fromUnit,
        displayQuantity: formatQuantityRange(qty, fromUnit || "piece", qtyMax),
        kind,
        needsWeight: true,
      };
    }

    if (fromFamily === "mass" && toFamily === "countable") {
      const perPiece = resolvePieceGrams({ ...ingredient, unit: toUnit || "" });
      // For reverse, look up by name with empty/piece target
      const per =
        resolvePieceGrams({ ...ingredient, unit: "" }) ??
        resolvePieceGrams({ ...ingredient, unit: "piece" }) ??
        perPiece;
      if (per != null && per > 0) {
        const grams = massUnitToGrams(qty, fromUnit);
        if (grams != null) {
          const pieces = grams / per;
          const rounded = roundQuantity(pieces, toUnit || "piece");
          return withRange(
            {
              quantity: rounded,
              unit: toUnit || "",
              displayQuantity: formatQuantityRange(rounded, toUnit || "piece"),
              kind,
            },
            qtyMax,
            (max) => {
              const g = massUnitToGrams(max, fromUnit);
              return g == null ? null : g / per;
            }
          );
        }
      }
      return {
        quantity: qty,
        quantityMax: qtyMax,
        unit: fromUnit,
        displayQuantity: formatQuantityRange(qty, fromUnit, qtyMax),
        kind,
        needsWeight: true,
      };
    }

    // Countable ↔ volume via piece weight → density
    if (fromFamily === "countable" && toFamily === "volume") {
      const perPiece = resolvePieceGrams(ingredient);
      if (perPiece == null) {
        return {
          quantity: qty,
          quantityMax: qtyMax,
          unit: fromUnit,
          displayQuantity: formatQuantityRange(qty, fromUnit || "piece", qtyMax),
          kind,
          needsWeight: true,
        };
      }
      const densityInfo = resolveDensity(
        resolveConversionName(ingredient),
        ingredient.densityGPerMl
      );
      if (!densityInfo) {
        return {
          quantity: qty,
          quantityMax: qtyMax,
          unit: fromUnit,
          displayQuantity: formatQuantityRange(qty, fromUnit || "piece", qtyMax),
          kind,
          needsDensity: true,
        };
      }
      const grams = qty * perPiece;
      const ml = grams / densityInfo.densityGPerMl;
      const converted = mlToVolumeUnit(ml, toUnit, prefs.cupStandard, au);
      if (converted == null) return failKeep(ingredient, kind);
      const rounded = roundQuantity(converted, toUnit);
      return withRange(
        {
          quantity: rounded,
          unit: toUnit,
          displayQuantity: formatQuantityRange(rounded, toUnit),
          kind: densityInfo.kind ?? kind,
        },
        qtyMax,
        (max) => {
          const g = max * perPiece;
          const m = g / densityInfo.densityGPerMl;
          return mlToVolumeUnit(m, toUnit, prefs.cupStandard, au);
        }
      );
    }

    if (fromFamily === "volume" && toFamily === "countable") {
      const per =
        resolvePieceGrams({ ...ingredient, unit: "" }) ??
        resolvePieceGrams({ ...ingredient, unit: "piece" }) ??
        resolvePieceGrams({ ...ingredient, unit: toUnit || "" });
      if (per == null || per <= 0) {
        return {
          quantity: qty,
          quantityMax: qtyMax,
          unit: fromUnit,
          displayQuantity: formatQuantityRange(qty, fromUnit, qtyMax),
          kind,
          needsWeight: true,
        };
      }
      const densityInfo = resolveDensity(
        resolveConversionName(ingredient),
        ingredient.densityGPerMl
      );
      if (!densityInfo) {
        return {
          quantity: qty,
          quantityMax: qtyMax,
          unit: fromUnit,
          displayQuantity: formatQuantityRange(qty, fromUnit, qtyMax),
          kind,
          needsDensity: true,
        };
      }
      const ml = volumeUnitToMl(qty, fromUnit, prefs.cupStandard, au);
      if (ml == null) return failKeep(ingredient, kind);
      const grams = ml * densityInfo.densityGPerMl;
      const pieces = grams / per;
      const rounded = roundQuantity(pieces, toUnit || "piece");
      return withRange(
        {
          quantity: rounded,
          unit: toUnit || "",
          displayQuantity: formatQuantityRange(rounded, toUnit || "piece"),
          kind: densityInfo.kind ?? kind,
        },
        qtyMax,
        (max) => {
          const m = volumeUnitToMl(max, fromUnit, prefs.cupStandard, au);
          if (m == null) return null;
          return (m * densityInfo.densityGPerMl) / per;
        }
      );
    }

    return {
      quantity: qty,
      quantityMax: qtyMax,
      unit: fromUnit,
      displayQuantity: formatQuantityRange(qty, fromUnit || "piece", qtyMax),
      kind,
    };
  }

  if (fromFamily === "volume" && toFamily === "volume") {
    const ml = volumeUnitToMl(qty, fromUnit, prefs.cupStandard, au);
    if (ml == null) return failKeep(ingredient, kind);
    const converted = mlToVolumeUnit(ml, toUnit, prefs.cupStandard, au);
    if (converted == null) return failKeep(ingredient, kind);
    const rounded = roundQuantity(converted, toUnit);
    return withRange(
      {
        quantity: rounded,
        unit: toUnit,
        displayQuantity: formatQuantityRange(rounded, toUnit),
        kind,
      },
      qtyMax,
      (max) => {
        const m = volumeUnitToMl(max, fromUnit, prefs.cupStandard, au);
        if (m == null) return null;
        return mlToVolumeUnit(m, toUnit, prefs.cupStandard, au);
      }
    );
  }

  if (fromFamily === "mass" && toFamily === "mass") {
    const grams = massUnitToGrams(qty, fromUnit);
    if (grams == null) return failKeep(ingredient, kind);
    const converted = gramsToMassUnit(grams, toUnit);
    if (converted == null) return failKeep(ingredient, kind);
    const rounded = roundQuantity(converted, toUnit);
    return withRange(
      {
        quantity: rounded,
        unit: toUnit,
        displayQuantity: formatQuantityRange(rounded, toUnit),
        kind,
      },
      qtyMax,
      (max) => {
        const g = massUnitToGrams(max, fromUnit);
        if (g == null) return null;
        return gramsToMassUnit(g, toUnit);
      }
    );
  }

  const densityInfo = resolveDensity(
    resolveConversionName(ingredient),
    ingredient.densityGPerMl
  );
  if (!densityInfo) {
    return {
      quantity: qty,
      quantityMax: qtyMax,
      unit: fromUnit,
      displayQuantity: formatQuantityRange(qty, fromUnit, qtyMax),
      kind,
      needsDensity: true,
    };
  }
  const d = densityInfo.densityGPerMl;

  if (fromFamily === "volume" && toFamily === "mass") {
    const ml = volumeUnitToMl(qty, fromUnit, prefs.cupStandard, au);
    if (ml == null) return failKeep(ingredient, kind);
    const grams = ml * d;
    const converted = gramsToMassUnit(grams, toUnit);
    if (converted == null) return failKeep(ingredient, kind);
    const rounded = roundQuantity(converted, toUnit);
    return withRange(
      {
        quantity: rounded,
        unit: toUnit,
        displayQuantity: formatQuantityRange(rounded, toUnit),
        kind: densityInfo.kind,
      },
      qtyMax,
      (max) => {
        const m = volumeUnitToMl(max, fromUnit, prefs.cupStandard, au);
        if (m == null) return null;
        return gramsToMassUnit(m * d, toUnit);
      }
    );
  }

  if (fromFamily === "mass" && toFamily === "volume") {
    const grams = massUnitToGrams(qty, fromUnit);
    if (grams == null) return failKeep(ingredient, kind);
    const ml = grams / d;
    const converted = mlToVolumeUnit(ml, toUnit, prefs.cupStandard, au);
    if (converted == null) return failKeep(ingredient, kind);
    const rounded = roundQuantity(converted, toUnit);
    return withRange(
      {
        quantity: rounded,
        unit: toUnit,
        displayQuantity: formatQuantityRange(rounded, toUnit),
        kind: densityInfo.kind,
      },
      qtyMax,
      (max) => {
        const g = massUnitToGrams(max, fromUnit);
        if (g == null) return null;
        return mlToVolumeUnit(g / d, toUnit, prefs.cupStandard, au);
      }
    );
  }

  return failKeep(ingredient, kind);
}

function failKeep(ingredient: Ingredient, kind: IngredientKind): ConvertResult {
  const unit = canonicalizeUnit(ingredient.unit);
  return {
    quantity: ingredient.quantity,
    quantityMax: ingredient.quantityMax,
    unit,
    displayQuantity: formatQuantityRange(
      ingredient.quantity,
      unit,
      ingredient.quantityMax
    ),
    kind,
  };
}

/** Apply preferred display units to a list of ingredients (after scaling). */
export function applyDisplayPrefs(
  ingredients: Ingredient[],
  prefs: MeasurementPrefs = DEFAULT_MEASUREMENT_PREFS,
  options: { applyDefaults?: boolean } = {}
): Array<
  Ingredient & {
    displayQuantity: string;
    needsDensity?: boolean;
    needsWeight?: boolean;
  }
> {
  const applyDefaults = options.applyDefaults ?? false;
  return ingredients.map((ing) => {
    const target =
      ing.displayUnit ||
      (applyDefaults ? preferredUnitFor(ing, prefs) : canonicalizeUnit(ing.unit));
    const result = convertIngredient(ing, target, prefs);
    return {
      ...ing,
      quantity: result.quantity,
      quantityMax: result.quantityMax,
      unit: result.unit,
      kind: result.kind ?? ing.kind,
      displayQuantity: result.displayQuantity,
      needsDensity: result.needsDensity,
      needsWeight: result.needsWeight,
    };
  });
}
