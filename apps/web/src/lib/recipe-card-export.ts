import type { Ingredient, Recipe, RecipeCardPayload } from "@ladlelink/types";
import type { ScaledIngredient } from "@ladlelink/scaling";
import { pluralUnitLabel } from "@ladlelink/units";
import {
  buildRecipeCardPayload,
  encodePayloadForQr,
  injectPngRecipeMetadata,
} from "./recipe-card-payload";
import { capitalizeFirst, softenNameCase } from "./ingredient-ui";

export const RECIPE_CARD_WIDTH = 1080;
export const RECIPE_CARD_HEIGHT = 1920;

export interface RecipeCardColors {
  background: string;
  card: string;
  title: string;
  body: string;
  section: string;
}

export const DEFAULT_RECIPE_CARD_COLORS: RecipeCardColors = {
  background: "#35121f",
  card: "#ffffff",
  title: "#2c2427",
  body: "#2c2427",
  section: "#5a1d34",
};

export function scaledToExportIngredients(
  scaled: ScaledIngredient[]
): Ingredient[] {
  return scaled.map((ing) => {
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
    if (ing.unit) next.displayUnit = ing.unit;
    return next;
  });
}

export function formatIngredientLine(ing: ScaledIngredient): string {
  const parts: string[] = [];
  if (ing.displayQuantity) parts.push(ing.displayQuantity);
  if (ing.size) {
    parts.push(parts.length === 0 ? capitalizeFirst(ing.size) : ing.size);
  }
  const unitText = String(ing.unit || "");
  if (unitText && !ing.size) {
    const label = pluralUnitLabel(unitText, ing.quantityMax ?? ing.quantity);
    parts.push(parts.length === 0 ? capitalizeFirst(label) : label);
  }
  const name = softenNameCase(ing.name);
  parts.push(parts.length === 0 ? capitalizeFirst(name) : name);
  if (ing.notes) parts.push(`(${ing.notes})`);
  return parts.join(" ");
}

export function buildExportPayload(
  recipe: Recipe,
  scaled: ScaledIngredient[],
  servings: number
): RecipeCardPayload {
  return buildRecipeCardPayload({
    title: recipe.title,
    servings,
    ingredients: scaledToExportIngredients(scaled),
    steps: recipe.steps,
    notes: recipe.notes ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
  });
}

