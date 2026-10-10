import { describe, expect, it } from "vitest";
import type { Ingredient, MeasurementPrefs } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import {
  canonicalizeUnit,
  convertIngredient,
  conversionCatalogLabels,
  defaultProduceSize,
  formatQuantity,
  formatQuantityRange,
  GENERATED_DENSITY_TABLE,
  GENERATED_PIECE_WEIGHTS,
  inferConversionKey,
  isProduceIngredient,
  isSingleIngredientLabel,
  lookupDensity,
  mlPerCup,
  pluralProduceName,
  pluralUnitLabel,
  resolveConversionName,
  resolveDensity,
  resolvePieceGrams,
  unitFamily,
  volumeUnitToMl,
} from "./index.js";

const metric: MeasurementPrefs = { ...DEFAULT_MEASUREMENT_PREFS, cupStandard: "metric" };
const us: MeasurementPrefs = { ...DEFAULT_MEASUREMENT_PREFS, cupStandard: "us" };

describe("cup locale", () => {
  it("uses 250 ml for metric cups and 240 ml for US", () => {
    expect(mlPerCup("metric")).toBe(250);
    expect(mlPerCup("us")).toBe(240);
    expect(volumeUnitToMl(1, "cup", "metric")).toBe(250);
    expect(volumeUnitToMl(1, "cup", "us")).toBe(240);
  });

  it("converts cups to ml differently by locale", () => {
    const flour: Ingredient = { quantity: 1, unit: "cup", name: "flour" };
    const metricMl = convertIngredient(flour, "ml", metric);
    const usMl = convertIngredient(flour, "ml", us);
    expect(metricMl.quantity).toBe(250);
    expect(usMl.quantity).toBe(240);
  });
});

describe("density-aware conversion", () => {
  it("converts flour cups to grams using density and metric cup", () => {
    const flour: Ingredient = { quantity: 1, unit: "cup", name: "all-purpose flour" };
    const result = convertIngredient(flour, "g", metric);
    // 250 ml * 0.5208 g/ml ≈ 130 g
    expect(result.needsDensity).toBeUndefined();
    expect(result.quantity).toBe(130);
    expect(result.unit).toBe("g");
  });

  it("converts brown sugar, rice, oil, and cocoa by volume", () => {
    expect(convertIngredient({ quantity: 1, unit: "cup", name: "brown sugar" }, "g", us).quantity).toBe(
      Math.round(240 * 0.9167)
    );
    expect(convertIngredient({ quantity: 1, unit: "cup", name: "rice" }, "g", us).needsDensity).toBeUndefined();
    expect(convertIngredient({ quantity: 1, unit: "cup", name: "olive oil" }, "g", us).needsDensity).toBeUndefined();
    expect(convertIngredient({ quantity: 1, unit: "cup", name: "cocoa powder" }, "g", us).needsDensity).toBeUndefined();
  });

  it("converts water ml to grams 1:1", () => {
    const water: Ingredient = { quantity: 100, unit: "ml", name: "water" };
    const result = convertIngredient(water, "g", metric);
    expect(result.quantity).toBe(100);
  });

  it("refuses volume↔mass when density unknown", () => {
    const mystery: Ingredient = { quantity: 1, unit: "cup", name: "xyzzy unknown powder 999" };
    const result = convertIngredient(mystery, "g", metric);
    expect(result.needsDensity).toBe(true);
    expect(result.unit).toBe("cup");
  });

  it("uses density override when provided", () => {
    const mystery: Ingredient = {
      quantity: 100,
      unit: "ml",
      name: "mystery",
      densityGPerMl: 0.5,
    };
    const result = convertIngredient(mystery, "g", metric);
    expect(result.needsDensity).toBeUndefined();
    expect(result.quantity).toBe(50);
  });
});

describe("same-family conversion", () => {
  it("converts tsp to tbsp", () => {
    const salt: Ingredient = { quantity: 3, unit: "tsp", name: "salt" };
    const result = convertIngredient(salt, "tbsp", metric);
    expect(result.quantity).toBe(1);
  });

  it("converts g to kg", () => {
    const flour: Ingredient = { quantity: 1500, unit: "g", name: "flour" };
    const result = convertIngredient(flour, "kg", metric);
    expect(result.quantity).toBe(1.5);
  });
});

