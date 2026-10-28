import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatStepsForEditor,
  looksLikeIngredientLine,
  parseHeuristic,
  parseIngredientLine,
  parseJsonLd,
  parseMicrodata,
  parseRecipeHtml,
  parseRecipeText,
  parseStepsFromEditor,
  stripStepNumber,
} from "./index.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("parseIngredientLine", () => {
  it("parses quantity unit name", () => {
    expect(parseIngredientLine("2 cups flour")).toEqual({
      quantity: 2,
      unit: "cup",
      name: "flour",
      conversionKey: "flour",
    });
  });

  it("parses mixed fractions", () => {
    const result = parseIngredientLine("1 1/2 cups milk");
    expect(result.quantity).toBeCloseTo(1.5);
    expect(result.unit).toBe("cup");
    expect(result.name).toBe("milk");
  });

  it("parses mixed teaspoon amounts with common recipe typography", () => {
    expect(parseIngredientLine("1 1/4 teaspoon")).toMatchObject({
      quantity: 1.25,
      unit: "tsp",
    });
    expect(parseIngredientLine("1 1/4 teaspoons salt")).toMatchObject({
      quantity: 1.25,
      unit: "tsp",
      name: "salt",
    });
    expect(parseIngredientLine("1-1/4 teaspoon salt")).toMatchObject({
      quantity: 1.25,
      unit: "tsp",
      name: "salt",
    });
    // Unicode fraction slash (U+2044) common in scraped recipes
    expect(parseIngredientLine("1 1\u20444 teaspoon vanilla")).toMatchObject({
      quantity: 1.25,
      unit: "tsp",
      name: "vanilla",
    });
  });

  it("recognizes ounce long and short forms", () => {
    expect(parseIngredientLine("8 oz cheese")).toMatchObject({
      quantity: 8,
      unit: "oz",
      name: "cheese",
    });
    expect(parseIngredientLine("8 ounces cheese")).toMatchObject({
      quantity: 8,
      unit: "oz",
      name: "cheese",
    });
    expect(parseIngredientLine("8 oz. cheese")).toMatchObject({
      quantity: 8,
      unit: "oz",
      name: "cheese",
    });
    expect(parseIngredientLine("8oz sugar")).toMatchObject({
      quantity: 8,
      unit: "oz",
      name: "sugar",
    });
  });

  it("recognizes fluid ounces", () => {
    expect(parseIngredientLine("2 fl oz vanilla")).toMatchObject({
      quantity: 2,
      unit: "fl_oz",
      name: "vanilla",
    });
    expect(parseIngredientLine("2 fluid ounces milk")).toMatchObject({
      quantity: 2,
      unit: "fl_oz",
      name: "milk",
    });
  });

  it("parses produce sizes and moves produce nouns into name", () => {
    expect(parseIngredientLine("1 large egg")).toMatchObject({
      quantity: 1,
      size: "large",
      unit: "",
      name: "egg",
    });
    expect(parseIngredientLine("2 medium tomatoes")).toMatchObject({
      quantity: 2,
      size: "medium",
      unit: "",
      name: "tomato",
    });
    expect(parseIngredientLine("1 small onion")).toMatchObject({
      quantity: 1,
      size: "small",
      unit: "",
      name: "onion",
    });
  });

  it("parses portion units with produce in the name field", () => {
    expect(parseIngredientLine("1 clove of garlic")).toMatchObject({
      quantity: 1,
      unit: "clove",
      name: "garlic",
      size: "medium",
    });
    expect(parseIngredientLine("6 garlic cloves, smashed and peeled")).toMatchObject({
      quantity: 6,
      unit: "clove",
      name: "garlic, smashed and peeled",
      conversionKey: "garlic",
      size: "medium",
    });
    expect(parseIngredientLine("2 stalks celery")).toMatchObject({
      quantity: 2,
      unit: "stalk",
      name: "celery",
      size: "medium",
    });
    expect(parseIngredientLine("1 pinch salt")).toMatchObject({
      quantity: 1,
      unit: "pinch",
      name: "salt",
    });
    expect(parseIngredientLine("1 pinch salt").size).toBeUndefined();
    expect(parseIngredientLine("Small pinch of sea salt")).toMatchObject({
      quantity: 1,
      unit: "pinch",
      size: "small",
      name: "sea salt",
    });
    expect(parseIngredientLine("a pinch of salt")).toMatchObject({
      quantity: 1,
      unit: "pinch",
      name: "salt",
    });
    expect(parseIngredientLine("pinch of salt")).toMatchObject({
      quantity: 1,
      unit: "pinch",
      name: "salt",
    });
    expect(parseIngredientLine("2 twists black pepper")).toMatchObject({
      quantity: 2,
      unit: "twist",
      name: "black pepper",
    });
    expect(parseIngredientLine("2 twists black pepper").size).toBeUndefined();
    expect(parseIngredientLine("1 egg")).toMatchObject({
      quantity: 1,
      unit: "",
      name: "egg",
      size: "medium",
    });
    expect(parseIngredientLine("3 tomatoes")).toMatchObject({
      quantity: 3,
      unit: "",
      name: "tomato",
      size: "medium",
    });
  });

  it("defaults produce size to medium unless an absolute measure is given", () => {
    expect(parseIngredientLine("2 yellow onions, chopped")).toMatchObject({
      size: "medium",
      conversionKey: "onion",
    });
    expect(parseIngredientLine("1 cup diced tomato").size).toBeUndefined();
    expect(parseIngredientLine("8 oz onion").size).toBeUndefined();
    expect(parseIngredientLine("1 can tomatoes").size).toBeUndefined();
    expect(parseIngredientLine("1 large egg")).toMatchObject({ size: "large" });
  });

  it("parses pints", () => {
    expect(parseIngredientLine("1 pint milk")).toMatchObject({
      quantity: 1,
      unit: "pint",
      name: "milk",
    });
  });

  it("suggests conversionKey for common variations", () => {
    expect(parseIngredientLine("1 cup unsalted butter")).toMatchObject({
      quantity: 1,
      unit: "cup",
      name: "unsalted butter",
      conversionKey: "butter",
    });
    // Exact catalog names still pre-fill Measure as for confirmation
    expect(parseIngredientLine("2 cups bread flour")).toMatchObject({
      name: "bread flour",
      conversionKey: "bread flour",
    });
    expect(parseIngredientLine("6 cups water")).toMatchObject({
      name: "water",
      conversionKey: "water",
    });
    expect(parseIngredientLine("2 medium yellow onions, coarsely chopped")).toMatchObject({
      size: "medium",
      name: expect.stringMatching(/onion/i),
      conversionKey: "onion",
    });
    expect(parseIngredientLine("1 tsp curry powder")).toMatchObject({
      name: "curry powder",
      conversionKey: "spice",
    });
    expect(parseIngredientLine("1 tbsp mushroom powder")).toMatchObject({
      name: "mushroom powder",
      conversionKey: "spice",
    });
    expect(parseIngredientLine("2 tbsp cocoa powder")).toMatchObject({
      name: "cocoa powder",
      conversionKey: "cocoa",
    });
    expect(parseIngredientLine("1 tsp baking soda")).toMatchObject({
      name: "baking soda",
      conversionKey: "baking soda",
    });
  });

  it("decodes HTML fraction entities from recipe JSON-LD lines", () => {
    expect(parseIngredientLine("1 &frac14; teaspoon fine sea salt, divided, to taste")).toMatchObject({
      quantity: 1.25,
      unit: "tsp",
      name: "fine sea salt",
      notes: "divided, to taste",
    });
    expect(parseIngredientLine("½ teaspoon red pepper flakes")).toMatchObject({
      quantity: 0.5,
      unit: "tsp",
      name: "red pepper flakes",
    });
  });

  it("parses bare to-taste lines with a blank quantity", () => {
    expect(parseIngredientLine("Freshly ground black pepper, to taste")).toMatchObject({
      quantity: 0,
      unit: "",
      name: "Freshly ground black pepper",
      notes: "to taste",
    });
  });

  it("parses garnish when it is not the leading unit", () => {
    expect(parseIngredientLine("cilantro for garnish")).toMatchObject({
      quantity: 0,
      unit: "garnish",
      name: "cilantro",
    });
    expect(parseIngredientLine("fresh dill, for garnishing")).toMatchObject({
      quantity: 0,
      unit: "garnish",
      name: "fresh dill",
    });
    expect(parseIngredientLine("garnish with chopped parsley")).toMatchObject({
      quantity: 0,
      unit: "garnish",
      name: "chopped parsley",
    });
    expect(parseIngredientLine("parsley as a garnish")).toMatchObject({
      quantity: 0,
      unit: "garnish",
      name: "parsley",
    });
    // Measured amount keeps its unit; garnish phrase is stripped from the name
    expect(parseIngredientLine("1 tbsp chopped parsley for garnish")).toMatchObject({
      quantity: 1,
      unit: "tbsp",
      name: "chopped parsley",
    });
  });

  it("parses quantity ranges with units", () => {
    expect(parseIngredientLine("4 to 8 ounces cream cheese")).toMatchObject({
      quantity: 4,
      quantityMax: 8,
      unit: "oz",
      name: "cream cheese",
    });
    expect(parseIngredientLine("4-8 oz. sugar")).toMatchObject({
      quantity: 4,
      quantityMax: 8,
      unit: "oz",
      name: "sugar",
    });
    expect(parseIngredientLine("4 – 8 fl oz milk")).toMatchObject({
      quantity: 4,
      quantityMax: 8,
      unit: "fl_oz",
      name: "milk",
    });
    expect(parseIngredientLine("2-3 cloves garlic")).toMatchObject({
      quantity: 2,
      quantityMax: 3,
      unit: "clove",
      name: "garlic",
    });
    expect(parseIngredientLine("1 to 2 large eggs")).toMatchObject({
      quantity: 1,
      quantityMax: 2,
      size: "large",
      unit: "",
      name: "egg",
    });
  });

  describe("prefers weight when dual measures", () => {
    it("keeps a single measure unchanged", () => {
      expect(parseIngredientLine("2 cups flour")).toMatchObject({
        quantity: 2,
        unit: "cup",
        name: "flour",
      });
    });

    it("prefers mass in parentheses either order", () => {
      expect(parseIngredientLine("4 cups (480 g) flour")).toMatchObject({
        quantity: 480,
        unit: "g",
        name: "flour",
      });
      expect(parseIngredientLine("2 cups (250g) sugar")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "sugar",
      });
      expect(parseIngredientLine("480 grams (4 cups) flour")).toMatchObject({
        quantity: 480,
        unit: "g",
        name: "flour",
      });
      expect(parseIngredientLine("250 g (2 cups) sugar")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "sugar",
      });
    });

    it("allows about/approx hedges in parenthetical conversions", () => {
      expect(parseIngredientLine("4 cups (about 480 grams) flour")).toMatchObject({
        quantity: 480,
        unit: "g",
        name: "flour",
      });
      expect(parseIngredientLine("480g (approx. 4 cups) flour")).toMatchObject({
        quantity: 480,
        unit: "g",
        name: "flour",
      });
    });

    it("prefers mass with slash or dash dual measures", () => {
      expect(parseIngredientLine("250g / 2 cups flour")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "flour",
      });
      expect(parseIngredientLine("2 cups / 250 g sugar")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "sugar",
      });
      expect(parseIngredientLine("2 cups – 250 g flour")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "flour",
      });
      expect(parseIngredientLine("250g - 2 cups flour")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "flour",
      });
    });

    it("prefers trailing weight or metric volume after the name", () => {
      expect(parseIngredientLine("2 cups flour - 250 grams")).toMatchObject({
        quantity: 250,
        unit: "g",
        name: "flour",
      });
      expect(parseIngredientLine("2 1/3 Cups Bread Flour (- 280 grams)")).toMatchObject({
        quantity: 280,
        unit: "g",
        name: "Bread Flour",
      });
      expect(
        parseIngredientLine("1/2 Cup Milk ((warm) - 118 milliliters)")
      ).toMatchObject({
        quantity: 118,
        unit: "ml",
        name: "Milk (warm)",
      });
    });

    it("keeps prep and substitution notes when stripping conversions", () => {
      expect(
        parseIngredientLine(
          "3 Tablespoons Unsalted Butter ((sliced & softened) - 43 grams)"
        )
      ).toMatchObject({
        quantity: 43,
        unit: "g",
        name: "Unsalted Butter (sliced & softened)",
      });
      expect(
        parseIngredientLine(
          "1/2 Cup Greek Yogurt (- 118 milliliters - You can also use sour cream)"
        )
      ).toMatchObject({
        quantity: 118,
        unit: "ml",
        name: "Greek Yogurt (You can also use sour cream)",
      });
    });

    it("prefers packed mass over volume", () => {
      expect(parseIngredientLine("8oz (1 cup) cream cheese")).toMatchObject({
        quantity: 8,
        unit: "oz",
        name: "cream cheese",
      });
      expect(parseIngredientLine("1 cup (8 oz) cream cheese")).toMatchObject({
        quantity: 8,
        unit: "oz",
        name: "cream cheese",
      });
    });

    it("keeps measured package amounts over can/package counts", () => {
      expect(parseIngredientLine("1 can (14 oz) tomatoes")).toMatchObject({
        quantity: 14,
        unit: "oz",
        name: "tomatoes",
      });
      expect(parseIngredientLine("1 package (8 oz) cream cheese")).toMatchObject({
        quantity: 8,
        unit: "oz",
        name: "cream cheese",
      });
    });
  });
});

