import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRecipeHtml } from "@ladlelink/parser";
import { recipeInputFromDraft } from "./import-draft";

const RECIPE_HTML = `<!doctype html>
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Lemon Cake",
 "recipeYield":"8 servings",
 "image":"https://example.com/images/lemon-cake.jpg",
 "recipeIngredient":["200 g butter","200 g sugar","3 eggs"],
 "recipeInstructions":[{"@type":"HowToStep","text":"Mix and bake."}]}
</script>
</head><body></body></html>`;

describe("recipeInputFromDraft", () => {
  it("keeps the imported image URL when saving a reviewed draft", () => {
    const parsed = parseRecipeHtml(RECIPE_HTML, "https://example.com/cake");
    const input = recipeInputFromDraft(
      { ...parsed, servings: parsed.servings },
      parsed.ingredients,
      parsed.steps
    );

    assert.equal(input.imageUrl, "https://example.com/images/lemon-cake.jpg");
    assert.equal(input.title, "Lemon Cake");
    assert.equal(input.sourceUrl, "https://example.com/cake");
    assert.equal(input.ingredients.length, 3);
  });

  it("splits comma-separated draft tags into separate trimmed tags", () => {
    const parsed = parseRecipeHtml(RECIPE_HTML, "https://example.com/cake");
    const input = recipeInputFromDraft(
      { ...parsed, servings: parsed.servings, tags: ["chilli, asian", " dessert ", ""] },
      parsed.ingredients,
      parsed.steps
    );

    assert.deepEqual(input.tags, ["chilli", "asian", "dessert"]);
  });

  it("stores an uploaded photo as the local path, not a web address", () => {
    const parsed = parseRecipeHtml(RECIPE_HTML, "https://example.com/cake");
    const input = recipeInputFromDraft(
      { ...parsed, servings: parsed.servings, photoUrl: "/api/photos/abc.jpg" },
      parsed.ingredients,
      parsed.steps
    );

    assert.equal(input.photoPath, "/api/photos/abc.jpg");
    assert.equal(input.imageUrl, null);
  });

  it("saves no photo when the reviewer removed it", () => {
    const parsed = parseRecipeHtml(RECIPE_HTML, "https://example.com/cake");
    const input = recipeInputFromDraft(
      { ...parsed, servings: parsed.servings, photoUrl: null },
      parsed.ingredients,
      parsed.steps
    );

    assert.equal(input.photoPath, null);
    assert.equal(input.imageUrl, null);
  });
});
