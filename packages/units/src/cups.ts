import type { CupStandard } from "@ladlelink/types";
import { COUNTABLE_UNIT_SET, UNIT_ALIASES } from "./catalog.js";

/** Milliliters per cup for each locale. */
export function mlPerCup(standard: CupStandard): number {
  return standard === "us" ? 240 : 250;
}

/** US customary tsp/tbsp in ml (same for both locales; cups differ). */
export const ML_PER_TSP = 4.92892159375;
export const ML_PER_TBSP = 14.78676478125;
export const ML_PER_FL_OZ = 29.5735295625;
export const ML_PER_DESSERTSPOON = 10;
export const ML_PER_PINT = 473.176473;
export const ML_PER_QUART = 946.352946;
export const ML_PER_GALLON = 3785.411784;

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

export function volumeUnitToMl(
  quantity: number,
  unit: string,
  cupStandard: CupStandard
): number | null {
  switch (canonicalizeUnit(unit)) {
    case "ml":
      return quantity;
    case "l":
      return quantity * 1000;
    case "tsp":
      return quantity * ML_PER_TSP;
    case "tbsp":
      return quantity * ML_PER_TBSP;
    case "dessertspoon":
      return quantity * ML_PER_DESSERTSPOON;
    case "fl_oz":
      return quantity * ML_PER_FL_OZ;
    case "cup":
      return quantity * mlPerCup(cupStandard);
    case "pint":
      return quantity * ML_PER_PINT;
    case "quart":
      return quantity * ML_PER_QUART;
    case "gallon":
      return quantity * ML_PER_GALLON;
    default:
      return null;
  }
}

export function mlToVolumeUnit(
  ml: number,
  unit: string,
  cupStandard: CupStandard
): number | null {
  switch (canonicalizeUnit(unit)) {
    case "ml":
      return ml;
    case "l":
      return ml / 1000;
    case "tsp":
      return ml / ML_PER_TSP;
    case "tbsp":
      return ml / ML_PER_TBSP;
    case "dessertspoon":
      return ml / ML_PER_DESSERTSPOON;
    case "fl_oz":
      return ml / ML_PER_FL_OZ;
    case "cup":
      return ml / mlPerCup(cupStandard);
    case "pint":
      return ml / ML_PER_PINT;
    case "quart":
      return ml / ML_PER_QUART;
    case "gallon":
      return ml / ML_PER_GALLON;
    default:
      return null;
  }
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
