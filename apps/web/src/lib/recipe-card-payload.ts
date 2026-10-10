import type { Ingredient, ParsedRecipe, RecipeCardPayload } from "@ladlelink/types";
import {
  RECIPE_CARD_PNG_KEYWORD,
  RECIPE_CARD_QR_PREFIX,
  RECIPE_CARD_QR_PREFIX_GZ,
} from "@ladlelink/types";
import extract from "png-chunks-extract";
import encode from "png-chunks-encode";
import text from "png-chunk-text";

/** Soft QR byte budget aiming for ECC Q; gzip/compact kick in above this. */
const QR_SOFT_MAX_BYTES = 1500;

export function buildRecipeCardPayload(input: {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  notes?: string | null;
  sourceUrl?: string | null;
}): RecipeCardPayload {
  const recipe: RecipeCardPayload["recipe"] = {
    title: input.title,
    servings: input.servings,
    ingredients: input.ingredients,
    steps: input.steps,
  };
  if (input.notes != null && input.notes !== "") recipe.notes = input.notes;
  if (input.sourceUrl != null && input.sourceUrl !== "") {
    recipe.sourceUrl = input.sourceUrl;
  }
  return {
    version: 1,
    kind: "ladlelink-recipe-card",
    recipe,
  };
}

export function payloadToParsedRecipe(payload: RecipeCardPayload): ParsedRecipe {
  const { recipe } = payload;
  return {
    title: recipe.title,
    servings: recipe.servings > 0 ? recipe.servings : 1,
    ingredients: recipe.ingredients.map(cloneIngredient),
    steps: [...recipe.steps],
    tags: [],
    notes: recipe.notes ?? null,
    sourceUrl: recipe.sourceUrl ?? "",
  };
}

function cloneIngredient(ing: Ingredient): Ingredient {
  const next: Ingredient = {
    quantity: ing.quantity,
    unit: ing.unit,
    name: ing.name,
  };
  if (ing.quantityMax != null) next.quantityMax = ing.quantityMax;
  if (ing.size) next.size = ing.size;
  if (ing.notes) next.notes = ing.notes;
  if (ing.conversionKey) next.conversionKey = ing.conversionKey;
  if (ing.kind) next.kind = ing.kind;
  if (ing.densityGPerMl != null) next.densityGPerMl = ing.densityGPerMl;
  if (ing.displayUnit) next.displayUnit = ing.displayUnit;
  return next;
}

export function isRecipeCardPayload(value: unknown): value is RecipeCardPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as RecipeCardPayload;
  return (
    v.version === 1 &&
    v.kind === "ladlelink-recipe-card" &&
    !!v.recipe &&
    typeof v.recipe.title === "string" &&
    typeof v.recipe.servings === "number" &&
    Array.isArray(v.recipe.ingredients) &&
    Array.isArray(v.recipe.steps)
  );
}

