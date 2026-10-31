/**
 * Import break-it checks for the demo (browser) URL import path, run against
 * hand-written fixtures through the real reader loop with a mocked fetch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importRecipeInBrowser } from "./demo-url-import";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "packages",
  "parser",
  "fixtures"
);
const fixture = (name: string) => readFileSync(join(fixtures, name), "utf8");

/** Fake fetch: answers per URL predicate; anything else gets 403. */
function fakeFetch(route: (url: string) => string | null) {
  return (async (input: string | URL | Request) => {
    const body = route(String(input));
    if (body === null) return new Response("blocked", { status: 403 });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("demo import of real-recipe pages", () => {
  it("imports a RecipeTin-style page instead of rejecting it", async () => {
    const fetchImpl = fakeFetch(() => fixture("recipetin-style.html"));
    const recipe = await importRecipeInBrowser(
      "https://www.recipetineats.com/beef-ragu/",
      fetchImpl
    );
    assert.equal(recipe.title, "Beef Ragu");
    assert.equal(recipe.servings, 4);
    assert.equal(recipe.ingredients.length, 6);
  });

  it("normalises gm weights on a taste.com.au-style page", async () => {
    const fetchImpl = fakeFetch(() => fixture("taste-style.html"));
    const recipe = await importRecipeInBrowser(
      "https://www.taste.com.au/recipes/beef-ragu",
      fetchImpl
    );
    assert.match(recipe.title, /beef ragu/i);
    assert.equal(recipe.ingredients[0].quantity, 500);
    assert.equal(recipe.ingredients[0].unit, "g");
  });
});
