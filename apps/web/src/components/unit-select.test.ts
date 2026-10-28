import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnitSelect } from "./UnitSelect.tsx";

function html(props: {
  value?: string;
  quantity?: number;
  allowedCountable?: string | null;
}): string {
  return renderToStaticMarkup(
    createElement(UnitSelect, {
      value: props.value ?? "cup",
      allowEmpty: false,
      onChange: () => {},
      quantity: props.quantity,
      allowedCountable: props.allowedCountable,
    })
  );
}

const option = (unit: string, label: string) =>
  new RegExp(`<option value="${unit}"(?: selected="")?>${label}</option>`);

describe("UnitSelect quantity labels", () => {
  it("pluralizes the unit labels when the reader passes an amount", () => {
    const twoCups = html({ quantity: 2 });
    assert.match(twoCups, option("cup", "cups"));
    assert.doesNotMatch(twoCups, option("cup", "cup"));

    const oneCup = html({ quantity: 1 });
    assert.match(oneCup, option("cup", "cup"));
    // A half measure takes the singular too
    assert.match(html({ quantity: 0.5 }), option("cup", "cup"));
  });

  it("pluralizes a countable label (6 eggs)", () => {
    const markup = html({ value: "egg", quantity: 6, allowedCountable: "egg" });
    assert.match(markup, option("egg", "eggs"));
    assert.match(html({ value: "egg", quantity: 1, allowedCountable: "egg" }), option("egg", "egg"));
  });

  it("leaves edit/import selects unchanged when no amount is passed", () => {
    assert.match(html({}), option("cup", "cup"));
  });
});
