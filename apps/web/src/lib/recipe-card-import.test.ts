import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanOcrText } from "./recipe-card-import";

describe("cleanOcrText", () => {
  it("keeps recipe caption lines and drops Instagram chrome", () => {
    const raw = `
16:38
makeretemiringa
28 Milo Weet-Bix Balls for LESS than $5!
Ingredients
12 Weet-Bix, crushed
1/2 cup desiccated coconut
What do you think of this?
49%
`.trim();
    const cleaned = cleanOcrText(raw);
    assert.match(cleaned, /28 Milo Weet-Bix Balls/);
    assert.match(cleaned, /12 Weet-Bix/);
    assert.doesNotMatch(cleaned, /What do you think/);
    assert.doesNotMatch(cleaned, /^16:38$/m);
    assert.doesNotMatch(cleaned, /49%/);
  });
});
