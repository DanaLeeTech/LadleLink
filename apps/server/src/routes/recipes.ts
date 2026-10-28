import { Router } from "express";
import type { RecipeInput } from "@ladlelink/types";
import { parseRecipeHtml } from "@ladlelink/parser";
import { fetchHtmlSafely, scanWithClamAv, UnsafeUrlError } from "@ladlelink/url-guard";
import type { RecipeStore } from "../db/store.js";

/**
 * Optional malware scan of fetched pages. Enabled only when CLAMAV_HOST is set,
 * so the default self-hosted install is unchanged. The page bytes are streamed
 * to clamd in memory and never written to disk.
 */
const CLAMAV_HOST = process.env.CLAMAV_HOST;
const CLAMAV_PORT = process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3310;

async function scanFetchedPage(html: string): Promise<void> {
  if (!CLAMAV_HOST) return;
  const result = await scanWithClamAv(Buffer.from(html, "utf8"), {
    host: CLAMAV_HOST,
    port: CLAMAV_PORT,
  });
  if (!result.clean) {
    throw new Error(`Link blocked by security scan (${result.signature ?? result.raw})`);
  }
}

export function recipesRouter(store: RecipeStore): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    res.json(store.list(q, tag));
  });

  router.post("/import", async (req, res) => {
    const url = req.body?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: "A valid http(s) URL is required" });
      return;
    }
    try {
      const { html, finalUrl } = await fetchHtmlSafely(url);
      await scanFetchedPage(html);
      const parsed = parseRecipeHtml(html, finalUrl);
      res.json(parsed);
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : "Import failed";
      res.status(422).json({ error: message });
    }
  });

  router.get("/:id", (req, res) => {
    const recipe = store.get(req.params.id);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(recipe);
  });

  router.post("/", (req, res) => {
    const input = validateRecipeInput(req.body);
    if ("error" in input) {
      res.status(400).json({ error: input.error });
      return;
    }
    const recipe = store.create(input);
    res.status(201).json(recipe);
  });

  router.put("/:id", (req, res) => {
    const input = validateRecipeInput(req.body);
    if ("error" in input) {
      res.status(400).json({ error: input.error });
      return;
    }
    const recipe = store.update(req.params.id, input);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(recipe);
  });

  router.delete("/:id", (req, res) => {
    const ok = store.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}

function validateRecipeInput(body: unknown): RecipeInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return { error: "title is required" };
  if (typeof b.servings !== "number" || b.servings <= 0) return { error: "servings must be > 0" };
  if (!Array.isArray(b.ingredients)) return { error: "ingredients must be an array" };
  if (!Array.isArray(b.steps)) return { error: "steps must be an array" };

  return {
    title: b.title.trim(),
    servings: b.servings,
    ingredients: b.ingredients as RecipeInput["ingredients"],
    steps: b.steps.map(String),
    sections: Array.isArray(b.sections) ? (b.sections as RecipeInput["sections"]) : undefined,
    tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
    notes: typeof b.notes === "string" ? b.notes : b.notes === null ? null : undefined,
    photoPath:
      typeof b.photoPath === "string" ? b.photoPath : b.photoPath === null ? null : undefined,
    imageUrl:
      typeof b.imageUrl === "string" ? b.imageUrl : b.imageUrl === null ? null : undefined,
    sourceUrl:
      typeof b.sourceUrl === "string" ? b.sourceUrl : b.sourceUrl === null ? null : undefined,
  };
}
