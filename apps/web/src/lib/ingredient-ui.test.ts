import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CanonicalUnit, Ingredient } from "@ladlelink/types";
import {
  formatIngredientPreview,
  formatQuantityField,
  parseQuantityField,
  parseQuantityFieldForCommit,
} from "./ingredient-ui";

describe("parseQuantityField", () => {
  it("accepts whole numbers", () => {
    assert.deepEqual(parseQuantityField("4"), { quantity: 4, quantityMax: null });
  });

  it("accepts decimals with a dot or a decimal comma", () => {
    assert.equal(parseQuantityField("1.5").quantity, 1.5);
    assert.equal(parseQuantityField("0,5").quantity, 0.5);
    assert.equal(parseQuantityField("1,25").quantity, 1.25);
    // Three trailing digits stay a thousands separator.
    assert.equal(parseQuantityField("1,000").quantity, 1000);
  });

  it("accepts simple fractions", () => {
    assert.equal(parseQuantityField("1/2").quantity, 0.5);
    assert.equal(parseQuantityField("3 / 4").quantity, 0.75);
  });

  it("accepts mixed fractions", () => {
    assert.equal(parseQuantityField("1 1/2").quantity, 1.5);
    assert.equal(parseQuantityField("2  1/3").quantity, 2 + 1 / 3);
  });

  it("accepts a spaced unicode mixed fraction", () => {
    assert.equal(parseQuantityField("1 ½").quantity, 1.5);
    assert.equal(parseQuantityField("2 ⅓").quantity, 2 + 1 / 3);
  });

  it("accepts unicode fractions", () => {
    for (const [text, value] of [
      ["½", 0.5],
      ["¼", 0.25],
      ["¾", 0.75],
      ["⅓", 1 / 3],
      ["⅔", 2 / 3],
      ["⅛", 0.125],
      ["1½", 1.5],
    ] as const) {
      assert.equal(parseQuantityField(text).quantity, value, text);
    }
  });

  it("keeps ranges, including fractional ones", () => {
    assert.deepEqual(parseQuantityField("4-8"), { quantity: 4, quantityMax: 8 });
    assert.deepEqual(parseQuantityField("1/2 to 1"), { quantity: 0.5, quantityMax: 1 });
    assert.deepEqual(parseQuantityField("1 ½-2"), { quantity: 1.5, quantityMax: 2 });
  });

  it("treats empty as blank", () => {
    assert.deepEqual(parseQuantityField("  "), { quantity: 0, quantityMax: null });
    assert.deepEqual(parseQuantityFieldForCommit(""), { quantity: 0, quantityMax: null });
  });
});

describe("parseQuantityFieldForCommit", () => {
  it("rejects text that is not a quantity", () => {
    assert.equal(parseQuantityFieldForCommit("abc"), null);
    assert.equal(parseQuantityFieldForCommit("1/0"), null);
    assert.equal(parseQuantityFieldForCommit("0/4"), null, "zero numerator commits nothing");
    assert.equal(parseQuantityFieldForCommit("1/2 cups"), null, "unit text is not a quantity");
    assert.equal(parseQuantityFieldForCommit("½ cup"), null);
    assert.equal(parseQuantityFieldForCommit("1 ½ cup"), null);
  });

  it("rejects zero and negative values", () => {
    assert.equal(parseQuantityFieldForCommit("0"), null);
    assert.equal(parseQuantityFieldForCommit("-2"), null);
  });

  it("accepts a committed fraction", () => {
    assert.deepEqual(parseQuantityFieldForCommit("½"), { quantity: 0.5, quantityMax: null });
  });
});

describe("quantity display", () => {
  it("shows friendly fractions in the qty field", () => {
    assert.equal(formatQuantityField({ quantity: 0.5 }), "½");
    assert.equal(formatQuantityField({ quantity: 1.5 }), "1 ½");
    assert.equal(formatQuantityField({ quantity: 2 }), "2");
    assert.equal(formatQuantityField({ quantity: 6.5, quantityMax: 8 }), "6 ½-8");
  });

  it("shows ½ egg, not 0.5 egg", () => {
    const egg: Ingredient = { quantity: 0.5, unit: "" as CanonicalUnit, name: "egg" };
    assert.equal(formatIngredientPreview(egg), "½ egg");
  });

  it("shows ¾ cup for a fractional cup", () => {
    const milk: Ingredient = { quantity: 0.75, unit: "cup", name: "milk" };
    assert.equal(formatIngredientPreview(milk), "¾ cup milk");
  });

  it("pluralises a fraction above one and keeps non-friendly values clean", () => {
    const flour: Ingredient = { quantity: 1.5, unit: "cup", name: "flour" };
    assert.equal(formatIngredientPreview(flour), "1 ½ cups flour");
    const odd: Ingredient = { quantity: 0.7, unit: "" as CanonicalUnit, name: "egg" };
    assert.equal(formatIngredientPreview(odd), "0.7 egg");
    const range: Ingredient = { quantity: 0.5, quantityMax: 1, unit: "cup", name: "cream" };
    assert.equal(formatIngredientPreview(range), "½-1 cup cream");
  });
});
