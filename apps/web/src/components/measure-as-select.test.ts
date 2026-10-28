import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { convertIngredient } from "@ladlelink/units";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { GROUPED, MeasureAsSelect } from "./IngredientNameInput.tsx";

/** Expected dropdown membership, group by group (A–Z, localeCompare). */
const EXPECTED: Record<string, string[]> = {
  Fruits:
    "apple, apricot, avocado, banana, berry, blackberries, blueberry, breadfruit, cantaloupe, cherry, clementine, coconut, cranberries, currants, date, dragon fruit, fig, grape, grapefruit, guava, honeydew, kiwi, kumquat, lemon, lime, lychee, mango, melon, nectarine, orange, orange juice, papaya, passion fruit, peach, pear, persimmon, pineapple, plum, pomegranate, prune, raisins, raspberry, rhubarb, starfruit, strawberry, tangerine, watermelon".split(
      ", "
    ),
  Vegetables:
    "alfalfa sprouts, artichoke, asparagus, bamboo shoots, bean sprouts, beet greens, beetroot, bitter melon, bok choy, broccoflower, broccoli, broccoli raab, brussels sprout, burdock, cabbage, cactus, capsicum, carrot, cassava, cauliflower, celeriac, celery, celery juice, chard, cherry tomato, chilli, christophine, collards, corn, cress, cucumber, dandelion greens, edamame, eggplant, escarole, fennel, green bean, green peas, greens, habanero, jalapeno, jicama, kale, kohlrabi, lambsquarter, leek, lettuce, lotus root, mushroom, mustard greens, okra, onion, palm hearts, parsnip, pimiento, plantain, poke greens, potato, pumpkin, radicchio, radish, romaine lettuce, rutabaga, salsify, serrano, shallot, snap pea, snow pea, spaghetti squash, spinach, spring onion, sprouts, squash, summer squash, sun dried tomatoes, sweet potato, sweet potato paste, taro, taro leaves, tomato, turnip, turnip greens, water chestnut, watercress, winter melon, winter squash, yam, yellow string beans, zucchini".split(
      ", "
    ),
  "Herbs & aromatics":
    "basil, bay leaf, chives, coriander, dill, garlic, ginger, mint, oregano, parsley, rosemary, sage, thyme".split(
      ", "
    ),
  Protein:
    "abalone, armadillo, bacon, bear, beaver, beef, beef sausage, bison, blood sausage, bologna, brains, bratwurst, calamari, caribou, caviar, chicken, chicken breast, chicken drumstick, chicken leg, chicken thigh, chitterlings, chorizo, clams, corned beef, cornish game hen, crab, crayfish, dove, duck, duck egg, egg, egg white, fat back, fish, gizzard, goat, goose, groundhog, ham, heart, hog maws, italian sausage, kidney, lamb, liver, liverwurst, lobster, meat, moose, mussels, natto, octopus, opossum, ostrich, oysters, pastrami, pepperoni, pheasant, polish sausage, pork, pork sausage, prawn, quail, rabbit, raccoon, ribs, salami, sausage, scallops, shellfish, soybean curd, spam, squirrel, steak, textured vegetable protein, thuringer, tripe, turkey, turkey bacon, turkey ham, turtle, veal, venison, venison sausage, vienna sausage, wild pig".split(
      ", "
    ),
  Dairy:
    "almond milk, butter, buttermilk, cheese, chocolate milk, coffee creamer, cottage cheese, cream, cream cheese, ghee, goat milk, kefir, margarine, milk, mozzarella cheese, non dairy milk, oat milk, parmesan, queso anejo, queso asadero, queso cotija, queso fresco, rice milk, sour cream, soy milk, soybean curd cheese, strawberry milk, whey, yogurt".split(
      ", "
    ),
  "Nuts & seeds":
    "almonds, brazil nuts, cashews, chestnuts, chia seeds, flax seeds, hazelnuts, macadamia nuts, mixed nuts, mixed seeds, nuts, peanuts, pecans, pine nuts, pistachio nuts, pumpkin seeds, sesame seeds, sunflower seeds, walnuts".split(
      ", "
    ),
  Pantry:
    "agave liquid sweetener, all-purpose flour, almond butter, almond oil, almond paste, applesauce, baking powder, baking soda, barley, bean paste, beans, black beans, blackeyed peas, blueberry syrup, bread, bread flour, breadcrumbs, brown sugar, buckwheat groats, bulgur, cake flour, canola oil, cashew butter, cereal, chickpeas, chocolate chips, chocolate hazelnut spread, chocolate syrup, cocoa, coconut milk, coconut oil, coffee, corn oil, corn syrup, cornstarch, cottonseed oil, couscous, crackers, cream of rice, cream of wheat, dal, dulce de leche, fava beans, flaxseed oil, flour, fruit butter, graham crackers, grits, guava paste, hominy, honey, honey butter, jam, jelly, kidney beans, lard, lentils, lima beans, long rice noodles, marmalade, masa harina, melba toast, millet, miso, molasses, mung beans, noodles, oat bran cereal, oatmeal, oats, oil, olive, olive oil, pasta, peanut butter, peanut oil, peruvian beans, pink beans, pinto beans, popcorn, powdered sugar, pretzels, quinoa, rice, rice noodles, safflower oil, seaweed, sesame oil, shortening, simple syrup, soy nut butter, soybean oil, soybeans, split peas, sugar, sunflower oil, syrup, tahini, tea, vanilla, vanilla extract, vegetable oil, vermicelli, vinegar, walnut oil, water, wheat bran, wheat cereal, wheat germ, wheat germ oil, white beans, whole wheat cereal, whole wheat flour, yeast, yeast extract spread".split(
      ", "
    ),
  "Sauces & condiments":
    "alfredo sauce, avocado dressing, barbecue sauce, black bean sauce, buffalo sauce, caesar dressing, cheese sauce, chutney, coleslaw dressing, cranberry sauce, creamy italian dressing, dessert sauce, duck sauce, enchilada sauce, fish sauce, fruit dressing, fry sauce, garlic sauce, gravy, hoisin sauce, hollandaise sauce, honey mustard dressing, horseradish, horseradish sauce, hot pepper sauce, hot thai sauce, italian dressing, ketchup, kimchi, lemon butter sauce, mayonnaise, miso sauce, mole sauce, mustard, oyster sauce, peanut sauce, pesto sauce, pickles, poppy seed dressing, ranch dressing, relish, russian dressing, salsa, sauerkraut, sausage gravy, seafood sauce, sesame dressing, soy sauce, spaghetti sauce, steak sauce, tartar sauce, teriyaki sauce, thousand island dressing, tomato chili sauce, vegan mayonnaise, wasabi paste, worcestershire sauce".split(
      ", "
    ),
  Seasonings:
    "black pepper, chili flakes, cumin, garlic powder, kosher salt, lemon juice, onion powder, paprika, red pepper flakes, salt, sea salt, spice, table salt".split(
      ", "
    ),
  Other: "adobo, mixed vegetable juice, table fat".split(", "),
};

