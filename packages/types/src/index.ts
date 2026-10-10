export type IngredientKind = "dry" | "wet" | "other";

export type CupStandard = "metric" | "us";
export type MassSystem = "metric" | "imperial";
export type VolumeSystem = "metric" | "customary";

export type ProduceSize = "small" | "medium" | "large";

export type CanonicalUnit =
  | "tsp"
  | "tbsp"
  | "dessertspoon"
  | "cup"
  | "fl_oz"
  | "pint"
  | "quart"
  | "gallon"
  | "ml"
  | "l"
  | "mg"
  | "g"
  | "kg"
  | "oz"
  | "lb"
  | "piece"
  | "clove"
  | "pinch"
  | "twist"
  | "dash"
  | "drop"
  | "smidgen"
  | "handful"
  | "dollop"
  | "knob"
  | "stick"
  | "cube"
  | "slice"
  | "wedge"
  | "strip"
  | "sheet"
  | "rasher"
  | "fillet"
  | "scoop"
  | "can"
  | "tin"
  | "jar"
  | "package"
  | "packet"
  | "bunch"
  | "sprig"
  | "leaf"
  | "head"
  | "bulb"
  | "stalk"
  | "rib"
  | "spear"
  | "floret"
  | "ear"
  | "pod"
  | "kernel"
  | "segment"
  | "ring"
  | "crown"
  | "whole"
  | "egg"
  | "tomato"
  | "onion"
  | "garlic"
  | "shallot"
  | "leek"
  | "potato"
  | "sweet_potato"
  | "carrot"
  | "asparagus"
  | "shrimp"
  | "cherry_tomato"
  | "celery"
  | "cucumber"
  | "zucchini"
  | "courgette"
  | "eggplant"
  | "aubergine"
  | "pepper"
  | "capsicum"
  | "chili"
  | "chilli"
  | "chile"
  | "beet"
  | "beetroot"
  | "turnip"
  | "parsnip"
  | "radish"
  | "lemon"
  | "lime"
  | "orange"
  | "apple"
  | "banana"
  | "avocado"
  | "mango"
  | "peach"
  | "pear"
  | "plum"
  | "berry"
  | "strawberry"
  | "blueberry"
  | "raspberry"
  | "cherry"
  | "grape"
  | "fig"
  | "date"
  | "olive"
  | "mushroom"
  | "corn"
  | "cob"
  | "lettuce"
  | "cabbage"
  | "cauliflower"
  | "broccoli"
  | "fennel"
  | "ginger"
  | "scallion"
  | "spring_onion"
  | "green_onion"
  | "bay_leaf"
  | "to_taste"
  | "garnish"
  | string;

export interface Ingredient {
  quantity: number;
  /** Upper bound when the amount is a range (e.g. 4-8 oz → quantity 4, quantityMax 8). */
  quantityMax?: number;
  unit: CanonicalUnit;
  name: string;
  /**
   * Catalog label used for density / piece-weight lookup when different from `name`
   * (e.g. name "yellow onions, chopped" → conversionKey "onion").
   */
  conversionKey?: string;
  size?: ProduceSize;
  notes?: string;
  kind?: IngredientKind;
  densityGPerMl?: number;
  displayUnit?: CanonicalUnit;
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  steps: string[];
  ingredients: Ingredient[];
  tags: string[];
  notes?: string | null;
  photoPath?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeInput {
  title: string;
  servings: number;
  steps: string[];
  ingredients: Ingredient[];
  tags?: string[];
  notes?: string | null;
  photoPath?: string | null;
  sourceUrl?: string | null;
}

export interface ParsedRecipe {
  title: string;
  servings: number;
  steps: string[];
  ingredients: Ingredient[];
  tags?: string[];
  notes?: string | null;
  photoUrl?: string | null;
  sourceUrl: string;
}

export interface MeasurementPrefs {
  cupStandard: CupStandard;
  dryPreferredUnit: CanonicalUnit;
  wetPreferredUnit: CanonicalUnit;
  massSystem: MassSystem;
  volumeSystem: VolumeSystem;
}

export const DEFAULT_MEASUREMENT_PREFS: MeasurementPrefs = {
  cupStandard: "metric",
  dryPreferredUnit: "g",
  wetPreferredUnit: "ml",
  massSystem: "metric",
  volumeSystem: "metric",
};

export interface ConvertResult {
  quantity: number;
  quantityMax?: number;
  unit: CanonicalUnit;
  displayQuantity: string;
  /** Volume↔mass conversion missing a pantry density. */
  needsDensity?: boolean;
  /** Countable↔mass conversion missing a piece weight. */
  needsWeight?: boolean;
  kind?: IngredientKind;
}

export interface ExportPayload {
  version: 1;
  exportedAt: string;
  recipes: Recipe[];
  settings?: {
    measurement?: MeasurementPrefs;
  };
}

/** Embedded in recipe-card PNG metadata / QR for lossless re-import. */
export interface RecipeCardPayload {
  version: 1;
  kind: "ladlelink-recipe-card";
  recipe: {
    title: string;
    servings: number;
    ingredients: Ingredient[];
    steps: string[];
    notes?: string | null;
    sourceUrl?: string | null;
  };
}

export const RECIPE_CARD_PNG_KEYWORD = "ladlelink-recipe";
export const RECIPE_CARD_QR_PREFIX = "LL1:";
export const RECIPE_CARD_QR_PREFIX_GZ = "LL1Z:";
