import type { Ingredient } from "@ladlelink/types";
import { aliasMatchScore } from "./alias-match.js";
import { PRODUCE_UNITS, unitLabel } from "./catalog.js";
import { DENSITY_TABLE } from "./density.js";
import { GENERATED_PIECE_WEIGHTS } from "./generated/piece-weights.generated.js";
import { isProduceIngredient } from "./produce.js";

/**
 * Surface forms → canonical conversion label (what Measure as… stores).
 * Longer / more specific aliases win at infer time.
 */
const CONVERSION_ALIAS_SEEDS: Record<string, string[]> = {
  butter: [
    "butter",
    "unsalted butter",
    "salted butter",
    "softened butter",
    "melted butter",
    "sweet butter",
  ],
  margarine: ["margarine"],
  flour: [
    "flour",
    "all-purpose flour",
    "all purpose flour",
    "ap flour",
    "plain flour",
    "white flour",
    "wheat flour",
  ],
  "bread flour": ["bread flour", "strong flour", "strong white flour"],
  "cake flour": ["cake flour", "soft flour"],
  "whole wheat flour": [
    "whole wheat flour",
    "wholemeal flour",
    "whole-wheat flour",
    "graham flour",
  ],
  sugar: [
    "sugar",
    "white sugar",
    "granulated sugar",
    "caster sugar",
    "castor sugar",
    "superfine sugar",
  ],
  "brown sugar": [
    "brown sugar",
    "light brown sugar",
    "dark brown sugar",
    "packed brown sugar",
    "packed light brown sugar",
    "packed dark brown sugar",
  ],
  "powdered sugar": [
    "powdered sugar",
    "icing sugar",
    "confectioners sugar",
    "confectioners' sugar",
    "confectioner's sugar",
  ],
  "baking soda": [
    "baking soda",
    "bicarbonate of soda",
    "bicarb",
    "bicarb soda",
    "sodium bicarbonate",
  ],
  "baking powder": ["baking powder"],
  "table salt": ["table salt", "salt", "fine salt", "iodized salt"],
  "sea salt": ["sea salt", "fine sea salt", "flaky sea salt", "flaky salt"],
  "kosher salt": ["kosher salt"],
  oil: [
    "oil",
    "vegetable oil",
    "canola oil",
    "rapeseed oil",
    "sunflower oil",
    "neutral oil",
    "cooking oil",
  ],
  "olive oil": [
    "olive oil",
    "extra-virgin olive oil",
    "extra virgin olive oil",
    "evoo",
  ],
  milk: [
    "milk",
    "whole milk",
    "2% milk",
    "2 percent milk",
    "skim milk",
    "skimmed milk",
    "low-fat milk",
    "low fat milk",
  ],
  cream: [
    "cream",
    "heavy cream",
    "whipping cream",
    "heavy whipping cream",
    "double cream",
    "single cream",
  ],
  yogurt: ["yogurt", "yoghurt", "greek yogurt", "greek yoghurt", "plain yogurt"],
  water: ["water"],
  honey: ["honey"],
  rice: ["rice", "white rice", "uncooked rice", "long-grain rice", "jasmine rice", "basmati rice"],
  oats: ["oats", "rolled oats", "oatmeal", "old-fashioned oats"],
  cornstarch: ["cornstarch", "corn starch", "cornflour", "corn flour"],
  cocoa: ["cocoa", "cocoa powder", "unsweetened cocoa", "unsweetened cocoa powder"],
  onion: [
    "onion",
    "onions",
    "yellow onion",
    "yellow onions",
    "white onion",
    "white onions",
    "red onion",
    "red onions",
    "sweet onion",
    "sweet onions",
    "brown onion",
    "brown onions",
  ],
  tomato: [
    "tomato",
    "tomatoes",
    "roma tomato",
    "roma tomatoes",
    "plum tomato",
    "plum tomatoes",
  ],
  "cherry tomato": [
    "cherry tomato",
    "cherry tomatoes",
    "grape tomato",
    "grape tomatoes",
  ],
  potato: [
    "potato",
    "potatoes",
    "russet potato",
    "russet potatoes",
    "yukon gold potato",
    "yukon potatoes",
    "baby potato",
    "baby potatoes",
  ],
  "sweet potato": ["sweet potato", "sweet potatoes", "yam", "yams"],
  garlic: ["garlic"],
  egg: ["egg", "eggs", "large egg", "large eggs", "medium egg", "medium eggs"],
  "chicken breast": [
    "chicken breast",
    "chicken breasts",
    "boneless chicken breast",
    "boneless skinless chicken breast",
    "boneless skinless chicken breasts",
  ],
  banana: ["banana", "bananas", "ripe banana", "ripe bananas"],
  carrot: ["carrot", "carrots"],
  celery: ["celery"],
  lemon: ["lemon", "lemons"],
  lime: ["lime", "limes"],
  apple: ["apple", "apples"],
  pepper: ["bell pepper", "bell peppers", "capsicum", "sweet pepper"],
  "black pepper": [
    "black pepper",
    "freshly ground black pepper",
    "ground black pepper",
    "freshly cracked black pepper",
  ],
  spice: [
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
    "tarragon",
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
  ],
  shrimp: ["shrimp", "prawn", "prawns"],
  bacon: ["bacon"],
  ginger: ["ginger", "fresh ginger", "ginger root"],
};

