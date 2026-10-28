/**
 * Regression checks for the 2026-10-28 parser round: "each" leading amounts,
 * noisy per-piece weights, "N and M/D", "minus", comma decimals, French articles,
 * aria-hidden servings, "Step 1Heat", JSON-LD images and title cleanup.
 */
import { describe, expect, it } from "vitest";
import {
  cleanRecipeTitle,
  parseHeuristic,
  parseIngredientLine,
  parseJsonLd,
  parseRecipeHtml,
  parseRecipeText,
  stripStepNumber,
} from "./index.js";

const recipeHtml = (jsonLd: object, extraHead = "") => `<!doctype html>
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

describe("each after the leading measure", () => {
  it("keeps the amount and turns each into a plain note", () => {
    expect(parseIngredientLine("1/2 tsp each salt and pepper")).toMatchObject({
      quantity: 0.5,
      unit: "tsp",
      name: "salt and pepper",
      notes: "each",
    });
  });

  it("still reads a per-piece weight that follows the name", () => {
    expect(parseIngredientLine("4 chicken breasts, 150 - 180g each")).toMatchObject({
      quantity: 4,
      unit: "",
      name: expect.stringMatching(/^chicken breasts?$/),
      notes: "150-180 g each",
    });
  });
});

describe("noisy per-piece weight with a note", () => {
  it("keeps the count, the metric each-weight and the note text", () => {
    expect(
      parseIngredientLine("4  chicken breasts (, 150 - 180g / 5 - 6 oz each (Note 1))")
    ).toMatchObject({
      quantity: 4,
      unit: "",
      name: expect.stringMatching(/^chicken breasts?$/),
      notes: "150-180 g each, Note 1",
    });
  });
});

describe("mixed numbers written with and", () => {
  it("prefers the bracketed mass as the dual-measure rule already does", () => {
    expect(parseIngredientLine("2 and 1/4 cups (281g) flour")).toMatchObject({
      quantity: 281,
      unit: "g",
      name: "flour",
    });
  });

  it("reads a metric-free and amount with its unit", () => {
    expect(parseIngredientLine("1 and 1/2 teaspoons cornstarch")).toMatchObject({
      quantity: 1.5,
      unit: "tsp",
      name: "cornstarch",
    });
  });
});

describe("minus amounts", () => {
  it("drops the minus note when a bracketed weight wins", () => {
    const ing = parseIngredientLine("2 cups minus 2 tablespoons cake flour (8 ½ ounces)");
    expect(ing).toMatchObject({ quantity: 8.5, unit: "oz", name: "cake flour" });
    expect(ing.notes).toBeUndefined();
  });

  it("keeps the minus note when the leading measure wins", () => {
    expect(parseIngredientLine("2 cups minus 2 tbsp cake flour")).toMatchObject({
      quantity: 2,
      unit: "cup",
      name: "cake flour",
      notes: "minus 2 tbsp",
    });
  });

  it("still treats plus like before", () => {
    expect(parseIngredientLine("2 cups plus 2 tbsp flour, sifted")).toMatchObject({
      quantity: 2,
      unit: "cup",
      name: "flour, sifted",
      notes: "plus 2 tbsp",
    });
  });
});

describe("clean names and notes", () => {
  const JUNK = /\(\s*\)|\(\s*,|^\s*,|,\s*$|\[\s*\]/;

  it("never leaves empty brackets or stray commas", () => {
    const lines = [
      "2 cups (  ) flour",
      "4  chicken breasts (, 150 - 180g / 5 - 6 oz each (Note 1))",
      "1/2 tsp each salt and pepper",
      "2 cups minus 2 tbsp cake flour",
    ];
    for (const line of lines) {
      const ing = parseIngredientLine(line);
      expect(ing.name, line).not.toMatch(JUNK);
      expect(ing.name.startsWith("("), line).toBe(false);
      if (ing.notes) expect(ing.notes, line).not.toMatch(JUNK);
    }
  });
});

describe("decimal comma and hedges", () => {
  it("reads a European decimal comma after the thousands rule", () => {
    expect(parseIngredientLine("0,5 l milk")).toMatchObject({
      quantity: 0.5,
      unit: "l",
      name: "milk",
    });
    expect(parseIngredientLine("1,350 g flour")).toMatchObject({
      quantity: 1350,
      unit: "g",
      name: "flour",
    });
  });

  it("keeps a leading hedge as a note", () => {
    expect(parseIngredientLine("about 2 cups stock")).toMatchObject({
      quantity: 2,
      unit: "cup",
      name: "stock",
      notes: "about",
    });
  });
});

describe("French ingredient lines", () => {
  it("drops the leading article and keeps the written name", () => {
    expect(parseIngredientLine("150g de farine")).toMatchObject({
      quantity: 150,
      unit: "g",
      name: "farine",
    });
    // Never touch an English word that merely starts with those letters
    expect(parseIngredientLine("2 cups devilled ham").name).toBe("devilled ham");
  });

  it("infers the conversion key from the French word", () => {
    const french = parseIngredientLine("150g de farine");
    const english = parseIngredientLine("150 g flour");
    expect(french.conversionKey).toBe(english.conversionKey);
    expect(french.conversionKey).toBe("flour");
  });

  it("infers the key for œufs, ligature included", () => {
    const english = parseIngredientLine("3 eggs").conversionKey;
    expect(parseIngredientLine("3 œufs").conversionKey).toBe(english);
    expect(parseIngredientLine("des œufs").conversionKey).toBe(english);
    // The displayed name is still the French as written
    expect(parseIngredientLine("3 œufs").name).toBe("œufs");
  });

  it("reads Pour N personnes as servings without eating pour-the-batter steps", () => {
    const recipe = parseRecipeText(
      [
        "Tarte aux pommes",
        "Pour 4 personnes",
        "",
        "Ingredients",
        "- 150g de farine",
        "- 3 pommes",
        "",
        "Method",
        "1. Pour the batter into the tin.",
        "2. Bake for 30 minutes.",
      ].join("\n")
    );
    expect(recipe.servings).toBe(4);
    expect(recipe.steps).toContain("Pour the batter into the tin.");
  });
});

describe("heuristic servings with aria-hidden duplicates", () => {
  it("does not read Coles' screen-reader copy as 44", () => {
    const html = `<!doctype html><html><body>
