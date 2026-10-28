import { useLayoutEffect, useRef, useState } from "react";
import { replaceAsciiFractions } from "../lib/unicode-fractions";

interface StepsTextareaProps {
  id?: string;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  "aria-label"?: string;
}

/** Steps editor that turns typed `1/4` into `¼` (and similar fractions). */
export function StepsTextarea({
  id = "steps",
  rows = 10,
  value,
  onChange,
  required,
  "aria-label": ariaLabel,
}: StepsTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (cursor == null || !ref.current) return;
    ref.current.setSelectionRange(cursor, cursor);
    setCursor(null);
  }, [value, cursor]);

  return (
    <textarea
      ref={ref}
      id={id}
      rows={rows}
      value={value}
      required={required}
      aria-label={ariaLabel}
      onChange={(e) => {
        const el = e.target;
        const { text, cursor: nextCursor } = replaceAsciiFractions(
          el.value,
          el.selectionStart ?? el.value.length
        );
        onChange(text);
        if (text !== el.value) setCursor(nextCursor);
      }}
    />
  );
}