export async function generateQrDataUrl(payload: RecipeCardPayload): Promise<{
  dataUrl: string;
  truncated: boolean;
}> {
  const QRCode = (await import("qrcode")).default;
  const { data, truncated } = await encodePayloadForQr(payload);
  // Prefer Q for screenshot resilience; fall back if the payload is too dense.
  const levels = ["Q", "M", "L"] as const;
  let lastError: unknown;
  for (const level of levels) {
    try {
      const dataUrl = await QRCode.toDataURL(data, {
        errorCorrectionLevel: level,
        margin: 2,
        width: 360,
        color: { dark: "#1a1214", light: "#ffffff" },
      });
      return { dataUrl, truncated };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not encode recipe QR code");
}

export interface RenderRecipeCardOptions {
  title: string;
  ingredients: string[];
  steps: string[];
  colors: RecipeCardColors;
  qrDataUrl: string;
  payload: RecipeCardPayload;
  dense?: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load QR image"));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const test = `${current} ${word}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

async function ensureCardFonts(dense: boolean): Promise<void> {
  const titleSize = dense ? 48 : 64;
  const sectionSize = dense ? 28 : 34;
  const bodySize = dense ? 22 : 28;
  const stepNumSize = dense ? 24 : 32;
  await Promise.all([
    document.fonts.load(`700 ${titleSize}px Fraunces`),
    document.fonts.load(`700 ${sectionSize}px Fraunces`),
    document.fonts.load(`700 ${stepNumSize}px Fraunces`),
    document.fonts.load(`400 ${bodySize}px "Source Sans 3"`),
    document.fonts.load(`400 16px "Source Sans 3"`),
  ]);
  await document.fonts.ready;
}

/**
 * Paint the recipe card with Canvas 2D so export layout matches measured text
 * (DOM→image libraries mis-measure Fraunces and cause overlaps).
 */
export async function renderRecipeCardPng(
  options: RenderRecipeCardOptions
): Promise<Blob> {
  const dense = Boolean(options.dense);
  await ensureCardFonts(dense);
  const qrImage = await loadImage(options.qrDataUrl);

  const outerPadX = 52;
  const outerPadY = 56;
  const cardPadX = 52;
  const cardPadTop = 56;
  const cardPadBottom = 48;
  const cardRadius = 28;
  const qrSize = dense ? 260 : 320;
  const qrGap = 52;
  const qrCaption = "Import into LadleLink";
  const qrCaptionSize = dense ? 14 : 16;
  const qrCaptionGap = 8;

  const titleSize = dense ? 48 : 64;
  const sectionSize = dense ? 28 : 34;
  const bodySize = dense ? 22 : 28;
  const stepNumSize = dense ? 24 : 32;
  const titleLine = titleSize * 1.2;
  const sectionLine = sectionSize * 1.25;
  const bodyLine = bodySize * 1.4;
  const titleMarginBottom = dense ? 16 : 28;
  const sectionMarginTop = dense ? 14 : 24;
  const sectionMarginBottom = dense ? 8 : 12;
  const ingredientGap = dense ? 6 : 10;
  const stepGap = dense ? 8 : 12;
  const stepNumCol = 48;

  const canvas = document.createElement("canvas");
  canvas.width = RECIPE_CARD_WIDTH;
  canvas.height = RECIPE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas");

  const cardW = RECIPE_CARD_WIDTH - outerPadX * 2;
  const innerW = cardW - cardPadX * 2;
  const qrBlockW = qrSize;
  const ingredientColW = Math.max(120, innerW - qrBlockW - qrGap);

  // ——— Measure content height ———
  ctx.font = `700 ${titleSize}px Fraunces, Georgia, serif`;
  const titleLines = wrapText(ctx, options.title, innerW);
  let contentH = titleLines.length * titleLine + titleMarginBottom;

  contentH += sectionMarginTop + sectionLine + sectionMarginBottom;

  ctx.font = `400 ${bodySize}px "Source Sans 3", sans-serif`;
  let ingredientBlockH = 0;
  for (let i = 0; i < options.ingredients.length; i++) {
    const lines = wrapText(ctx, options.ingredients[i]!, ingredientColW);
    ingredientBlockH += lines.length * bodyLine;
    if (i < options.ingredients.length - 1) ingredientBlockH += ingredientGap;
  }
  const qrBlockH = qrSize + qrCaptionGap + qrCaptionSize * 1.2;
  contentH += Math.max(ingredientBlockH, qrBlockH);

  contentH += sectionMarginTop + sectionLine + sectionMarginBottom;

  ctx.font = `400 ${bodySize}px "Source Sans 3", sans-serif`;
  const stepTextW = innerW - stepNumCol;
  for (let i = 0; i < options.steps.length; i++) {
    const lines = wrapText(ctx, options.steps[i]!, stepTextW);
    contentH += Math.max(stepNumSize * 1.4, lines.length * bodyLine);
    if (i < options.steps.length - 1) contentH += stepGap;
  }

  const cardH = Math.min(
    RECIPE_CARD_HEIGHT - outerPadY * 2,
    cardPadTop + contentH + cardPadBottom
  );
  const cardX = outerPadX;
  const cardY = (RECIPE_CARD_HEIGHT - cardH) / 2;

  // ——— Paint ———
  ctx.fillStyle = options.colors.background;
  ctx.fillRect(0, 0, RECIPE_CARD_WIDTH, RECIPE_CARD_HEIGHT);

  ctx.save();
  ctx.shadowColor = "rgba(42, 20, 28, 0.18)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = options.colors.card;
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.fill();
  ctx.restore();

  // Clip to card for safety
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.clip();

  let y = cardY + cardPadTop;
  const textLeft = cardX + cardPadX;

  ctx.fillStyle = options.colors.title;
  ctx.font = `700 ${titleSize}px Fraunces, Georgia, serif`;
  ctx.textBaseline = "top";
  for (const line of titleLines) {
    ctx.fillText(line, textLeft, y);
    y += titleLine;
  }
  y += titleMarginBottom;

  y += sectionMarginTop;
  ctx.fillStyle = options.colors.section;
  ctx.font = `700 ${sectionSize}px Fraunces, Georgia, serif`;
  ctx.fillText("Ingredients", textLeft, y);
  y += sectionLine + sectionMarginBottom;

  const ingredientsTop = y;
  ctx.fillStyle = options.colors.body;
  ctx.font = `400 ${bodySize}px "Source Sans 3", sans-serif`;
  let ingY = ingredientsTop;
  for (let i = 0; i < options.ingredients.length; i++) {
    const lines = wrapText(ctx, options.ingredients[i]!, ingredientColW);
    for (const line of lines) {
      ctx.fillText(line, textLeft, ingY);
      ingY += bodyLine;
    }
    if (i < options.ingredients.length - 1) ingY += ingredientGap;
  }

  const qrX = textLeft + ingredientColW + qrGap;
  const qrY = ingredientsTop;
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  ctx.fillStyle = options.colors.body;
  ctx.font = `400 ${qrCaptionSize}px "Source Sans 3", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(qrCaption, qrX + qrSize / 2, qrY + qrSize + qrCaptionGap);
  ctx.textAlign = "left";

  y = Math.max(ingY, qrY + qrBlockH);

  y += sectionMarginTop;
  ctx.fillStyle = options.colors.section;
  ctx.font = `700 ${sectionSize}px Fraunces, Georgia, serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Steps", textLeft, y);
  y += sectionLine + sectionMarginBottom;

  for (let i = 0; i < options.steps.length; i++) {
    const stepTop = y;
    ctx.fillStyle = options.colors.section;
    ctx.font = `700 ${stepNumSize}px Fraunces, Georgia, serif`;
    ctx.fillText(String(i + 1), textLeft, stepTop);

    ctx.fillStyle = options.colors.body;
    ctx.font = `400 ${bodySize}px "Source Sans 3", sans-serif`;
    const lines = wrapText(ctx, options.steps[i]!, stepTextW);
    let stepY = stepTop;
    for (const line of lines) {
      ctx.fillText(line, textLeft + stepNumCol, stepY);
      stepY += bodyLine;
    }
    y = Math.max(stepTop + stepNumSize * 1.4, stepY);
    if (i < options.steps.length - 1) y += stepGap;
  }

  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png"
    );
  });
  const buf = new Uint8Array(await blob.arrayBuffer());
  const withMeta = injectPngRecipeMetadata(buf, options.payload);
  return new Blob([Uint8Array.from(withMeta)], { type: "image/png" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "recipe"}-card.png`;
}
