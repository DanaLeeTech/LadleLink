import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatStepsForEditor,
  parseHeuristic,
  parseIngredientLine,
  parseJsonLd,
  parseMicrodata,
  parseRecipeHtml,
  parseRecipeText,
  parseStepsFromEditor,
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
      name: "fine sea salt, divided",
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
      unit: "to_taste",
      name: "Freshly ground black pepper",
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