<h1>Choc Chip Cookies</h1>
<div class="recipe-serves"><span>Serves</span><span aria-hidden="true">4</span><span>4</span></div>
<h2>Ingredients</h2>
<ul>
  <li>2 cups flour</li>
  <li>1 cup sugar</li>
  <li>200 g butter</li>
</ul>
<h2>Method</h2>
<ol><li>Mix everything and bake until golden brown.</li></ol>
</body></html>`;
    const recipe = parseHeuristic(html, "https://www.coles.com.au/recipe/cookies");
    expect(recipe?.servings).toBe(4);
  });
});

describe("numbered step prefixes", () => {
  it("strips Step N with or without a space", () => {
    expect(stripStepNumber("Step 1Heat the oven")).toBe("Heat the oven");
    expect(stripStepNumber("Step 2 Mix the batter")).toBe("Mix the batter");
    expect(stripStepNumber("1. Heat the oven")).toBe("Heat the oven");
  });

  it("flows through parseRecipeHtml", () => {
    const recipe = parseRecipeHtml(
      recipeHtml({
        ...baseRecipe,
        recipeInstructions: ["Step 1Heat the oven to 180C.", "Step 2 Mix the batter."],
      }),
      "https://example.com/cake"
    );
    expect(recipe.steps).toEqual(["Heat the oven to 180C.", "Mix the batter."]);
  });
});

describe("JSON-LD images", () => {
  it("reads an array of ImageObject urls (BBC style)", () => {
    const recipe = parseJsonLd(
      recipeHtml({ ...baseRecipe, image: [{ "@type": "ImageObject", url: "https://img.test/bbc.jpg" }] }),
      "https://example.com/cake"
    );
    expect(recipe?.photoUrl).toBe("https://img.test/bbc.jpg");
  });

  it("reads contentUrl inside nested arrays (NYT style)", () => {
    const recipe = parseJsonLd(
      recipeHtml({
        ...baseRecipe,
        image: [[{ "@type": "ImageObject", contentUrl: "https://img.test/nyt.jpg" }]],
      }),
      "https://example.com/cake"
    );
    expect(recipe?.photoUrl).toBe("https://img.test/nyt.jpg");
  });

  it("falls back to og:image when the JSON-LD has no usable image", () => {
    const recipe = parseJsonLd(
      recipeHtml(
        { ...baseRecipe, image: [] },
        '<meta property="og:image" content="https://img.test/og.jpg">'
      ),
      "https://example.com/cake"
    );
    expect(recipe?.photoUrl).toBe("https://img.test/og.jpg");
  });
});

describe("title cleanup", () => {
  it("drops only the last site-name segment", () => {
    expect(cleanRecipeTitle("Pancakes | Woolworths")).toBe("Pancakes");
    expect(cleanRecipeTitle("A | B | Site")).toBe("A | B");
    expect(cleanRecipeTitle("Pancakes")).toBe("Pancakes");
  });

  it("applies to both scraped HTML and pasted text", () => {
    const html = parseRecipeHtml(
      recipeHtml({ ...baseRecipe, name: "Pancakes | Woolworths" }),
      "https://example.com/pancakes"
    );
    expect(html.title).toBe("Pancakes");

    const pasted = parseRecipeText(
      ["Pancakes | Woolworths", "", "Ingredients", "- 2 cups flour", "- 1 cup milk", "", "Method", "1. Cook."].join(
        "\n"
      )
    );
    expect(pasted.title).toBe("Pancakes");
  });

  it("strips Markdown emphasis from a pasted title", () => {
    const titles: Array<[string, string]> = [
      ["**Scones**", "Scones"],
      ["*Scones*", "Scones"],
      ["__Scones__", "Scones"],
      ["_Scones_", "Scones"],
    ];
    for (const [raw, expected] of titles) {
      const recipe = parseRecipeText(
        [raw, "", "Ingredients", "- 2 cups flour", "- 1 cup milk", "", "Method", "1. Bake."].join("\n")
      );
      expect(recipe.title, raw).toBe(expected);
    }
  });
});
