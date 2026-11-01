import { parseRecipeText, scoreParsedRecipe } from "@ladlelink/parser";
import type { ParsedRecipe } from "@ladlelink/types";
import {
  decodePayloadFromQrData,
  extractPngRecipeMetadata,
  payloadToParsedRecipe,
} from "./recipe-card-payload";

export type ImageImportSource = "metadata" | "qr" | "ocr";

export interface ImageImportResult {
  recipe: ParsedRecipe;
  source: ImageImportSource;
}

async function fileToImageData(file: File): Promise<{
  imageData: ImageData;
  pngBytes: Uint8Array | null;
  width: number;
  height: number;
}> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isPng =
    buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

  const blob = new Blob([Uint8Array.from(buf)], {
    type: file.type || (isPng ? "image/png" : "image/*"),
  });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not read image");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      imageData,
      pngBytes: isPng ? buf : null,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

function cropImageData(source: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.min(Math.floor(w), source.width - sx);
  const sh = Math.min(Math.floor(h), source.height - sy);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not crop image");
  ctx.putImageData(source, 0, 0);
  return ctx.getImageData(sx, sy, sw, sh);
}

/** Upscale a region so small QRs in screenshots have more modules for jsQR. */
function scaleImageData(source: ImageData, scale: number): ImageData {
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.putImageData(source, 0, 0);

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return source;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(canvas, 0, 0, out.width, out.height);
  return octx.getImageData(0, 0, out.width, out.height);
}

type JsQR = typeof import("jsqr").default;

function scanOnce(jsQR: JsQR, imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return code?.data ?? null;
}

/**
 * jsQR often misses a small dense QR in a large screenshot. Try the full frame,
 * then card-right crops (where we place the code), at multiple scales.
 */
async function tryDecodeQr(imageData: ImageData): Promise<ParsedRecipe | null> {
  const { default: jsQR } = await import("jsqr");
  const w = imageData.width;
  const h = imageData.height;

  const regions: ImageData[] = [imageData];

  // Right half / right third — QR sits on the right of the card
  regions.push(cropImageData(imageData, w * 0.45, 0, w * 0.55, h));
  regions.push(cropImageData(imageData, w * 0.55, 0, w * 0.45, h));
  // Upper-middle right (ingredients band)
  regions.push(cropImageData(imageData, w * 0.4, h * 0.1, w * 0.55, h * 0.55));
  regions.push(cropImageData(imageData, w * 0.5, h * 0.15, w * 0.45, h * 0.45));
  // Centered card-ish crop then right side of that
  regions.push(cropImageData(imageData, w * 0.1, h * 0.15, w * 0.8, h * 0.7));

  const scales = [1, 2, 3, 0.75];

  for (const region of regions) {
    for (const scale of scales) {
      const scaled = scaleImageData(region, scale);
      // Skip absurdly large buffers
      if (scaled.width * scaled.height > 12_000_000) continue;
      const raw = scanOnce(jsQR, scaled);
      if (!raw) continue;
      const payload = await decodePayloadFromQrData(raw);
      if (payload) return payloadToParsedRecipe(payload);
    }
  }

  return null;
}

/** Instagram / phone-screenshot chrome that OCR often picks up. */
const OCR_CHROME_LINE =
  /^(?:liked by|view (?:all )?(?:\d+ )?comments?|what do you think(?: of this)?\??|add a comment(?:\.\.\.)?|suggested for you|sponsored|follow|following|message|share|save|send|see translation|view replies?|original audio|\d+\s*(?:hours?|minutes?|days?|weeks?)\s+ago|just now|\d+[hmwd]|photo by|video by)$/i;

/**
 * Strip obvious phone / Instagram UI lines from OCR text before parsing.
 */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((raw) => {
      const line = raw.trim();
      if (!line) return true;
      // Status-bar clock ("16:38" or "16:38 cm")
      if (/^\d{1,2}:\d{2}\b/.test(line)) return false;
      if (OCR_CHROME_LINE.test(line)) return false;
      // Battery / signal glyphs
      if (/^[\d\s%|]+$/.test(line) && line.includes("%")) return false;
      return true;
    })
    .join("\n");
}

