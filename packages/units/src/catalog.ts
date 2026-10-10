import type { CanonicalUnit } from "@ladlelink/types";

/** Canonical unit → alias forms (already normalized: lowercase, spaces/hyphens as `_`). */
export const UNIT_ALIAS_GROUPS: Record<string, string[]> = {
  // Volume
  tsp: ["tsp", "tsps", "t", "teaspoon", "teaspoons"],
  tbsp: ["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons"],
  dessertspoon: [
    "dessertspoon",
    "dessertspoons",
    "dessert_spoon",
    "dessert_spoons",
    "dsp",
    "dstspn",
  ],
  cup: ["cup", "cups", "c"],
  fl_oz: [
    "fl_oz",
    "floz",
    "fl-oz",
    "fluid_ounce",
    "fluid_ounces",
    "fluidounce",
    "fluidounces",
  ],
  pint: ["pint", "pints", "pt"],
  quart: ["quart", "quarts", "qt"],
  gallon: ["gallon", "gallons", "gal"],
  ml: [
    "ml",
    "mls",
    "milliliter",
    "milliliters",
    "millilitre",
    "millilitres",
  ],
  l: ["l", "liter", "liters", "litre", "litres"],
  // Mass
  mg: ["mg", "mgs", "milligram", "milligrams", "milligramme", "milligrammes"],
  g: ["g", "gram", "grams", "gramme", "grammes"],
  kg: ["kg", "kgs", "kilogram", "kilograms", "kilogramme", "kilogrammes"],
  oz: ["oz", "ozs", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  // Countable — portions / seasoning
  piece: ["piece", "pieces", "pc", "pcs"],
  clove: ["clove", "cloves"],
  pinch: ["pinch", "pinches"],
  twist: ["twist", "twists"],
  dash: ["dash", "dashes"],
  drop: ["drop", "drops"],
  smidgen: ["smidgen", "smidgens"],
  handful: ["handful", "handfuls"],
  dollop: ["dollop", "dollops"],
  knob: ["knob", "knobs"],
  stick: ["stick", "sticks"],
  cube: ["cube", "cubes"],
  slice: ["slice", "slices"],
  wedge: ["wedge", "wedges"],
  strip: ["strip", "strips"],
  sheet: ["sheet", "sheets"],
  rasher: ["rasher", "rashers"],
  fillet: ["fillet", "fillets", "filet", "filets"],
  scoop: ["scoop", "scoops"],
  can: ["can", "cans"],
  tin: ["tin", "tins"],
  jar: ["jar", "jars"],
  package: ["package", "packages", "pkg"],
  packet: ["packet", "packets"],
  bunch: ["bunch", "bunches"],
  sprig: ["sprig", "sprigs"],
  leaf: ["leaf", "leaves"],
  head: ["head", "heads"],
  bulb: ["bulb", "bulbs"],
  stalk: ["stalk", "stalks"],
  rib: ["rib", "ribs"],
  spear: ["spear", "spears"],
  floret: ["floret", "florets"],
  ear: ["ear", "ears"],
  pod: ["pod", "pods"],
  kernel: ["kernel", "kernels"],
  segment: ["segment", "segments"],
  ring: ["ring", "rings"],
  crown: ["crown", "crowns"],
  whole: ["whole", "wholes"],
  to_taste: ["to_taste", "totaste"],
  garnish: ["garnish", "garnishes", "garnishing"],
  // Produce nouns
  egg: ["egg", "eggs"],
  tomato: ["tomato", "tomatoes"],
  onion: ["onion", "onions"],
  garlic: ["garlic"],
  shallot: ["shallot", "shallots"],
  leek: ["leek", "leeks"],
  potato: ["potato", "potatoes"],
  sweet_potato: ["sweet_potato", "sweet_potatoes", "sweetpotato", "sweetpotatoes"],
  carrot: ["carrot", "carrots"],
  celery: ["celery"],
  asparagus: ["asparagus"],
  shrimp: ["shrimp", "prawn", "prawns"],
  cherry_tomato: ["cherry_tomato", "cherry_tomatoes"],
  cucumber: ["cucumber", "cucumbers"],
  zucchini: ["zucchini", "zucchinis"],
  courgette: ["courgette", "courgettes"],
  eggplant: ["eggplant", "eggplants"],
  aubergine: ["aubergine", "aubergines"],
  pepper: ["pepper", "peppers"],
  capsicum: ["capsicum", "capsicums"],
  chili: ["chili", "chilis", "chilies"],
  chilli: ["chilli", "chillis", "chillies"],
  chile: ["chile", "chiles"],
  beet: ["beet", "beets"],
  beetroot: ["beetroot", "beetroots"],
  turnip: ["turnip", "turnips"],
  parsnip: ["parsnip", "parsnips"],
  radish: ["radish", "radishes"],
  lemon: ["lemon", "lemons"],
  lime: ["lime", "limes"],
  orange: ["orange", "oranges"],
  apple: ["apple", "apples"],
  banana: ["banana", "bananas"],
  avocado: ["avocado", "avocados", "avocadoes"],
  mango: ["mango", "mangos", "mangoes"],
  peach: ["peach", "peaches"],
  pear: ["pear", "pears"],
  plum: ["plum", "plums"],
  berry: ["berry", "berries"],
  strawberry: ["strawberry", "strawberries"],
  blueberry: ["blueberry", "blueberries"],
  raspberry: ["raspberry", "raspberries"],
  cherry: ["cherry", "cherries"],
  grape: ["grape", "grapes"],
  fig: ["fig", "figs"],
  date: ["date", "dates"],
  olive: ["olive", "olives"],
  mushroom: ["mushroom", "mushrooms"],
  corn: ["corn"],
  cob: ["cob", "cobs"],
  lettuce: ["lettuce", "lettuces"],
  cabbage: ["cabbage", "cabbages"],
  cauliflower: ["cauliflower", "cauliflowers"],
  broccoli: ["broccoli"],
  fennel: ["fennel"],
  ginger: ["ginger"],
  scallion: ["scallion", "scallions"],
  spring_onion: ["spring_onion", "spring_onions"],
  green_onion: ["green_onion", "green_onions"],
  bay_leaf: ["bay_leaf", "bay_leaves"],
  prawn: ["prawn", "prawns"],
  chicken_breast: ["chicken_breast", "chicken_breasts"],
  chicken_thigh: ["chicken_thigh", "chicken_thighs"],
  bacon: ["bacon"],
  sausage: ["sausage", "sausages"],
  kiwi: ["kiwi", "kiwis", "kiwifruit"],
  pineapple: ["pineapple", "pineapples"],
  watermelon: ["watermelon", "watermelons"],
  cantaloupe: ["cantaloupe", "cantaloupes"],
  honeydew: ["honeydew", "honeydews"],
  grapefruit: ["grapefruit", "grapefruits"],
  nectarine: ["nectarine", "nectarines"],
  apricot: ["apricot", "apricots"],
  papaya: ["papaya", "papayas"],
  pomegranate: ["pomegranate", "pomegranates"],
  artichoke: ["artichoke", "artichokes"],
  squash: ["squash", "squashes"],
  pumpkin: ["pumpkin", "pumpkins"],
  yam: ["yam", "yams"],
  jalapeno: ["jalapeno", "jalapenos", "jalapeño", "jalapeños"],
  habanero: ["habanero", "habaneros"],
  serrano: ["serrano", "serranos"],
  kale: ["kale"],
  spinach: ["spinach"],
  chard: ["chard"],
  bok_choy: ["bok_choy", "bok_choys", "bokchoy"],
  brussels_sprout: ["brussels_sprout", "brussels_sprouts", "brussel_sprout", "brussel_sprouts"],
  green_bean: ["green_bean", "green_beans"],
  snap_pea: ["snap_pea", "snap_peas"],
  snow_pea: ["snow_pea", "snow_peas"],
  okra: ["okra"],
  rutabaga: ["rutabaga", "rutabagas"],
  celery_root: ["celery_root", "celery_roots"],
  celeriac: ["celeriac"],
  fennel_bulb: ["fennel_bulb", "fennel_bulbs"],
};

/** Flat alias → canonical map built from UNIT_ALIAS_GROUPS. */
export const UNIT_ALIASES: Record<string, string> = (() => {
  const map: Record<string, string> = { "": "" };
  for (const [canonical, aliases] of Object.entries(UNIT_ALIAS_GROUPS)) {
    map[canonical] = canonical;
    for (const alias of aliases) {
      map[alias] = canonical;
    }
  }
  return map;
})();

export const VOLUME_UNITS: CanonicalUnit[] = [
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
];

export const MASS_UNITS: CanonicalUnit[] = ["mg", "g", "kg", "oz", "lb"];

export const PORTION_UNITS: CanonicalUnit[] = [
  "piece",
  "clove",
  "pinch",
  "twist",
  "dash",
  "drop",
  "smidgen",
  "handful",
  "dollop",
  "knob",
  "stick",
  "cube",
  "slice",
  "wedge",
  "strip",
  "sheet",
  "rasher",
  "fillet",
  "scoop",
  "can",
  "tin",
  "jar",
  "package",
  "packet",
  "bunch",
  "sprig",
  "leaf",
  "head",
  "bulb",
  "stalk",
  "rib",
  "spear",
  "floret",
  "ear",
  "pod",
  "kernel",
  "segment",
  "ring",
  "crown",
  "whole",
  "to_taste",
  "garnish",
];

export const PRODUCE_UNITS: CanonicalUnit[] = [
  "egg",
  "tomato",
  "onion",
  "garlic",
  "shallot",
  "leek",
  "potato",
  "sweet_potato",
  "carrot",
  "celery",
  "cucumber",
  "zucchini",
  "courgette",
  "eggplant",
  "aubergine",
  "pepper",
  "capsicum",
  "chili",
  "chilli",
  "chile",
  "beet",
  "beetroot",
  "turnip",
  "parsnip",
  "radish",
  "lemon",
  "lime",
  "orange",
  "apple",
  "banana",
  "avocado",
  "mango",
  "peach",
  "pear",
  "plum",
  "berry",
  "strawberry",
  "blueberry",
  "raspberry",
  "cherry",
  "grape",
  "fig",
  "date",
  "olive",
  "mushroom",
  "corn",
  "cob",
  "lettuce",
  "cabbage",
  "cauliflower",
  "broccoli",
  "fennel",
  "ginger",
  "scallion",
  "spring_onion",
  "green_onion",
  "bay_leaf",
  "asparagus",
  "shrimp",
  "prawn",
  "cherry_tomato",
  "chicken_breast",
  "chicken_thigh",
  "bacon",
  "sausage",
  "kiwi",
  "pineapple",
  "watermelon",
  "cantaloupe",
  "honeydew",
  "grapefruit",
  "nectarine",
  "apricot",
  "papaya",
  "pomegranate",
  "artichoke",
  "squash",
  "pumpkin",
  "yam",
  "jalapeno",
  "habanero",
  "serrano",
  "kale",
  "spinach",
  "chard",
  "bok_choy",
  "brussels_sprout",
  "green_bean",
  "snap_pea",
  "snow_pea",
  "okra",
  "rutabaga",
  "celery_root",
  "celeriac",
  "fennel_bulb",
];

export const COUNTABLE_UNITS: CanonicalUnit[] = [...PORTION_UNITS, ...PRODUCE_UNITS];

export const COUNTABLE_UNIT_SET = new Set<string>(COUNTABLE_UNITS);

export const CONVERTIBLE_UNITS: CanonicalUnit[] = [...MASS_UNITS, ...VOLUME_UNITS];

/** Reader unit cycling: convertible units plus piece. */
export const COMMON_UNITS: CanonicalUnit[] = [...CONVERTIBLE_UNITS, "piece"];

export const ALL_UNITS: CanonicalUnit[] = [
  ...VOLUME_UNITS,
  ...MASS_UNITS,
  ...PORTION_UNITS,
  ...PRODUCE_UNITS,
];

export const ALL_UNIT_SET = new Set<string>(ALL_UNITS);

/** Produce nouns used when name is empty after parse. */
export const PRODUCE_UNIT_SET = new Set<string>(PRODUCE_UNITS);

/**
 * Build a regex alternation of all unit aliases, longest-first.
 * Multi-word forms use `\\s+` so they match spaced text before canonicalize.
 */
export function unitPatternAlternation(): string {
  const rawForms = new Set<string>();
  for (const aliases of Object.values(UNIT_ALIAS_GROUPS)) {
    for (const alias of aliases) {
      rawForms.add(alias);
    }
  }
  // Human-readable spaced / dotted forms for the parser (pre-canonicalize)
  const extras = [
    "fluid\\s*ounces?",
    "fl\\.?\\s*oz\\.?",
    "dessert\\s*spoons?",
    "bay\\s*leaves?",
    "bay\\s*leaf",
    "spring\\s*onions?",
    "green\\s*onions?",
    "to\\s*taste",
    "for\\s+garnish(?:ing)?",
    "as\\s+(?:a\\s+)?garnish",
    "to\\s+garnish",
    "garnish(?:es|ing)?",
    "ounces?",
    "ozs?",
    "oz\\.?",
    "pounds?",
    "lbs?",
    "lb\\.?",
    "tablespoons?",
    "teaspoons?",
    "millilit(?:er|re)s?",
    "lit(?:er|re)s?",
    "kilograms?",
    "milligrams?",
    "grams?",
    "cups?",
    "pints?",
    "quarts?",
    "gallons?",
  ];
  for (const e of extras) rawForms.add(e);

  const sorted = [...rawForms].sort((a, b) => {
    const la = a.replace(/\\.?\\s\*/g, " ").replace(/\\s\+/g, " ").length;
    const lb = b.replace(/\\.?\\s\*/g, " ").replace(/\\s\+/g, " ").length;
    return lb - la;
  });

  // Escape plain aliases; leave regex extras as-is when they contain \
  return sorted
    .map((form) => {
      if (form.includes("\\")) return form;
      return form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, "[\\s_-]+");
    })
    .join("|");
}

export function unitLabel(unit: string): string {
  if (!unit) return "—";
  return unit.replace(/_/g, " ");
}

export function isKnownUnit(unit: string): boolean {
  return ALL_UNIT_SET.has(unit) || unit === "";
}
