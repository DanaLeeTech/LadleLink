import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MeasureAsSelect } from "./IngredientNameInput.tsx";

/**
 * Server rendering covers the "first paint" half of the 150 ms debounce: the stored
 * conversionKey must already be selected and the Matches group must be filled from the
 * initial name. The timer itself needs a DOM, so it is not asserted here.
 */
function html(name: string, conversionKey?: string): string {
  return renderToString(
    createElement(MeasureAsSelect, { name, conversionKey, onChange: () => {} })
  );
}

function selectedValue(markup: string): string[] {
  return [...markup.matchAll(/<option[^>]*>/g)]
    .filter((m) => m[0]!.includes("selected"))
    .map((m) => /value="([^"]*)"/.exec(m[0]!)?.[1] ?? "?");
}

function matchValues(markup: string): string[] {
  const group = /<optgroup label="Matches">(.*?)<\/optgroup>/s.exec(markup)?.[1] ?? "";
  return [...group.matchAll(/value="([^"]*)"/g)].map((m) => m[1]!);
}

describe("Measure as… debounce (first paint)", () => {
  it("keeps a stored conversionKey selected instead of the typed match", () => {
    const markup = html("scallion", "butter");
    assert.deepEqual(selectedValue(markup), ["butter"]);
    assert.ok(matchValues(markup).includes("spring onion"));
  });

  it("fills Matches for the initial name so a pause is not needed to see them", () => {
    assert.deepEqual(matchValues(html("scallion")), ["spring onion", "onion"]);
    assert.deepEqual(selectedValue(html("scallion")), ["spring onion"]);
  });

  it("does not preselect while the name is still a fragment", () => {
    const markup = html("chick");
    assert.deepEqual(matchValues(markup), []);
    assert.deepEqual(selectedValue(markup), [""]);
  });

  it("survives empty and whitespace names", () => {
    for (const name of ["", "   "]) {
      const markup = html(name);
      assert.deepEqual(matchValues(markup), []);
      assert.deepEqual(selectedValue(markup), [""]);
    }
  });
});
