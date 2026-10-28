import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  conversionCatalogLabels,
  expandNameVariants,
  formatConversionLabel,
  matchingConversionLabels,
  PRODUCE_UNITS,
  unitLabel,
} from "@ladlelink/units";

type SuggestionGroup =
  | "Fruits"
  | "Vegetables"
  | "Herbs & aromatics"
  | "Protein"
  | "Dairy"
  | "Nuts & seeds"
  | "Pantry"
  | "Sauces & condiments"
  | "Seasonings"
  | "Other";

interface Suggestion {
  label: string;
  group: SuggestionGroup;
}

const GROUP_ORDER: SuggestionGroup[] = [
  "Fruits",
  "Vegetables",
  "Herbs & aromatics",
  "Protein",
  "Dairy",
  "Nuts & seeds",
  "Pantry",
  "Sauces & condiments",
  "Seasonings",
  "Other",
];

const PRODUCE_GROUP_BY_KEY: Record<string, SuggestionGroup> = {
  lemon: "Fruits",
  lime: "Fruits",
  orange: "Fruits",
  apple: "Fruits",
  banana: "Fruits",
  avocado: "Fruits",
  mango: "Fruits",
  peach: "Fruits",
  pear: "Fruits",
  plum: "Fruits",
  berry: "Fruits",
  strawberry: "Fruits",
  blueberry: "Fruits",
  raspberry: "Fruits",
  cherry: "Fruits",
  grape: "Fruits",
  fig: "Fruits",
  date: "Fruits",
  olive: "Fruits",
  kiwi: "Fruits",
  pineapple: "Fruits",
  watermelon: "Fruits",
  cantaloupe: "Fruits",
  honeydew: "Fruits",
  grapefruit: "Fruits",
  nectarine: "Fruits",
  apricot: "Fruits",
  papaya: "Fruits",
  pomegranate: "Fruits",
  tomato: "Vegetables",
  cherry_tomato: "Vegetables",
  onion: "Vegetables",
  shallot: "Vegetables",
  leek: "Vegetables",
  potato: "Vegetables",
  sweet_potato: "Vegetables",
  carrot: "Vegetables",
  celery: "Vegetables",
  cucumber: "Vegetables",
  zucchini: "Vegetables",
  courgette: "Vegetables",
  eggplant: "Vegetables",
  aubergine: "Vegetables",
  pepper: "Vegetables",
  capsicum: "Vegetables",
  chili: "Vegetables",
  chilli: "Vegetables",
  chile: "Vegetables",
  beet: "Vegetables",
  beetroot: "Vegetables",
  turnip: "Vegetables",
  parsnip: "Vegetables",
  radish: "Vegetables",
  mushroom: "Vegetables",
  corn: "Vegetables",
  cob: "Vegetables",
  lettuce: "Vegetables",
  cabbage: "Vegetables",
  cauliflower: "Vegetables",
  broccoli: "Vegetables",
  fennel: "Vegetables",
  scallion: "Vegetables",
  spring_onion: "Vegetables",
  green_onion: "Vegetables",
  asparagus: "Vegetables",
  artichoke: "Vegetables",
  squash: "Vegetables",
  pumpkin: "Vegetables",
  yam: "Vegetables",
  jalapeno: "Vegetables",
  habanero: "Vegetables",
  serrano: "Vegetables",
  kale: "Vegetables",
  spinach: "Vegetables",
  chard: "Vegetables",
  bok_choy: "Vegetables",
  brussels_sprout: "Vegetables",
  green_bean: "Vegetables",
  snap_pea: "Vegetables",
  snow_pea: "Vegetables",
  okra: "Vegetables",
  rutabaga: "Vegetables",
  celery_root: "Vegetables",
  celeriac: "Vegetables",
  fennel_bulb: "Vegetables",
  garlic: "Herbs & aromatics",
  ginger: "Herbs & aromatics",
  bay_leaf: "Herbs & aromatics",
  egg: "Protein",
  shrimp: "Protein",
  prawn: "Protein",
  chicken_breast: "Protein",
  chicken_thigh: "Protein",
  bacon: "Protein",
  sausage: "Protein",
};