export function parseRecipeCardJson(raw: string): RecipeCardPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecipeCardPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function gzipBase64(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function gunzipBase64(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Compact payload for oversized QR: plain ingredient lines, keep notes/sourceUrl. */
function compactPayload(payload: RecipeCardPayload): RecipeCardPayload {
  return {
    version: 1,
    kind: "ladlelink-recipe-card",
    recipe: {
      title: payload.recipe.title,
      servings: payload.recipe.servings,
      ingredients: payload.recipe.ingredients.map((ing) => {
        const line: Ingredient = {
          quantity: ing.quantity,
          unit: ing.unit,
          name: ing.name,
        };
        if (ing.quantityMax != null) line.quantityMax = ing.quantityMax;
        if (ing.size) line.size = ing.size;
        return line;
      }),
      steps: payload.recipe.steps,
      notes: payload.recipe.notes ?? null,
      sourceUrl: payload.recipe.sourceUrl ?? null,
    },
  };
}

/**
 * Encode payload for a QR code. Prefers raw JSON; gzip when needed; compact fields as last resort.
 */
export async function encodePayloadForQr(
  payload: RecipeCardPayload
): Promise<{ data: string; truncated: boolean }> {
  const full = JSON.stringify(payload);
  if (utf8Bytes(RECIPE_CARD_QR_PREFIX + full).length <= QR_SOFT_MAX_BYTES) {
    return { data: RECIPE_CARD_QR_PREFIX + full, truncated: false };
  }

  try {
    const gz = await gzipBase64(full);
    const gzData = RECIPE_CARD_QR_PREFIX_GZ + gz;
    if (utf8Bytes(gzData).length <= QR_SOFT_MAX_BYTES) {
      return { data: gzData, truncated: false };
    }
  } catch {
    // CompressionStream unavailable — fall through
  }

  const compact = JSON.stringify(compactPayload(payload));
  if (utf8Bytes(RECIPE_CARD_QR_PREFIX + compact).length <= QR_SOFT_MAX_BYTES) {
    return { data: RECIPE_CARD_QR_PREFIX + compact, truncated: true };
  }

  try {
    const gz = await gzipBase64(compact);
    const gzData = RECIPE_CARD_QR_PREFIX_GZ + gz;
    if (utf8Bytes(gzData).length <= QR_SOFT_MAX_BYTES) {
      return { data: gzData, truncated: true };
    }
  } catch {
    // ignore
  }

  // Extreme fallback: drop steps from QR (PNG metadata still has full data).
  const minimal = compactPayload(payload);
  minimal.recipe.steps = minimal.recipe.steps.map((s, i) => `${i + 1}. ${s}`.slice(0, 80));
  const minimalJson = JSON.stringify(minimal);
  return { data: RECIPE_CARD_QR_PREFIX + minimalJson, truncated: true };
}

export async function decodePayloadFromQrData(
  data: string
): Promise<RecipeCardPayload | null> {
  if (data.startsWith(RECIPE_CARD_QR_PREFIX_GZ)) {
    try {
      const json = await gunzipBase64(data.slice(RECIPE_CARD_QR_PREFIX_GZ.length));
      return parseRecipeCardJson(json);
    } catch {
      return null;
    }
  }
  if (data.startsWith(RECIPE_CARD_QR_PREFIX)) {
    return parseRecipeCardJson(data.slice(RECIPE_CARD_QR_PREFIX.length));
  }
  // Bare JSON QR
  return parseRecipeCardJson(data);
}

/** PNG tEXt is Latin-1 only — store UTF-8 JSON as base64. */
const METADATA_B64_PREFIX = "b64:";

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeMetadataText(payload: RecipeCardPayload): string {
  return METADATA_B64_PREFIX + utf8ToBase64(JSON.stringify(payload));
}

function decodeMetadataText(raw: string): RecipeCardPayload | null {
  if (raw.startsWith(METADATA_B64_PREFIX)) {
    try {
      return parseRecipeCardJson(base64ToUtf8(raw.slice(METADATA_B64_PREFIX.length)));
    } catch {
      return null;
    }
  }
  // Legacy plain JSON (ASCII-only exports)
  return parseRecipeCardJson(raw);
}

export function injectPngRecipeMetadata(
  pngBytes: Uint8Array,
  payload: RecipeCardPayload
): Uint8Array {
  const chunks = extract(pngBytes);
  const filtered = chunks.filter((c) => {
    if (c.name !== "tEXt" && c.name !== "zTXt") return true;
    try {
      const decoded = text.decode(c.data);
      return decoded.keyword !== RECIPE_CARD_PNG_KEYWORD;
    } catch {
      return true;
    }
  });
  const textChunk = text.encode(RECIPE_CARD_PNG_KEYWORD, encodeMetadataText(payload));
  // Insert after IHDR
  const ihdrIdx = filtered.findIndex((c) => c.name === "IHDR");
  const insertAt = ihdrIdx >= 0 ? ihdrIdx + 1 : 1;
  filtered.splice(insertAt, 0, textChunk);
  return encode(filtered);
}

export function extractPngRecipeMetadata(
  pngBytes: Uint8Array
): RecipeCardPayload | null {
  try {
    const chunks = extract(pngBytes);
    for (const chunk of chunks) {
      if (chunk.name !== "tEXt" && chunk.name !== "zTXt") continue;
      try {
        const decoded = text.decode(chunk.data);
        if (decoded.keyword === RECIPE_CARD_PNG_KEYWORD) {
          return decodeMetadataText(decoded.text);
        }
      } catch {
        // continue
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function pngDataUrlWithMetadata(
  dataUrl: string,
  payload: RecipeCardPayload
): Promise<string> {
  const res = await fetch(dataUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const withMeta = injectPngRecipeMetadata(buf, payload);
  const blob = new Blob([Uint8Array.from(withMeta)], { type: "image/png" });
  return URL.createObjectURL(blob);
}
