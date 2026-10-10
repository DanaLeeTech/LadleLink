import { PRODUCE_UNIT_SET, unitLabel } from "./catalog.js";
import { canonicalizeUnit } from "./cups.js";

const IRREGULAR_UNITS: Record<string, string> = {
  pinch: "pinches",
  leaf: "leaves",
  bay_leaf: "bay leaves",
  dash: "dashes",
  whole: "whole",
  smidgen: "smidgens",
  handful: "handfuls",
  to_taste: "to taste",
  garnish: "garnish",
  // Abbreviations stay unchanged (defaultPlural would turn "oz" into "ozes")
  oz: "oz",
  lb: "lb",
  mg: "mg",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  tsp: "tsp",
  tbsp: "tbsp",
  fl_oz: "fl oz",
  dessertspoon: "dessertspoons",
  spring_onion: "spring onions",
  green_onion: "green onions",
};

/** Full plural label for produce used as a unit or bare name. */
const IRREGULAR_PRODUCE: Record<string, string> = {
  tomato: "tomatoes",
  potato: "potatoes",
  sweet_potato: "sweet potatoes",
  cherry_tomato: "cherry tomatoes",
  cherry: "cherries",
  berry: "berries",
  strawberry: "strawberries",
  blueberry: "blueberries",
  raspberry: "raspberries",
  peach: "peaches",
  radish: "radishes",
  leaf: "leaves",
  bay_leaf: "bay leaves",
  mango: "mangoes",
  chili: "chilies",
  chilli: "chillies",
  // Mass / uncountable in recipes — don't invent plurals
  garlic: "garlic",
  ginger: "ginger",
  celery: "celery",
  broccoli: "broccoli",
  fennel: "fennel",
  corn: "corn",
  lettuce: "lettuce",
  cabbage: "cabbage",
  cauliflower: "cauliflower",
  asparagus: "asparagus",
  spinach: "spinach",
  kale: "kale",
  chard: "chard",
  bok_choy: "bok choy",
  bacon: "bacon",
  shrimp: "shrimp",
  okra: "okra",
  squash: "squash",
};

function isPluralQuantity(quantity: number): boolean {
  return Number.isFinite(quantity) && Math.abs(quantity - 1) > 1e-9;
}

function defaultPlural(word: string): string {
  if (word.endsWith("y") && word.length > 1 && !/[aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Human unit label, pluralized when quantity is not 1. */
export function pluralUnitLabel(unit: string, quantity: number): string {
  const c = canonicalizeUnit(unit);
  if (!c) return "";
  const base = unitLabel(c);
  if (!isPluralQuantity(quantity)) return base;
  if (IRREGULAR_UNITS[c]) return IRREGULAR_UNITS[c];
  if (IRREGULAR_PRODUCE[c]) return IRREGULAR_PRODUCE[c];
  const parts = base.split(" ");
  if (parts.length > 1) {
    const last = parts[parts.length - 1]!;
    parts[parts.length - 1] = defaultPlural(last);
    return parts.join(" ");
  }
  return defaultPlural(base);
}

/** Pluralize a produce name for preview when qty ≠ 1. */
export function pluralProduceName(name: string, quantity: number): string {
  const trimmed = name.trim();
  if (!isPluralQuantity(quantity)) return trimmed;
  const key = trimmed.toLowerCase().replace(/\s+/g, "_");
  if (IRREGULAR_PRODUCE[key]) return IRREGULAR_PRODUCE[key];
  if (PRODUCE_UNIT_SET.has(key)) return defaultPlural(trimmed.toLowerCase());
  return trimmed;
}