/** Duplicate labels hidden from the dropdown (spec list). */
const HIDDEN = [
  "honeydew melon",
  "kiwi fruit",
  "beet",
  "beets",
  "brussels sprouts",
  "celery root",
  "chile",
  "chili",
  "courgette",
  "aubergine",
  "pepper",
  "peppers",
  "scallion",
  "green onion",
  "fennel bulb",
  "cob",
  "cilantro",
  "ginger root",
  "eggs",
  "pork bacon",
  "shrimp",
  "livers",
  "cocoa powder",
  "artichokes",
  "berries",
  "bluberries",
  "blueberries",
  "carrots",
  "cherries",
  "grapes",
  "green beans",
  "leeks",
  "mushrooms",
  "olives",
  "onions",
  "parsnips",
  "radishes",
  "raspberries",
  "strawberries",
  "tomatoes",
  "turrnip greens",
  "snowpeas",
  "water chesnut",
];

/** Regional-name pairs shown together in the option text. */
const COMBINED: Record<string, string> = {
  prawn: "prawn/shrimp",
  coriander: "coriander/cilantro",
  capsicum: "capsicum/bell pepper",
  "spring onion": "spring onion/scallion",
  eggplant: "eggplant/aubergine",
  zucchini: "zucchini/courgette",
  beetroot: "beetroot/beet",
  celeriac: "celeriac/celery root",
  chilli: "chilli/chili",
};

interface OptionInfo {
  group: string;
  value: string;
  text: string;
  selected: boolean;
}

function render(name: string, conversionKey?: string): string {
  return renderToString(
    createElement(MeasureAsSelect, { name, conversionKey, onChange: () => {} })
  );
}

function parseOptions(html: string): OptionInfo[] {
  const decoded = html.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
  const re =
    /<optgroup label="([^"]*)">|<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g;
  const options: OptionInfo[] = [];
  let group = "";
  for (const match of decoded.matchAll(re)) {
    if (match[1] !== undefined) {
      group = match[1];
      continue;
    }
    options.push({
      group,
      value: match[2]!,
      text: match[4]!,
      selected: match[3] !== undefined,
    });
  }
  return options;
}

