import type { IngredientKind } from "@ladlelink/types";
import { aliasMatchScore } from "./alias-match.js";
import { GENERATED_DENSITY_TABLE } from "./generated/density.generated.js";
import { expandNameVariants } from "./name-variants.js";

export interface DensityEntry {
  key: string;
  aliases: string[];
  densityGPerMl: number;
  kind: IngredientKind;
}

/** Hand-tuned overrides (prefer these aliases / values over generated). */
const HAND_DENSITY_OVERRIDES: DensityEntry[] = [
  { key: "water", aliases: ["water"], densityGPerMl: 1.0, kind: "wet" },
  {
    key: "flour",
    aliases: ["flour", "all-purpose flour", "plain flour", "ap flour", "white flour"],
    densityGPerMl: 0.5208,
    kind: "dry",
  }, // ~125 g / US cup
  {
    key: "bread flour",
    aliases: ["bread flour", "strong flour"],
    densityGPerMl: 0.54,
    kind: "dry",
  },
  { key: "cake flour", aliases: ["cake flour"], densityGPerMl: 0.46, kind: "dry" },
  {
    key: "sugar",
    aliases: ["sugar", "white sugar", "granulated sugar", "caster sugar"],
    densityGPerMl: 0.8333,
    kind: "dry",
  }, // ~200 g / cup
  {
    key: "brown sugar",
    aliases: ["brown sugar", "light brown sugar", "dark brown sugar", "packed brown sugar"],
    densityGPerMl: 0.9167,
    kind: "dry",
  }, // ~220 g packed / cup
  {
    key: "powdered sugar",
    aliases: [
      "powdered sugar",
      "icing sugar",
      "confectioners sugar",
      "confectioners' sugar",
    ],
    densityGPerMl: 0.5,
    kind: "dry",
  },
  {
    key: "butter",
    aliases: [
      "butter",
      "unsalted butter",
      "salted butter",
      "softened butter",
      "melted butter",
    ],
    densityGPerMl: 0.911,
    kind: "wet",
  },
  {
    key: "oil",
    aliases: [
      "oil",
      "vegetable oil",
      "canola oil",
      "rapeseed oil",
      "sunflower oil",
      "neutral oil",
      "cooking oil",
    ],
    densityGPerMl: 0.92,
    kind: "wet",
  },
  {
    key: "olive oil",
    aliases: [
      "olive oil",
      "extra-virgin olive oil",
      "extra virgin olive oil",
      "evoo",
    ],
    densityGPerMl: 0.91,
    kind: "wet",
  },
  { key: "honey", aliases: ["honey"], densityGPerMl: 1.42, kind: "wet" },
  {
    key: "milk",
    aliases: [
      "milk",
      "whole milk",
      "2% milk",
      "skim milk",
      "skimmed milk",
      "low-fat milk",
    ],
    densityGPerMl: 1.03,
    kind: "wet",
  },
  {
    key: "cream",
    aliases: [
      "cream",
      "heavy cream",
      "whipping cream",
      "heavy whipping cream",
      "double cream",
    ],
    densityGPerMl: 0.994,
    kind: "wet",
  },
  {
    key: "table salt",
    aliases: ["table salt", "salt", "fine salt", "iodized salt"],
    densityGPerMl: 1.217,
    kind: "dry",
  },
  {
    key: "sea salt",
    aliases: ["sea salt", "fine sea salt", "flaky sea salt", "flaky salt"],
    densityGPerMl: 1.1,
    kind: "dry",
  },
  {
    key: "kosher salt",
    aliases: ["kosher salt"],
    densityGPerMl: 0.72,
    kind: "dry",
  },
  {
    // Must beat generated "peppers" (bell pepper) — "black pepper" pluralizes to "black peppers".
    key: "black pepper",
    aliases: [
      "black pepper",
      "freshly ground black pepper",
      "ground black pepper",
      "freshly cracked black pepper",
      "peppercorn",
      "peppercorns",
    ],
    densityGPerMl: 0.48,
    kind: "dry",
  },
  {
    key: "ginger",
    aliases: ["ginger", "fresh ginger", "ginger root"],
    densityGPerMl: 1.0,
    kind: "other",
  },
  {
    key: "vanilla extract",
    aliases: [
      "vanilla extract",
      "pure vanilla extract",
      "vanilla essence",
    ],
    densityGPerMl: 0.88,
    kind: "wet",
  },
  {
    key: "whole wheat flour",
    aliases: ["whole wheat flour", "wholemeal flour", "whole-wheat flour"],
    densityGPerMl: 0.5,
    kind: "dry",
  },
  { key: "cornstarch", aliases: ["cornstarch", "corn starch", "cornflour"], densityGPerMl: 0.54, kind: "dry" },
  { key: "cocoa", aliases: ["cocoa", "cocoa powder", "unsweetened cocoa"], densityGPerMl: 0.41, kind: "dry" },
  {
    key: "baking soda",
    aliases: [
      "baking soda",
      "bicarbonate of soda",
      "bicarb",
      "bicarb soda",
      "sodium bicarbonate",
    ],
    densityGPerMl: 1.2, // ~6 g / tsp
    kind: "dry",
  },
  {
    key: "baking powder",
    aliases: ["baking powder"],
    densityGPerMl: 0.8, // ~4 g / tsp
    kind: "dry",
  },
  {
    key: "breadcrumbs",
    aliases: ["breadcrumbs", "bread crumbs", "panko", "panko breadcrumbs"],
    densityGPerMl: 0.45,
    kind: "dry",
  },
  {
    key: "fennel",
    aliases: ["fennel", "fennel bulb", "fennel bulbs"],
    densityGPerMl: 0.59,
    kind: "other",
  },
  {
    key: "dill",
    aliases: ["dill", "fresh dill", "dill weed"],
    densityGPerMl: 0.1,
    kind: "other",
  },
  {
    key: "mint",
    aliases: ["mint", "fresh mint", "spearmint", "peppermint"],
    densityGPerMl: 0.1,
    kind: "other",
  },
  { key: "rice", aliases: ["rice", "white rice", "uncooked rice"], densityGPerMl: 0.7708, kind: "dry" },
  { key: "oats", aliases: ["oats", "rolled oats", "oatmeal"], densityGPerMl: 0.3375, kind: "dry" },
  {
    key: "herb",
    aliases: ["herb", "herbs", "tarragon", "fresh tarragon", "dried tarragon"],
    densityGPerMl: 0.25,
    kind: "dry",
  },
  /**
   * Catch-all for dried herbs & ground spices (~1 g/tsp leafy herbs).
   * Fresh soft herbs (basil, parsley, cilantro) stay on their own rows.
   */
  {
    key: "spice",
    aliases: [
      "spice",
      "spices",
      "dried spice",
      "dried spices",
      "dried herb",
      "dried herbs",
      "seasoning",
      "seasonings",
      "oregano",
      "dried oregano",
      "thyme",
      "dried thyme",
      "rosemary",
      "dried rosemary",
      "sage",
      "dried sage",
      "marjoram",
      "italian seasoning",
      "herbes de provence",
      "paprika",
      "smoked paprika",
      "cumin",
      "ground cumin",
      "garlic powder",
      "onion powder",
      "chili powder",
      "chilli powder",
      "chili flakes",
      "chilli flakes",
      "red pepper flakes",
      "crushed red pepper",
      "cayenne",
      "cinnamon",
      "ground cinnamon",
      "turmeric",
      "nutmeg",
      "ground nutmeg",
      "bay leaf",
      "bay leaves",
      "dried bay leaf",
      "ground coriander",
      "coriander seeds",
    ],
    densityGPerMl: 0.25,
    kind: "dry",
  },
];

