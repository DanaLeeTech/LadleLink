import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importRecipeInBrowser, looksLikeRealPage } from "./demo-url-import";

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

const RECIPE_HTML = `<!doctype html>
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Test Pancakes",
 "recipeYield":"4 servings",
 "recipeIngredient":["2 cups flour","1 cup milk","2 eggs"],
 "recipeInstructions":[{"@type":"HowToStep","text":"Mix and cook."}]}
</script>
</head><body></body></html>`;

/** Fake fetch: answers per URL (and request headers); anything else gets 403. */
function fakeFetch(
  route: (url: string, init?: RequestInit) => string | null,
  calls: string[] = []
) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const body = route(url, init);
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

  it("does not retry other readers when the page itself has no recipe", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch(() => fixture("wikipedia-article.html"), calls);
    await assert.rejects(
      () => importRecipeInBrowser("https://example.com/pancakes", fetchImpl),
      /No recipe found/
    );
    // First reader, then one rendered-markdown attempt — no proxy repeats.
    assert.equal(calls.length, 2);
    assert.match(calls[0]!, /r\.jina\.ai/);
    assert.match(calls[1]!, /r\.jina\.ai/);
  });

  it("tries another reader when the first returns a Cloudflare challenge", async () => {
    const CHALLENGE =
      "<!doctype html><html><head><title>Just a moment...</title></head><body><p>Checking your browser</p></body></html>";
    const calls: string[] = [];
    const fetchImpl = fakeFetch(
      (url) => (url.includes("r.jina.ai") ? CHALLENGE : RECIPE_HTML),
      calls
    );
    const recipe = await importRecipeInBrowser("https://example.com/pancakes", fetchImpl);
    assert.equal(recipe.title, "Test Pancakes");
    assert.ok(calls.some((url) => url.includes("allorigins")));
  });

  it("tries another reader when the first returns a blank or empty shell", async () => {
    for (const blank of ["", "<!doctype html><html><body></body></html>"]) {
      const calls: string[] = [];
      const fetchImpl = fakeFetch((url) => (url.includes("r.jina.ai") ? blank : RECIPE_HTML), calls);
      const recipe = await importRecipeInBrowser("https://example.com/pancakes", fetchImpl);
      assert.equal(recipe.title, "Test Pancakes");
      assert.ok(calls.some((url) => url.includes("allorigins")));
    }
  });

  it("tells a real page from a challenge or blank shell", () => {
    assert.equal(looksLikeRealPage(fixture("wikipedia-article.html")), true);
    assert.equal(looksLikeRealPage(fixture("not-found.html")), false);
    assert.equal(
      looksLikeRealPage(
        "<!doctype html><html><head><title>Just a moment...</title></head><body><p>Checking your browser</p></body></html>"
      ),
      false
    );
    assert.equal(looksLikeRealPage(""), false);
  });

  it("asks every reader before giving up", async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      return new Response("blocked", { status: 403 });
    }) as typeof fetch;
    await assert.rejects(
      () => importRecipeInBrowser("https://example.com/pancakes", fetchImpl),
      /No recipe found/
    );
    assert.ok(attempts >= 3);
  });

  it("rejects links that are not http or https without fetching them", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch(() => RECIPE_HTML, calls);
    await assert.rejects(() => importRecipeInBrowser("file:///etc/passwd", fetchImpl), /http/);
    assert.deepEqual(calls, []);
  });

  it("tries r.jina.ai first and stops at the first good result", async () => {
    const calls: string[] = [];
    const messages: string[] = [];
    const fetchImpl = fakeFetch((url) => (url.includes("r.jina.ai") ? RECIPE_HTML : null), calls);
    const recipe = await importRecipeInBrowser("https://example.com/pancakes", fetchImpl, {
      onProgress: (message) => messages.push(message),
    });
    assert.equal(recipe.title, "Test Pancakes");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /r\.jina\.ai/);
    assert.deepEqual(messages, ["Fetching…", "Reading recipe…"]);
  });

  it("rejects a 404 page with a clear message", async () => {
    const fetchImpl = fakeFetch(() => fixture("not-found.html"));
    await assert.rejects(
      () => importRecipeInBrowser("https://example.com/gone", fetchImpl),
      /No recipe found on that page/
    );
  });

  it("rejects a Wikipedia-style article", async () => {
    const fetchImpl = fakeFetch(() => fixture("wikipedia-article.html"));
    await assert.rejects(
      () => importRecipeInBrowser("https://en.wikipedia.org/wiki/Pancake", fetchImpl),
      /No recipe found on that page/
    );
  });

  it("ignores a page whose only lists are navigation", async () => {
    const fetchImpl = fakeFetch(() => fixture("nav-list.html"));
    await assert.rejects(
      () => importRecipeInBrowser("https://example.com/recipes", fetchImpl),
      /No recipe found on that page/
    );
  });

  it("keeps HowToSection headings and the image URL", async () => {
    const fetchImpl = fakeFetch(() => fixture("howto-section.html"));
    const recipe = await importRecipeInBrowser("https://example.com/cake", fetchImpl);
    assert.equal(recipe.sections?.length, 2);
    assert.equal(recipe.sections?.[1].title, "For the icing");
    assert.equal(recipe.photoUrl, "https://example.com/images/lemon-cake.jpg");
    assert.equal(recipe.steps[0], "Cream the butter and sugar.");
  });

  it("parses a Coles-style page with servings and clean steps", async () => {
    const fetchImpl = fakeFetch(() => fixture("coles-style.html"));
    const recipe = await importRecipeInBrowser("https://www.coles.com.au/recipe/cookies", fetchImpl);
    assert.equal(recipe.servings, 12);
    assert.equal(recipe.steps[0], "Preheat the oven to 180°C and line two trays.");
    assert.equal(recipe.sections?.[0].title, "For the dough");
    assert.equal(
      recipe.photoUrl,
      "https://www.coles.com.au/content/dam/coles/choc-chip-cookies.jpg"
    );
  });

  it("falls back to rendered markdown when every HTML reader gets a JS shell", async () => {
    const JS_SHELL =
      '<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>';
    const MARKDOWN = `Title: Best Brownies

# Best Brownies

## Ingredients
- 200 g butter
- 200 g dark chocolate
- 3 eggs
- 1 cup sugar

## Method
1. Melt the butter and chocolate.
2. Whisk in the eggs and sugar.
3. Bake for 25 minutes.`;
    const fetchImpl = fakeFetch((url, init) => {
      if (!url.includes("r.jina.ai")) return JS_SHELL;
      // The HTML attempt asks for HTML; the fallback keeps jina's markdown default.
      return init?.headers && "X-Return-Format" in (init.headers as object)
        ? JS_SHELL
        : MARKDOWN;
    });
    const recipe = await importRecipeInBrowser("https://example.com/brownies", fetchImpl);
    assert.equal(recipe.title, "Best Brownies");
    assert.equal(recipe.ingredients.length, 4);
    assert.equal(recipe.sourceUrl, "https://example.com/brownies");
    assert.equal(recipe.steps.length, 3);
  });

  it("still rejects markdown junk from the fallback", async () => {
    const JUNK = `Title: Page not found

# Page not found

- Home
- Recipes
- About

Sorry, we couldn't find that page.`;
    const fetchImpl = fakeFetch(() => JUNK);
    await assert.rejects(
      () => importRecipeInBrowser("https://example.com/gone", fetchImpl),
      /No recipe found on that page/
    );
  });

  it("reports progress and stops when cancelled", async () => {
    const messages: string[] = [];
    const controller = new AbortController();
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        importRecipeInBrowser("https://example.com/pancakes", fetchImpl, {
          signal: controller.signal,
          onProgress: (message) => messages.push(message),
        }),
      /cancelled/i
    );
    assert.deepEqual(messages, ["Fetching…"]);
    assert.equal(attempts, 1);
  });

  it("aborts an in-flight fetch when cancelled", async () => {
    const controller = new AbortController();
    let attempts = 0;
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      attempts += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      });
    }) as unknown as typeof fetch;

    const pending = importRecipeInBrowser("https://example.com/pancakes", fetchImpl, {
      signal: controller.signal,
    });
    controller.abort();

    await assert.rejects(pending, /cancelled/i);
    assert.equal(attempts, 1);
  });
});
