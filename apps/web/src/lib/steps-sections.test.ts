import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeStepSections, splitStepsBySection } from "./steps-sections";

const steps = ["Melt the butter.", "Whisk the eggs.", "Beat the icing.", "Spread it."];

describe("splitStepsBySection", () => {
  it("keeps one untitled group when there are no step sections", () => {
    assert.deepEqual(splitStepsBySection(steps), [{ title: null, steps }]);
    // Ingredient sections are none of its business
    assert.deepEqual(
      splitStepsBySection(steps, [{ kind: "ingredients", at: 1, title: "For the cake" }]),
      [{ title: null, steps }]
    );
  });

  it("cuts the list at each step heading, in order", () => {
    assert.deepEqual(
      splitStepsBySection(steps, [
        { kind: "steps", at: 0, title: "For the cake" },
        { kind: "steps", at: 2, title: "For the icing" },
      ]),
      [
        { title: "For the cake", steps: ["Melt the butter.", "Whisk the eggs."] },
        { title: "For the icing", steps: ["Beat the icing.", "Spread it."] },
      ]
    );
  });

  it("keeps untitled steps before the first heading", () => {
    assert.deepEqual(splitStepsBySection(steps, [{ kind: "steps", at: 1, title: "Icing" }]), [
      { title: null, steps: ["Melt the butter."] },
      { title: "Icing", steps: ["Whisk the eggs.", "Beat the icing.", "Spread it."] },
    ]);
  });

  it("drops a heading past the end instead of losing steps", () => {
    const groups = splitStepsBySection(steps, [{ kind: "steps", at: 99, title: "Later" }]);
    assert.deepEqual(groups, [{ title: null, steps }]);
  });
});

describe("mergeStepSections", () => {
  it("rebuilds sections with the cumulative step count", () => {
    const merged = mergeStepSections([
      { title: "For the cake", steps: ["Melt the butter.", "Whisk the eggs."] },
      { title: "For the icing", steps: ["Beat the icing."] },
    ]);
    assert.deepEqual(merged.steps, ["Melt the butter.", "Whisk the eggs.", "Beat the icing."]);
    assert.deepEqual(merged.sections, [
      { kind: "steps", at: 0, title: "For the cake" },
      { kind: "steps", at: 2, title: "For the icing" },
    ]);
  });

  it("counts untitled leading steps in the offset", () => {
    const merged = mergeStepSections([
      { title: null, steps: ["Prep."] },
      { title: "Icing", steps: ["Beat the icing."] },
    ]);
    assert.deepEqual(merged.sections, [{ kind: "steps", at: 1, title: "Icing" }]);
  });

  it("round-trips split → merge without changing the headings", () => {
    const sections = [
      { kind: "steps" as const, at: 0, title: "For the cake" },
      { kind: "steps" as const, at: 2, title: "For the icing" },
    ];
    const merged = mergeStepSections(splitStepsBySection(steps, sections));
    assert.deepEqual(merged.steps, steps);
    assert.deepEqual(merged.sections, sections);
  });

  it("drops a heading that has no steps left", () => {
    const merged = mergeStepSections([
      { title: "Empty", steps: [] },
      { title: null, steps: ["Mix."] },
    ]);
    assert.deepEqual(merged.steps, ["Mix."]);
    assert.deepEqual(merged.sections, []);
  });
});
