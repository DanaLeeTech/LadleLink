import { useEffect, useState, type CSSProperties } from "react";
import { isValidServings, type ServingsValue } from "../lib/recipe-form";

export { isValidServings, type ServingsValue };

interface ServingsInputProps {
  id?: string;
  value: ServingsValue;
  onChange: (value: ServingsValue) => void;
  min?: number;
  required?: boolean;
  "aria-label"?: string;
  style?: CSSProperties;
  className?: string;
}

/** Servings field that can be cleared while editing; use `required` to block empty submit. */
export function ServingsInput({
  id,
  value,
  onChange,
  min = 1,
  required,
  className,
  style,
  "aria-label": ariaLabel,
}: ServingsInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => (value === "" ? "" : String(value)));

  useEffect(() => {
    if (!focused) setDraft(value === "" ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      id={id}
      className={className}
      style={style}
      type="number"
      min={min}
      step={1}
      required={required}
      value={focused ? draft : value === "" ? "" : value}
      aria-label={ariaLabel}
      onFocus={() => {
        setDraft(value === "" ? "" : String(value));
        setFocused(true);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === "") {
          onChange("");
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setFocused(false)}
    />
  );
}