describe("ingredient line fixes", () => {
  it("accepts gm and gms for grams", () => {
    for (const line of [
      "500 gm beef mince",
      "500 gms beef mince",
      "500 grams beef mince",
      "500 gram beef mince",
    ]) {
      expect(parseIngredientLine(line)).toMatchObject({
        quantity: 500,
        unit: "g",
        name: "beef mince",
      });
    }
  });

  it("keeps a package count and puts the pack size in the notes", () => {
    expect(parseIngredientLine("2 x 400g cans diced tomatoes")).toMatchObject({
      quantity: 2,
      unit: "can",
      name: "diced tomatoes",
      notes: "400 g each",
    });
    expect(parseIngredientLine("2 x 400g cans diced tomatoes").size).toBeUndefined();
    expect(parseIngredientLine("2 x 400 g tins chopped tomatoes")).toMatchObject({
      quantity: 2,
      unit: "tin",
      name: "chopped tomatoes",
      notes: "400 g each",
    });
  });

  it("keeps the ingredient name when each piece has a weight", () => {
    expect(parseIngredientLine("4 chicken breasts, 150 - 180g each")).toMatchObject({
      quantity: 4,
      unit: "",
      name: expect.stringMatching(/^chicken breasts?$/),
      notes: "150-180 g each",
    });
    expect(parseIngredientLine("4 chicken breasts (150–180g each)")).toMatchObject({
      quantity: 4,
      name: expect.stringMatching(/^chicken breasts?$/),
      notes: "150-180 g each",
    });
  });

  it("keeps a plus amount as a note", () => {
    expect(parseIngredientLine("2 cups plus 2 tbsp flour, sifted")).toMatchObject({
      quantity: 2,
      unit: "cup",
      name: "flour",
      notes: "sifted, plus 2 tbsp",
    });
    expect(parseIngredientLine("1 tbsp + 1 tsp sesame oil")).toMatchObject({
      quantity: 1,
      unit: "tbsp",
      name: "sesame oil",
      notes: "plus 1 tsp",
    });
  });

  it("combines imperial or metric weighings on one line", () => {
    expect(parseIngredientLine("1 lb 4 oz")).toMatchObject({ unit: "lb" });
    expect(parseIngredientLine("1 lb 4 oz").quantity).toBeCloseTo(1.25, 5);
    expect(parseIngredientLine("2 lb 4 oz pork shoulder")).toMatchObject({
      unit: "lb",
      name: "pork shoulder",
    });
    expect(parseIngredientLine("2 lb 4 oz pork shoulder").quantity).toBeCloseTo(2.25, 5);
    expect(parseIngredientLine("1 kg 200 g potatoes")).toMatchObject({
      quantity: 1.2,
      unit: "kg",
      name: "potatoes",
    });
  });

  it("keeps heaped and level as notes", () => {
    expect(parseIngredientLine("2 heaped tbsp flour")).toMatchObject({
      quantity: 2,
      unit: "tbsp",
      name: "flour",
      notes: "heaped",
    });
    expect(parseIngredientLine("2 heaped teaspoons sugar")).toMatchObject({
      quantity: 2,
      unit: "tsp",
      name: "sugar",
      notes: "heaped",
    });
    expect(parseIngredientLine("1 level tsp salt")).toMatchObject({
      quantity: 1,
      unit: "tsp",
      name: "salt",
      notes: "level",
    });
    expect(parseIngredientLine("1 heaped teaspoon salt")).toMatchObject({
      quantity: 1,
      unit: "tsp",
      name: "salt",
      notes: "heaped",
    });
  });

  it("handles NYT-style ranges without garbling the name", () => {
    expect(parseIngredientLine("2–3 tbsp olive oil")).toMatchObject({
      quantity: 2,
      quantityMax: 3,
      unit: "tbsp",
      name: "olive oil",
    });
    expect(parseIngredientLine("2 1/2 to 3 cups flour")).toMatchObject({
      quantity: 2.5,
      quantityMax: 3,
      unit: "cup",
      name: "flour",
    });
    expect(parseIngredientLine("2 ± 3 cups stock")).toMatchObject({
      quantity: 2,
      quantityMax: 3,
      unit: "cup",
      name: "stock",
    });
    expect(parseIngredientLine("2 pounds (900–1,350 g) beef chuck")).toMatchObject({
      quantity: 2,
      unit: "lb",
      name: "beef chuck",
    });
    expect(parseIngredientLine("3 cups (720-750 ml) water")).toMatchObject({
      quantity: 720,
      quantityMax: 750,
      unit: "ml",
      name: "water",
    });
  });

  it("singularizes produce for a quantity of one and keeps plurals countable", () => {
    expect(parseIngredientLine("2 onions")).toMatchObject({
      quantity: 2,
      unit: "",
      name: "onion",
      conversionKey: "onion",
    });
    expect(parseIngredientLine("1 tomatoes")).toMatchObject({
      quantity: 1,
      unit: "",
      name: "tomato",
    });
    expect(parseIngredientLine("1 tomato")).toMatchObject({
      quantity: 1,
      unit: "",
      name: "tomato",
    });
    // Counted produce keeps the catalog singular label for any quantity
    expect(parseIngredientLine("2 tomatoes")).toMatchObject({
      quantity: 2,
      unit: "",
      name: expect.stringMatching(/^tomato(es)?$/),
    });
    expect(parseIngredientLine("2 onions").name).not.toMatch(/onions$/);
  });

  it("trims leftover punctuation and brackets around the line", () => {
    for (const line of [", 2 cups flour ,", "- 2 cups flour -", "(2 cups flour)"]) {
      expect(parseIngredientLine(line)).toMatchObject({
        quantity: 2,
        unit: "cup",
        name: "flour",
      });
    }
  });

  it("keeps the original item text for a quantity of one", () => {
    expect(parseIngredientLine("1 x 400g tin tomatoes")).toMatchObject({
      quantity: 1,
      unit: "tin",
      name: "tomatoes",
      notes: "400 g each",
    });
    expect(parseIngredientLine("1 x 400g tin diced tomatoes").name).toBe("diced tomatoes");
    expect(parseIngredientLine("2 x 400g tins diced tomatoes").name).toBe("diced tomatoes");
    expect(parseIngredientLine("1 cup crushed tomatoes").name).toBe("crushed tomatoes");
  });

  it("keeps the plural name when a can is selected", () => {
    expect(parseIngredientLine("1 (400g) can chickpeas")).toMatchObject({
      quantity: 1,
      unit: "can",
      name: "chickpeas",
      notes: "400 g",
    });
  });

  it("moves a parenthetical heaped/level word after the unit into the notes", () => {
    expect(parseIngredientLine("2 tbsp (heaped) flour")).toMatchObject({
      quantity: 2,
      unit: "tbsp",
      name: "flour",
      notes: "heaped",
    });
    expect(parseIngredientLine("2 tbsp heaped flour")).toMatchObject({
      quantity: 2,
      unit: "tbsp",
      name: "flour",
      notes: "heaped",
    });
    expect(parseIngredientLine("1 cup (level) sugar").notes).toBe("level");
    // A useful conversion in brackets is still a conversion, not a note
    expect(parseIngredientLine("1 cup (250 ml) milk")).toMatchObject({
      unit: "ml",
      name: "milk",
    });
  });

  it("reads basic French measures", () => {
    expect(parseIngredientLine("2 cuillères à soupe beurre")).toMatchObject({
      quantity: 2,
      unit: "tbsp",
      name: "beurre",
    });
    expect(parseIngredientLine("1 cuillère à café sel")).toMatchObject({
      quantity: 1,
      unit: "tsp",
      name: "sel",
    });
    expect(parseIngredientLine("1 c. à soupe huile")).toMatchObject({
      quantity: 1,
      unit: "tbsp",
      name: "huile",
    });
    expect(parseIngredientLine("20 cl crème")).toMatchObject({
      quantity: 200,
      unit: "ml",
      name: "crème",
    });
    expect(parseIngredientLine("250 g farine")).toMatchObject({
      quantity: 250,
      unit: "g",
      name: "farine",
    });
  });

  it("reads thousands separators in weights", () => {
    expect(parseIngredientLine("1,350 g beef")).toMatchObject({
      quantity: 1350,
      unit: "g",
      name: "beef",
    });
  });
});

