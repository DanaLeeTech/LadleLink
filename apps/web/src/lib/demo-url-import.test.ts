import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importRecipeInBrowser } from "./demo-url-import";

const RECIPE_HTML = `<!doctype html>
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Test Pancakes",
 "recipeYield":"4 servings",
 "recipeIngredient":["2 cups flour","1 cup milk","2 eggs"],
 "recipeInstructions":[{"@type":"HowToStep","text":"Mix and cook."}]}
</script>
</head><body></body></html>`;

const JUNK_HTML = "<!doctype html><html><body><p>rate limited</p></body></html>";

/** Fake fetch: answers per URL predicate; anything else gets 403. */
function fakeFetch(route: (url: string) => string | null, calls: string[] = []) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const body = route(url);
    if (body === null) return new Response("blocked", { status: 403 });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("importRecipeInBrowser", () => {
  it("falls back to another reader when one fails", async () => {
    const fetchImpl = fakeFetch((url) => (url.includes("codetabs") ? RECIPE_HTML : null));
    const recipe = await importRecipeInBrowser("https://example.com/pancakes", fetchImpl);
    assert.equal(recipe.title, "Test Pancakes");
    assert.equal(recipe.ingredients.length, 3);
  });

  it("skips a reader that answers with a page that has no recipe", async () => {
    const fetchImpl = fakeFetch((url) => (url.includes("allorigins") ? RECIPE_HTML : JUNK_HTML));
    const recipe = await importRecipeInBrowser("https://example.com/pancakes", fetchImpl);
    assert.equal(recipe.title, "Test Pancakes");
  });

  it("asks every reader before giving up", async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      return new Response("blocked", { status: 403 });
    }) as typeof fetch;
    await assert.rejects(
      () => importRecipeInBrowser("https://example.com/pancakes", fetchImpl),
      /Could not import/
    );
    assert.ok(attempts >= 3);
  });

  it("rejects links that are not http or https without fetching them", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch(() => RECIPE_HTML, calls);
    await assert.rejects(() => importRecipeInBrowser("file:///etc/passwd", fetchImpl), /http/);
    assert.deepEqual(calls, []);
  });
});
