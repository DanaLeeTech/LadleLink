/**
 * Temperatures written in recipe text (`200c`, `400 °F`, `180–200C`, `300K`)
 * become tappable in the reader. Only these number + unit pairs count; a
 * number with no c/f/k letter is left alone.
 */
export type TempUnit = "c" | "f" | "k";

export interface TemperatureToken {
  /** Exact text as authored, e.g. "200c", "180–200 °C", "300K". */
  raw: string;
  /** One value, or two for a range. Always the authored numbers. */
  numbers: number[];
  unit: TempUnit;
  /** Text between the two range numbers, kept verbatim ("-", "–", " to "). */
  rangeSeparator: string | null;
  /** Whitespace and degree sign between the last number and the unit letter. */
  unitSpacing: string;
  /** Authored letter case, mirrored when converting: "200c" → "392f". */
  upper: boolean;
}

export type TemperatureSegment =
  { type: "text"; text: string } | { type: "temperature"; token: TemperatureToken };

const TEMPERATURE =
  /(\d+(?:\.\d+)?)(?:(\s*(?:-|–|to)\s*)(\d+(?:\.\d+)?))?(\s*°?\s*)([cfkCFK])(?![a-zA-Z])/g;

export function splitTemperatures(text: string): TemperatureSegment[] {
  const segments: TemperatureSegment[] = [];
  const pattern = new RegExp(TEMPERATURE.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", text: text.slice(last, match.index) });
    }
    const numbers = [Number(match[1])];
    if (match[3] !== undefined) numbers.push(Number(match[3]));
    segments.push({
      type: "temperature",
      token: {
        raw: match[0],
        numbers,
        unit: match[5]!.toLowerCase() as TempUnit,
        rangeSeparator: match[2] ?? null,
        unitSpacing: match[4]!,
        upper: match[5] === match[5]!.toUpperCase(),
      },
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

function toCelsius(value: number, unit: TempUnit): number {
  if (unit === "f") return (value - 32) * (5 / 9);
  if (unit === "k") return value - 273.15;
  return value;
}

function fromCelsius(celsius: number, unit: TempUnit): number {
  if (unit === "f") return (celsius * 9) / 5 + 32;
  if (unit === "k") return celsius + 273.15;
  return celsius;
}

/**
 * Converts from the authored numbers every time (never from the last display),
 * so tapping back to the original unit shows the authored value again.
 */
export function formatTemperature(token: TemperatureToken, unit: TempUnit): string {
  if (unit === token.unit) return token.raw;
  const numbers = token.numbers.map((value) =>
    String(Math.round(fromCelsius(toCelsius(value, token.unit), unit)))
  );
  let spacing = token.unitSpacing;
  let letter: string;
  if (unit === "k") {
    spacing = spacing.includes(" ") ? " " : ""; // Kelvin never takes a degree sign
    letter = "K";
  } else {
    letter = token.upper ? unit.toUpperCase() : unit;
  }
  const joined =
    numbers.length === 2 ? `${numbers[0]}${token.rangeSeparator}${numbers[1]}` : numbers[0];
  return `${joined}${spacing}${letter}`;
}

const CYCLE: TempUnit[] = ["c", "f", "k"];

/** Units a tap cycles through, starting at the authored one. */
export function temperatureCycle(token: TemperatureToken, includeKelvin: boolean): TempUnit[] {
  if (token.unit === "k" || includeKelvin) {
    const start = CYCLE.indexOf(token.unit);
    return [...CYCLE.slice(start), ...CYCLE.slice(0, start)];
  }
  return token.unit === "c" ? ["c", "f"] : ["f", "c"];
}
