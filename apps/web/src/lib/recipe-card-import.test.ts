import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanOcrText, stitchOcrTexts } from "./recipe-card-import";

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

describe("stitchOcrTexts", () => {
  it("joins texts with no shared lines", () => {
    const stitched = stitchOcrTexts(["Title\n1 cup flour", "1 tsp salt\nMix."]);
    assert.equal(stitched, "Title\n1 cup flour\n1 tsp salt\nMix.");
  });

  it("drops the one-line overlap between consecutive photos", () => {
    const stitched = stitchOcrTexts([
      "For the dough:\n1/2 cup water\n1 tsp honey",
      "1 tsp honey\n1 tsp yeast\nMix.",
    ]);
    assert.equal(stitched, "For the dough:\n1/2 cup water\n1 tsp honey\n1 tsp yeast\nMix.");
  });

  it("drops a multi-line overlap and ignores case, punctuation and spacing", () => {
    const stitched = stitchOcrTexts([
      "Ingredients\nOlives\nFresh basil leaves",
      "olives\nFRESH basil leaves\nBake 20 min.",
    ]);
    assert.equal(stitched, "Ingredients\nOlives\nFresh basil leaves\nBake 20 min.");
  });

  it("trims blank padding at the seam without keeping double blanks", () => {
    const stitched = stitchOcrTexts(["1 tsp salt\n\n\n", "\n\n1 tsp yeast\nMix."]);
    assert.equal(stitched, "1 tsp salt\n1 tsp yeast\nMix.");
  });
  it("keeps both texts whole when their boundary lines differ", () => {
    const stitched = stitchOcrTexts(["2 eggs", "1 cup milk"]);
    assert.equal(stitched, "2 eggs\n1 cup milk");
  });

  it("skips an OCR junk line at the top of the next image and trims the overlap", () => {
    const stitched = stitchOcrTexts([
      "In a small bowl, mix water and yeast.\nLet it sit for 10 minutes.\nCover the bowl.",
      "1313 j & o=1@\nLet it sit for 10 minutes.\nCover the bowl.\nBake.",
    ]);
    assert.equal(
      stitched,
      "In a small bowl, mix water and yeast.\nLet it sit for 10 minutes.\nCover the bowl.\nBake."
    );
  });

  it("completes a line cut off at the bottom of one image", () => {
    const stitched = stitchOcrTexts([
      "Cover the bowl.\nTip: You can place a bowl of hot water inside your",
      "Tip: You can place a bowl of hot water inside your switched-off oven.\nBake.",
    ]);
    assert.equal(
      stitched,
      "Cover the bowl.\nTip: You can place a bowl of hot water inside your switched-off oven.\nBake."
    );
  });

  it("matches the overlap when OCR junk sits on both sides of the seam", () => {
    const stitched = stitchOcrTexts([
      "Cover the bowl.\ndough rise until doubled.\nTip: You can place a bowl of hot water inside your\n| ® 4",
      "13113 0 & QO=u@\nLet it sit for 10 minutes.\nCover the bowl.\ndough rise until doubled.\n\nTip: You can place a bowl of hot water inside your\nswitched-off oven.\nBake.",
    ]);
    assert.equal(
      stitched,
      "Cover the bowl.\ndough rise until doubled.\nTip: You can place a bowl of hot water inside your\nswitched-off oven.\nBake."
    );
  });

  it("matches when one image has blank lines between lines and the next has none", () => {
    const stitched = stitchOcrTexts([
      "Let it sit for 10 minutes.\n\nIn a large bowl, combine flour.\n\nCover the bowl.\n\nTip: You can place a bowl of hot water inside your\n\n| ® 4",
      "In a large bowl, combine flour.\nCover the bowl.\nTip: You can place a bowl of hot water inside your\nswitched-off oven.\nBake.",
    ]);
    assert.equal(
      stitched,
      "Let it sit for 10 minutes.\nIn a large bowl, combine flour.\nCover the bowl.\nTip: You can place a bowl of hot water inside your\nswitched-off oven.\nBake."
    );
  });
});
