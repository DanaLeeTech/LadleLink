import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemperatureText } from "./TemperatureText.tsx";

function html(text: string, includeKelvin = false): string {
  return renderToStaticMarkup(createElement(TemperatureText, { text, includeKelvin }));
}

describe("TemperatureText", () => {
  it("renders plain text without buttons when there is no temperature", () => {
    assert.equal(html("Mix the batter."), "Mix the batter.");
  });

  it("renders each temperature as a tappable button with its authored text", () => {
    const markup = html("Bake at 200c, then rest.");
    assert.match(markup, /<button[^>]*class="temp-toggle"[^>]*>200c<\/button>/);
    assert.match(markup, /aria-label="200c, Celsius\. Switch to Fahrenheit\."/);
    assert.match(markup, /Bake at <button/);
    assert.match(markup, /<\/button>, then rest\./);
  });

  it("names Kelvin as the next unit when the setting is on", () => {
    assert.match(html("400f", true), /Switch to Kelvin\./);
  });
});