describe("formatting", () => {
  it("formats cup fractions without float tails", () => {
    expect(formatQuantity(0.333333, "cup")).toBe("1/3");
    expect(formatQuantity(1.5, "cup")).toBe("1 1/2");
    expect(formatQuantity(0.25, "tsp")).toBe("1/4");
    expect(formatQuantity(1.25, "tsp")).toBe("1 1/4");
    expect(formatQuantity(0.5, "tbsp")).toBe("1/2");
  });

  it("formats quantity ranges", () => {
    expect(formatQuantityRange(4, "oz", 8)).toBe("4-8");
  });
});

describe("plurals", () => {
  it("pluralizes unit labels when quantity ≠ 1", () => {
    expect(pluralUnitLabel("clove", 1)).toBe("clove");
    expect(pluralUnitLabel("clove", 2)).toBe("cloves");
    expect(pluralUnitLabel("pinch", 3)).toBe("pinches");
    expect(pluralUnitLabel("twist", 2)).toBe("twists");
    expect(pluralUnitLabel("cup", 2)).toBe("cups");
    expect(pluralUnitLabel("leaf", 2)).toBe("leaves");
    expect(pluralUnitLabel("oz", 4)).toBe("oz");
    expect(pluralUnitLabel("tsp", 2)).toBe("tsp");
    expect(pluralUnitLabel("tbsp", 2)).toBe("tbsp");
    expect(pluralUnitLabel("lb", 3)).toBe("lb");
    expect(pluralUnitLabel("ml", 250)).toBe("ml");
    expect(pluralUnitLabel("fl_oz", 2)).toBe("fl oz");
  });

  it("uses irregular produce plurals for produce units", () => {
    expect(pluralUnitLabel("tomato", 2)).toBe("tomatoes");
    expect(pluralUnitLabel("potato", 3)).toBe("potatoes");
    expect(pluralUnitLabel("sweet_potato", 2)).toBe("sweet potatoes");
    expect(pluralUnitLabel("cherry_tomato", 2)).toBe("cherry tomatoes");
    expect(pluralUnitLabel("garlic", 2)).toBe("garlic");
    expect(pluralUnitLabel("asparagus", 2)).toBe("asparagus");
    expect(pluralUnitLabel("spinach", 2)).toBe("spinach");
    expect(pluralUnitLabel("shrimp", 6)).toBe("shrimp");
    expect(pluralUnitLabel("bacon", 2)).toBe("bacon");
    expect(pluralUnitLabel("chili", 2)).toBe("chilies");
  });

  it("pluralizes produce names for preview", () => {
    expect(pluralProduceName("tomato", 1)).toBe("tomato");
    expect(pluralProduceName("tomato", 2)).toBe("tomatoes");
    expect(pluralProduceName("banana", 3)).toBe("bananas");
    expect(pluralProduceName("sweet potato", 2)).toBe("sweet potatoes");
  });
});

describe("density lookup", () => {
  it("matches brown sugar over sugar", () => {
    const entry = lookupDensity("packed light brown sugar");
    expect(entry?.key).toBe("brown sugar");
  });

  it("includes exhaustive USDA-mined density coverage", () => {
    expect(GENERATED_DENSITY_TABLE.length).toBeGreaterThan(500);
  });
});

