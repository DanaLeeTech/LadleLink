import { useState } from "react";
import {
  formatQuantityField,
  parseQuantityFieldForCommit,
} from "../lib/ingredient-ui";

interface QuantityInputProps {
  quantity: number;
  quantityMax?: number | null;
  onCommit: (next: { quantity: number; quantityMax: number | null }) => void;
}

/** Qty field that keeps a draft string while focused so `.` and `-` can be typed. */
export function QuantityInput({
  quantity,
  quantityMax,
  onCommit,
}: QuantityInputProps) {
  const ing = {
    quantity,
    quantityMax: quantityMax ?? undefined,
  };
  const formatted = formatQuantityField(ing);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatted);

  return (
    <input
      className="qty-input"
      type="text"
      inputMode="decimal"
      value={focused ? draft : formatted}
      onFocus={() => {
        setDraft(formatQuantityField(ing));
        setFocused(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseQuantityFieldForCommit(draft);
        // Reject final ≤ 0 / invalid; keep previous committed value (draft typing of "0." is fine).
        if (parsed) onCommit(parsed);
        setFocused(false);
      }}
      aria-label="Quantity"
    />
  );
}