const PANTRY_BY_GROUP: Partial<Record<SuggestionGroup, string[]>> = {
  Protein: ["chicken", "beef", "pork", "chicken breast"],
  Dairy: ["butter", "milk", "cream", "cheese", "yogurt", "sour cream", "parmesan"],
  Vegetables: ["water chestnut"],
  Pantry: [
    "flour",
    "all-purpose flour",
    "bread flour",
    "cake flour",
    "whole wheat flour",
    "sugar",
    "brown sugar",
    "powdered sugar",
    "oil",
    "olive oil",
    "water",
    "rice",
    "pasta",
    "honey",
    "vanilla",
    "baking powder",
    "baking soda",
    "yeast",
    "breadcrumbs",
    "cornstarch",
    "cocoa",
    "oats",
  ],
  Seasonings: [
    "table salt",
    "sea salt",
    "kosher salt",
    "salt",
    "black pepper",
    "spice",
    "lemon juice",
    "garlic powder",
    "onion powder",
    "paprika",
    "cumin",
    "chili flakes",
    "red pepper flakes",
  ],
  "Herbs & aromatics": [
    "parsley",
    "coriander",
    "dill",
    "rosemary",
    "sage",
    "mint",
    "chives",
    "basil",
    "oregano",
    "thyme",
  ],
};

/** Hidden duplicate labels → the label kept in the dropdown (lower-case display form). */
const DROPDOWN_ALIASES: Record<string, string> = {
  "honeydew melon": "honeydew",
  "kiwi fruit": "kiwi",
  beet: "beetroot",
  beets: "beetroot",
  "brussels sprouts": "brussels sprout",
  "celery root": "celeriac",
  chile: "chilli",
  chili: "chilli",
  courgette: "zucchini",
  aubergine: "eggplant",
  pepper: "capsicum",
  peppers: "capsicum",
  scallion: "spring onion",
  "green onion": "spring onion",
  "fennel bulb": "fennel",
  cob: "corn",
  cilantro: "coriander",
  "ginger root": "ginger",
  eggs: "egg",
  "pork bacon": "bacon",
  shrimp: "prawn",
  livers: "liver",
  "cocoa powder": "cocoa",
  artichokes: "artichoke",
  berries: "berry",
  bluberries: "blueberry",
  blueberries: "blueberry",
  carrots: "carrot",
  cherries: "cherry",
  grapes: "grape",
  "green beans": "green bean",
  leeks: "leek",
  mushrooms: "mushroom",
  olives: "olive",
  onions: "onion",
  parsnips: "parsnip",
  radishes: "radish",
  raspberries: "raspberry",
  strawberries: "strawberry",
  tomatoes: "tomato",
  "turrnip greens": "turnip greens",
  snowpeas: "snow pea",
  "water chesnut": "water chestnut",
};

/** Kept label → visible option text, when two regional names mean the same ingredient. */
const DISPLAY_LABELS: Record<string, string> = {
  prawn: "prawn/shrimp",
  coriander: "coriander/cilantro",
  capsicum: "capsicum/bell pepper",
  "spring onion": "spring onion/scallion",
  eggplant: "eggplant/aubergine",
  zucchini: "zucchini/courgette",
  beetroot: "beetroot/beet",
  celeriac: "celeriac/celery root",
  chilli: "chilli/chili",
};

function displayLabel(label: string): string {
  return DISPLAY_LABELS[label] ?? label;
}

/** Group pins for labels whose name alone guesses wrong (lower-case display form). */
const GROUP_OVERRIDES: Record<string, SuggestionGroup> = {
  olive: "Pantry",
  applesauce: "Pantry",
  "blueberry syrup": "Pantry",
  "guava paste": "Pantry",
  "coconut milk": "Pantry",
  "coconut oil": "Pantry",
  "almond butter": "Pantry",
  "almond paste": "Pantry",
  "cashew butter": "Pantry",
  "peanut butter": "Pantry",
  "soy nut butter": "Pantry",
  "honey butter": "Pantry",
  "fruit butter": "Pantry",
  "cream of wheat": "Pantry",
  "bitter melon": "Vegetables",
  "winter melon": "Vegetables",
  "mustard greens": "Vegetables",
  "yellow string beans": "Vegetables",
  "palm hearts": "Vegetables",
  buttermilk: "Dairy",
  "coffee creamer": "Dairy",
  "goat milk": "Dairy",
  "oat milk": "Dairy",
  "rice milk": "Dairy",
  "strawberry milk": "Dairy",
  "textured vegetable protein": "Protein",
  "soybean curd": "Protein",
  "soybean curd cheese": "Dairy",
};

