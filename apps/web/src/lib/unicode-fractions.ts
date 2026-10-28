/** ASCII fractions → Unicode vulgar fractions (recipe-style). Longer first. */
const ASCII_TO_UNICODE: [string, string][] = [
  ["1/8", "⅛"],
  ["3/8", "⅜"],
  ["5/8", "⅝"],
  ["7/8", "⅞"],
  ["1/4", "¼"],
  ["3/4", "¾"],
  ["1/3", "⅓"],
  ["2/3", "⅔"],
  ["1/2", "½"],
];

const ASCII_FRACTION_RE = /(?<!\d)(1\/8|3\/8|5\/8|7\/8|1\/4|3\/4|1\/3|2\/3|1\/2)(?!\d)/g;

const REPLACEMENTS = new Map(ASCII_TO_UNICODE);

/** Unicode vulgar fraction → decimal value (used when parsing typed quantities). */
export const UNICODE_FRACTION_VALUES: Record<string, number> = Object.fromEntries(
  ASCII_TO_UNICODE.map(([ascii, unicode]) => {
    const [numerator, denominator] = ascii.split("/").map(Number);
    return [unicode, numerator! / denominator!];
  })
);

/**
 * Replace ASCII fractions like `1/4` with `¼`.
 * Returns the new text and an adjusted caret index for the edit that produced `text`.
 */
export function replaceAsciiFractions(
  text: string,
  cursor = text.length
): { text: string; cursor: number } {
  let nextCursor = cursor;
  const next = text.replace(ASCII_FRACTION_RE, (match, _g, offset: number) => {
    const replacement = REPLACEMENTS.get(match) ?? match;
    const delta = replacement.length - match.length;
    if (offset < cursor) {
      // Caret was at/after this match — shift by the length change.
      const end = offset + match.length;
      if (cursor >= end) nextCursor += delta;
      else nextCursor = offset + replacement.length;
    }
    return replacement;
  });
  return { text: next, cursor: Math.max(0, Math.min(nextCursor, next.length)) };
}
