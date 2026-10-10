import type { Ingredient, ProduceSize } from "@ladlelink/types";
import { PRODUCE_UNIT_SET } from "./catalog.js";
import { canonicalizeUnit, unitFamily } from "./cups.js";

/** Culinary adjectives allowed before a produce noun ("yellow onion"). */
const PRODUCE_NAME_PREFIXES = new Set([
  "yellow",
  "white",
  "red",
  "green",
  "brown",
  "purple",
  "orange",
  "ripe",
  "baby",
  "fresh",
  "organic",
  "sweet",
  "hot",
  "bell",
  "roma",
  "plum",
  "cherry",
  "grape",
  "russet",
  "yukon",
  "new",
  "spring",
]);

/**
 * Countable units where small/medium/large is meaningful for produce.
 * Packaging and seasoning counts (can, pinch, sprig, …) are excluded.
 */
const SIZEABLE_PRODUCE_UNITS = new Set([
  "",
  "piece",
  "whole",
  "clove",
  "stalk",
  "rib",
  "spear",
  "head",
  "bulb",
  "ear",
  "floret",
  "wedge",
  "slice",
]);

/** True when name/unit/conversionKey refers to a catalog fruit or vegetable. */
export function isProduceIngredient(
  ing: Pick<Ingredient, "name" | "unit" | "conversionKey">
): boolean {
  const key = ing.conversionKey?.trim();
  // Prefer Measure-as key so "black pepper" is not treated as produce "pepper".
  if (key) return matchesProduceLabel(key);

  if (ing.unit && matchesProduceLabel(String(ing.unit))) return true;
  return isProducePhrase(ing.name || "");
}

function matchesProduceLabel(label: string): boolean {
  if (!label) return false;
  const n = label.toLowerCase().replace(/_/g, " ").trim();
  if (!n) return false;
  const underscored = n.replace(/\s+/g, "_");
  if (PRODUCE_UNIT_SET.has(underscored)) return true;
  return PRODUCE_UNIT_SET.has(canonicalizeUnit(n));
}

function isProducePhrase(name: string): boolean {
  const head = name.toLowerCase().replace(/_/g, " ").split(",")[0]!.trim();
  if (!head) return false;
  if (matchesProduceLabel(head)) return true;

  const tokens = head.split(/\s+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const slice = tokens.slice(i).join(" ");
    if (!matchesProduceLabel(slice)) continue;
    const prefix = tokens.slice(0, i);
    if (prefix.every((t) => PRODUCE_NAME_PREFIXES.has(t))) return true;
  }
  return false;
}

/**
 * Default produce size to medium when the recipe counts produce without
 * small/medium/large, but not when an absolute mass/volume is given, and
 * not for countables where size is meaningless (can, pinch, sprig, …).
 */
export function defaultProduceSize(
  ing: Pick<Ingredient, "name" | "unit" | "conversionKey" | "size">
): ProduceSize | undefined {
  if (ing.size) return undefined;
  const unit = canonicalizeUnit(ing.unit || "");
  const family = unitFamily(unit);
  if (family === "volume" || family === "mass") return undefined;
  if (!SIZEABLE_PRODUCE_UNITS.has(unit)) return undefined;
  if (!isProduceIngredient(ing)) return undefined;
  return "medium";
}
