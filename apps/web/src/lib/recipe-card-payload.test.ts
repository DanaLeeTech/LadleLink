import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecipeCardPayload,
  decodePayloadFromQrData,
  encodePayloadForQr,
  extractPngRecipeMetadata,
  injectPngRecipeMetadata,
  isRecipeCardPayload,
  parseRecipeCardJson,
  payloadToParsedRecipe,
} from "./recipe-card-payload";

/** Minimal valid 1×1 PNG */
function tinyPng(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
    0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60,
    0x00, 0x03, 0x00, 0x00, 0x07, 0x00, 0x01, 0xb2, 0x86, 0xac, 0xf4, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

describe("recipe-card-payload", () => {
  const payload = buildRecipeCardPayload({
    title: "Banana muffins",
    servings: 12,
    ingredients: [
      { quantity: 2, unit: "cup", name: "flour", displayUnit: "cup" },
      { quantity: 3, unit: "piece", name: "bananas", size: "medium" },
    ],
    steps: ["Mix dry ingredients.", "Bake at 180°C."],
    notes: "Best the next day.",
    sourceUrl: "https://example.com/muffins",
  });

  it("builds a valid payload", () => {
    assert.equal(isRecipeCardPayload(payload), true);
    assert.equal(payload.kind, "ladlelink-recipe-card");
    assert.equal(payload.recipe.notes, "Best the next day.");
    assert.equal(payload.recipe.sourceUrl, "https://example.com/muffins");
  });

  it("round-trips through JSON", () => {
    const again = parseRecipeCardJson(JSON.stringify(payload));
    assert.ok(again);
    assert.deepEqual(again, payload);
  });

  it("converts to ParsedRecipe with notes and sourceUrl", () => {
    const parsed = payloadToParsedRecipe(payload);
    assert.equal(parsed.title, "Banana muffins");
    assert.equal(parsed.notes, "Best the next day.");
    assert.equal(parsed.sourceUrl, "https://example.com/muffins");
    assert.equal(parsed.ingredients.length, 2);
  });

  it("encodes and decodes QR data (plain or gzip)", async () => {
    const { data } = await encodePayloadForQr(payload);
    const decoded = await decodePayloadFromQrData(data);
    assert.ok(decoded);
    assert.equal(decoded.recipe.title, payload.recipe.title);
    assert.equal(decoded.recipe.notes, payload.recipe.notes);
    assert.equal(decoded.recipe.sourceUrl, payload.recipe.sourceUrl);
    assert.equal(decoded.recipe.ingredients.length, 2);
  });

  it("injects and extracts PNG tEXt metadata", () => {
    const withMeta = injectPngRecipeMetadata(tinyPng(), payload);
    const extracted = extractPngRecipeMetadata(withMeta);
    assert.ok(extracted);
    assert.deepEqual(extracted, payload);
  });

  it("stores non-Latin-1 recipe text in PNG metadata", () => {
    const unicode = buildRecipeCardPayload({
      title: "Café crème — 180°C",
      servings: 2,
      ingredients: [{ quantity: 1, unit: "cup", name: "crème fraîche" }],
      steps: ["Bake at 180°C until golden."],
      notes: "Best with a “pinch” of salt.",
      sourceUrl: "https://example.com/café",
    });
    const withMeta = injectPngRecipeMetadata(tinyPng(), unicode);
    const extracted = extractPngRecipeMetadata(withMeta);
    assert.ok(extracted);
    assert.deepEqual(extracted, unicode);
  });
});
