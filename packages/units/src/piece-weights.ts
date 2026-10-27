import type { Ingredient, ProduceSize } from "@ladlelink/types";
import { bestAliasScore } from "./alias-match.js";
import { resolveConversionName } from "./conversion-key.js";
import { canonicalizeUnit } from "./cups.js";
import { GENERATED_PIECE_WEIGHTS, type PieceWeightEntry } from "./generated/piece-weights.generated.js";

export type { PieceWeightEntry };
export { GENERATED_PIECE_WEIGHTS };

const HAND_PIECE_OVERRIDES: PieceWeightEntry[] = [
  {
    key: "banana",
    aliases: ["banana", "bananas"],
    grams: { small: 101, medium: 118, large: 136 },
  },
  {
    key: "egg",
    aliases: ["egg", "eggs"],
    grams: { small: 40, medium: 50, large: 60 },
  },
  {
    key: "garlic_clove",
    aliases: ["garlic"],
    units: ["clove"],
    grams: { small: 2, medium: 3, large: 5 },
  },
  {
    key: "butter_stick",
    aliases: ["butter", "unsalted butter", "salted butter"],
    units: ["stick"],
    grams: { small: 113, medium: 113, large: 113 },
  },
  {
    key: "celery_stalk",
    aliases: ["celery"],
    units: ["stalk", "rib"],
    grams: { small: 30, medium: 40, large: 55 },
  },
  {
    key: "celery",
    aliases: ["celery"],
    grams: { small: 30, medium: 40, large: 55 },
  },
  {
    key: "asparagus_spear",
    aliases: ["asparagus"],
    units: ["spear"],
    grams: { small: 12, medium: 16, large: 22 },
  },
  {
    key: "bacon_slice",
    aliases: ["bacon"],
    units: ["slice", "rasher"],
    grams: { small: 8, medium: 12, large: 16 },
  },
  {
    key: "bread_slice",
    aliases: ["bread", "white bread", "wheat bread", "sandwich bread"],
    units: ["slice"],
    grams: { small: 25, medium: 28, large: 35 },
  },
  {
    key: "chicken_breast",
    aliases: ["chicken breast", "chicken breasts"],
    grams: { small: 120, medium: 174, large: 220 },
  },
  {
    key: "onion",
    aliases: [
      "onion",
      "onions",
      "yellow onion",
      "yellow onions",
      "white onion",
      "red onion",
      "sweet onion",
    ],
    grams: { small: 110, medium: 150, large: 190 },
  },
  {
    key: "tomato",
    aliases: ["tomato", "tomatoes", "roma tomato", "plum tomato"],
    grams: { small: 90, medium: 123, large: 180 },
  },
  {
    key: "potato",
    aliases: ["potato", "potatoes", "russet potato", "yukon gold potato"],
    grams: { small: 140, medium: 213, large: 300 },
  },
  // Override FNDDS slice-sized "carrots" (~5 g) with whole-carrot weights.
  {
    key: "carrots",
    aliases: ["carrot", "carrots"],
    grams: { small: 50, medium: 72, large: 100 },
  },
  // Override FNDDS slice-sized "peppers" (~12 g) with whole bell peppers.
  // Avoid bare "pepper" as a containment alias — it would match "black pepper".
  {
    key: "peppers",
    aliases: [
      "pepper",
      "peppers",
      "bell pepper",
      "bell peppers",
      "capsicum",
      "sweet pepper",
      "sweet peppers",
    ],
    grams: { small: 120, medium: 150, large: 200 },
  },
  // Generated key is misspelled "water_chesnut"; also answer to the correct spelling.
  {
    key: "water_chesnut",
    aliases: ["water chesnut", "water chestnut", "water chestnuts"],
    grams: { small: 7.5, medium: 10, large: 12.5 },
  },
  {
    key: "ginger",
    aliases: ["ginger", "fresh ginger", "ginger root"],
    grams: { small: 8, medium: 12, large: 20 },
  },
  {
    key: "ginger_knob",
    aliases: ["ginger", "fresh ginger", "ginger root"],
    units: ["knob", "piece"],
    grams: { small: 8, medium: 12, large: 20 },
  },
  {
    key: "bay_leaf",
    aliases: ["bay leaf", "bay leaves"],
    units: ["leaf", "piece"],
    grams: { small: 0.15, medium: 0.2, large: 0.25 },
  },
  {
    key: "herb_sprig",
    aliases: [
      "thyme",
      "rosemary",
      "sage",
      "dill",
      "mint",
      "oregano",
      "tarragon",
      "marjoram",
    ],
    units: ["sprig"],
    grams: { small: 0.8, medium: 1, large: 1.3 },
  },
  // Seasoning countables — unit-gated so produce rows don't steal pinch/twist.
  {
    key: "black_pepper_twist",
    aliases: [
      "black pepper",
      "freshly ground black pepper",
      "ground black pepper",
      "freshly cracked black pepper",
    ],
    units: ["twist"],
    grams: { small: 0.05, medium: 0.1, large: 0.2 },
  },
  {
    key: "black_pepper_pinch",
    aliases: [
      "black pepper",
      "freshly ground black pepper",
      "ground black pepper",
      "freshly cracked black pepper",
    ],
    units: ["pinch"],
    grams: { small: 0.1, medium: 0.15, large: 0.25 },
  },
  {
    key: "black_pepper_dash",
    aliases: [
      "black pepper",
      "freshly ground black pepper",
      "ground black pepper",
      "freshly cracked black pepper",
    ],
    units: ["dash"],
    grams: { small: 0.2, medium: 0.3, large: 0.45 },
  },
  {
    key: "black_pepper_smidgen",
    aliases: [
      "black pepper",
      "freshly ground black pepper",
      "ground black pepper",
      "freshly cracked black pepper",
    ],
    units: ["smidgen"],
    grams: { small: 0.05, medium: 0.08, large: 0.12 },
  },
  {
    key: "table_salt_pinch",
    aliases: ["table salt", "salt", "fine salt", "iodized salt"],
    units: ["pinch"],
    grams: { small: 0.25, medium: 0.36, large: 0.5 },
  },
  {
    key: "table_salt_dash",
    aliases: ["table salt", "salt", "fine salt", "iodized salt"],
    units: ["dash"],
    grams: { small: 0.5, medium: 0.75, large: 1 },
  },
  {
    key: "table_salt_smidgen",
    aliases: ["table salt", "salt", "fine salt", "iodized salt"],
    units: ["smidgen"],
    grams: { small: 0.12, medium: 0.18, large: 0.25 },
  },
  {
    key: "sea_salt_pinch",
    aliases: ["sea salt", "fine sea salt", "flaky sea salt", "flaky salt"],
    units: ["pinch"],
    grams: { small: 0.22, medium: 0.34, large: 0.45 },
  },
  {
    key: "sea_salt_dash",
    aliases: ["sea salt", "fine sea salt", "flaky sea salt", "flaky salt"],
    units: ["dash"],
    grams: { small: 0.45, medium: 0.68, large: 0.9 },
  },
  {
    key: "sea_salt_smidgen",
    aliases: ["sea salt", "fine sea salt", "flaky sea salt", "flaky salt"],
    units: ["smidgen"],
    grams: { small: 0.1, medium: 0.17, large: 0.22 },
  },
  {
    key: "kosher_salt_pinch",
    aliases: ["kosher salt"],
    units: ["pinch"],
    grams: { small: 0.15, medium: 0.22, large: 0.3 },
  },
  {
    key: "kosher_salt_dash",
    aliases: ["kosher salt"],
    units: ["dash"],
    grams: { small: 0.3, medium: 0.44, large: 0.6 },
  },
  {
    key: "kosher_salt_smidgen",
    aliases: ["kosher salt"],
    units: ["smidgen"],
    grams: { small: 0.08, medium: 0.11, large: 0.15 },
  },
  {
    key: "spice_pinch",
    aliases: [
      "spice",
      "spices",
      "dried herb",
      "dried herbs",
      "seasoning",
      "seasonings",
      "oregano",
      "thyme",
      "rosemary",
      "sage",
      "marjoram",
      "tarragon",
      "italian seasoning",
      "paprika",
      "smoked paprika",
      "cumin",
      "garlic powder",
      "onion powder",
      "chili powder",
      "chili flakes",
      "red pepper flakes",
      "cayenne",
      "cinnamon",
      "turmeric",
      "nutmeg",
    ],
    units: ["pinch"],
    grams: { small: 0.05, medium: 0.08, large: 0.12 },
  },
  {
    key: "spice_dash",
    aliases: [
      "spice",
      "spices",
      "dried herb",
      "dried herbs",
      "seasoning",
      "seasonings",
      "oregano",
      "thyme",
      "rosemary",
      "sage",
      "marjoram",
      "tarragon",
      "italian seasoning",
      "paprika",
      "smoked paprika",
      "cumin",
      "garlic powder",
      "onion powder",
      "chili powder",
      "chili flakes",
      "red pepper flakes",
      "cayenne",
      "cinnamon",
      "turmeric",
      "nutmeg",
    ],
    units: ["dash"],
    grams: { small: 0.1, medium: 0.15, large: 0.25 },
  },
  {
    key: "spice_smidgen",
    aliases: [
      "spice",
      "spices",
      "dried herb",
      "dried herbs",
      "seasoning",
      "seasonings",
      "oregano",
      "thyme",
      "rosemary",
      "sage",
      "marjoram",
      "tarragon",
      "italian seasoning",
      "paprika",
      "smoked paprika",
      "cumin",
      "garlic powder",
      "onion powder",
      "chili powder",
      "chili flakes",
      "red pepper flakes",
      "cayenne",
      "cinnamon",
      "turmeric",
      "nutmeg",
    ],
    units: ["smidgen"],
    grams: { small: 0.03, medium: 0.04, large: 0.06 },
  },
  {
    key: "lemon_wedge",
    aliases: ["lemon", "lemons"],
    units: ["wedge"],
    grams: { small: 6, medium: 9, large: 12 },
  },
  {
    key: "lemon_slice",
    aliases: ["lemon", "lemons"],
    units: ["slice"],
    grams: { small: 4, medium: 6, large: 8 },
  },
  {
    key: "lime_wedge",
    aliases: ["lime", "limes"],
    units: ["wedge"],
    grams: { small: 4, medium: 6, large: 8 },
  },
  {
    key: "lime_slice",
    aliases: ["lime", "limes"],
    units: ["slice"],
    grams: { small: 3, medium: 4, large: 6 },
  },
  {
    key: "vanilla_drop",
    aliases: [
      "vanilla extract",
      "pure vanilla extract",
      "vanilla essence",
    ],
    units: ["drop"],
    grams: { small: 0.04, medium: 0.05, large: 0.06 },
  },
  {
    key: "spinach_handful",
    aliases: ["spinach", "baby spinach"],
    units: ["handful"],
    grams: { small: 20, medium: 30, large: 45 },
  },
  {
    key: "sour_cream_dollop",
    aliases: ["sour cream", "creme fraiche", "crème fraîche"],
    units: ["dollop"],
    grams: { small: 12, medium: 18, large: 25 },
  },
];

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PIECE_TABLE: PieceWeightEntry[] = (() => {
  const overrideKeys = new Set(HAND_PIECE_OVERRIDES.map((e) => e.key));
  return [
    ...HAND_PIECE_OVERRIDES,
    ...GENERATED_PIECE_WEIGHTS.filter((e) => !overrideKeys.has(e.key)),
  ];
})();

