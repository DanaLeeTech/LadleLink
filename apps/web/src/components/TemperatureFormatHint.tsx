import { useState } from "react";

/** ⓘ next to the Steps/Notes labels: how to write temperatures the reader can convert. */
export function TemperatureFormatHint() {
  const [open, setOpen] = useState(false);
  return (
    <span className="format-hint">
      <button
        type="button"
        className="format-hint-button"
        aria-expanded={open}
        aria-label="Temperature formats"
        onClick={() => setOpen((value) => !value)}
      >
        ⓘ
      </button>
      {open && (
        <span className="format-hint-pop" role="tooltip">
          Write temperatures like <b>200C</b> or <b>400F</b> (also <b>200 °C</b>, <b>180–200C</b>,{" "}
          <b>300K</b>). They become tappable in the recipe and switch between °C and °F.
        </span>
      )}
    </span>
  );
}
