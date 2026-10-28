import { formatQuantity } from "./format.js";

export function formatQuantityRange(
  quantity: number,
  unit: string,
  quantityMax?: number
): string {
  if (
    quantityMax != null &&
    Number.isFinite(quantityMax) &&
    Math.abs(quantityMax - quantity) > 1e-9
  ) {
    return `${formatQuantity(quantity, unit)}-${formatQuantity(quantityMax, unit)}`;
  }
  // No amount: stay blank so the ingredient name leads the display line.
  if (Math.abs(quantity) < 1e-9) return "";
  return formatQuantity(quantity, unit);
}
