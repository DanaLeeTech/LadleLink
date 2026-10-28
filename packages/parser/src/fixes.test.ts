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
      name: "flour",
      notes: "sifted, plus 2 tbsp",
    });
  });
});

describe("bracket notes in the RecipeTin style", () => {
  it("moves '(, …)' text into the notes", () => {
    expect(parseIngredientLine("1-2 tbsp water (, as needed)")).toMatchObject({
      quantity: 1,
      quantityMax: 2,
      unit: "tbsp",
      name: "water",
      notes: "as needed",
    });
    expect(parseIngredientLine("2 tsp parsley (, finely chopped)")).toMatchObject({
      quantity: 2,
      unit: "tsp",
      name: "parsley",
      notes: "finely chopped",
    });
  });

  it("flattens nested brackets into one note without touching the spacing", () => {
    expect(
      parseIngredientLine(
        "700g / 1.4 lb chicken thigh fillets (, skinless boneless (4 - 6 pieces, Note 1))"
      )
    ).toMatchObject({
      quantity: 700,
      unit: "g",
      name: "chicken thigh fillets",
      notes: "skinless boneless, 4 - 6 pieces, Note 1",
    });
  });

  it("leaves parenthetical conversions for the dual-measure rules", () => {
    expect(parseIngredientLine("2 cups (281g) flour")).toMatchObject({
      quantity: 281,
      unit: "g",
      name: "flour",
    });
    expect(parseIngredientLine("1 can (14 oz) tomatoes")).toMatchObject({
      quantity: 14,
      unit: "oz",
      name: "tomatoes",
    });
  });
});

describe("pack size and bracket notes after the name", () => {
  it("moves a pack size that follows a bare count into the notes", () => {
    expect(parseIngredientLine("1 (400g) can chickpeas")).toMatchObject({
      quantity: 1,
      unit: "can",
      name: expect.stringMatching(/^chickpeas?$/),
      notes: "400 g",
    });
  });

  it("leaves a bracket after a unit to the dual-measure rule", () => {
    expect(parseIngredientLine("2 cups (281g) flour")).toMatchObject({
      quantity: 281,
      unit: "g",
      name: "flour",
    });
  });

  it("moves a comma-led prep note after the name", () => {
    expect(parseIngredientLine("2 eggs, (beaten)")).toMatchObject({
      quantity: 2,
      unit: "",
      name: expect.stringMatching(/^eggs?$/),
      notes: "beaten",
    });
  });

  it("moves a thickness and a per-piece note after the name", () => {
    const ing = parseIngredientLine(
      "2 boneless pork loin chops (0.5 inch thick) (100 g, per piece; 1 - 2 pieces)"
    );
    expect(ing).toMatchObject({
      quantity: 2,
      unit: "",
      name: "boneless pork loin chops",
    });
    expect(ing.notes).toContain("0.5 inch thick");
    expect(ing.notes).toContain("100 g, per piece; 1 - 2 pieces");
  });

  it("reads a dual-weight bracket on a bare count as one note", () => {
    const ing = parseIngredientLine(
      "2 boneless pork loin chops (½ inch thick) ((100 g, 3.5 oz per piece; ½ inch, 1–1.3 cm thick))"
    );
    expect(ing).toMatchObject({
      quantity: 2,
      unit: "",
      name: "boneless pork loin chops",
    });
    expect(ing.name).not.toContain("(");
    expect(ing.notes).toBe("0.5 inch thick, 100 g / 3.5 oz per piece, 1-1.3 cm thick");
  });

  it("reads French huile and sel as oil and table salt", () => {
    expect(parseIngredientLine("2 c. à soupe huile").conversionKey).toBe("oil");
    expect(parseIngredientLine("1 c. à café sel").conversionKey).toBe("table salt");
  });
});

describe("comma prep notes on a counted line", () => {
  it("moves a trailing prep phrase into the notes, not the name", () => {
    expect(parseIngredientLine("2 eggs, lightly whisked")).toMatchObject({
      quantity: 2,
      unit: "",
      notes: "lightly whisked",
    });
    expect(parseIngredientLine("2 eggs, lightly whisked").name).toBe(
      parseIngredientLine("2 eggs").name
    );
    expect(parseIngredientLine("2 onions, diced")).toMatchObject({
      quantity: 2,
      name: "onion",
      notes: "diced",
    });
    expect(parseIngredientLine("3 cloves garlic, minced")).toMatchObject({
      quantity: 3,
      unit: "clove",
      name: "garlic",
      notes: "minced",
    });
  });

  it("takes a size word out of a counted name instead of doubling it", () => {
    const ing = parseIngredientLine("2 overripe medium bananas, mashed");
    expect(ing).toMatchObject({
      quantity: 2,
      unit: "",
      name: "overripe bananas",
      size: "medium",
      notes: "mashed",
    });
    expect(ing.name).not.toContain("medium");
  });

  it("treats a comma note the same way on a measured line", () => {
    expect(parseIngredientLine("1 cup flour, sifted")).toMatchObject({
      quantity: 1,
      unit: "cup",
      name: "flour",
      notes: "sifted",
    });
    expect(parseIngredientLine("2 tomatoes, salt and pepper").name).toContain("salt and pepper");
  });
});

