import { describe, expect, it } from "vitest";
import type { Ingredient } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { scaleFactor, scaleRecipe, scaleRecipeIngredients } from "./index.js";

describe("scaleFactor", () => {
  it("doubles when servings double", () => {
    expect(scaleFactor(4, 8)).toBe(2);
  });

  it("halves when servings halve", () => {
    expect(scaleFactor(4, 2)).toBe(0.5);
  });
});

describe("scaleRecipeIngredients", () => {
  const ingredients: Ingredient[] = [
    { quantity: 2, unit: "cup", name: "flour", kind: "dry" },
    { quantity: 1, unit: "tsp", name: "salt" },
    { quantity: 3, unit: "piece", name: "eggs" },
  ];

  it("scales quantities by factor", () => {
    const scaled = scaleRecipeIngredients(ingredients, 4, 8);
    expect(scaled[0].quantity).toBe(4);
    expect(scaled[1].quantity).toBe(2);
    expect(scaled[2].quantity).toBe(6);
  });

  it("applies unit override after scaling", () => {
    const scaled = scaleRecipeIngredients(ingredients, 4, 4, {
      prefs: DEFAULT_MEASUREMENT_PREFS,
      unitOverrides: { 0: "g" },
    });
    // 2 cups metric * 0.5208 ≈ 260 g
    expect(scaled[0].unit).toBe("g");
    expect(scaled[0].quantity).toBe(260);
  });

  it("applies preferred units when requested", () => {
    const result = scaleRecipe(
      { servings: 2, ingredients },
      2,
      { applyPreferredUnits: true, prefs: DEFAULT_MEASUREMENT_PREFS }
    );
    expect(result.ingredients[0].unit).toBe("g");
  });

  it("scales quantity ranges on both ends", () => {
    const ranged: Ingredient[] = [
      { quantity: 4, quantityMax: 8, unit: "oz", name: "cream cheese" },
    ];
    const scaled = scaleRecipeIngredients(ranged, 4, 8);
    expect(scaled[0].quantity).toBe(8);
    expect(scaled[0].quantityMax).toBe(16);
    expect(scaled[0].displayQuantity).toContain("-");
  });

  it("preserves mass when changing produce size", () => {
    const onions: Ingredient[] = [
      {
        quantity: 2,
        unit: "",
        name: "yellow onions",
        conversionKey: "onion",
        size: "large",
      },
    ];
    const asSmall = scaleRecipeIngredients(onions, 1, 1, {
      sizeOverrides: { 0: "small" },
    });
    // 2 large × 190g = 380g; / 110g small ≈ 3.45
    expect(asSmall[0].size).toBe("small");
    expect(asSmall[0].quantity).toBeCloseTo(380 / 110, 2);
    expect(asSmall[0].quantity).toBeGreaterThan(2);

    const asGrams = scaleRecipeIngredients(onions, 1, 1, {
      unitOverrides: { 0: "g" },
    });
    expect(asGrams[0].unit).toBe("g");
    expect(asGrams[0].quantity).toBe(380);

    const tomatoes: Ingredient[] = [
      {
        quantity: 1,
        unit: "",
        name: "tomato",
        conversionKey: "tomato",
        size: "large",
      },
    ];
    const tomatoSmall = scaleRecipeIngredients(tomatoes, 1, 1, {
      sizeOverrides: { 0: "small" },
    });
    expect(tomatoSmall[0].quantity).toBeCloseTo(180 / 90, 5);
  });

  it("converts sized produce to cups from preserved mass", () => {
    const onions: Ingredient[] = [
      {
        quantity: 2,
        unit: "",
        name: "yellow onions",
        conversionKey: "onion",
        size: "medium",
      },
    ];
    const cups = scaleRecipeIngredients(onions, 1, 1, {
      prefs: DEFAULT_MEASUREMENT_PREFS,
      unitOverrides: { 0: "cup" },
    });
    expect(cups[0].unit).toBe("cup");
    expect(cups[0].needsDensity).toBeUndefined();
    expect(cups[0].quantity).toBeGreaterThan(1);
  });

  it("scales with Australian tablespoons by default and US when turned off", () => {
    const oil: Ingredient[] = [{ quantity: 1, unit: "tbsp", name: "olive oil" }];

    const au = scaleRecipeIngredients(oil, 2, 4, {
      prefs: DEFAULT_MEASUREMENT_PREFS,
      unitOverrides: { 0: "ml" },
    });
    expect(au[0].quantity).toBe(40);

    const us = scaleRecipeIngredients(oil, 2, 4, {
      prefs: { ...DEFAULT_MEASUREMENT_PREFS, cupStandard: "us", australianMeasures: false },
      unitOverrides: { 0: "ml" },
    });
    expect(us[0].quantity).toBe(29.6);
  });
});
