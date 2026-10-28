import { describe, expect, it } from "vitest";
import type { Ingredient, MeasurementPrefs } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import {
  canonicalizeUnit,
  convertIngredient,
  conversionCatalogLabels,
  conversionMatchIndexBuildCount,
  defaultProduceSize,
  formatQuantity,
  formatQuantityRange,
  GENERATED_DENSITY_TABLE,
  GENERATED_PIECE_WEIGHTS,
  inferConversionKey,
  isProduceIngredient,
  isSingleIngredientLabel,
  lookupDensity,
  matchingConversionLabels,
  mlPerCup,
  pluralProduceName,
  pluralUnitLabel,
  resolveConversionName,
  resolveDensity,
  resolvePieceGrams,
  singularizeName,
  unitFamily,
  usesAustralianMeasures,
  volumeUnitToMl,
} from "./index.js";

const metric: MeasurementPrefs = {
  ...DEFAULT_MEASUREMENT_PREFS,
  cupStandard: "metric",
  australianMeasures: true,
};
const us: MeasurementPrefs = {
  ...DEFAULT_MEASUREMENT_PREFS,
  cupStandard: "us",
  australianMeasures: false,
};

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

describe("Australian measures", () => {
  it("uses 20 ml tbsp and 5 ml tsp; US uses 14.8 and 4.9", () => {
    const oil: Ingredient = { quantity: 2, unit: "tbsp", name: "olive oil" };
    expect(convertIngredient(oil, "ml", metric).quantity).toBe(40);
    expect(convertIngredient(oil, "ml", us).quantity).toBe(29.6);

    const salt: Ingredient = { quantity: 1, unit: "tsp", name: "salt" };
    expect(convertIngredient(salt, "ml", metric).quantity).toBe(5);
    expect(convertIngredient(salt, "ml", us).quantity).toBe(4.93);

    // Default prefs carry no flag at all: metric cups mean Australian spoons.
    expect(convertIngredient(oil, "ml", DEFAULT_MEASUREMENT_PREFS).quantity).toBe(40);
  });

  it("uses imperial pints and quarts", () => {
    const milk: Ingredient = { quantity: 1, unit: "pint", name: "milk" };
    expect(convertIngredient(milk, "ml", metric).quantity).toBe(568);
    const stock: Ingredient = { quantity: 1, unit: "quart", name: "stock" };
    expect(convertIngredient(stock, "ml", metric).quantity).toBe(1137);
  });

  it("falls back to US pints and quarts when Australian measures are off", () => {
    const milk: Ingredient = { quantity: 1, unit: "pint", name: "milk" };
    expect(convertIngredient(milk, "ml", us).quantity).toBe(473);
    const stock: Ingredient = { quantity: 1, unit: "quart", name: "stock" };
    expect(convertIngredient(stock, "ml", us).quantity).toBe(946);
    // A 250 ml metric cup with US measures is not a combination the UI produces,
    // but the flag decides the spoons either way.
    expect(usesAustralianMeasures({ ...us, cupStandard: "metric" })).toBe(false);
  });

  it("is on by default for metric cups and off when US cups are chosen", () => {
    expect(usesAustralianMeasures(DEFAULT_MEASUREMENT_PREFS)).toBe(true);
    expect(usesAustralianMeasures({ ...DEFAULT_MEASUREMENT_PREFS, cupStandard: "us" })).toBe(
      false
    );
    expect(usesAustralianMeasures(metric)).toBe(true);
    expect(usesAustralianMeasures(us)).toBe(false);
  });

  it("converts back from ml with the same factors", () => {
    expect(convertIngredient({ quantity: 40, unit: "ml", name: "water" }, "tbsp", metric).quantity).toBe(
      2
    );
    expect(convertIngredient({ quantity: 568, unit: "ml", name: "milk" }, "pint", metric).quantity).toBe(
      1
    );
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
    expect(convertIngredient(salt, "tbsp", us).quantity).toBe(1);
    // 3 × 5 ml tsp = 15 ml = ¾ of a 20 ml Australian tbsp.
    expect(convertIngredient(salt, "tbsp", metric).quantity).toBe(0.75);
  });

  it("converts g to kg", () => {
    const flour: Ingredient = { quantity: 1500, unit: "g", name: "flour" };
    const result = convertIngredient(flour, "kg", metric);
    expect(result.quantity).toBe(1.5);
  });
});