describe("piece weights", () => {
  it("includes exhaustive USDA-mined piece coverage", () => {
    expect(GENERATED_PIECE_WEIGHTS.length).toBeGreaterThan(400);
  });

  it("converts large banana to grams", () => {
    const banana: Ingredient = {
      quantity: 1,
      unit: "",
      name: "banana",
      size: "large",
    };
    const result = convertIngredient(banana, "g", metric);
    expect(result.needsWeight).toBeUndefined();
    expect(result.unit).toBe("g");
    expect(result.quantity).toBe(136);
  });

  it("converts garlic cloves to grams", () => {
    const garlic: Ingredient = { quantity: 2, unit: "clove", name: "garlic" };
    const result = convertIngredient(garlic, "g", metric);
    expect(result.needsWeight).toBeUndefined();
    expect(result.quantity).toBe(6);
  });

  it("converts butter stick to grams", () => {
    const butter: Ingredient = { quantity: 1, unit: "stick", name: "butter" };
    const result = convertIngredient(butter, "g", metric);
    expect(result.quantity).toBe(113);
  });

  it("converts eggs by size", () => {
    const large: Ingredient = { quantity: 2, unit: "", name: "egg", size: "large" };
    const result = convertIngredient(large, "g", metric);
    expect(result.quantity).toBe(120);
  });

  it("converts quantity ranges on both ends", () => {
    const cream: Ingredient = {
      quantity: 4,
      quantityMax: 8,
      unit: "oz",
      name: "cream cheese",
    };
    const result = convertIngredient(cream, "g", us);
    expect(result.quantity).toBeLessThan(result.quantityMax!);
    expect(result.displayQuantity).toContain("-");
  });

  it("flags unknown countable as needsWeight", () => {
    const mystery: Ingredient = { quantity: 1, unit: "", name: "dragonfruit orb" };
    const result = convertIngredient(mystery, "g", metric);
    expect(result.needsWeight).toBe(true);
  });

  it("resolves piece grams for specials", () => {
    expect(resolvePieceGrams({ quantity: 1, unit: "clove", name: "garlic" })).toBe(3);
    expect(resolvePieceGrams({ quantity: 1, unit: "stick", name: "butter" })).toBe(113);
  });

  it("converts pepper mill twists and seasoning pinches to grams", () => {
    const twists: Ingredient = {
      quantity: 2,
      unit: "twist",
      name: "freshly ground black pepper",
      conversionKey: "black pepper",
    };
    const twistResult = convertIngredient(twists, "g", metric);
    expect(twistResult.needsWeight).toBeUndefined();
    expect(twistResult.quantity).toBeCloseTo(0.2, 5);

    expect(
      resolvePieceGrams({ quantity: 1, unit: "pinch", name: "salt" })
    ).toBeCloseTo(0.36, 5);
    expect(
      resolvePieceGrams({ quantity: 1, unit: "pinch", name: "oregano" })
    ).toBeCloseTo(0.08, 5);
    expect(
      resolvePieceGrams({ quantity: 1, unit: "dash", name: "kosher salt" })
    ).toBeCloseTo(0.44, 5);
  });

  it("uses ground black pepper density, not bell pepper", () => {
    expect(lookupDensity("black pepper")?.key).toBe("black pepper");
    expect(lookupDensity("black pepper")?.densityGPerMl).toBeCloseTo(0.48, 3);
    const tsp: Ingredient = {
      quantity: 1,
      unit: "tsp",
      name: "black pepper",
      conversionKey: "black pepper",
    };
    const result = convertIngredient(tsp, "g", us);
    expect(result.needsDensity).toBeUndefined();
    expect(result.quantity).toBeGreaterThan(2);
    expect(result.quantity).toBeLessThan(3);
  });

  it("resolves carrot / ginger / sprig holes", () => {
    expect(resolvePieceGrams({ quantity: 1, unit: "", name: "carrot" })).toBe(72);
    expect(resolvePieceGrams({ quantity: 1, unit: "knob", name: "ginger" })).toBe(12);
    expect(resolvePieceGrams({ quantity: 1, unit: "sprig", name: "thyme" })).toBe(1);
    expect(lookupDensity("ginger")?.densityGPerMl).toBeCloseTo(1, 3);
  });
});

