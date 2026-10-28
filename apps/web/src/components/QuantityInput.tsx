import { useRef, useState } from "react";
import {
  formatQuantityField,
  parseQuantityFieldForCommit,
} from "../lib/ingredient-ui";

/** Tap-to-insert fractions for the Android keyboard, which has no fraction keys. */
const FRACTION_CHIPS = ["½", "¼", "¾", "⅓"];

interface QuantityInputProps {
  quantity: number;
  quantityMax?: number | null;
  onCommit: (next: { quantity: number; quantityMax: number | null }) => void;
}

/** Qty field that keeps a draft string while focused so `.`/`,`/`/` and `-` can be typed. */
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatted);
  const [error, setError] = useState<string | null>(null);

  function insertFraction(chip: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? start;
    setDraft(draft.slice(0, start) + chip + draft.slice(end));
    setError(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + chip.length, start + chip.length);
    });
  }

  return (
    <div className="qty-field">
      <input
        ref={inputRef}
        className="qty-input"
        type="text"
        inputMode="decimal"
        value={focused || error ? draft : formatted}
        onFocus={() => {
          if (!error) setDraft(formatQuantityField(ing));
          setFocused(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={() => {
          const parsed = parseQuantityFieldForCommit(draft);
          setFocused(false);
          if (parsed) {
            setError(null);
            onCommit(parsed);
          } else {
            // Keep the bad text visible instead of silently reverting it.
            setError("Enter a number, fraction or range above 0");
          }
        }}
        aria-label="Quantity"
        aria-invalid={error ? true : undefined}
      />
      {focused && (
        <div className="qty-chips">
          {FRACTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="qty-chip"
              aria-label={`Insert ${chip}`}
              // Keep focus (and its draft) in the input while inserting.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertFraction(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      )}
      {error && (
        <span className="qty-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
