import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatTemperature,
  splitTemperatures,
  temperatureCycle,
  type TemperatureSegment,
  type TemperatureToken,
} from "./temperature";

function temperature(raw: string): TemperatureToken {
  const segment = splitTemperatures(raw).find(
    (item): item is Extract<TemperatureSegment, { type: "temperature" }> =>
      item.type === "temperature"
  );
  assert.ok(segment, `expected a temperature token in ${JSON.stringify(raw)}`);
  return segment.token;
}

function texts(raw: string): string[] {
  return splitTemperatures(raw)
    .filter((item) => item.type === "text")
    .map((item) => (item as Extract<TemperatureSegment, { type: "text" }>).text);
}

describe("splitTemperatures", () => {
  it("leaves text with no temperature alone", () => {
    assert.deepEqual(splitTemperatures("Mix the batter."), [
      { type: "text", text: "Mix the batter." },
    ]);
    // A plain number, gas mark and units that start with c/f/k are not temperatures.
    assert.deepEqual(splitTemperatures("Gas mark 6 for 20 minutes."), [
      { type: "text", text: "Gas mark 6 for 20 minutes." },
    ]);
    assert.deepEqual(splitTemperatures("Add 200g flour and 200cl stock."), [
      { type: "text", text: "Add 200g flour and 200cl stock." },
    ]);
    assert.deepEqual(splitTemperatures("Cook 200 for the table, 4cal of energy."), [
      { type: "text", text: "Cook 200 for the table, 4cal of energy." },
    ]);
  });

  it("finds glued and spaced temperatures in any case", () => {
    assert.deepEqual(splitTemperatures("Bake at 200c for 20 minutes."), [
      { type: "text", text: "Bake at " },
      { type: "temperature", token: temperature("200c") },
      { type: "text", text: " for 20 minutes." },
    ]);
    for (const raw of ["400F", "400 f", "400 °C", "400°c", "300K", "300 k"]) {
      assert.equal(temperature(`Heat to ${raw}.`).raw, raw, raw);
    }
  });

  it("keeps the authored casing and degree sign for the unit cycle", () => {
    const token = temperature("180 °C");
    assert.equal(token.unit, "c");
    assert.equal(token.upper, true);
    assert.equal(token.unitSpacing, " °");
    assert.equal(token.numbers[0], 180);
  });

  it("reads a range as one token and keeps its separator", () => {
    const separators: Record<string, string> = {
      "180-200c": "-",
      "180–200 °C": "–",
      "180 to 200C": " to ",
    };
    for (const raw of Object.keys(separators)) {
      const token = temperature(`Set the oven to ${raw}.`);
      assert.equal(token.raw, raw);
      assert.deepEqual(token.numbers, [180, 200]);
      assert.equal(token.rangeSeparator, separators[raw]);
    }
  });

  it("finds every temperature in a step and keeps the text between them", () => {
    const segments = splitTemperatures("Start at 200c, then finish at 220c.");
    assert.deepEqual(
      segments.map((item) => (item.type === "text" ? item.text : item.token.raw)),
      ["Start at ", "200c", ", then finish at ", "220c", "."]
    );
  });

  it("matches a temperature at the start or end of the text", () => {
    assert.deepEqual(
      splitTemperatures("200c").map((item) => (item.type === "text" ? item.text : item.token.raw)),
      ["200c"]
    );
    assert.deepEqual(texts("200c then rest"), [" then rest"]);
    assert.deepEqual(texts("rest 200c"), ["rest "]);
  });
});

describe("formatTemperature", () => {
  it("shows the authored text unchanged in its own unit", () => {
    const token = temperature("200 °C");
    assert.equal(formatTemperature(token, "c"), "200 °C");
  });

  it("converts C to F and K, mirroring the authored style", () => {
    assert.equal(formatTemperature(temperature("200c"), "f"), "392f");
    assert.equal(formatTemperature(temperature("200 °C"), "f"), "392 °F");
    assert.equal(formatTemperature(temperature("200C"), "k"), "473K");
    assert.equal(formatTemperature(temperature("200 °C"), "k"), "473 K");
  });

  it("converts F to C and K", () => {
    assert.equal(formatTemperature(temperature("350F"), "c"), "177C");
    assert.equal(formatTemperature(temperature("350f"), "k"), "450K");
  });

  it("converts K to C and F", () => {
    assert.equal(formatTemperature(temperature("300K"), "c"), "27C");
    assert.equal(formatTemperature(temperature("300k"), "f"), "80f");
  });

  it("converts both ends of a range and keeps the separator", () => {
    assert.equal(formatTemperature(temperature("180-200c"), "f"), "356-392f");
    assert.equal(formatTemperature(temperature("180 to 200C"), "f"), "356 to 392F");
    assert.equal(formatTemperature(temperature("180–200 °C"), "f"), "356–392 °F");
  });

  it("always converts from the authored number, so repeated taps never drift", () => {
    const token = temperature("350f");
    // Back and forth between C and back must give the authored 350 again, not 351.
    assert.equal(formatTemperature(token, "c"), "177c");
    assert.equal(formatTemperature(token, "f"), "350f");
  });
});

describe("temperatureCycle", () => {
  it("cycles C ⇄ F by default", () => {
    assert.deepEqual(temperatureCycle(temperature("200c"), false), ["c", "f"]);
    assert.deepEqual(temperatureCycle(temperature("400F"), false), ["f", "c"]);
  });

  it("adds K when the Kelvin setting is on", () => {
    assert.deepEqual(temperatureCycle(temperature("200c"), true), ["c", "f", "k"]);
    assert.deepEqual(temperatureCycle(temperature("400F"), true), ["f", "k", "c"]);
  });

  it("always cycles all three when the recipe wrote the temperature in K", () => {
    assert.deepEqual(temperatureCycle(temperature("300K"), false), ["k", "c", "f"]);
  });
});