/**
 * Extra aliases for generated (or hand) density rows so Measure as… synonyms
 * resolve (aubergine → eggplant, prawn → shrimp, etc.).
 */
const EXTRA_DENSITY_ALIASES: Record<string, string[]> = {
  eggplant: ["aubergine", "aubergines"],
  zucchini: ["courgette", "courgettes"],
  beets: ["beet", "beetroot", "beetroots"],
  cabbage: ["bok choy", "bok choys", "bokchoy", "pak choi"],
  peppers: [
    "capsicum",
    "capsicums",
    "chile",
    "chiles",
    "chilli",
    "chillies",
    "jalapeno",
    "jalapenos",
    "habanero",
    "habaneros",
    "serrano",
    "serranos",
  ],
  celery: ["celeriac", "celery root"],
  corn: ["cob", "corn cob"],
  water_chesnut: ["water chestnut", "water chestnuts"],
  honeydew_melon: ["honeydew", "honeydews"],
  kiwi_fruit: ["kiwi", "kiwis", "kiwifruit"],
  shrimp: ["prawn", "prawns"],
  onions: ["scallion", "scallions", "shallot", "shallots"],
  green_peas: ["snap pea", "snap peas", "snow pea", "snow peas"],
  sweet_potato: ["yam", "yams"],
  cheese: ["parmesan", "parmesan cheese", "parm"],
  "vanilla extract": ["vanilla"],
  cilantro: ["coriander", "fresh coriander"],
};

const overrideKeys = new Set(HAND_DENSITY_OVERRIDES.map((e) => e.key));

function withExtraAliases(entries: DensityEntry[]): DensityEntry[] {
  return entries.map((entry) => {
    const extra = EXTRA_DENSITY_ALIASES[entry.key];
    if (!extra?.length) return entry;
    return { ...entry, aliases: [...new Set([...entry.aliases, ...extra])] };
  });
}

/** Approximate bulk densities for recipe ingredients (g/ml). Hand overrides + USDA FNDDS mined. */
export const DENSITY_TABLE: DensityEntry[] = withExtraAliases([
  ...HAND_DENSITY_OVERRIDES,
  ...GENERATED_DENSITY_TABLE.filter((e) => !overrideKeys.has(e.key)),
]);

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupDensity(name: string): DensityEntry | null {
  const n = normalizeName(name);
  if (!n) return null;

  const variants = expandNameVariants(n);
  let best: DensityEntry | null = null;
  let bestScore = 0;
  for (const entry of DENSITY_TABLE) {
    const targets = [entry.key.replace(/_/g, " "), ...entry.aliases];
    for (const variant of variants) {
      for (const alias of targets) {
        const score = aliasMatchScore(variant, normalizeName(alias));
        if (score > bestScore) {
          best = entry;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export function resolveDensity(
  name: string,
  override?: number
): { densityGPerMl: number; kind: IngredientKind; fromTable: boolean } | null {
  if (override != null && Number.isFinite(override) && override > 0) {
    const entry = lookupDensity(name);
    return {
      densityGPerMl: override,
      kind: entry?.kind ?? "other",
      fromTable: false,
    };
  }
  const entry = lookupDensity(name);
  if (!entry) return null;
  return {
    densityGPerMl: entry.densityGPerMl,
    kind: entry.kind,
    fromTable: true,
  };
}