/** Word-boundary-ish match so short stems don't hit unrelated labels. Allows a plural s/es. */
function hasWord(label: string, pattern: string): boolean {
  return new RegExp(`(?:^|[^a-z])(?:${pattern})(?:s|es)?(?:$|[^a-z])`).test(label);
}

function guessGroup(label: string): SuggestionGroup {
  const l = label.toLowerCase();

  // Sauces, dressings and condiments before fruit/fish/seasoning words ("cranberry sauce").
  if (
    hasWord(
      l,
      "sauce|dressing|condiment|ketchup|mayonnaise|mayo|relish|pickles?|sauerkraut|kimchi|chutney|salsa|gravy|horseradish|wasabi|mustard"
    )
  ) {
    return "Sauces & condiments";
  }

  // Fruits before pantry honey / protein egg so honeydew and similar stay correct.
  if (
    hasWord(
      l,
      "apple|banana|berry|blueberry|strawberry|raspberry|blackberry|cherry|grape|grapefruit|lemon|lime|mango|orange|peach|pear|plum|melon|watermelon|cantaloupe|honeydew|kiwi|fig|date|avocado|pineapple|pomegranate|apricot|nectarine|papaya|olive|coconut|tangerine|clementine|cranberry|raisin|currant|guava|passion\\s*fruit|persimmon|lychee|starfruit|breadfruit|dragon\\s*fruit|rhubarb|prune|kumquat|blackberries|cranberries|raspberries|strawberries"
    )
  ) {
    return "Fruits";
  }

  // Grains / oils / legumes / sweeteners before vegetable "corn" / "pepper".
  if (
    hasWord(
      l,
      "flour|sugar|rice|oats?|oatmeal|pasta|water|honey|vanilla|yeast|baking|cocoa|starch|breadcrumb|bread|noodle|couscous|quinoa|barley|cornmeal|corn\\s*syrup|corn\\s*nuts|chips|syrup|molasses|vinegar|broth|stock|bouillon|beans|lentils?|chickpeas?|split\\s*peas?|blackeyed\\s*peas?|soybeans?|dal|cereal|crackers?|jam|jelly|lard|marmalade|millet|miso|popcorn|pretzels?|seaweed|shortening|tahini|tea|vermicelli|bran|bulgur|grits|hominy|buckwheat|dulce|masa|melba|wheat\\s*germ|coffee|spread|sweetener|bean\\s*paste"
    ) ||
    l === "oil" ||
    l.endsWith(" oil")
  ) {
    return "Pantry";
  }

  // Seasoning peppers before bare "pepper" vegetables.
  if (
    hasWord(
      l,
      "black\\s*pepper|white\\s*pepper|ground\\s*pepper|peppercorn|salt|sauce|spice|paprika|cumin|oregano|thyme|basil|powder|seasoning|flakes|extract|dijon|mustard\\s*sauce|yellow\\s*mustard|honey\\s*mustard|ketchup|mayo|mayonnaise|relish"
    )
  ) {
    return "Seasonings";
  }

  // Meats before vegetable "pepper" (e.g. pepper steak).
  if (
    hasWord(
      l,
      "chicken|beef|pork|bacon|sausage|shrimp|prawn|turkey|lamb|veal|ham|steak|meat|fish|salmon|tuna|cod|tilapia|trout|halibut|sardine|anchovy|mackerel|lobster|crab|clam|oyster|mussel|squid|calamari|octopus|scallop|duck|goose|bison|venison|liver|liverwurst|tripe|hot\\s*dog|frankfurter|bologna|pepperoni|prosciutto|chorizo|tofu|tempeh|seitan|abalone|armadillo|bear|beaver|brains|bratwurst|caribou|caviar|chitterlings|crayfish|dove|fat\\s*back|gizzard|goat|groundhog|heart|hog\\s*maws|kidney|moose|natto|opossum|ostrich|pastrami|pheasant|quail|rabbit|raccoon|ribs?|salami|shellfish|spam|squirrel|thuringer|turtle|wild\\s*pig|game\\s*hen"
    ) ||
    /\beggs?\b/.test(l)
  ) {
    return "Protein";
  }

  if (
    hasWord(
      l,
      "butter|milk|cream|creamer|cheese|yogurt|yoghurt|parmesan|whey|ricotta|mozzarella|cheddar|cottage|ghee|kefir|margarine|queso"
    )
  ) {
    return "Dairy";
  }

  // Nuts and seeds after Dairy so "almond milk" stays dairy.
  if (
    hasWord(
      l,
      "nuts?|almonds?|cashews?|chestnuts?|pecans?|walnuts?|hazelnuts?|peanuts?|pistachios?|macadamia|brazil\\s*nuts|pine\\s*nuts|mixed\\s*nuts|seeds?|chia\\s*seeds|flax\\s*seeds|flaxseeds?|sesame\\s*seeds|sunflower\\s*seeds|pumpkin\\s*seeds|mixed\\s*seeds"
    )
  ) {
    return "Nuts & seeds";
  }

  if (
    hasWord(
      l,
      "parsley|cilantro|coriander|dill|rosemary|sage|mint|chive|garlic|ginger|herb|bay\\s*leaf|lemongrass"
    ) ||
    /\bbay\b/.test(l)
  ) {
    return "Herbs & aromatics";
  }

  if (
    hasWord(
      l,
      "tomato|onion|shallot|leek|potato|sweet\\s*potato|carrot|celery|cucumber|zucchini|courgette|eggplant|aubergine|bell\\s*pepper|pepper|capsicum|chili|chilli|chile|beet|beetroot|turnip|parsnip|radish|mushroom|corn|lettuce|cabbage|cauliflower|broccoli|fennel|scallion|asparagus|artichoke|squash|pumpkin|yam|jalapeno|habanero|serrano|kale|spinach|chard|bok\\s*choy|brussels|green\\s*bean|snap\\s*pea|snow\\s*pea|green\\s*peas?|okra|rutabaga|celeriac|celery\\s*root|arugula|rocket|endive|radicchio|collard|mustard\\s*green|watercress|kohlrabi|daikon|jicama|nopal|tomatillo|plantain|taro|cassava|yuca|sprouts?|shoots?|greens?|cress|edamame|escarole|lambsquarter|lotus\\s*roots?|palm\\s*hearts?|pimiento|salsify|cactus|burdock|broccoflower|christophine"
    )
  ) {
    return "Vegetables";
  }

  return "Other";
}