describe("conversion keys", () => {
  it("keeps Measure-as labels to single ingredients", () => {
    expect(isSingleIngredientLabel("general tso chicken")).toBe(false);
    expect(isSingleIngredientLabel("kung pao chicken")).toBe(false);
    expect(isSingleIngredientLabel("artichoke dip")).toBe(false);
    expect(isSingleIngredientLabel("fried broccoli")).toBe(false);
    expect(isSingleIngredientLabel("cheese flavored corn snacks")).toBe(false);
    expect(isSingleIngredientLabel("chicken nuggets")).toBe(false);
    expect(isSingleIngredientLabel("bibimbap")).toBe(false);

    expect(isSingleIngredientLabel("chicken breast")).toBe(true);
    expect(isSingleIngredientLabel("olive oil")).toBe(true);
    expect(isSingleIngredientLabel("cake flour")).toBe(true);
    expect(isSingleIngredientLabel("chocolate chips")).toBe(true);
    expect(isSingleIngredientLabel("soy sauce")).toBe(true);

    const catalog = conversionCatalogLabels();
    expect(catalog).not.toContain("general tso chicken");
    expect(catalog).toContain("chicken breast");
    expect(catalog).toContain("cake flour");
    expect(catalog).toContain("baking soda");
    expect(catalog).toContain("shallot");
  });

  it("resolves Measure-as synonyms that previously lacked density", () => {
    expect(lookupDensity("aubergine")?.key).toBe("eggplant");
    expect(lookupDensity("courgette")?.key).toBe("zucchini");
    expect(lookupDensity("prawn")?.key).toBe("shrimp");
    expect(lookupDensity("shallot")?.key).toBe("onions");
    expect(lookupDensity("bok choy")?.key).toBe("cabbage");
    expect(lookupDensity("honeydew")?.key).toBe("honeydew_melon");
    expect(lookupDensity("kiwi")?.key).toBe("kiwi_fruit");
    expect(lookupDensity("yam")?.key).toBe("sweet_potato");
    expect(lookupDensity("snow pea")?.key).toBe("green_peas");
    expect(lookupDensity("jalapeno")?.key).toBe("peppers");
    expect(lookupDensity("vanilla")?.key).toBe("vanilla extract");
    expect(lookupDensity("breadcrumbs")?.key).toBe("breadcrumbs");
    expect(lookupDensity("parmesan")?.key).toBe("cheese");
    expect(lookupDensity("bay leaf")?.key).toBe("spice");
    expect(lookupDensity("coriander")?.key).toBe("cilantro");
    expect(lookupDensity("dill")?.key).toBe("dill");
    expect(lookupDensity("mint")?.key).toBe("mint");
    expect(lookupDensity("fennel bulb")?.key).toBe("fennel");
  });

  it("infers butter / flour / onion / brown sugar variations", () => {
    expect(inferConversionKey("unsalted butter")).toBe("butter");
    expect(inferConversionKey("salted butter")).toBe("butter");
    expect(inferConversionKey("bread flour")).toBe("bread flour");
    expect(inferConversionKey("all-purpose flour")).toBe("flour");
    expect(inferConversionKey("yellow onions, coarsely chopped")).toBe("onion");
    expect(inferConversionKey("packed light brown sugar")).toBe("brown sugar");
  });

  it("infers common dried herbs and spices as spice", () => {
    expect(inferConversionKey("oregano")).toBe("spice");
    expect(inferConversionKey("dried oregano")).toBe("spice");
    expect(inferConversionKey("smoked paprika")).toBe("spice");
    expect(inferConversionKey("garlic powder")).toBe("spice");
    expect(lookupDensity("oregano")?.key).toBe("spice");
    expect(lookupDensity("spice")?.densityGPerMl).toBeCloseTo(0.25, 3);
  });

  it("maps powder names to spice unless a non-produce catalog match wins", () => {
    expect(inferConversionKey("curry powder")).toBe("spice");
    expect(inferConversionKey("asafoetida powder")).toBe("spice");
    expect(inferConversionKey("mushroom powder")).toBe("spice");
    expect(inferConversionKey("tomato powder")).toBe("spice");
    expect(inferConversionKey("onion powder")).toBe("spice");
    expect(inferConversionKey("cocoa powder")).toBe("cocoa");
    expect(inferConversionKey("powdered sugar")).toBe("powdered sugar");
    expect(inferConversionKey("baking powder")).toBe("baking powder");
  });

  it("infers baking soda / bicarb as baking soda", () => {
    expect(inferConversionKey("baking soda")).toBe("baking soda");
    expect(inferConversionKey("bicarbonate of soda")).toBe("baking soda");
    expect(inferConversionKey("bicarb")).toBe("baking soda");
    expect(lookupDensity("baking soda")?.densityGPerMl).toBeCloseTo(1.2, 3);
  });

  it("defaults produce size only for countable produce", () => {
    expect(isProduceIngredient({ name: "tomato", unit: "" })).toBe(true);
    expect(defaultProduceSize({ name: "tomato", unit: "" })).toBe("medium");
    expect(defaultProduceSize({ name: "tomato", unit: "cup" })).toBeUndefined();
    expect(defaultProduceSize({ name: "onion", unit: "oz" })).toBeUndefined();
    expect(defaultProduceSize({ name: "tomato", unit: "can" })).toBeUndefined();
    expect(defaultProduceSize({ name: "tomato", unit: "jar" })).toBeUndefined();
    expect(defaultProduceSize({ name: "garlic", unit: "clove" })).toBe("medium");
    expect(
      defaultProduceSize({ name: "egg", unit: "", size: "large" })
    ).toBeUndefined();
    expect(defaultProduceSize({ name: "salt", unit: "pinch" })).toBeUndefined();
    expect(
      isProduceIngredient({
        name: "freshly ground black pepper",
        unit: "twist",
        conversionKey: "black pepper",
      })
    ).toBe(false);
    expect(
      isProduceIngredient({
        name: "yellow onions, chopped",
        unit: "",
        conversionKey: "onion",
      })
    ).toBe(true);
  });

  it("uses conversionKey for density while keeping display name", () => {
    const ing: Ingredient = {
      quantity: 1,
      unit: "cup",
      name: "unsalted butter, softened",
      conversionKey: "butter",
    };
    expect(resolveConversionName(ing)).toBe("butter");
    const result = convertIngredient(ing, "g", us);
    expect(result.needsDensity).toBeUndefined();
    expect(result.unit).toBe("g");
    expect(result.quantity).toBeGreaterThan(100);
  });

  it("uses conversionKey for piece weights", () => {
    const ing: Ingredient = {
      quantity: 2,
      unit: "",
      name: "yellow onions, coarsely chopped",
      conversionKey: "onion",
      size: "medium",
    };
    const result = convertIngredient(ing, "g", metric);
    expect(result.needsWeight).toBeUndefined();
    expect(result.quantity).toBe(300);
  });

  it("matches singular conversion keys to plural density rows", () => {
    expect(lookupDensity("onion")?.key).toBe("onions");
    expect(resolveDensity("onion")?.densityGPerMl).toBeCloseTo(0.7604, 3);
    expect(lookupDensity("tomato")?.key).toBe("tomatoes");
  });

  it("converts countable produce to volume via piece weight and density", () => {
    const onions: Ingredient = {
      quantity: 2,
      unit: "",
      name: "yellow onions",
      conversionKey: "onion",
      size: "medium",
    };
    const cups = convertIngredient(onions, "cup", us);
    expect(cups.needsDensity).toBeUndefined();
    expect(cups.needsWeight).toBeUndefined();
    expect(cups.unit).toBe("cup");
    // 300g / 0.7604 g/ml / 240 ml/cup ≈ 1.64 → snaps near 1 5/8
    expect(cups.quantity).toBeGreaterThan(1.5);
    expect(cups.quantity).toBeLessThan(1.8);

    const tomatoes: Ingredient = {
      quantity: 1,
      unit: "",
      name: "tomato",
      conversionKey: "tomato",
      size: "medium",
    };
    const ml = convertIngredient(tomatoes, "ml", metric);
    expect(ml.needsDensity).toBeUndefined();
    expect(ml.unit).toBe("ml");
    expect(ml.quantity).toBeGreaterThan(50);
  });

  it("falls back to name lookup when conversionKey cleared", () => {
    const mystery: Ingredient = {
      quantity: 1,
      unit: "cup",
      name: "xyzzy unknown powder 999",
    };
    expect(convertIngredient(mystery, "g", metric).needsDensity).toBe(true);
  });
});

