/**
 * Import & parser break-it checks: a real RecipeTin-style page, a taste.com.au
 * "gm" page, and French / Markdown pastes. Fixtures are hand-written.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRecipeHtml, parseRecipeText } from "./index.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string) => readFileSync(join(fixtures, name), "utf8");

describe("page import: real recipe sites", () => {
  it("parses a RecipeTin-style @graph page without rejecting it", () => {
    const recipe = parseRecipeHtml(read("recipetin-style.html"), "https://www.recipetineats.com/beef-ragu/");

    expect(recipe.title).toBe("Beef Ragu");
    expect(recipe.servings).toBe(4);
    expect(recipe.photoUrl).toBe(
      "https://www.recipetineats.com/wp-content/uploads/beef-ragu.jpg"
    );
    expect(recipe.ingredients).toHaveLength(6);
    expect(recipe.ingredients[1]).toMatchObject({ quantity: 500, unit: "g" });
    expect(recipe.ingredients[1].name).toMatch(/beef chuck/);
    expect(recipe.ingredients[4]).toMatchObject({ quantity: 2, unit: "can", notes: "400 g each" });
    // JSON-LD steps carry <p> tags; they must be stripped, not passed through
    expect(recipe.steps).toHaveLength(4);
    expect(recipe.steps[0]).toBe("Heat the olive oil in a heavy pot over high heat.");
    expect(recipe.steps.join(" ")).not.toMatch(/<p>|<\/p>/);
  });

  it("normalises taste.com.au gm weights to grams", () => {
    const recipe = parseRecipeHtml(read("taste-style.html"), "https://www.taste.com.au/recipes/beef-ragu");

    expect(recipe.title).toBe("Slow cooked beef ragu");
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 500, unit: "g", name: "beef chuck, cubed" });
    expect(recipe.ingredients[3]).toMatchObject({ quantity: 400, unit: "g" });
    expect(recipe.ingredients[3].name).toMatch(/can diced tomatoes/);
  });
});

describe("pasted text", () => {
  it("reads a Markdown heading title and Serves line", () => {
    const recipe = parseRecipeText(
      [
        "# Sunday Roast",
        "Serves 4",
        "",
        "Ingredients",
        "- 1.5 kg beef",
        "- 2 tbsp oil",
        "",
        "Method",
        "1. Roast the beef.",
      ].join("\n")
    );

    expect(recipe.title).toBe("Sunday Roast");
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.steps).toEqual(["Roast the beef."]);
  });

  it("reads a French paste with cl / cuillères / bœuf intact", () => {
    const recipe = parseRecipeText(
      ["2 cuillères à soupe d'huile", "20 cl crème", "500 g bœuf", "150 ml lait"].join("\n")
    );

    expect(recipe.ingredients).toHaveLength(4);
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 2, unit: "tbsp", name: "huile" });
    expect(recipe.ingredients[1]).toMatchObject({ quantity: 200, unit: "ml", name: "crème" });
    expect(recipe.ingredients[2]).toMatchObject({ quantity: 500, unit: "g", name: "bœuf" });
    expect(recipe.ingredients[3]).toMatchObject({ quantity: 150, unit: "ml", name: "lait" });
  });
});
