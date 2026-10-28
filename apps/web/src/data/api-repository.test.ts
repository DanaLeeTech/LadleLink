import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApiRepository } from "./api-repository";

const store = new Map<string, string>();
const g = globalThis as typeof globalThis & { localStorage?: Storage };

function stubLocalStorage() {
  if (!g.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  }
}

describe("api repository import", () => {
  it("aborts the in-flight import request when the signal aborts", async () => {
    stubLocalStorage();
    const realFetch = globalThis.fetch;
    let seen: AbortSignal | undefined;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        seen?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as typeof fetch;

    try {
      const repo = createApiRepository();
      const controller = new AbortController();
      const pending = repo.importFromUrl("https://example.com/cake", {
        signal: controller.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();
      await assert.rejects(pending);
      assert.equal(seen?.aborted, true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