describe("comma notes on any ingredient line", () => {
  it("moves text after the name into the notes", () => {
    expect(parseIngredientLine("50 g butter, melted, cooled")).toMatchObject({
      quantity: 50,
      unit: "g",
      name: "butter",
      notes: "melted, cooled",
    });
    expect(parseIngredientLine("1 brown onion, finely chopped")).toMatchObject({
      quantity: 1,
      unit: "",
      name: "brown onion",
      notes: "finely chopped",
    });
    expect(parseIngredientLine("1 cup milk, warmed")).toMatchObject({
      quantity: 1,
      unit: "cup",
      name: "milk",
      notes: "warmed",
    });
    expect(parseIngredientLine("salt, to taste")).toMatchObject({
      quantity: 0,
      unit: "",
      name: "salt",
      notes: "to taste",
    });
  });

  it("keeps a seasoning name whole", () => {
    expect(parseIngredientLine("salt and pepper")).toMatchObject({
      quantity: 0,
      unit: "",
      name: "salt and pepper",
    });
    expect(parseIngredientLine("Salt and pepper, to taste")).toMatchObject({
      quantity: 0,
      unit: "",
      name: "Salt and pepper",
      notes: "to taste",
    });
  });

  it("recognises shaved, plus-extra and greasing tails as notes", () => {
    expect(parseIngredientLine("Parmesan cheese, shaved, to serve")).toMatchObject({
      quantity: 0,
      unit: "",
      name: "Parmesan cheese",
      notes: "shaved, to serve",
    });
    expect(parseIngredientLine("1 tbsp oil, plus extra for frying")).toMatchObject({
      quantity: 1,
      unit: "tbsp",
      name: "oil",
      notes: "plus extra for frying",
    });
    expect(parseIngredientLine("Melted low-fat dairy spread, to grease")).toMatchObject({
      quantity: 0,
      unit: "",
      name: "Melted low-fat dairy spread",
      notes: "to grease",
    });
  });

  it("merges a comma note with a bracket note without duplicating it", () => {
    expect(parseIngredientLine("2 tsp parsley, finely chopped (, finely chopped)")).toMatchObject({
      quantity: 2,
      unit: "tsp",
      name: "parsley",
      notes: "finely chopped",
    });
  });

  it("leaves a garnish tail for the garnish branch", () => {
    expect(parseIngredientLine("fresh dill, for garnishing")).toMatchObject({
      quantity: 0,
      unit: "garnish",
      name: "fresh dill",
    });
  });

  it("leaves no stray comma or bracket at the edges of a name or note", () => {
    for (const line of ["50 g butter, melted, cooled", "salt, to taste", "1 cup milk, warmed"]) {
      const ing = parseIngredientLine(line);
      expect(ing.name, line).not.toMatch(/^,|,$|\(\s*\)/);
      if (ing.notes) expect(ing.notes, line).not.toMatch(/^,|,$|\(\s*\)/);
    }
  });
});

describe("abbreviations inside brackets", () => {
  it("keeps 'w/o shell' in the note instead of the name", () => {
    const ing = parseIngredientLine("1 large egg (50 g each w/o shell)");
    expect(ing).toMatchObject({
      quantity: 1,
      unit: "",
      name: "egg",
      size: "large",
      notes: "50 g each w/o shell",
    });
    expect(ing.name).not.toContain("(");
    expect(ing.name).not.toMatch(/w\/o|w\s+o/);
  });

  it("still reads a bracket that closes at each, even with words after it", () => {
    expect(parseIngredientLine("4 chicken breasts (150-180g each) skinless")).toMatchObject({
      quantity: 4,
      unit: "",
      name: "chicken breast skinless",
      size: "medium",
      notes: "150-180 g each",
    });
  });
});

describe("clean names and notes", () => {
  const JUNK = /\(\s*\)|\(\s*,|\(\s|^\s*,|,\s*$|\[\s*\]/;

  it("never leaves empty brackets or stray commas", () => {
    const lines = [
      "2 cups (  ) flour",
      "4  chicken breasts (, 150 - 180g / 5 - 6 oz each (Note 1))",
      "1/2 tsp each salt and pepper",
      "2 cups minus 2 tbsp cake flour",
      "1-2 tbsp water (, as needed)",
      "2 tsp parsley (, finely chopped)",
      "700g / 1.4 lb chicken thigh fillets (, skinless boneless (4 - 6 pieces, Note 1))",
    ];
    for (const line of lines) {
      const ing = parseIngredientLine(line);
      expect(ing.name, line).not.toMatch(JUNK);
      expect(ing.name.startsWith("("), line).toBe(false);
      expect(ing.name.split("(").length, line).toBe(ing.name.split(")").length);
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
