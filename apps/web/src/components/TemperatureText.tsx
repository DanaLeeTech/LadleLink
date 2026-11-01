import { Fragment, useState } from "react";
import {
  formatTemperature,
  splitTemperatures,
  temperatureCycle,
  type TemperatureToken,
  type TempUnit,
} from "../lib/temperature";

const UNIT_NAME: Record<TempUnit, string> = {
  c: "Celsius",
  f: "Fahrenheit",
  k: "Kelvin",
};

function TemperatureButton({
  token,
  includeKelvin,
}: {
  token: TemperatureToken;
  includeKelvin: boolean;
}) {
  const units = temperatureCycle(token, includeKelvin);
  const [index, setIndex] = useState(0);
  const unit = units[index]!;
  const next = units[(index + 1) % units.length]!;
  const text = formatTemperature(token, unit);
  return (
    <button
      type="button"
      className="temp-toggle"
      title={`Switch to ${UNIT_NAME[next]}`}
      aria-label={`${text}, ${UNIT_NAME[unit]}. Switch to ${UNIT_NAME[next]}.`}
      onClick={() => setIndex((current) => (current + 1) % units.length)}
    >
      {text}
    </button>
  );
}

/** Renders recipe text with its temperatures as tap-to-convert buttons. */
export function TemperatureText({
  text,
  includeKelvin = false,
}: {
  text: string;
  includeKelvin?: boolean;
}) {
  return splitTemperatures(text).map((segment, index) =>
    segment.type === "text" ? (
      <Fragment key={index}>{segment.text}</Fragment>
    ) : (
      <TemperatureButton key={index} token={segment.token} includeKelvin={includeKelvin} />
    )
  );
}
