import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeImportUrl } from "./import-url";

describe("normalizeImportUrl", () => {
  it("adds https when the scheme is missing", () => {
    assert.equal(
      normalizeImportUrl("recipetineats.com/butter-chicken/"),
      "https://recipetineats.com/butter-chicken/"
    );
    assert.equal(
      normalizeImportUrl("  bbcgoodfood.com/recipes/x  "),
      "https://bbcgoodfood.com/recipes/x"
    );
  });

  it("keeps an explicit http or https address", () => {
    assert.equal(normalizeImportUrl("http://example.com/cake?v=1"), "http://example.com/cake?v=1");
    assert.equal(
      normalizeImportUrl("https://example.com/cake#top"),
      "https://example.com/cake#top"
    );
  });

  it("rejects text that cannot be a web address", () => {
    assert.equal(normalizeImportUrl(""), null);
    assert.equal(normalizeImportUrl("   "), null);
    assert.equal(normalizeImportUrl("not a url"), null);
    assert.equal(normalizeImportUrl("https://"), null);
    assert.equal(normalizeImportUrl("no-dot-host/path"), null);
    assert.equal(normalizeImportUrl("ftp://example.com/cake"), null);
  });
});
