const FRACTIONS: Array<{ value: number; label: string }> = [
  { value: 0.125, label: "1/8" },
  { value: 0.25, label: "1/4" },
  { value: 1 / 3, label: "1/3" },
  { value: 0.375, label: "3/8" },
  { value: 0.5, label: "1/2" },
  { value: 0.625, label: "5/8" },
  { value: 2 / 3, label: "2/3" },
  { value: 0.75, label: "3/4" },
  { value: 0.875, label: "7/8" },
];

const FRACTION_UNITS = new Set(["cup", "tsp", "tbsp", "dessertspoon"]);

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
  const s = String(rounded);
  if (s.includes("e") || s.includes("E")) return rounded.toFixed(2);
  return s;
}
