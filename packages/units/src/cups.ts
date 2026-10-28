import type { CupStandard } from "@ladlelink/types";
import { COUNTABLE_UNIT_SET, UNIT_ALIASES } from "./catalog.js";

/** Milliliters per cup for each locale. Australian measures are always metric. */
export function mlPerCup(standard: CupStandard, australian = false): number {
  if (australian) return 250;
  return standard === "us" ? 240 : 250;
}

/** US customary volume sizes (used when Australian measures are off). */
export const ML_PER_TSP = 4.92892159375;
export const ML_PER_TBSP = 14.78676478125;
export const ML_PER_FL_OZ = 29.5735295625;
export const ML_PER_DESSERTSPOON = 10;
export const ML_PER_PINT = 473.176473;
export const ML_PER_QUART = 946.352946;
export const ML_PER_GALLON = 3785.411784;

/** Australian metric spoons, and imperial pints/quarts/gallons. */
export const AU_ML_PER_TSP = 5;
export const AU_ML_PER_TBSP = 20;
export const IMPERIAL_ML_PER_PINT = 568.26125;
export const IMPERIAL_ML_PER_QUART = 1136.5225;
export const IMPERIAL_ML_PER_GALLON = 4546.09;

export function normalizeUnitToken(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function canonicalizeUnit(unit: string): string {
  // Preserve case-sensitive T → tbsp before lowercasing
  if (unit.trim() === "T") return "tbsp";
  const u = normalizeUnitToken(unit);
  return UNIT_ALIASES[u] ?? u;
}

/** Milliliters in one of `unit`, or null when it is not a volume unit. */
function mlPerVolumeUnit(
  unit: string,
  cupStandard: CupStandard,
  australian: boolean
): number | null {
  switch (canonicalizeUnit(unit)) {
    case "ml":
      return 1;
    case "l":
      return 1000;
    case "tsp":
      return australian ? AU_ML_PER_TSP : ML_PER_TSP;
    case "tbsp":
      return australian ? AU_ML_PER_TBSP : ML_PER_TBSP;
    case "dessertspoon":
      return ML_PER_DESSERTSPOON;
    case "fl_oz":
      // Australian recipes use millilitres instead; fl oz stays US customary.
      return ML_PER_FL_OZ;
    case "cup":
      return mlPerCup(cupStandard, australian);
    // Australian pints and quarts are imperial (20 and 40 imperial fl oz).
    case "pint":
      return australian ? IMPERIAL_ML_PER_PINT : ML_PER_PINT;
    case "quart":
      return australian ? IMPERIAL_ML_PER_QUART : ML_PER_QUART;
    case "gallon":
      return australian ? IMPERIAL_ML_PER_GALLON : ML_PER_GALLON;
    default:
      return null;
  }
}

export function volumeUnitToMl(
  quantity: number,
  unit: string,
  cupStandard: CupStandard,
  australian = false
): number | null {
  const factor = mlPerVolumeUnit(unit, cupStandard, australian);
  return factor == null ? null : quantity * factor;
}

export function mlToVolumeUnit(
  ml: number,
  unit: string,
  cupStandard: CupStandard,
  australian = false
): number | null {
  const factor = mlPerVolumeUnit(unit, cupStandard, australian);
  return factor == null ? null : ml / factor;
}

export function massUnitToGrams(quantity: number, unit: string): number | null {
  switch (canonicalizeUnit(unit)) {
    case "mg":
      return quantity / 1000;
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "oz":
      return quantity * 28.349523125;
    case "lb":
      return quantity * 453.59237;
    default:
      return null;
  }
}

export function gramsToMassUnit(grams: number, unit: string): number | null {
  switch (canonicalizeUnit(unit)) {
    case "mg":
      return grams * 1000;
    case "g":
      return grams;
    case "kg":
      return grams / 1000;
    case "oz":
      return grams / 28.349523125;
    case "lb":
      return grams / 453.59237;
    default:
      return null;
  }
}

export type UnitFamily = "volume" | "mass" | "countable" | "unknown";

const VOLUME_SET = new Set([
  "tsp",
  "tbsp",
  "dessertspoon",
  "cup",
  "fl_oz",
  "pint",
  "quart",
  "gallon",
  "ml",
  "l",
]);

const MASS_SET = new Set(["mg", "g", "kg", "oz", "lb"]);

export function unitFamily(unit: string): UnitFamily {
  const c = canonicalizeUnit(unit);
  if (VOLUME_SET.has(c)) return "volume";
  if (MASS_SET.has(c)) return "mass";
  if (COUNTABLE_UNIT_SET.has(c) || c === "") return "countable";
  return "unknown";
}