describe("expanded units", () => {
  it("canonicalizes long and short ounce forms", () => {
    expect(canonicalizeUnit("ounces")).toBe("oz");
    expect(canonicalizeUnit("oz.")).toBe("oz");
    expect(canonicalizeUnit("ozs")).toBe("oz");
    expect(canonicalizeUnit("fluid ounces")).toBe("fl_oz");
    expect(canonicalizeUnit("fl. oz.")).toBe("fl_oz");
  });

  it("converts pint and mg", () => {
    const milk = convertIngredient({ quantity: 1, unit: "pint", name: "milk" }, "ml", us);
    expect(milk.quantity).toBe(473); // rounded ml display
    expect(volumeUnitToMl(1, "pint", "us")).toBeCloseTo(473.176473, 5);
    const yeast = convertIngredient({ quantity: 1000, unit: "mg", name: "yeast" }, "g", metric);
    expect(yeast.quantity).toBe(1);
  });

  it("treats produce and portion units as countable", () => {
    expect(unitFamily("stalk")).toBe("countable");
    expect(unitFamily("egg")).toBe("countable");
    expect(unitFamily("tomato")).toBe("countable");
    const egg = convertIngredient({ quantity: 2, unit: "", name: "egg" }, "g", metric);
    expect(egg.unit).toBe("g");
    expect(egg.quantity).toBe(100);
  });
});