export const GROUPED: { group: SuggestionGroup; items: string[] }[] = (() => {
  const byLabel = new Map<string, Suggestion>();

  function add(label: string, group: SuggestionGroup) {
    const display = formatConversionLabel(label);
    const key = display.toLowerCase();
    if (DROPDOWN_ALIASES[key]) return;
    if (!byLabel.has(key)) {
      byLabel.set(key, { label: display, group: GROUP_OVERRIDES[key] ?? group });
    }
  }

  for (const unit of PRODUCE_UNITS) {
    add(unitLabel(String(unit)), PRODUCE_GROUP_BY_KEY[unit] ?? "Vegetables");
  }

  for (const group of GROUP_ORDER) {
    for (const label of PANTRY_BY_GROUP[group] ?? []) {
      add(label, group);
    }
  }

  for (const label of conversionCatalogLabels()) {
    add(label, guessGroup(label));
  }

  return GROUP_ORDER.map((group) => ({
    group,
    items: [...byLabel.values()]
      .filter((s) => s.group === group)
      .map((s) => s.label)
      .sort((a, b) => a.localeCompare(b)),
  })).filter((g) => g.items.length > 0);
})();

const CATALOG_SET = new Set(GROUPED.flatMap((g) => g.items));

/**
 * Typed name → kept label for exact hits: regional alternates, hidden duplicates
 * and kept labels themselves. Used so alias names pre-select the right option.
 */
