import type { Ingredient, ProduceSize } from "@ladlelink/types";
import {
  formatQuantity,
  formatQuantityRange,
  pluralUnitLabel,
  pluralProduceName,
  unitFamily,
  unitLabel,
} from "@ladlelink/units";
import { isProduceSize } from "../components/UnitSelect";
import { UNICODE_FRACTION_VALUES } from "./unicode-fractions";

export { unitLabel };

/** Size applies to countable / empty / unknown units — not absolute volume or mass. */
export function isSizeCompatibleUnit(unit: string): boolean {
  const family = unitFamily(unit || "");
  return family !== "volume" && family !== "mass";
}

/** Value for the merged size/unit select (unit wins when both exist). */
export function measureSelectValue(
  ing: Pick<Ingredient, "size" | "unit">
): string {
  return ing.unit || ing.size || "";
}

/**
 * Patch from the merged size/unit select.
 * Produce sizes set `size` and clear `unit`; measures set `unit` and clear `size`.
 */
export function patchFromMeasureSelect(value: string): {
  unit: string;
  size: ProduceSize | undefined;
} {
  if (isProduceSize(value)) {
    return { size: value, unit: "" };
  }
  return { unit: value, size: undefined };
}

/** Display value for the single quantity field: `4`, `4-8` or `1 ½`; blank when quantity is 0. */
export function formatQuantityField(ing: Pick<Ingredient, "quantity" | "quantityMax">): string {
  if (
    ing.quantityMax != null &&
    Number.isFinite(ing.quantityMax) &&
    ing.quantityMax !== ing.quantity
  ) {
    return `${formatFieldNum(ing.quantity)}-${formatFieldNum(ing.quantityMax)}`;
  }
  if (!Number.isFinite(ing.quantity) || ing.quantity === 0) return "";
  return formatFieldNum(ing.quantity);
}

/** Committed ingredient qty must be finite and greater than zero. */
export function isValidIngredientQuantity(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * One quantity, as people type it: `2`, `0.5` / `0,5`, `1/2`, `1 1/2`, `½`, `1½`.
 * Null when it is not a usable number.
 */
function parseSingleQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const unicode = text.match(/^(?:(\d+)\s*)?([½¼¾⅓⅔⅜⅝⅞⅛])$/);
  if (unicode) {
    return (unicode[1] ? Number(unicode[1]) : 0) + UNICODE_FRACTION_VALUES[unicode[2]!]!;
  }

  const fraction = text.match(/^(\d+)?\s*(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[3]);
    if (!denominator) return null;
    return (fraction[1] ? Number(fraction[1]) : 0) + Number(fraction[2]) / denominator;
  }

  // A comma is a decimal in `0,5` but a thousands separator in `1,000`.
  const commaDecimal = /^\d+,\d{1,2}$/.test(text);
  const cleaned = commaDecimal ? text.replace(",", ".") : text.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/** `quantityMax: null` means clear any existing range upper bound. */
export function parseQuantityField(raw: string): {
  quantity: number;
  quantityMax: number | null;
} {
  const text = raw.trim();
  if (!text) return { quantity: 0, quantityMax: null };

  const range = text.match(/^(.+?)\s*(?:to|-|–|—)\s*(.+)$/i);
  if (range) {
    const a = parseSingleQuantity(range[1]!);
    const b = parseSingleQuantity(range[2]!);
    if (a != null && b != null) {
      return { quantity: Math.min(a, b), quantityMax: Math.max(a, b) };
    }
  }

  const n = parseSingleQuantity(text);
  return { quantity: n ?? 0, quantityMax: null };
}

/**
 * Parse a qty draft for commit. Empty → blank (0). Non-empty ≤ 0 / non-finite → null (reject).
 */
export function parseQuantityFieldForCommit(raw: string): {
  quantity: number;
  quantityMax: number | null;
} | null {
  const text = raw.trim();
  if (!text) return { quantity: 0, quantityMax: null };
  const parsed = parseQuantityField(raw);
  if (!isValidIngredientQuantity(parsed.quantity)) return null;
  if (
    parsed.quantityMax != null &&
    !isValidIngredientQuantity(parsed.quantityMax)
  ) {
    return null;
  }
  return parsed;
}

function formatFieldNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // `piece` is the countable fallback: whole numbers, friendly fractions, else 2 dp.
  return formatQuantity(n, "piece");
}

/** Quantity for the line preview — fractions for spoon/cup measures. */
function formatPreviewQuantity(ing: Ingredient): string {
  const hasRange =
    ing.quantityMax != null &&
    Number.isFinite(ing.quantityMax) &&
    ing.quantityMax !== ing.quantity;
  if (!hasRange && (!Number.isFinite(ing.quantity) || ing.quantity === 0)) {
    return "";
  }
  return formatQuantityRange(ing.quantity, ing.unit || "", ing.quantityMax);
}

/** Sentence-case the first letter (e.g. "to taste …" → "To taste …"). */
export function capitalizeFirst(text: string): string {
  if (!text) return text;
  const i = text.search(/\S/);
  if (i < 0) return text;
  return text.slice(0, i) + text.charAt(i).toUpperCase() + text.slice(i + 1);
}

/** Lowercase leading capitals in names; keep ALL-CAPS words (BBQ, USDA) intact. */
export function softenNameCase(name: string): string {
  return name.replace(/[A-Za-z][A-Za-z'’-]*/g, (word) => {
    const letters = word.replace(/[^A-Za-z]/g, "");
    if (letters.length > 1 && letters === letters.toUpperCase()) return word;
    return word.charAt(0).toLowerCase() + word.slice(1);
  });
}

export function formatIngredientPreview(ing: Ingredient): string {
  const parts: string[] = [];
  const qtyForPlural =
    ing.quantityMax != null && Number.isFinite(ing.quantityMax)
      ? ing.quantityMax
      : ing.quantity;

  // Preview uses recipe-style fractions for cup/tsp/tbsp; the qty input stays decimal.
  const qtyText = formatPreviewQuantity(ing);
  if (qtyText) parts.push(qtyText);
  if (ing.size) parts.push(ing.size);
  if (ing.unit) {
    parts.push(pluralUnitLabel(String(ing.unit), qtyForPlural));
    if (ing.name.trim()) parts.push(softenNameCase(ing.name.trim()));
  } else if (ing.name.trim()) {
    parts.push(softenNameCase(pluralProduceName(ing.name.trim(), qtyForPlural)));
  }

  let preview = parts.join(" ").trim() || "—";
  // Sentence-case when the line doesn't start with a quantity
  if (!qtyText && preview !== "—") preview = capitalizeFirst(preview);
  return preview;
}