function sizeGrams(entry: PieceWeightEntry, size?: ProduceSize): number {
  if (size === "small") return entry.grams.small;
  if (size === "large") return entry.grams.large;
  return entry.grams.medium;
}

/**
 * Resolve grams-per-piece for a countable ingredient.
 * Prefer unit-gated matches (clove + garlic) over bare name matches.
 */
export function resolvePieceGrams(ingredient: Ingredient): number | null {
  const unit = canonicalizeUnit(ingredient.unit || "");
  const name = normalizeName(resolveConversionName(ingredient));
  if (!name && !unit) return null;

  let best: { entry: PieceWeightEntry; score: number } | null = null;

  for (const entry of PIECE_TABLE) {
    const gated = Boolean(entry.units?.length);
    const unitOk = gated ? !!unit && entry.units!.includes(unit) : true;
    if (!unitOk) continue;

    const aliasScore = name ? bestAliasScore(name, entry.aliases) : 0;
    if (!aliasScore) continue;

    // Prefer gated matches; then stronger alias scores
    const score = (gated ? 100_000 : 0) + aliasScore;
    if (!best || score > best.score) best = { entry, score };
  }

  if (!best) return null;
  return sizeGrams(best.entry, ingredient.size);
}

export function lookupPieceWeight(name: string, unit?: string): PieceWeightEntry | null {
  const n = normalizeName(name);
  const u = unit ? canonicalizeUnit(unit) : "";
  let best: { entry: PieceWeightEntry; score: number } | null = null;
  for (const entry of PIECE_TABLE) {
    const gated = Boolean(entry.units?.length);
    if (gated && (!u || !entry.units!.includes(u))) continue;
    if (!gated && u && u !== "piece") continue;
    const aliasScore = bestAliasScore(n, entry.aliases);
    if (!aliasScore) continue;
    const score = (gated ? 100_000 : 0) + aliasScore;
    if (!best || score > best.score) best = { entry, score };
  }
  return best?.entry ?? null;
}