describe("formatting", () => {
  it("formats cup fractions without float tails", () => {
    expect(formatQuantity(0.333333, "cup")).toBe("⅓");
    expect(formatQuantity(1.5, "cup")).toBe("1 ½");
    expect(formatQuantity(0.25, "tsp")).toBe("¼");
    expect(formatQuantity(1.25, "tsp")).toBe("1 ¼");
    expect(formatQuantity(0.5, "tbsp")).toBe("½");
  });

  it("formats countable fractions, never decimals like 0.75", () => {
    expect(formatQuantity(0.5, "egg")).toBe("½");
    expect(formatQuantity(0.75, "egg")).toBe("¾");
    expect(formatQuantity(1.5, "piece")).toBe("1 ½");
    expect(formatQuantity(3, "egg")).toBe("3");
    // Not near a friendly fraction: keep the decimal.
    expect(formatQuantity(0.7, "egg")).toBe("0.7");
  });

  it("formats quantity ranges", () => {
    expect(formatQuantityRange(4, "oz", 8)).toBe("4-8");
  });

  it("keeps metric mass and volume as decimals, not fractions", () => {
    expect(formatQuantity(1.5, "g")).toBe("1.5");
    expect(formatQuantity(0.5, "g")).toBe("0.5");
    expect(formatQuantity(1.5, "ml")).toBe("1.5");
    expect(formatQuantity(0.25, "kg")).toBe("0.25");
    expect(formatQuantity(1.5, "l")).toBe("1.5");
    // Imperial measures people still read as fractions
    expect(formatQuantity(1.5, "oz")).toBe("1 ½");
    expect(formatQuantity(0.5, "lb")).toBe("½");
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

  it("uses singular labels for fractions below one", () => {
    expect(pluralUnitLabel("cup", 0.5)).toBe("cup");
    expect(pluralUnitLabel("cup", 1.5)).toBe("cups");
    expect(pluralProduceName("egg", 0.5)).toBe("egg");
    expect(pluralProduceName("egg", 2)).toBe("eggs");
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

  it("singularizes the last word of a name for a quantity of one", () => {
    expect(singularizeName("diced tomatoes")).toBe("diced tomato");
    expect(singularizeName("chopped onions")).toBe("chopped onion");
    expect(singularizeName("frozen berries")).toBe("frozen berry");
    expect(singularizeName("cherry tomatoes")).toBe("cherry tomato");
    expect(singularizeName("glasses")).toBe("glass");
    // Mass nouns and already-singular names are untouched
    for (const name of ["hummus", "asparagus", "couscous", "flour", "salt", "egg"]) {
      expect(singularizeName(name)).toBe(name);
    }
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

  it("resolves the corrected water chestnut spelling", () => {
    expect(lookupDensity("water chestnut")?.key).toBe("water_chesnut");
    expect(lookupDensity("water chesnut")?.key).toBe("water_chesnut");
    expect(resolvePieceGrams({ quantity: 1, unit: "", name: "water chestnut" })).toBe(10);
  });

  it("matches water chestnut names to the generated catalog label", () => {
    expect(matchingConversionLabels("water chestnut")[0]).toBe("water chesnut");
    expect(matchingConversionLabels("water chestnuts")[0]).toBe("water chesnut");
  });

  it("keeps the alias and exact-only matching rules", () => {
    // "pepper" is EXACT_ONLY: it must not leak into "bell pepper" (vegetable).
    expect(matchingConversionLabels("pepper")).toEqual(["pepper"]);
    expect(matchingConversionLabels("black pepper")).toEqual(["black pepper"]);
    expect(matchingConversionLabels("bell pepper")).toEqual(["pepper"]);
    // Empty input never touches the index.
    expect(matchingConversionLabels("")).toEqual([]);
    expect(matchingConversionLabels("   ")).toEqual([]);
  });

  it("builds the match index once and stays inside the typing budget", () => {
    const names = ["water chestnut", "scallion", "shrimp", "unsalted butter", "tomato"];
    for (const name of names) matchingConversionLabels(name);
    const builds = conversionMatchIndexBuildCount();

    // Benchmark-style guard: 200 lookups must average under 50 ms each. The old
    // full-catalog scan took ~1 s per keypress at 4× CPU slowdown, so even this
    // generous bound fails loudly if the per-call scan comes back.
    const started = performance.now();
    for (let i = 0; i < 200; i++) matchingConversionLabels(names[i % names.length]!);
    expect((performance.now() - started) / 200).toBeLessThan(50);

    // The index is a module-load artefact: lookups must not rebuild it.
    expect(conversionMatchIndexBuildCount()).toBe(builds);
  });

  it("keeps conversions working for dropdown labels", () => {
    expect(convertIngredient({ quantity: 1, unit: "cup", name: "carrot" }, "g", metric).quantity).toBe(
      199
    );
    expect(convertIngredient({ quantity: 2, unit: "", name: "capsicum" }, "g", metric).quantity).toBe(
      300
    );
    expect(convertIngredient({ quantity: 100, unit: "g", name: "prawn" }, "ml", metric).quantity).toBe(
      178
    );
    expect(
      convertIngredient({ quantity: 1, unit: "", name: "water chestnut" }, "g", metric).quantity
    ).toBe(10);
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