const EXACT_KEPT_BY_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [kept, combined] of Object.entries(DISPLAY_LABELS)) {
    const alternate = combined.split("/")[1];
    if (alternate && !map[alternate]) map[alternate] = kept;
  }
  for (const [hidden, kept] of Object.entries(DROPDOWN_ALIASES)) {
    if (!map[hidden]) map[hidden] = kept;
  }
  for (const label of CATALOG_SET) {
    if (!map[label]) map[label] = label;
  }
  return map;
})();

function normalizeKey(key: string | undefined): string {
  if (!key) return "";
  const formatted = formatConversionLabel(key);
  const kept = DROPDOWN_ALIASES[formatted.toLowerCase()] ?? formatted;
  return CATALOG_SET.has(kept) ? kept : "";
}

interface IngredientNameInputProps {
  value: string;
  conversionKey?: string;
  onChangeName: (name: string) => void;
  onChangeConversionKey: (conversionKey: string | undefined) => void;
  "aria-label"?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/** Free-text display name for an ingredient. */
export function IngredientNameInput({
  value,
  onChangeName,
  "aria-label": ariaLabel = "Ingredient name",
  placeholder = "Ingredient name",
  required,
  id,
}: Pick<
  IngredientNameInputProps,
  "value" | "onChangeName" | "aria-label" | "placeholder" | "required" | "id"
>) {
  return (
    <input
      id={id}
      className="ingredient-name-input"
      value={value}
      onChange={(e) => onChangeName(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      required={required}
    />
  );
}

interface MeasureAsSelectProps {
  name: string;
  conversionKey?: string;
  onChange: (conversionKey: string | undefined) => void;
}

/** Typed name → value that settles once the user pauses (150 ms), not on every keypress. */
function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Conversion-base select: Matches first, then grouped catalog. Empty shows —. */
export function MeasureAsSelect({ name, conversionKey, onChange }: MeasureAsSelectProps) {
  const debouncedName = useDebouncedValue(name);
  // Rebuilding several hundred <option>s must not block the keypress that caused
  // it: React may interrupt this render and finish it in the background.
  const deferredName = useDeferredValue(debouncedName);

  // Exact alias hit (e.g. "scallion", "water chestnut") wins over fuzzy matches.
  const exactKept = useMemo(() => {
    const typed = deferredName.trim().toLowerCase();
    if (!typed) return "";
    for (const variant of expandNameVariants(typed)) {
      const kept = EXACT_KEPT_BY_NAME[variant];
      if (kept) return kept;
    }
    return "";
  }, [deferredName]);

  const matches = useMemo(() => {
    const kept: string[] = [];
    const seen = new Set<string>();
    if (exactKept) {
      seen.add(exactKept);
      kept.push(exactKept);
    }
    for (const label of matchingConversionLabels(deferredName)) {
      const mapped = DROPDOWN_ALIASES[label.toLowerCase()] ?? label;
      if (seen.has(mapped)) continue;
      seen.add(mapped);
      kept.push(mapped);
    }
    return kept;
  }, [deferredName, exactKept]);
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Prefer stored key; then an exact alias hit; then a confident match.
  const selectValue =
    normalizeKey(conversionKey) ||
    exactKept ||
    (matches.length === 1 ? matches[0]! : "") ||
    (matches.find((m) => m.toLowerCase() === name.trim().toLowerCase()) ?? "");

  const restGroups = useMemo(
    () =>
      GROUPED.map(({ group, items }) => ({
        group,
        items: items.filter((label) => !matchSet.has(label)),
      })).filter((g) => g.items.length > 0),
    [matchSet]
  );

  return (
    <select
      className="ingredient-name-pick unit-select"
      value={selectValue}
      aria-label="Measure as"
      title={
        selectValue
          ? `Measuring as ${selectValue} — change if wrong`
          : "Conversion base for density/weight — pick a match or leave as —"
      }
      onChange={(e) => {
        const next = e.target.value;
        onChange(next || undefined);
      }}
    >
      <option value="">—</option>
      {matches.length > 0 && (
        <optgroup label="Matches">
          {matches.map((label) => (
            <option key={`match-${label}`} value={label}>
              {displayLabel(label)}
            </option>
          ))}
        </optgroup>
      )}
      {restGroups.map(({ group, items }) => (
        <optgroup key={group} label={group}>
          {items.map((label) => (
            <option key={`${group}-${label}`} value={label}>
              {displayLabel(label)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