const NOISE_PHRASES = [
  "room temperature",
  "plus more for",
  "plus more",
  "to taste",
  "or more",
  "as needed",
  "if desired",
  "for garnish",
  "for serving",
];

const NOISE_TOKENS = new Set([
  "fresh",
  "frozen",
  "organic",
  "raw",
  "cooked",
  "dried",
  "coarsely",
  "finely",
  "roughly",
  "thinly",
  "thickly",
  "chopped",
  "diced",
  "sliced",
  "minced",
  "grated",
  "shredded",
  "crushed",
  "ground",
  "packed",
  "sifted",
  "softened",
  "melted",
  "divided",
  "optional",
  "preferably",
  "about",
  "approximately",
  "boneless",
  "skinless",
  "peeled",
  "seeded",
  "trimmed",
  "washed",
  "drained",
  "rinsed",
  "small",
  "medium",
  "large",
  "extra",
  "jumbo",
]);

const COLOR_TOKENS = new Set([
  "yellow",
  "white",
  "red",
  "green",
  "brown",
  "black",
  "purple",
  "orange",
]);

export interface ConversionCandidate {
  key: string;
  aliases: string[];
}

/** Build inference candidates from seeds + density/piece/produce tables. */
function buildCandidates(): ConversionCandidate[] {
  const byKey = new Map<string, Set<string>>();

  function add(key: string, aliases: string[]) {
    const k = key.trim().toLowerCase();
    if (!k) return;
    let set = byKey.get(k);
    if (!set) {
      set = new Set<string>();
      byKey.set(k, set);
    }
    set.add(k);
    for (const a of aliases) {
      const n = a.toLowerCase().trim();
      if (n) set.add(n);
    }
  }

  for (const [key, aliases] of Object.entries(CONVERSION_ALIAS_SEEDS)) {
    add(key, aliases);
  }
  for (const entry of DENSITY_TABLE) {
    add(entry.key, entry.aliases);
  }
  for (const entry of GENERATED_PIECE_WEIGHTS) {
    add(entry.key.replace(/_/g, " "), entry.aliases);
  }
  for (const unit of PRODUCE_UNITS) {
    const label = unitLabel(String(unit));
    add(label, [label, String(unit).replace(/_/g, " ")]);
  }

  return [...byKey.entries()]
    .map(([key, aliases]) => ({
      key,
      aliases: [...aliases].sort((a, b) => b.length - a.length),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

let CANDIDATES: ConversionCandidate[] | null = null;

function candidates(): ConversionCandidate[] {
  if (!CANDIDATES) CANDIDATES = buildCandidates();
  return CANDIDATES;
}

/** Normalize a catalog key for display (underscores → spaces). */
export function formatConversionLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** Staples that would otherwise match dish/baked-good filters. */
const ALLOWED_SINGLE_INGREDIENT_LABELS = new Set([
  "cake flour",
  "chocolate chips",
  "rice noodles",
  "egg noodles",
]);

/** Single-token prepared foods / dishes (not usable as a conversion base). */
const REJECT_SINGLE_TOKEN = new Set([
  "ambrosia",
  "atole",
  "bibimbap",
  "bisque",
  "breadsticks",
  "candy",
  "cannelloni",
  "ceviche",
  "cheesecake",
  "chilaquiles",
  "chimichanga",
  "chowder",
  "cobbler",
  "coleslaw",
  "congee",
  "cornbread",
  "crisp",
  "croutons",
  "custard",
  "dip",
  "doughnut",
  "dried",
  "dumpling",
  "eggnog",
  "enchilada",
  "fajita",
  "firni",
  "flan",
  "frescavena",
  "fritter",
  "fruit",
  "fufu",
  "gelato",
  "gnocchi",
  "gordita",
  "guacamole",
  "guisada",
  "gumbo",
  "hash",
  "haupia",
  "horchata",
  "hummus",
  "icing",
  "injera",
  "jai",
  "lasagna",
  "manicotti",
  "meatball",
  "meatballs",
  "mousse",
  "nachos",
  "paella",
  "pie",
  "pierogi",
  "pudding",
  "pupusa",
  "quesadilla",
  "ratatouille",
  "ravioli",
  "sambar",
  "sauce",
  "sherbet",
  "sorbet",
  "spanakopita",
  "spoonbread",
  "stewed",
  "tabbouleh",
  "tamale",
  "taquito",
  "tempura",
  "tiramisu",
  "topping",
  "tortellini",
  "trifle",
  "upma",
  "vegetables",
  "wonton",
]);

/**
 * Keep Measure as… to single foods — drop baby/toddler, dishes, and prepared meals.
 */
export function isSingleIngredientLabel(label: string): boolean {
  const n = formatConversionLabel(label).toLowerCase();
  if (!n || n.length > 36) return false;
  if (n.includes(",")) return false;
  if (ALLOWED_SINGLE_INGREDIENT_LABELS.has(n)) return true;
  if (REJECT_SINGLE_TOKEN.has(n)) return false;

  if (/\b(baby|toddler|infant|stage\s*\d)\b/.test(n)) return false;
  // FNDDS aggregations like "chicken or turkey", "jam or jelly"
  if (/\bor\b/.test(n)) return false;
  // "X and Y" multi-part names
  if (/\band\b/.test(n) && n.split(/\s+/).length >= 3) return false;
  if (n.split(/\s+/).length > 3) return false;
  if (/\bflavou?red\b/.test(n)) return false;
  if (/\bin\b/.test(n)) return false;

  // Meal / dish nouns
  if (
    /\b(with|sandwich|salad|soup|stew|stewed|casserole|pizza|burrito|taco|curry|stir[\s-]?fry|omelet|omelette|pad\s*thai|loaf|cookie|cake|cupcake|muffin|pancake|waffle|smoothie|beverage|drink|formula|lasagna|ravioli|gnocchi|dumplings?|meatballs?|hot\s*dogs?|pot\s*pie|shepherd|stuffing|pie(\s*filling)?|pudding|mousse|custard|sundae|egg\s*roll|sushi(\s*roll)?|patty|patties|burgers?|tots|fries|croquette|fondue|timbale|thermidor|cacciatore|fricassee|tetrazzini|divan|creole|tartare|scallopini|rarebit|sloppy|ramen|pilaf|rellenos?|rancheros|paneer|saag|dukboki|tteokbokki|licuado|batido|creme\s*brulee|gelatin|frozen\s*(dessert|yogurt)|ice\s*cream|soft\s*serve|snow\s*cone|italian\s*ice|milk\s*shake|hush\s*puppy|tapenade|quiche|souffl[eé]|stroganoff|parmigiana|scampi|tempura|risotto|jambalaya|kebabs?|satay|candy|jerky|bits|substitute|replacement|mixture|cocktail|trail\s*mix|snacks?|chips|nuggets?|tenders?|dips?|pastry|puffs|sticks|balls?|bowl|pone|mush|rinds|whipped\s*topping|nutritional|fruit\s*cocktail|refried|dirty\s*rice|spanish\s*rice|yellow\s*rice|rice\s*dressing|luncheon\s*meat|imitation|hash|gumbo|paella|atole|gordita|sope|gefilte|iced\s*coffee|hot\s*chocolate|corn\s*nuts|soy\s*nuts|wasabi\s*peas|classic\s*mixed|raw\s*vegetable|cheese\s*spread|head\s*cheese)\b/.test(
      n
    )
  ) {
    return false;
  }

  // Cooking methods that mark prepared foods (not raw ingredients)
  if (
    /\b(fried|deep[\s-]?fried|baked|grilled|broiled|braised|stuffed|breaded|battered|scalloped|creamed|mashed|sauteed|sautéed)\b/.test(
      n
    )
  ) {
    return false;
  }

  // Named restaurant / cuisine entrees
  if (
    /\b(general\s*tso|kung\s*pao|egg\s*foo|moo\s*shu|moo\s*goo|lo\s*mein|orange\s*chicken|pepper\s*steak|sesame\s*chicken|almond\s*chicken|swiss\s*steak|hunan|szechuan|schezuan|lomi\s*salmon|beef\s*burgundy|channa\s*saag|palak\s*paneer|huevos|biscayne|welsh\s*rarebit|chicken\s*cornbread)\b/.test(
      n
    )
  ) {
    return false;
  }

  // "barbecue chicken" / "shrimp teriyaki", but keep barbecue/teriyaki sauce
  if (/\b(barbecue|bbq|teriyaki)\b/.test(n) && !/\bsauce\b/.test(n)) {
    return false;
  }

  return true;
}

/**
 * Labels shown in Measure as… — curated seeds + produce + short density keys.
 * Density-backed keys enable volume↔mass; produce/piece keys enable count↔mass.
 */
export function conversionCatalogLabels(): string[] {
  const labels = new Set<string>();
  for (const key of Object.keys(CONVERSION_ALIAS_SEEDS)) {
    const label = formatConversionLabel(key);
    if (isSingleIngredientLabel(label)) labels.add(label);
  }
  for (const entry of DENSITY_TABLE) {
    const label = formatConversionLabel(entry.key);
    if (isSingleIngredientLabel(label)) labels.add(label);
  }
  for (const unit of PRODUCE_UNITS) {
    const label = formatConversionLabel(unitLabel(String(unit)));
    if (isSingleIngredientLabel(label)) labels.add(label);
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

/**
 * Catalog labels that loosely match an ingredient name, best first (for Matches group).
 */
export function matchingConversionLabels(name: string): string[] {
  const normalized = normalizeForInfer(name);
  if (!normalized) return [];
  const variants = expandNameVariants(normalized);
  const catalog = conversionCatalogLabels();
  const scored: { label: string; score: number }[] = [];

  for (const label of catalog) {
    let best = 0;
    for (const variant of variants) {
      best = Math.max(best, aliasMatchScore(variant, label));
      // Also score against seed aliases for this label
      const cand = candidates().find((c) => formatConversionLabel(c.key) === label);
      if (cand) {
        for (const alias of cand.aliases) {
          best = Math.max(best, aliasMatchScore(variant, alias));
        }
      }
    }
    if (best >= 1000) scored.push({ label, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .map((s) => s.label);
}

function normalizeForInfer(name: string): string {
  let n = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/,/g, " ")
    .replace(/[^\p{L}\p{N}\s%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const phrase of NOISE_PHRASES) {
    n = n.replace(new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi"), " ");
  }

  const tokens = n.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (NOISE_TOKENS.has(t)) continue;
    // Drop color adjectives when the next token looks like food (or end)
    if (COLOR_TOKENS.has(t)) {
      const next = tokens[i + 1];
      if (!next || !NOISE_TOKENS.has(next)) {
        // keep color only if it's part of a known compound handled via aliases
        // (e.g. "brown sugar", "black pepper") — leave token for alias match
        kept.push(t);
        continue;
      }
    }
    kept.push(t);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function singularForms(word: string): string[] {
  const forms = new Set<string>([word]);
  if (word.endsWith("ies") && word.length > 4) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("oes") && word.length > 4) forms.add(word.slice(0, -2));
  if (word.endsWith("ses") && word.length > 4) forms.add(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    forms.add(word.slice(0, -1));
  }
  return [...forms];
}

function expandNameVariants(name: string): string[] {
  const variants = new Set<string>([name]);
  const parts = name.split(/\s+/);
  if (parts.length) {
    const last = parts[parts.length - 1]!;
    for (const s of singularForms(last)) {
      variants.add([...parts.slice(0, -1), s].join(" ").trim());
    }
  }
  return [...variants];
}

/**
 * Infer a conversion catalog key for a free-text ingredient name.
 * Returns undefined when no confident match (or name already is the key).
 */
export function inferConversionKey(name: string): string | undefined {
  const normalized = normalizeForInfer(name);
  if (!normalized) return undefined;

  const variants = expandNameVariants(normalized);
  let bestKey: string | undefined;
  let bestScore = 0;

  for (const candidate of candidates()) {
    const display = formatConversionLabel(candidate.key);
    if (!isSingleIngredientLabel(display)) continue;
    for (const alias of candidate.aliases) {
      for (const variant of variants) {
        let score = aliasMatchScore(variant, alias);
        // Also try singularized full variant against alias
        if (!score) {
          for (const s of singularForms(variant)) {
            score = Math.max(score, aliasMatchScore(s, alias));
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestKey = candidate.key;
        }
      }
    }
  }

  const hasPowder = /\bpowder\b/.test(normalized);

  // Require at least a whole-word hit (score >= 1000)
  if (bestScore < 1000 || !bestKey) {
    // Unmatched “… powder” (e.g. curry powder) → spice density catch-all.
    if (hasPowder) return "spice";
    return undefined;
  }

  // Prefer spaced display form so Measure as… select values match.
  const label = formatConversionLabel(bestKey);
  // Fruit/veg matches for “… powder” are wrong density-wise (mushroom powder ≠ mushroom).
  if (hasPowder && isProduceIngredient({ name: "", unit: "", conversionKey: label })) {
    return "spice";
  }
  return label;
}

/** Name used for density / piece-weight lookup. */
export function resolveConversionName(ingredient: Pick<Ingredient, "name" | "conversionKey">): string {
  const key = ingredient.conversionKey?.trim();
  if (key) return key;
  return ingredient.name || "";
}

/** True when conversionKey is set and meaningfully different from the display name. */
export function conversionKeyDiffersFromName(
  ingredient: Pick<Ingredient, "name" | "conversionKey">
): boolean {
  const key = ingredient.conversionKey?.trim().toLowerCase();
  if (!key) return false;
  const n = normalizeForInfer(ingredient.name || "");
  if (!n) return true;
  if (n === key) return false;
  // "unsalted butter" with key butter → differs for display cue
  if (aliasMatchScore(n, key) >= 10_000) return false;
  return true;
}

/** Suggest conversionKey for an ingredient if missing. */
export function suggestConversionKey(name: string): string | undefined {
  return inferConversionKey(name);
}