function tryParseOcrText(text: string): ParsedRecipe | null {
  const cleaned = cleanOcrText(text);
  if (!cleaned.trim()) return null;
  try {
    return parseRecipeText(cleaned);
  } catch {
    return null;
  }
}

/** OCR lines that differ only in case, spacing or punctuation still count as the same line. */
function normalizeOcrLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_STITCH_OVERLAP_LINES = 60;
/** Status-bar / nav-bar OCR crumbs at the seam before the real overlap starts. */
const STITCH_SEAM_JUNK_LINES = 3;

function sameOcrLine(a: string, b: string): boolean {
  return normalizeOcrLine(a) === normalizeOcrLine(b);
}

/**
 * Where the next photo's text resumes the previous one: return how much of the
 * accumulated text to keep and which line of the next text starts the new content.
 */
function findStitchOverlap(a: string[], b: string[]): { keepA: number; fromB: number } | null {
  // Clean overlap: the next text starts exactly on the shared lines.
  for (let k = Math.min(a.length, b.length, MAX_STITCH_OVERLAP_LINES); k > 0; k--) {
    let same = true;
    for (let i = 0; i < k && same; i++) same = sameOcrLine(a[a.length - k + i], b[i]);
    if (same) return { keepA: a.length, fromB: k };
  }

  // Noisy seam: junk ahead of the shared run (status bar) and after it (nav bar, cut-off line).
  let best: { keepA: number; fromB: number; run: number } | null = null;
  const mostHeadJunk = Math.min(STITCH_SEAM_JUNK_LINES, b.length - 1);
  for (let fromB = 0; fromB <= mostHeadJunk; fromB++) {
    for (let keepA = Math.max(0, a.length - MAX_STITCH_OVERLAP_LINES); keepA < a.length; keepA++) {
      let run = 0;
      while (
        keepA + run < a.length &&
        fromB + run < b.length &&
        sameOcrLine(a[keepA + run], b[fromB + run])
      ) {
        run++;
      }
      if (run >= 2 && (!best || run > best.run)) best = { keepA, fromB, run };
    }
  }
  if (best) return { keepA: best.keepA, fromB: best.fromB };

  // A line cut at the bottom of the first photo reappears complete at the top of the next.
  const cut = normalizeOcrLine(a[a.length - 1] ?? "");
  if (cut.length >= 20 && normalizeOcrLine(b[0] ?? "").startsWith(cut)) {
    return { keepA: a.length - 1, fromB: 0 };
  }
  return null;
}

/**
 * Join OCR texts from consecutive photos of one recipe, dropping the lines the
 * photos overlap on. Small OCR junk at the seam is tolerated both sides.
 * Blank OCR lines are dropped: the parser ignores them, and one screenshot may
 * have a blank between every line while the next has none.
 */
export function stitchOcrTexts(texts: string[]): string {
  let lines: string[] = [];
  for (const text of texts) {
    const next = text.split("\n").filter((line) => line.trim());
    if (!next.length) continue;

    const overlap = lines.length ? findStitchOverlap(lines, next) : null;
    lines = overlap
      ? lines.slice(0, overlap.keepA).concat(next.slice(overlap.fromB))
      : lines.concat(next);
  }
  return lines.join("\n");
}

function pickBestRecipe(candidates: ParsedRecipe[]): ParsedRecipe | null {
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) => {
    const curScore = scoreParsedRecipe(cur);
    const bestScore = scoreParsedRecipe(best);
    if (curScore !== bestScore) return curScore > bestScore ? cur : best;
    // Tie-break: prefer the longer, non-ingredient title
    return (cur.title?.length ?? 0) > (best.title?.length ?? 0) ? cur : best;
  });
}

async function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image for OCR");
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image for OCR"))),
      "image/png"
    );
  });
}

type Recognize = (input: File | Blob) => Promise<string>;

