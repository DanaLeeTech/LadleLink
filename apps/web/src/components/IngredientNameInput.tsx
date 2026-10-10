import { useMemo } from "react";
import {
  conversionCatalogLabels,
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
  | "Pantry"
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
  "Pantry",
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
  Protein: ["chicken", "beef", "pork", "eggs", "chicken breast"],
  Dairy: ["butter", "milk", "cream", "cheese", "yogurt", "sour cream", "parmesan"],
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
    "soy sauce",
    "lemon juice",
    "garlic powder",
    "onion powder",
    "paprika",
    "cumin",
    "oregano",
    "thyme",
    "basil",
    "chili flakes",
    "red pepper flakes",
  ],
  "Herbs & aromatics": [
    "parsley",
    "cilantro",
    "coriander",
    "dill",
    "rosemary",
    "sage",
    "mint",
    "chives",
  ],
};

/** Word-boundary-ish match so short stems don't hit unrelated labels. */
function hasWord(label: string, pattern: string): boolean {
  return new RegExp(`(?:^|[^a-z])(?:${pattern})(?:$|[^a-z])`).test(label);
}

function guessGroup(label: string): SuggestionGroup {
  const l = label.toLowerCase();

  // Fruits before pantry honey / protein egg so honeydew and similar stay correct.
  if (
    hasWord(
      l,
      "apple|banana|berry|blueberry|strawberry|raspberry|blackberry|cherry|grape|grapefruit|lemon|lime|mango|orange|peach|pear|plum|melon|watermelon|cantaloupe|honeydew|kiwi|fig|date|avocado|pineapple|pomegranate|apricot|nectarine|papaya|olive|coconut|tangerine|clementine|cranberry|raisin|currant|guava|passion\\s*fruit|persimmon|lychee|starfruit"
    )
  ) {
    return "Fruits";
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

  // Oils / corn pantry items before vegetable "corn" / "pepper".
  if (
    hasWord(
      l,
      "flour|sugar|rice|oats?|pasta|water|honey|vanilla|yeast|baking|cocoa|starch|breadcrumb|noodle|couscous|quinoa|barley|cornmeal|corn\\s*syrup|corn\\s*nuts|chips|syrup|molasses|vinegar|broth|stock|bouillon"
    ) ||
    l === "oil" ||
    l.endsWith(" oil")
  ) {
    return "Pantry";
  }

  // Meats before vegetable "pepper" (e.g. pepper steak).
  if (
    hasWord(
      l,
      "chicken|beef|pork|bacon|sausage|shrimp|prawn|turkey|lamb|veal|ham|steak|meat|fish|salmon|tuna|cod|tilapia|trout|halibut|sardine|anchovy|mackerel|lobster|crab|clam|oyster|mussel|squid|calamari|octopus|scallop|duck|goose|bison|venison|liver|tripe|hot\\s*dog|frankfurter|bologna|pepperoni|prosciutto|chorizo|tofu|tempeh|seitan"
    ) ||
    /\beggs?\b/.test(l)
  ) {
    return "Protein";
  }

  if (
    hasWord(
      l,
      "butter|milk|cream|cheese|yogurt|yoghurt|parmesan|whey|ricotta|mozzarella|cheddar|cottage"
    )
  ) {
    return "Dairy";
  }

  if (
    hasWord(
      l,
      "parsley|cilantro|coriander|dill|rosemary|sage|mint|chive|garlic|ginger|bay\\s*leaf|lemongrass"
    ) ||
    /\bbay\b/.test(l)
  ) {
    return "Herbs & aromatics";
  }

  if (
    hasWord(
      l,
      "tomato|onion|shallot|leek|potato|sweet\\s*potato|carrot|celery|cucumber|zucchini|courgette|eggplant|aubergine|bell\\s*pepper|pepper|capsicum|chili|chilli|chile|beet|beetroot|turnip|parsnip|radish|mushroom|corn|lettuce|cabbage|cauliflower|broccoli|fennel|scallion|asparagus|artichoke|squash|pumpkin|yam|jalapeno|habanero|serrano|kale|spinach|chard|bok\\s*choy|brussels|green\\s*bean|snap\\s*pea|snow\\s*pea|okra|rutabaga|celeriac|celery\\s*root|arugula|rocket|endive|radicchio|collard|mustard\\s*green|watercress|kohlrabi|daikon|jicama|nopal|tomatillo|plantain|taro|cassava|yuca"
    )
  ) {
    return "Vegetables";
  }

  return "Other";
}

const GROUPED: { group: SuggestionGroup; items: string[] }[] = (() => {
  const byLabel = new Map<string, Suggestion>();

  function add(label: string, group: SuggestionGroup) {
    const display = formatConversionLabel(label);
    const key = display.toLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, { label: display, group });
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

function normalizeKey(key: string | undefined): string {
  if (!key) return "";
  const formatted = formatConversionLabel(key);
  return CATALOG_SET.has(formatted) ? formatted : "";
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

/** Conversion-base select: Matches first, then grouped catalog. Empty shows —. */
export function MeasureAsSelect({ name, conversionKey, onChange }: MeasureAsSelectProps) {
  const matches = useMemo(() => matchingConversionLabels(name), [name]);
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Prefer stored key; else pre-select a confident match (e.g. name is exactly "water")
  const selectValue =
    normalizeKey(conversionKey) ||
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
              {label}
            </option>
          ))}
        </optgroup>
      )}
      {restGroups.map(({ group, items }) => (
        <optgroup key={group} label={group}>
          {items.map((label) => (
            <option key={`${group}-${label}`} value={label}>
              {label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
