import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RecipeErrorBoundary } from "./RecipeErrorBoundary.tsx";

function failedBoundary(onDelete?: () => Promise<void>) {
  const boundary = new RecipeErrorBoundary({ children: null, onDelete });
  boundary.state = { failed: true, deleting: false, error: null };
  return boundary;
}

function renderFallback(boundary: RecipeErrorBoundary): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, boundary.render() as ReactElement)
  );
}

describe("RecipeErrorBoundary", () => {
  it("switches to the failed state when a child throws", () => {
    assert.deepEqual(RecipeErrorBoundary.getDerivedStateFromError(), { failed: true });
  });

  it("shows the message, a Delete button and a way back", () => {
    const html = renderFallback(failedBoundary());
    assert.match(html, /This recipe couldn(?:'|&#x27;|&apos;)t be loaded/);
    assert.match(html, /Delete recipe/);
    assert.match(html, /href="\/"/);
    assert.match(html, /Back to recipes/);
  });

  it("renders children untouched while nothing has failed", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(RecipeErrorBoundary, null, createElement("p", null, "fine"))
      )
    );
    assert.match(html, /fine/);
    assert.doesNotMatch(html, /couldn/);
  });

  it("runs onDelete exactly once and swallows a delete failure", async () => {
    let calls = 0;
    const ok = failedBoundary(async () => {
      calls += 1;
    });
    await (ok as unknown as { onDelete: () => Promise<void> }).onDelete();
    assert.equal(calls, 1);

    const broken = failedBoundary(async () => {
      throw new Error("Delete failed: offline");
    });
    await assert.doesNotReject(
      (broken as unknown as { onDelete: () => Promise<void> }).onDelete()
    );
  });
});