async function withOcrWorker<T>(fn: (recognize: Recognize) => Promise<T>): Promise<T> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const recognize: Recognize = async (input) => {
      const {
        data: { text },
      } = await worker.recognize(input);
      return text;
    };
    return await fn(recognize);
  } finally {
    await worker.terminate();
  }
}

/**
 * Import a recipe from an image file.
 * Order: PNG metadata → QR → OCR + plaintext parse (caption-band compare on portraits).
 */
export async function importRecipeFromImage(
  file: File,
  onProgress?: (message: string) => void
): Promise<ImageImportResult> {
  onProgress?.("Reading image…");
  const { imageData, pngBytes, width, height } = await fileToImageData(file);

  if (pngBytes) {
    onProgress?.("Checking embedded recipe data…");
    const fromMeta = extractPngRecipeMetadata(pngBytes);
    if (fromMeta) {
      return { recipe: payloadToParsedRecipe(fromMeta), source: "metadata" };
    }
  }

  onProgress?.("Scanning QR code…");
  const fromQr = await tryDecodeQr(imageData);
  if (fromQr) {
    return { recipe: fromQr, source: "qr" };
  }

  onProgress?.("Reading text from image (OCR)…");
  const recipe = await withOcrWorker(async (recognize) => {
    const candidates: ParsedRecipe[] = [];
    const texts: string[] = [];

    const fullText = await recognize(file);
    texts.push(fullText);
    const fromFull = tryParseOcrText(fullText);
    if (fromFull) candidates.push(fromFull);

    // Tall phone screenshots: also OCR the caption band and keep the better parse
    const isPortrait = height >= width * 1.35;
    const fullLooksWeak =
      !fromFull || fromFull.ingredients.length < 2 || scoreParsedRecipe(fromFull) < 25;

    if (isPortrait || fullLooksWeak) {
      onProgress?.("Trying caption area…");
      const captionBand = cropImageData(imageData, 0, height * 0.45, width, height * 0.55);
      const captionBlob = await imageDataToPngBlob(captionBand);
      const captionText = await recognize(captionBlob);
      texts.push(captionText);
      const fromCaption = tryParseOcrText(captionText);
      if (fromCaption) candidates.push(fromCaption);
    }

    const best = pickBestRecipe(candidates);
    if (best) return best;

    if (texts.every((t) => !t.trim())) {
      throw new Error("No text found in the image");
    }

    const fallback = cleanOcrText(texts.find((t) => t.trim()) || "");
    return parseRecipeText(fallback);
  });

  onProgress?.("Parsing recipe text…");
  return { recipe, source: "ocr" };
}

/**
 * Import one recipe spread across up to 5 images: each image's OCR text is
 * stitched (overlapped lines dropped) and parsed as one text. A LadleLink card
 * in any image still wins with its exact recipe data.
 */
export async function importRecipeFromImages(
  files: File[],
  onProgress?: (message: string) => void
): Promise<ImageImportResult> {
  if (!files.length) throw new Error("Choose an image file first.");
  if (files.length === 1) return importRecipeFromImage(files[0], onProgress);

  for (let i = 0; i < files.length; i++) {
    const label = `Checking image ${i + 1} of ${files.length} for recipe data…`;
    onProgress?.(label);
    const { imageData, pngBytes } = await fileToImageData(files[i]);
    if (pngBytes) {
      const fromMeta = extractPngRecipeMetadata(pngBytes);
      if (fromMeta) {
        return { recipe: payloadToParsedRecipe(fromMeta), source: "metadata" };
      }
    }
    const fromQr = await tryDecodeQr(imageData);
    if (fromQr) return { recipe: fromQr, source: "qr" };
  }

  const recipe = await withOcrWorker(async (recognize) => {
    const texts: string[] = [];
    for (let i = 0; i < files.length; i++) {
      onProgress?.(`Reading image ${i + 1} of ${files.length} (OCR)…`);
      texts.push(cleanOcrText(await recognize(files[i])));
    }
    const stitched = stitchOcrTexts(texts);
    if (!stitched.trim()) throw new Error("No text found in the images");
    return parseRecipeText(stitched);
  });

  onProgress?.("Parsing recipe text…");
  return { recipe, source: "ocr" };
}
