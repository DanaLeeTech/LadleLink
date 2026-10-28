/**
 * Photo URLs: a root-relative or relative image belongs to the recipe's page,
 * not to the app showing it.
 */
import { describe, expect, it } from "vitest";
import { parseHeuristic, parseJsonLd, parseMicrodata, resolvePhotoUrl } from "./index.js";

const jsonLdPage = (jsonLd: object, extraHead = "") => `<!doctype html>
<html><head>${extraHead}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head><body><h1>Fallback</h1></body></html>`;

const baseRecipe = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Test Cake",
  recipeYield: "8 servings",
  recipeIngredient: ["2 cups flour", "1 cup milk", "3 eggs"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Mix and bake." }],
};

describe("resolvePhotoUrl", () => {
  it("returns null for nothing usable", () => {
    expect(resolvePhotoUrl(null, "https://example.com/cake")).toBeNull();
    expect(resolvePhotoUrl(undefined, "https://example.com/cake")).toBeNull();
    expect(resolvePhotoUrl("   ", "https://example.com/cake")).toBeNull();
  });

  it("leaves an absolute http(s) URL alone", () => {
    expect(resolvePhotoUrl("https://img.test/cake.jpg", "https://example.com/cake")).toBe(
      "https://img.test/cake.jpg"
    );
    expect(resolvePhotoUrl(" HTTP://img.test/cake.jpg ", "https://example.com/cake")).toBe(
      "HTTP://img.test/cake.jpg"
    );
  });

  it("resolves relative, root-relative and protocol-relative URLs", () => {
    const base = "https://example.com/recipes/cake";
    expect(resolvePhotoUrl("images/cake.jpg", base)).toBe(
      "https://example.com/recipes/images/cake.jpg"
    );
    expect(resolvePhotoUrl("/content/dam/coles/x.jpg", base)).toBe(
      "https://example.com/content/dam/coles/x.jpg"
    );
    expect(resolvePhotoUrl("//img.example.com/x.jpg", base)).toBe(
      "https://img.example.com/x.jpg"
    );
  });

  it("keeps the original when there is no usable base", () => {
    expect(resolvePhotoUrl("/x.jpg", "")).toBe("/x.jpg");
    expect(resolvePhotoUrl("images/cake.jpg", "not a url")).toBe("images/cake.jpg");
    expect(resolvePhotoUrl("data:image/png;base64,AAA", "https://example.com/cake")).toBe(
      "data:image/png;base64,AAA"
    );
  });
});

describe("extractors resolve photo URLs against the page", () => {
  it("resolves a relative JSON-LD image", () => {
    const recipe = parseJsonLd(
      jsonLdPage({ ...baseRecipe, image: "images/cake.jpg" }),
      "https://example.com/recipes/cake"
    );
    expect(recipe?.photoUrl).toBe("https://example.com/recipes/images/cake.jpg");
  });

  it("resolves a root-relative microdata image", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Microdata Soup</h1>
        <img itemprop="image" src="/img/soup.jpg" />
        <ul>
          <li itemprop="recipeIngredient">1 cup water</li>
          <li itemprop="recipeIngredient">100 g pasta</li>
        </ul>
        <div itemprop="recipeInstructions"><ol><li itemprop="text">Boil and simmer.</li></ol></div>
      </div>`;
    const recipe = parseMicrodata(html, "https://example.com/soup");
    expect(recipe?.photoUrl).toBe("https://example.com/img/soup.jpg");
  });

  it("resolves a protocol-relative og:image", () => {
    const recipe = parseJsonLd(
      jsonLdPage(
        { ...baseRecipe, image: [] },
        '<meta property="og:image" content="//cdn.example.com/cake.jpg">'
      ),
      "https://example.com/cake"
    );
    expect(recipe?.photoUrl).toBe("https://cdn.example.com/cake.jpg");
  });

  it("resolves a root-relative og:image in the heuristic", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:image" content="/content/dam/coles/choc-chip-cookies.jpg">
      </head><body>
      <h1>Choc Chip Cookies</h1>
      <h2>Ingredients</h2>
      <ul><li>2 cups flour</li><li>1 cup sugar</li><li>200 g butter</li></ul>
      <h2>Method</h2>
      <ol><li>Mix everything and bake until golden brown.</li></ol>
      </body></html>`;
    const recipe = parseHeuristic(html, "https://www.coles.com.au/recipe/cookies");
    expect(recipe?.photoUrl).toBe(
      "https://www.coles.com.au/content/dam/coles/choc-chip-cookies.jpg"
    );
  });

  it("keeps an absolute URL unchanged and leaves an empty image null", () => {
    const absolute = parseJsonLd(
      jsonLdPage({ ...baseRecipe, image: "https://img.test/cake.jpg" }),
      "https://example.com/cake"
    );
    expect(absolute?.photoUrl).toBe("https://img.test/cake.jpg");

    const empty = parseJsonLd(
      jsonLdPage({ ...baseRecipe, image: "" }),
      "https://example.com/cake"
    );
    expect(empty?.photoUrl).toBeNull();

    const none = parseJsonLd(jsonLdPage({ ...baseRecipe, image: [] }), "https://example.com/cake");
    expect(none?.photoUrl).toBeNull();
  });
});
