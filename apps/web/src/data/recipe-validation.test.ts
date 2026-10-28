import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Recipe } from "@ladlelink/types";
import { importSummary, sanitizeRecipe, validateImportRecipes } from "./recipe-validation";

const good: Recipe = {
  id: "r1",
  title: "Lemon Cake",
  servings: 8,
  ingredients: [{ quantity: 200, unit: "g", name: "butter", conversionKey: "butter" }],
  steps: ["Mix", "Bake"],
  sections: [{ kind: "ingredients", at: 0, title: "For the cake" }],
  tags: ["cake"],
  notes: "Keeps for 3 days",
  sourceUrl: "https://example.com/cake",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("sanitizeRecipe", () => {
  it("keeps a well-formed recipe intact", () => {
    assert.deepEqual(sanitizeRecipe(good), good);
  });

  it("rejects recipes missing required fields or with the wrong types", () => {
    const broken = [
      { ...good, id: "" },
      { ...good, title: 42 },
      { ...good, servings: 0 },
      { ...good, servings: "8" },
      { ...good, steps: "Mix and bake" },
      { ...good, steps: [1, 2] },
      { ...good, ingredients: "butter" },
      { ...good, updatedAt: undefined },
      null,
      "recipe",
    ];
    for (const value of broken) {
      assert.equal(sanitizeRecipe(value), null, JSON.stringify(value)?.slice(0, 60));
    }
  });

  it("rejects the whole recipe when one ingredient row is bad", () => {
    assert.equal(
      sanitizeRecipe({
        ...good,
        ingredients: [...good.ingredients, { quantity: "a lot", unit: "g", name: "sugar" }],
      }),
      null
    );
  });

  it("drops garbage optional fields instead of saving them", () => {
    const recipe = sanitizeRecipe({
      ...good,
      tags: "cake",
      sections: "nope",
      notes: 7,
      sourceUrl: { href: "x" },
      ingredients: [{ quantity: 1, unit: "cup", name: "flour", size: "gigantic", densityGPerMl: "1" }],
    });
    assert.ok(recipe);
    assert.deepEqual(recipe.tags, []);
    assert.equal(recipe.sections, undefined);
    assert.equal(recipe.notes, undefined);
    assert.equal(recipe.sourceUrl, undefined);
    assert.deepEqual(recipe.ingredients, [{ quantity: 1, unit: "cup", name: "flour" }]);
  });
});

describe("validateImportRecipes", () => {
  it("keeps good entries and names each skipped one", () => {
    const { recipes, reasons } = validateImportRecipes([
      good,
      { ...good, id: "r2", title: "No servings", servings: -1 },
      { id: "r3" },
      "not a recipe",
    ]);
    assert.deepEqual(
      recipes.map((r) => r.id),
      ["r1"]
    );
    assert.equal(reasons.length, 3);
    assert.match(reasons[0]!, /Skipped “No servings”/);
    assert.match(reasons[1]!, /Skipped #3/);
    assert.match(reasons[2]!, /Skipped #4/);
  });

  it("returns no recipes at all when every entry is damaged", () => {
    const { recipes, reasons } = validateImportRecipes([
      { ...good, servings: NaN },
      { ...good, steps: ["ok", null] },
      { ...good, ingredients: [{ name: "flour", unit: "cup" }] },
      [],
    ]);
    assert.deepEqual(recipes, []);
    assert.equal(reasons.length, 4);
  });

  it("skips a mixed backup's bad rows without touching the good ones", () => {
    const { recipes } = validateImportRecipes([
      { ...good, id: "keep-a" },
      { ...good, id: "bad-1", ingredients: [{ quantity: 1, unit: 2, name: "x" }] },
      { ...good, id: "keep-b", updatedAt: "2026-02-02T00:00:00.000Z" },
      { ...good, id: "bad-2", steps: "single string" },
    ]);
    assert.deepEqual(
      recipes.map((r) => r.id),
      ["keep-a", "keep-b"]
    );
    // Surviving recipes are complete objects, never half-built.
    for (const recipe of recipes) {
      assert.ok(recipe.title);
      assert.ok(recipe.ingredients.every((i) => typeof i.quantity === "number"));
    }
  });

  it("rejects a numeric-but-wrong servings and a missing title", () => {
    assert.equal(sanitizeRecipe({ ...good, servings: -4 }), null);
    assert.equal(sanitizeRecipe({ ...good, servings: 0 }), null);
    assert.equal(sanitizeRecipe({ ...good, servings: Infinity }), null);
    assert.equal(sanitizeRecipe({ ...good, title: undefined }), null);
    assert.equal(sanitizeRecipe({ ...good, title: null }), null);
  });

  it("splits comma-separated backup tags, trims them and drops duplicates", () => {
    const recipe = sanitizeRecipe({ ...good, tags: ["chilli, asian", " asian ", "", "dinner"] });
    assert.ok(recipe);
    assert.deepEqual(recipe.tags, ["chilli", "asian", "dinner"]);
  });
});

describe("importSummary", () => {
  it("reports a normal import with skipped rows as success", () => {
    const summary = importSummary({ imported: 2, skipped: 1, reasons: ["Skipped #2: bad"] });
    assert.equal(summary.ok, true);
    assert.equal(summary.message, "Imported 2 recipes. Skipped 1 damaged entry.");
    // Reasons are listed separately, behind the page's details toggle
    assert.deepEqual(summary.reasons, ["Skipped #2: bad"]);
  });

  it("uses singular nouns for one recipe and one damaged entry", () => {
    assert.equal(importSummary({ imported: 1 }).message, "Imported 1 recipe.");
    assert.equal(
      importSummary({ imported: 1, skipped: 1, reasons: ["Skipped #2: bad"] }).message,
      "Imported 1 recipe. Skipped 1 damaged entry."
    );
  });

  it("uses plural nouns for several damaged entries", () => {
    const reasons = Array.from({ length: 8 }, (_, i) => `Skipped #${i + 1}: bad`);
    const summary = importSummary({ imported: 3, skipped: 8, reasons });
    assert.equal(summary.message, "Imported 3 recipes. Skipped 8 damaged entries.");
    assert.equal(summary.reasons.length, 8);
  });

  it("reports an all-skipped file as a failure that saved nothing", () => {
    const summary = importSummary({
      imported: 0,
      skipped: 3,
      reasons: ["Skipped #1: bad", "Skipped #2: bad", "Skipped #3: bad"],
    });
    assert.equal(summary.ok, false);
    assert.match(summary.message, /No recipes were imported/);
    assert.match(summary.message, /nothing was saved/);
    assert.match(summary.message, /Skipped 3 damaged entries\./);
    // Per-recipe reasons survive for the user
    assert.equal(summary.reasons.length, 3);
    assert.match(summary.reasons[2]!, /Skipped #3: bad/);
  });
});