describe("step editor helpers", () => {
  it("decodes HTML entities in steps", () => {
    expect(
      formatStepsForEditor([
        "Reserve the broccoli florets—we&#8217;ll use them in a bit.",
        "Add &frac14; teaspoon of the salt.",
      ])
    ).toBe(
      "1. Reserve the broccoli florets—we’ll use them in a bit.\n\n2. Add ¼ teaspoon of the salt."
    );
  });

  it("numbers unnumbered steps and inserts blank lines", () => {
    expect(formatStepsForEditor(["Mix flour", "Add eggs", "Bake"])).toBe(
      "1. Mix flour\n\n2. Add eggs\n\n3. Bake"
    );
  });

  it("does not double-number already numbered steps", () => {
    expect(formatStepsForEditor(["1. Mix flour", "2) Add eggs"])).toBe(
      "1. Mix flour\n\n2) Add eggs"
    );
  });

  it("round-trips blank lines out of stored array", () => {
    const formatted = formatStepsForEditor(["Mix", "Bake"]);
    expect(parseStepsFromEditor(formatted)).toEqual(["Mix", "Bake"]);
  });
});

describe("parseRecipeText", () => {
  const bananaMuffins = `
- Prep time: 15 minutes
- Bake time: 18–22 minutes
- Temperature: 175°C (350°F)
Ingredients
- 3–4 ripe bananas, well mashed
- 1 cup spelt flour
- 1 cup oat flour
- ⅓ cup melted butter or coconut oil
- ½ cup honey or maple syrup (optional )
- 1 large egg
- 1 tsp baking soda
- 1 tsp vanilla extract
- 1 tsp ground cinnamon
- ½ tsp salt
- ½ to ¾ cup chocolate chips (plus a few extra to press on top)
Instructions
1. Preheat and Prep: Preheat your oven to 175°C (350°F) and line a 12-cup muffin tin with paper liners or grease it well.
2. Mix Wet Ingredients: In a large bowl, whisk together the mashed bananas, melted butter (or coconut oil), maple syrup (or honey), egg, and vanilla extract until smooth.
3. Add Dry Ingredients: Gently stir in the spelt flour, oat flour, baking soda, cinnamon, and salt just until combined (do not overmix).
4. Fold in Choc Chips: Gently fold in the chocolate chips.
5. Bake: Divide the batter evenly among the 12 muffin cups. Sprinkle a few extra chocolate chips on top of each muffin. Bake for 18–22 minutes, or until a toothpick inserted into the center comes out clean.
6. Cool: Let them cool in the tin for about 5 minutes before transferring them to a wire rack to cool completely.
`.trim();

  it("parses a pasted recipe with metadata, ingredients, and instructions", () => {
    const recipe = parseRecipeText(bananaMuffins);
    expect(recipe.title).toBe("Untitled recipe");
    expect(recipe.servings).toBe(1);
    expect(recipe.sourceUrl).toBe("");
    expect(recipe.notes).toContain("Prep time: 15 minutes");
    expect(recipe.notes).toContain("Bake time: 18–22 minutes");
    expect(recipe.notes).toContain("Temperature: 175°C (350°F)");
    expect(recipe.ingredients).toHaveLength(11);
    expect(recipe.steps).toHaveLength(6);
    expect(recipe.steps[0]).toMatch(/^Preheat and Prep:/);
    expect(recipe.steps[5]).toMatch(/^Cool:/);
  });

  it("parses ingredient quantities and units from pasted text", () => {
    const recipe = parseRecipeText(bananaMuffins);
    expect(recipe.ingredients[0]).toMatchObject({
      quantity: 3,
      quantityMax: 4,
      name: expect.stringMatching(/ripe bananas/i),
    });
    expect(recipe.ingredients[1]).toMatchObject({
      quantity: 1,
      unit: "cup",
      name: "spelt flour",
    });
    expect(recipe.ingredients[3]).toMatchObject({
      quantity: expect.closeTo(1 / 3, 5),
      unit: "cup",
      name: expect.stringMatching(/melted butter/i),
    });
    expect(recipe.ingredients[4]).toMatchObject({
      quantity: 0.5,
      unit: "cup",
      name: expect.stringMatching(/honey|maple/i),
    });
    expect(recipe.ingredients[10]).toMatchObject({
      quantity: 0.5,
      quantityMax: 0.75,
      unit: "cup",
      name: expect.stringMatching(/chocolate chips/i),
    });
  });

  it("uses an explicit title and servings when present", () => {
    const recipe = parseRecipeText(`
Banana Chocolate Chip Muffins
Serves: 12
Ingredients
- 1 cup flour
Instructions
1. Mix and bake.
`.trim());
    expect(recipe.title).toBe("Banana Chocolate Chip Muffins");
    expect(recipe.servings).toBe(12);
    expect(recipe.notes).toContain("Serves: 12");
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.steps).toEqual(["Mix and bake."]);
  });

  it("uses a Markdown heading as the title and reads Serves / Makes yields", () => {
    const markdown = parseRecipeText(
      [
        "## Chilli Prawns",
        "",
        "Serves 4",
        "",
        "### Ingredients",
        "- 500 g prawns",
        "- 2 tbsp olive oil",
        "",
        "### Method",
        "1. Heat the oil.",
        "2. Fry the prawns.",
      ].join("\n")
    );
    expect(markdown.title).toBe("Chilli Prawns");
    expect(markdown.servings).toBe(4);
    expect(markdown.ingredients).toHaveLength(2);
    expect(markdown.steps).toEqual(["Heat the oil.", "Fry the prawns."]);

    const closingHashes = parseRecipeText(
      [
        "# Brownies #",
        "",
        "## Ingredients",
        "- 200 g butter",
        "- 200 g dark chocolate",
        "- 3 eggs",
        "",
        "## Method",
        "1. Melt the butter.",
        "2. Stir in the eggs and bake.",
      ].join("\n")
    );
    expect(closingHashes.title).toBe("Brownies");

    const makes = parseRecipeText(
      ["# Rum Balls", "Makes 12", "Ingredients", "2 cups biscuit crumbs", "Mix well."].join(
        "\n"
      )
    );
    expect(makes.title).toBe("Rum Balls");
    expect(makes.servings).toBe(12);
  });

  it("takes the first heading over intro prose, and any casing of Serves", () => {
    const intro = parseRecipeText(
      [
        "# Sunday roast",
        "",
        "This is my nan's recipe, handed down every winter.",
        "",
        "SERVES 4",
        "",
        "Ingredients",
        "- 1 kg beef",
        "",
        "Method",
        "Roast the beef.",
      ].join("\n")
    );
    expect(intro.title).toBe("Sunday roast");
    expect(intro.servings).toBe(4);

    // A section heading is never the recipe title.
    const sectionFirst = parseRecipeText(
      "Sunday roast\n\n# Ingredients\n- 1 kg beef\n\n# Method\nRoast the beef."
    );
    expect(sectionFirst.title).toBe("Sunday roast");
  });

  it("falls back to the first non-empty line when there is no heading", () => {
    const plain = parseRecipeText(
      "Sunday roast\n\nServes 6\n\nIngredients\n- 1 kg beef\n\nMethod\nRoast the beef."
    );
    expect(plain.title).toBe("Sunday roast");
    expect(plain.servings).toBe(6);
  });

  // Fails today: a one-word line is dropped by the lone-username noise rule, so the
  // heading is not used as the title. Needed for common pastes like "# Brownies".
  it("keeps a one-word heading as the title", () => {
    const recipe = parseRecipeText(
      "# Brownies\n\nIngredients\n- 2 cups flour\n\nMethod\n1. Mix.\n2. Bake."
    );
    expect(recipe.title).toBe("Brownies");

    for (const heading of ["## Brownies", "#   Brownies"]) {
      const body = `${heading}\n\nIngredients\n- 2 cups flour\n\nMethod\n1. Mix.\n2. Bake.`;
      expect(parseRecipeText(body).title).toBe("Brownies");
    }
  });

  it("keeps quantity-less ingredient lines inside an Ingredients section", () => {
    const recipe = parseRecipeText(
      `
Sausage rolls

Ingredients
1 cup flour
salt, to taste
Salt and pepper, to taste
Parmesan cheese, shaved, to serve
For the filling:
For the sauce
salt and pepper

Method
1. Mix everything together.
2. Bake for 20 minutes.
`.trim()
    );
    expect(recipe.title).toBe("Sausage rolls");
    expect(recipe.ingredients).toHaveLength(5);
    expect(recipe.ingredients.map((i) => i.name)).toEqual([
      "flour",
      "salt",
      "Salt and pepper",
      "Parmesan cheese",
      "salt and pepper",
    ]);
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 1, unit: "cup" });
    expect(recipe.ingredients[1]).toMatchObject({ quantity: 0, unit: "", notes: "to taste" });
    expect(recipe.ingredients[2]).toMatchObject({
      quantity: 0,
      unit: "",
      notes: "to taste",
    });
    expect(recipe.ingredients[3]).toMatchObject({
      quantity: 0,
      unit: "",
      notes: "shaved, to serve",
    });
    expect(recipe.ingredients[4]).toMatchObject({ quantity: 0, unit: "" });
    expect(recipe.ingredients.some((i) => /For the filling|For the sauce/.test(i.name))).toBe(
      false
    );
    expect(recipe.steps).toEqual(["Mix everything together.", "Bake for 20 minutes."]);
  });

  it("still reads a bare to-taste line as a to_taste unit", () => {
    expect(parseIngredientLine("salt to taste")).toMatchObject({
      quantity: 0,
      unit: "to_taste",
      name: "salt",
    });
    expect(looksLikeIngredientLine("salt to taste")).toBe(true);
  });

  it("throws when no ingredients can be extracted", () => {
    expect(() => parseRecipeText("Just some notes\nNothing useful")).toThrow(
      /ingredients/i
    );
  });

  const miloWeetBixCaption = `
28 Milo Weet-Bix Balls for LESS than $5! 😍🙌
4 ingredients, NO baking and perfect for the kids lunchboxes!

Ingredients
12 Weet-Bix, crushed
1/2 cup desiccated coconut
1/4 cup Milo
1 tin condensed milk (395g)

Mix everything together, roll into balls, coat in extra coconut and pop in the fridge to set!

Makes 28 balls for approx. $4.99 - that's just 18c each!

#kidssnacks #lunchboxideasforkids #lunchboxidea
`.trim();

  it("parses an Instagram-style caption with freeform method and Makes yield", () => {
    const recipe = parseRecipeText(miloWeetBixCaption);
    expect(recipe.title).toMatch(/^28 Milo Weet-Bix Balls/i);
    expect(recipe.servings).toBe(28);
    expect(recipe.ingredients).toHaveLength(4);
    expect(recipe.ingredients[0].name).toMatch(/Weet-Bix/i);
    expect(recipe.ingredients[1]).toMatchObject({
      quantity: 0.5,
      unit: "cup",
      name: expect.stringMatching(/desiccated coconut/i),
    });
    expect(recipe.ingredients[2]).toMatchObject({
      quantity: 0.25,
      unit: "cup",
      name: expect.stringMatching(/Milo/i),
    });
    expect(recipe.ingredients[3].name).toMatch(/condensed milk/i);
    expect(recipe.steps).toHaveLength(1);
    expect(recipe.steps[0]).toMatch(/Mix everything together/i);
    expect(recipe.ingredients.map((i) => i.name).join(" ")).not.toMatch(
      /#kidssnacks|18c each|Mix everything/i
    );
  });

  it("accepts Ingredients: with a colon and Ingredients List", () => {
    const withColon = parseRecipeText(`
Easy Snack
Ingredients:
- 1 cup flour
- 2 eggs
Mix and bake.
`.trim());
    expect(withColon.ingredients).toHaveLength(2);
    expect(withColon.steps[0]).toMatch(/Mix and bake/i);

    const withList = parseRecipeText(`
Snack Balls
Ingredients List
1 cup oats
2 tbsp honey
Roll into balls.
`.trim());
    expect(withList.ingredients).toHaveLength(2);
    expect(withList.steps[0]).toMatch(/Roll into balls/i);
  });

  it("parses a headerless qty list plus prose method", () => {
    const recipe = parseRecipeText(`
No-Bake Bites
1 cup oats
1/2 cup peanut butter
2 tbsp honey
Mix well and chill.
`.trim());
    expect(recipe.title).toBe("No-Bake Bites");
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.steps).toEqual(["Mix well and chill."]);
  });

  it("ignores Instagram chrome, hashtags, and handles in a noisy OCR dump", () => {
    const noisy = `
makeretemiringa
28 Milo Weet-Bix Balls for LESS than $5!
4 ingredients, NO baking and perfect for the kids lunchboxes!
Ingredients
12 Weet-Bix, crushed
1/2 cup desiccated coconut
1/4 cup Milo
1 tin condensed milk (395g)
Mix everything together, roll into balls, coat in extra coconut and pop in the fridge to set!
Makes 28 balls for approx. $4.99 - that's just 18c each!
#kidssnacks #lunchboxideasforkids
22 hours ago
livy_ratuu
What do you think of this?
`.trim();
    const recipe = parseRecipeText(noisy);
    expect(recipe.title).toMatch(/Milo Weet-Bix Balls/i);
    expect(recipe.servings).toBe(28);
    expect(recipe.ingredients).toHaveLength(4);
    expect(recipe.steps.some((s) => /Mix everything together/i.test(s))).toBe(
      true
    );
    const blob = [
      recipe.title,
      ...recipe.ingredients.map((i) => i.name),
      ...recipe.steps,
      recipe.notes ?? "",
    ].join("\n");
    expect(blob).not.toMatch(/#kidssnacks|livy_ratuu|What do you think/i);
  });

  it("repairs OCR fraction and glued-unit mistakes from phone screenshots", () => {
    const ocrDump = `
16:38 cm
2 cup dessicajed:
PR—
28 Milo Weet-Bix Balls for LESS than $5! @ #4
4 ingredients, NO baking and perfect for the kids
lunchboxes!
Ingredients:
12 Weet-Bix, crushed
% cup desiccated coconut
4% cup Milo
1in condensed milk (395g)
Mix everything together, roll into balls, coat in extra
coconut and pop in the fridge to set!
Makes 28 balls for approx. $4.99 - that's just 18c each!
#kidssnacks #lunchboxideasforkids #lunchboxidea
arm livw rat #5 20h he
a [J 4
`.trim();
    const recipe = parseRecipeText(ocrDump);
    expect(recipe.title).toMatch(/Milo Weet-Bix Balls/i);
    expect(recipe.servings).toBe(28);
    expect(recipe.ingredients).toHaveLength(4);
    expect(recipe.ingredients[1]).toMatchObject({
      quantity: 0.5,
      unit: "cup",
      name: expect.stringMatching(/desiccated coconut/i),
    });
    expect(recipe.ingredients[2]).toMatchObject({
      quantity: 0.25,
      unit: "cup",
      name: expect.stringMatching(/Milo/i),
    });
    // Prefer mass when dual measures present ("1 tin … (395g)")
    expect(recipe.ingredients[3]).toMatchObject({
      quantity: 395,
      unit: "g",
      name: expect.stringMatching(/condensed milk/i),
    });
    expect(recipe.steps.join(" ")).toMatch(/Mix everything together.*fridge to set/i);
    expect(recipe.steps.join(" ")).not.toMatch(/\[J|livw rat/i);
  });
});