describe("Measure as… dropdown", () => {
  it("groups every label exactly as expected, once each", () => {
    assert.deepEqual(
      GROUPED.map((g) => g.group),
      Object.keys(EXPECTED)
    );
    assert.deepEqual(Object.fromEntries(GROUPED.map((g) => [g.group, g.items])), EXPECTED);

    const labels = GROUPED.flatMap((g) => g.items);
    assert.equal(labels.length, 471);
    assert.equal(new Set(labels).size, labels.length, "a label appears in two groups");
    for (const hidden of HIDDEN) {
      assert.ok(!labels.includes(hidden), `hidden label still shown: ${hidden}`);
    }
  });

  it("renders combined names on the kept value, with no duplicates", () => {
    const options = parseOptions(render("zzz"));
    assert.deepEqual(
      [...new Set(options.map((o) => o.group))],
      ["", ...Object.keys(EXPECTED)]
    );

    for (const [group, items] of Object.entries(EXPECTED)) {
      assert.deepEqual(
        options.filter((o) => o.group === group).map((o) => o.value),
        items,
        group
      );
    }

    for (const option of options) {
      if (!option.value) {
        assert.equal(option.text, "—");
        continue;
      }
      assert.equal(option.text, COMBINED[option.value] ?? option.value, option.value);
    }

    const values = options.filter((o) => o.value).map((o) => o.value);
    assert.equal(new Set(values).size, values.length, "duplicate option values");
    for (const hidden of HIDDEN) {
      assert.ok(!values.includes(hidden), `hidden option rendered: ${hidden}`);
    }
  });

  it("shows the kept combined option for stored duplicate keys", () => {
    const pairs: Array<[string, string]> = [
      ["shrimp", "prawn"],
      ["pepper", "capsicum"],
      ["peppers", "capsicum"],
      ["eggs", "egg"],
      ["chili", "chilli"],
      ["cilantro", "coriander"],
      ["beets", "beetroot"],
      ["tomatoes", "tomato"],
      ["pork bacon", "bacon"],
      ["water chesnut", "water chestnut"],
    ];
    for (const [stored, kept] of pairs) {
      const selected = parseOptions(render("", stored)).filter((o) => o.selected);
      assert.equal(selected.length, 1, stored);
      assert.equal(selected[0]!.value, kept, stored);
      assert.equal(selected[0]!.text, COMBINED[kept] ?? kept, stored);
    }
  });

  it("surfaces the combined option in Matches for either regional name", () => {
    const pairs: Array<[string, string]> = [
      ["shrimp", "prawn"],
      ["prawn", "prawn"],
      ["cilantro", "coriander"],
      ["coriander", "coriander"],
      ["pepper", "capsicum"],
      ["chili", "chilli"],
      ["beet", "beetroot"],
      ["water chesnut", "water chestnut"],
    ];
    for (const [typed, kept] of pairs) {
      const matches = parseOptions(render(typed)).filter((o) => o.group === "Matches");
      const hit = matches.filter((o) => o.value === kept);
      assert.equal(hit.length, 1, typed);
      assert.equal(hit[0]!.text, COMBINED[kept] ?? kept, typed);

      const values = matches.map((o) => o.value);
      assert.equal(new Set(values).size, values.length, `duplicate Matches for ${typed}`);
      for (const hidden of HIDDEN) {
        assert.ok(!values.includes(hidden), `hidden Matches entry for ${typed}: ${hidden}`);
      }
    }
  });

  it("converts with the kept option value", () => {
    const prefs = DEFAULT_MEASUREMENT_PREFS;

    const prawn = parseOptions(render("", "shrimp")).find((o) => o.selected);
    assert.equal(prawn?.value, "prawn");
    const prawnMl = convertIngredient(
      { quantity: 100, unit: "g", name: "shrimp", conversionKey: prawn!.value },
      "ml",
      prefs
    );
    assert.equal(prawnMl.unit, "ml");
    assert.equal(prawnMl.needsDensity, undefined);

    const chestnut = parseOptions(render("", "water chesnut")).find((o) => o.selected);
    assert.equal(chestnut?.value, "water chestnut");
    const chestnutG = convertIngredient(
      { quantity: 1, unit: "", name: "water chestnut", conversionKey: chestnut!.value },
      "g",
      prefs
    );
    assert.equal(chestnutG.quantity, 10);
    assert.equal(chestnutG.needsWeight, undefined);
  });

  it("ranks an exact alias name first and pre-selects it", () => {
    const cases: Array<[string, string]> = [
      ["water chestnut", "water chestnut"],
      ["water chestnuts", "water chestnut"],
      ["scallion", "spring onion"],
      ["celery root", "celeriac"],
      ["bell pepper", "capsicum"],
      ["cilantro", "coriander"],
      ["shrimp", "prawn"],
      ["aubergine", "eggplant"],
      ["courgette", "zucchini"],
      ["beet", "beetroot"],
      ["chili", "chilli"],
    ];

    for (const [typed, kept] of cases) {
      const options = parseOptions(render(typed));
      const matches = options.filter((o) => o.group === "Matches");
      assert.ok(matches.length > 0, typed);
      assert.equal(matches[0]!.value, kept, typed);
      assert.equal(matches[0]!.text, COMBINED[kept] ?? kept, typed);

      const selected = options.filter((o) => o.selected);
      assert.equal(selected.length, 1, typed);
      assert.equal(selected[0]!.value, kept, typed);
    }

    const chestnut = parseOptions(render("water chestnut")).filter((o) => o.selected);
    assert.ok(chestnut.every((o) => o.value !== "water"), "water chestnut selects water");

    const water = parseOptions(render("water")).filter((o) => o.selected);
    assert.equal(water.length, 1);
    assert.equal(water[0]!.value, "water");
  });
});
