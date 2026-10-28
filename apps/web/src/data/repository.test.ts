import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNotFound } from "./repository";

describe("isNotFound", () => {
  it("matches what the demo store and the API throw for a missing recipe", () => {
    // Demo repository getRecipe throws this exact message.
    assert.equal(isNotFound(new Error("Recipe not found")), true);
    // API 404 body { error: "Recipe not found" }.
    assert.equal(isNotFound(new Error("Not Found")), true);
  });

  it("does not turn other failures into Recipe not found", () => {
    for (const err of [
      new Error("Failed to fetch"),
      new Error("Import failed"),
      new Error("Save failed"),
      "Recipe not found",
      null,
      undefined,
    ]) {
      assert.equal(isNotFound(err), false, String(err));
    }
  });
});