describe("import reliability", () => {
  const read = (name: string) => readFileSync(join(fixtures, name), "utf8");

  it("rejects a 404 page", () => {
    expect(() =>
      parseRecipeHtml(read("not-found.html"), "https://example.com/missing")
    ).toThrow(/Could not extract a recipe/);
  });

  it("rejects a Wikipedia-style article", () => {
    expect(() =>
      parseRecipeHtml(read("wikipedia-article.html"), "https://en.wikipedia.org/wiki/Pancake")
    ).toThrow(/Could not extract a recipe/);
  });

  it("ignores navigation and menu link lists when there is no schema", () => {
    expect(parseHeuristic(read("nav-list.html"), "https://example.com/recipes")).toBeNull();
    expect(() =>
      parseRecipeHtml(read("nav-list.html"), "https://example.com/recipes")
    ).toThrow(/Could not extract a recipe/);
  });

  it("keeps HowToSection headings and strips step prefixes", () => {
    const recipe = parseRecipeHtml(read("howto-section.html"), "https://example.com/cake");

    expect(recipe.steps).toEqual([
      "Cream the butter and sugar.",
      "Beat in the eggs and fold in the flour.",
      "Mix the lemon juice with icing sugar and drizzle over.",
    ]);
    expect(recipe.sections).toEqual([
      { kind: "steps", at: 0, title: "For the cake" },
      { kind: "steps", at: 2, title: "For the icing" },
    ]);
    expect(recipe.photoUrl).toBe("https://example.com/images/lemon-cake.jpg");
  });

  it("parses a Coles-style page: servings, ingredient sections, step prefixes", () => {
    const recipe = parseRecipeHtml(
      read("coles-style.html"),
      "https://www.coles.com.au/recipe/cookies"
    );

    expect(recipe.title).toBe("Chocolate Chip Cookies");
    expect(recipe.servings).toBe(12);
    expect(recipe.ingredients).toHaveLength(5);
    expect(recipe.sections).toEqual([
      { kind: "ingredients", at: 0, title: "For the dough" },
      { kind: "ingredients", at: 3, title: "For the icing" },
    ]);
    expect(recipe.steps).toEqual([
      "Preheat the oven to 180°C and line two trays.",
      "Mix the dough, roll into balls and bake for 12 minutes.",
    ]);
    // Root-relative og:image belongs to Coles, not to the app's own origin
    expect(recipe.photoUrl).toBe(
      "https://www.coles.com.au/content/dam/coles/choc-chip-cookies.jpg"
    );
  });

  it("treats a mid-list h2 as a section heading, not the end of the list", () => {
    const html = `
      <h1>Cake</h1>
      <h2>Ingredients</h2>
      <ul><li>200 g butter</li></ul>
      <h2>For the icing</h2>
      <ul><li>100 g icing sugar</li><li>1 tbsp milk</li></ul>
      <h2>Method</h2>
      <ol><li>Mix the batter and bake until golden.</li></ol>`;
    const recipe = parseRecipeHtml(html, "https://example.com/cake");
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.sections).toEqual([
      { kind: "ingredients", at: 1, title: "For the icing" },
    ]);
  });

  it("strips Step 1 style prefixes", () => {    expect(stripStepNumber("Step 1. Preheat the oven.")).toBe("Preheat the oven.");
    expect(stripStepNumber("step 2: Mix well")).toBe("Mix well");
    expect(stripStepNumber("3) Bake")).toBe("Bake");
  });

  it("strips Step N prefixes that have no punctuation", () => {
    expect(stripStepNumber("Step 2 Mix well")).toBe("Mix well");
    expect(stripStepNumber("STEP 3: Fold gently")).toBe("Fold gently");
    expect(stripStepNumber("4 - Bake for 20 minutes")).toBe("Bake for 20 minutes");
  });

  it("keeps decimal amounts at the start of a step", () => {
    expect(stripStepNumber("2.5 cups flour into the bowl.")).toBe(
      "2.5 cups flour into the bowl."
    );
    expect(stripStepNumber("1.5 kg beef, cubed")).toBe("1.5 kg beef, cubed");
    expect(stripStepNumber("2. Preheat the oven.")).toBe("Preheat the oven.");
  });

  it("groups microdata HowToSection steps under their headings", () => {
    const html = `
      <article itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Lemon Cake</h1>
        <ul>
          <li itemprop="recipeIngredient">200 g butter</li>
          <li itemprop="recipeIngredient">200 g sugar</li>
          <li itemprop="recipeIngredient">3 eggs</li>
        </ul>
        <div itemprop="recipeInstructions">
          <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToSection">
            <h3 itemprop="name">For the cake</h3>
            <div itemprop="itemListElement" itemscope itemtype="https://schema.org/HowToStep">
              <span itemprop="text">Cream the butter and sugar.</span>
            </div>
            <div itemprop="itemListElement" itemscope itemtype="https://schema.org/HowToStep">
              <span itemprop="text">Bake for 30 minutes.</span>
            </div>
          </div>
          <div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToSection">
            <h3 itemprop="name">For the icing</h3>
            <div itemprop="itemListElement" itemscope itemtype="https://schema.org/HowToStep">
              <span itemprop="text">Mix the icing sugar with lemon juice.</span>
            </div>
          </div>
        </div>
      </article>`;
    const recipe = parseRecipeHtml(html, "https://example.com/cake");
    expect(recipe.steps).toEqual([
      "Cream the butter and sugar.",
      "Bake for 30 minutes.",
      "Mix the icing sugar with lemon juice.",
    ]);
    expect(recipe.sections).toEqual([
      { kind: "steps", at: 0, title: "For the cake" },
      { kind: "steps", at: 2, title: "For the icing" },
    ]);
  });

  it("reads ingredient headings nested inside wrapper elements", () => {
    const html = `
      <h1>Cake</h1>
      <h2>Ingredients</h2>
      <div class="wrapper">
        <h3>For the icing</h3>
        <ul><li>100 g icing sugar</li><li>1 tbsp milk</li><li>1 tsp vanilla</li></ul>
      </div>
      <h2>Method</h2>
      <ol><li>Mix the batter and bake until golden.</li></ol>`;
    const recipe = parseRecipeHtml(html, "https://example.com/cake");
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.sections).toEqual([
      { kind: "ingredients", at: 0, title: "For the icing" },
    ]);
  });

  it("reads servings labels regardless of case", () => {
    for (const label of ["4 servings", "SERVES 4", "SERVINGS 4", "YIELD 4"]) {
      const html = `
        <h1>Cake</h1>
        <p>${label}</p>
        <h2>Ingredients</h2>
        <ul><li>200 g butter</li><li>200 g sugar</li><li>3 eggs</li></ul>
        <h2>Method</h2>
        <ol><li>Mix and bake for 30 minutes.</li></ol>`;
      const recipe = parseHeuristic(html, "https://example.com/cake");
      expect(recipe?.servings, label).toBe(4);
    }
  });

  it("rejects a news article that has no recipe", () => {
    const html = `
      <article>
        <h1>Council approves new bike lane</h1>
        <p>The council voted on Tuesday to approve a new bike lane along the river.</p>
        <h2>Related</h2>
        <ul>
          <li><a href="/a">Bike lane costs</a></li>
          <li><a href="/b">Traffic changes</a></li>
          <li><a href="/c">Vote results</a></li>
        </ul>
      </article>`;
    expect(() =>
      parseRecipeHtml(html, "https://news.example.com/a")
    ).toThrow(/Could not extract a recipe/);
  });

  it("ignores measured lists in nav, footer and aside", () => {
    const html = `
      <h1>Cake</h1>
      <main>
        <h2>Ingredients</h2>
        <ul><li>200 g butter</li><li>200 g sugar</li><li>3 eggs</li></ul>
        <h2>Method</h2>
        <ol><li>Mix and bake for 30 minutes.</li></ol>
      </main>
      <aside><h3>Popular</h3><ul><li>2 cups flour pancakes</li><li>1 kg pumpkin soup</li><li>200 g salad</li></ul></aside>
      <footer><ul><li>1 cup icing sugar</li><li>2 tbsp milk</li><li>3 eggs</li></ul></footer>`;
    const recipe = parseRecipeHtml(html, "https://example.com/cake");
    const names = recipe.ingredients.map((i) => i.name).join(" | ");
    expect(recipe.ingredients).toHaveLength(3);
    expect(names).not.toMatch(/icing sugar|milk|pancakes|soup|salad/);
  });

  it("skips a menu-style list of links and keeps the real ingredient list", () => {
    const html = `
      <h1>Cake</h1>
      <h2>Ingredients</h2>
      <ul>
        <li><a href="/shop/flour">featured 2 cups flour</a></li>
        <li><a href="/shop/sugar">featured 1 cup sugar</a></li>
        <li><a href="/shop/milk">featured 1 cup milk</a></li>
      </ul>
      <ul><li>200 g butter</li><li>3 eggs</li><li>1 tsp vanilla</li></ul>
      <h2>Method</h2>
      <ol><li>Mix and bake for 30 minutes.</li></ol>`;
    const recipe = parseRecipeHtml(html, "https://example.com/cake");
    const names = recipe.ingredients.map((i) => i.name).join(" | ");
    expect(recipe.ingredients).toHaveLength(3);
    expect(names).not.toMatch(/featured/);
  });

  it("requires steps as well as measured ingredients", () => {
    const html = `
      <h1>Pancake batter</h1>
      <h2>Ingredients</h2>
      <ul><li>2 cups flour</li><li>1 cup milk</li><li>2 eggs</li></ul>`;
    expect(parseHeuristic(html, "https://example.com/batter")).toBeNull();
    expect(() =>
      parseRecipeHtml(html, "https://example.com/batter")
    ).toThrow(/Could not extract a recipe/);
  });

  it("accepts a schema.org microdata Recipe page", () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Lemon Cake</h1>
        <span itemprop="recipeYield">8 servings</span>
        <img itemprop="image" src="https://example.com/cake.jpg" />
        <ul>
          <li itemprop="recipeIngredient">200 g butter</li>
          <li itemprop="recipeIngredient">200 g sugar</li>
        </ul>
        <div itemprop="recipeInstructions">
          <ol>
            <li itemprop="text">Cream the butter and sugar.</li>
            <li itemprop="text">Bake for 30 minutes.</li>
          </ol>
        </div>
      </div>`;
    const recipe = parseRecipeHtml(html, "https://example.com/cake");
    expect(recipe.title).toBe("Lemon Cake");
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.servings).toBe(8);
    expect(recipe.photoUrl).toBe("https://example.com/cake.jpg");
    expect(recipe.steps).toContain("Cream the butter and sugar.");
  });

  it("keeps step group headings from the heuristic", () => {
    const html = `
      <h1>Roast chicken</h1>
      <h2>Ingredients</h2>
      <ul><li>1 whole chicken</li><li>2 tbsp olive oil</li><li>1 tsp salt</li></ul>
      <h2>Method</h2>
      <ol><li>Heat the oven to 200°C and roast for an hour.</li></ol>
      <h3>For the gravy</h3>
      <ol><li>Stir the pan juices with flour and stock.</li></ol>`;
    const recipe = parseRecipeHtml(html, "https://example.com/chicken");
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.sections).toEqual([{ kind: "steps", at: 1, title: "For the gravy" }]);
  });

  it("reads <p>-per-line lists inside wrapper divs", () => {
    const html = `
      <h1>Oven baked risotto</h1>
      <h2>Ingredients</h2>
      <div class="recipe-card">
        <p>300 g arborio rice</p>
        <p>1 litre hot stock</p>
        <p>50 g parmesan</p>
      </div>
      <h2>Method</h2>
      <div class="recipe-steps">
        <p>Heat the stock in a saucepan until it simmers.</p>
        <p>Stir in the rice and cook for 18 minutes, adding stock as needed.</p>
      </div>
      <h2>Notes</h2>
      <p>Serve straight away with extra parmesan on top if you like it cheesy.</p>`;
    const recipe = parseRecipeHtml(html, "https://example.com/risotto");
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 300, unit: "g", name: "arborio rice" });
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0]).not.toMatch(/parmesan on top/);
  });

  it("rejects prose paragraphs under ingredient/method headings", () => {
    const html = `
      <h1>Our story</h1>
      <h2>Ingredients</h2>
      <div><p>We started in a small kitchen with a big idea.</p><p>Today we sell to shops across the country.</p></div>
      <h2>Method</h2>
      <div><p>Everything is made by hand, in small batches, with care.</p><p>We hope you enjoy it as much as we do.</p></div>`;
    expect(parseHeuristic(html, "https://example.com/about")).toBeNull();
  });
});

describe("parseRecipeHtml strategies", () => {
  it("parses JSON-LD recipes", () => {
    const html = readFileSync(join(fixtures, "jsonld-recipe.html"), "utf8");
    const recipe = parseJsonLd(html, "https://example.com/pancakes");
    expect(recipe?.title).toBe("Test Pancakes");
    expect(recipe?.servings).toBe(4);
    expect(recipe?.ingredients.length).toBe(4);
    expect(recipe?.steps.length).toBe(2);
    expect(recipe?.steps[1]).toContain("We’ll flip when bubbly—about ½ minute.");
    expect(recipe?.steps[1]).not.toMatch(/&#|frac/);
  });

  it("parses microdata recipes", () => {
    const html = readFileSync(join(fixtures, "microdata-recipe.html"), "utf8");
    const recipe = parseMicrodata(html, "https://example.com/soup");
    expect(recipe?.title).toBe("Microdata Soup");
    expect(recipe?.ingredients[0].name).toBe("water");
  });

  it("falls back to heuristic parsing", () => {
    const html = readFileSync(join(fixtures, "heuristic-recipe.html"), "utf8");
    const recipe = parseHeuristic(html, "https://example.com/cookies");
    expect(recipe?.title).toBe("Heuristic Cookies");
    expect(recipe?.ingredients.length).toBe(3);
    expect(recipe?.steps.length).toBe(2);
  });

  it("prefers JSON-LD in parseRecipeHtml", () => {
    const html = readFileSync(join(fixtures, "jsonld-recipe.html"), "utf8");
    const recipe = parseRecipeHtml(html, "https://example.com/pancakes");
    expect(recipe.title).toBe("Test Pancakes");
  });
});
