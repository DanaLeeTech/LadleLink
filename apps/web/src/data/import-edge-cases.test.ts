/** Corrupt-backup checks for the JSON import path. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBackupPayload, validateImportRecipes } from "./recipe-validation";

const good = {
  id: "r1",
  title: "Lemon Cake",
  servings: 8,
  ingredients: [{ quantity: 200, unit: "g", name: "butter" }],
  steps: ["Mix"],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("corrupt backup import", () => {
  it("skips wrong types, missing title, negative servings and non-array ingredients", () => {
    const { recipes, reasons } = validateImportRecipes([
      good,
      { ...good, id: "r2", servings: -1 },
      { id: "r3", servings: 4, ingredients: [], steps: [], createdAt: "a", updatedAt: "b" },
      { ...good, id: "r4", ingredients: "butter" },
      { ...good, id: "r5", steps: "Mix" },
    ]);
    assert.deepEqual(
      recipes.map((r) => r.id),
      ["r1"]
    );
    assert.equal(reasons.length, 4);
    assert.ok(reasons.every((r) => /^Skipped .*missing or invalid/.test(r)));
  });

  it("rejects a blank title instead of saving a nameless page", () => {
    assert.deepEqual(validateImportRecipes([{ ...good, title: "" }]).recipes, []);
    assert.deepEqual(validateImportRecipes([{ ...good, title: "   " }]).recipes, []);
  });

  it("rejects a blank ingredient row", () => {
    assert.deepEqual(
      validateImportRecipes([{ ...good, ingredients: [{ quantity: 0, unit: "", name: "" }] }])
        .recipes,
      []
    );
    assert.deepEqual(
      validateImportRecipes([{ ...good, ingredients: [{ quantity: 0, unit: "", name: "  " }] }])
        .recipes,
      []
    );
  });

  it("rejects a recipe with no steps and no ingredients", () => {
    assert.deepEqual(validateImportRecipes([{ ...good, steps: [], ingredients: [] }]).recipes, []);
    assert.deepEqual(validateImportRecipes([{ ...good, steps: [] }]).recipes, []);
    assert.deepEqual(validateImportRecipes([{ ...good, ingredients: [] }]).recipes, []);
  });

  it("gives a plain-English message for malformed JSON or a null file", () => {
    assert.throws(() => parseBackupPayload("{not json"), /isn't a LadleLink backup/i);
    assert.throws(() => parseBackupPayload(""), /isn't a LadleLink backup/i);
    assert.throws(() => parseBackupPayload("null"), /isn't a LadleLink backup/i);
    assert.throws(() => parseBackupPayload(JSON.stringify({ version: 1 })), /isn't a LadleLink backup/i);
    assert.doesNotThrow(() => parseBackupPayload(JSON.stringify({ version: 1, recipes: [] })));
  });
});
