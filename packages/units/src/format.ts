const FRACTIONS: Array<{ value: number; label: string }> = [
  { value: 0.125, label: "⅛" },
  { value: 0.25, label: "¼" },
  { value: 1 / 3, label: "⅓" },
  { value: 0.375, label: "⅜" },
  { value: 0.5, label: "½" },
  { value: 0.625, label: "⅝" },
  { value: 2 / 3, label: "⅔" },
  { value: 0.75, label: "¾" },
  { value: 0.875, label: "⅞" },
];

const FRACTION_UNITS = new Set(["cup", "tsp", "tbsp", "dessertspoon"]);
/** Metric mass/volume reads as a decimal ("1.5 g"), never "1 ½ g". */
const DECIMAL_UNITS = new Set(["g", "kg", "mg", "ml", "l", "cl"]);

function nearestFraction(frac: number): { value: number; label: string } {
  let best = FRACTIONS[0];
  let bestDiff = Math.abs(frac - best.value);
  for (const f of FRACTIONS) {
    const d = Math.abs(frac - f.value);
    if (d < bestDiff - 1e-12) {
      best = f;
      bestDiff = d;
    }
  }
  return best;
}

export function roundQuantity(quantity: number, unit: string): number {
  if (!Number.isFinite(quantity)) return 0;
  const u = unit.toLowerCase();
  if (FRACTION_UNITS.has(u)) {
    const whole = Math.floor(quantity + 1e-9);
    const frac = quantity - whole;
    if (frac < 1e-6) return whole;
    const snapped = whole + nearestFraction(frac).value;
    return snapped === 0 && quantity > 0 ? 0.125 : snapped;
  }
  if (u === "g" || u === "ml") {
    if (quantity >= 100) return Math.round(quantity);
    if (quantity >= 10) return Math.round(quantity * 10) / 10;
    return Math.round(quantity * 100) / 100;
  }
  if (u === "kg" || u === "l") {
    return Math.round(quantity * 1000) / 1000;
  }
  if (u === "oz" || u === "lb" || u === "fl_oz") {
    return Math.round(quantity * 100) / 100;
  }
  if (Number.isInteger(quantity)) return quantity;
  return Math.round(quantity * 100) / 100;
}

export function formatQuantity(quantity: number, unit: string): string {
  const rounded = roundQuantity(quantity, unit);
  const u = unit.toLowerCase();
  // to taste / garnish often have no amount — keep the qty display blank
  if ((u === "to_taste" || u === "garnish") && Math.abs(rounded) < 1e-9) {
    return "";
  }
  if (FRACTION_UNITS.has(u)) {
    const whole = Math.floor(rounded + 1e-9);
    const frac = rounded - whole;
    if (Math.abs(frac) < 1e-6) return String(whole || 0);
    const best = nearestFraction(frac);
    if (whole === 0) return best.label;
    return `${whole} ${best.label}`;
  }
  // Countable things (eggs, slices) read better as ½ than 0.5; leave 0.7 alone.
  const whole = Math.floor(rounded + 1e-9);
  const frac = rounded - whole;
  const best = nearestFraction(frac);
  if (!DECIMAL_UNITS.has(u) && frac > 1e-6 && Math.abs(frac - best.value) < 0.02) {
    return whole === 0 ? best.label : `${whole} ${best.label}`;
  }
  const s = String(rounded);
  if (s.includes("e") || s.includes("E")) return rounded.toFixed(2);
  return s;
}
