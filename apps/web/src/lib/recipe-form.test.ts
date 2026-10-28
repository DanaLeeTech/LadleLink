import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { servingsForMultiplier, splitTags, validateRecipeForm } from "./recipe-form";

describe("validateRecipeForm", () => {
  it("accepts a normal title and servings", () => {
    assert.deepEqual(validateRecipeForm("Pancakes", 4), {});
  });

  it("rejects a blank or whitespace-only title", () => {
    assert.equal(validateRecipeForm("", 4).title, "Add a title.");
    assert.equal(validateRecipeForm("   ", 4).title, "Add a title.");
  });

  it("rejects empty, zero and negative servings", () => {
    for (const servings of ["", 0, -2, Number.NaN] as const) {
      assert.equal(validateRecipeForm("Pancakes", servings).servings, "Servings must be 1 or more.");
    }
  });

  it("reports both problems at once", () => {
    const errors = validateRecipeForm(" ", "");
    assert.ok(errors.title && errors.servings);
  });
});

describe("splitTags", () => {
  it("splits comma-separated tags and trims them", () => {
    assert.deepEqual(splitTags(["dinner, quick ,  easy"]), ["dinner", "quick", "easy"]);
  });

  it("keeps separate tags and drops blanks and duplicates", () => {
    assert.deepEqual(splitTags(["dinner", "", " dinner ", "quick,"]), ["dinner", "quick"]);
  });
});

describe("servingsForMultiplier", () => {
  it("scales the base servings by ½, 1, 2 and 3", () => {
    assert.equal(servingsForMultiplier(4, 0.5), 2);
    assert.equal(servingsForMultiplier(4, 1), 4);
    assert.equal(servingsForMultiplier(4, 2), 8);
    assert.equal(servingsForMultiplier(4, 3), 12);
  });

  it("keeps halves and never drops below one serving", () => {
    assert.equal(servingsForMultiplier(3, 0.5), 1.5);
    assert.equal(servingsForMultiplier(1, 0.5), 1);
  });
});
