import type { Ingredient, ProduceSize } from "@ladlelink/types";
import {
  canonicalizeUnit,
  defaultProduceSize,
  inferConversionKey,
  PRODUCE_UNIT_SET,
  unitFamily,
  unitPatternAlternation,
} from "@ladlelink/units";

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/** Common HTML named entities that appear in recipe JSON-LD / scraped text. */
const HTML_NAMED: Record<string, string> = {
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  frac13: "⅓",
  frac23: "⅔",
  frac18: "⅛",
  frac38: "⅜",
  frac58: "⅝",
  frac78: "⅞",
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  mdash: "—",
  ndash: "–",
  hellip: "…",
  times: "×",
};

/** Decode HTML entities left literal in JSON-LD strings (e.g. `1 &frac14; teaspoon`). */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, ent: string) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x" || ent[1] === "X"
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
      if (Number.isFinite(code)) return String.fromCodePoint(code);
      return match;
    }
    return HTML_NAMED[ent.toLowerCase()] ?? match;
  });
}

const UNIT_ALT = unitPatternAlternation();
/** Letter-bounded so short forms (l, g, t, c) do not steal prefixes of words like "large". */
const UNIT_PATTERN = `((?<![a-zA-Z])(?:${UNIT_ALT})(?![a-zA-Z]))`;
const SIZE_PATTERN = "(small|medium|med|large)";

/** Seasoning-style countables that often appear without a leading number ("a pinch of salt"). */
const BARE_SEASONING_UNITS =
  "pinch|pinches|dash|dashes|drop|drops|smidgen|smidgens|handful|handfuls|twist|twists|dollop|dollops|knob|knobs";
const BARE_SEASONING_PATTERN = `((?<![a-zA-Z])(?:${BARE_SEASONING_UNITS})(?![a-zA-Z]))`;

const NUMBERED_STEP_PREFIX = /^\s*\d+\s*[.):\-]\s*/;

/** Phrases that mark garnish even when not the leading unit token. */
const GARNISH_PHRASE =
  /(?:\bfor\s+garnish(?:ing)?\b|\bas\s+(?:a\s+)?garnish\b|\bto\s+garnish\b|\bgarnish(?:ing)?\s+with\b|\bgarnish(?:es|ing)?\b)/i;

function hasGarnishPhrase(text: string): boolean {
  return GARNISH_PHRASE.test(text);
}

function stripGarnishPhrase(text: string): string {
  return text
    .replace(/\bgarnish(?:ing)?\s+with\b/gi, " ")
    .replace(
      /(?:,\s*)?(?:\bfor\s+garnish(?:ing)?\b|\bas\s+(?:a\s+)?garnish\b|\bto\s+garnish\b|\bgarnish(?:es|ing)?\b)/gi,
      " "
    )
    .replace(/^[:;\-\s]+|[:;\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripToTastePhrase(text: string): string {
  return text
    .replace(/(?:,\s*)?\bto\s*taste\b/gi, " ")
    .replace(/^[,;\-\s]+|[,;\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type MeasureSpan = {
  quantity: number;
  unit: string;
  index: number;
  length: number;
};

/** Optional hedge before a quantity (common in parenthetical conversions). */
const QTY_HEDGE = "(?:(?:about|approx\\.?|approximately|~)\\s+)?";

/**
 * Global qty+unit matcher. Capture groups:
 * 1–3 mixed whole/num/den, 4–5 fraction, 6 decimal, 7 unit.
 */
function measureRegex(): RegExp {
  return new RegExp(
    `${QTY_HEDGE}(?:` +
      `(\\d+)(?:\\s+|\\s*-\\s*)(\\d+)/(\\d+)` +
      `|(\\d+)/(\\d+)` +
      `|(\\d+(?:\\.\\d+)?)` +
      `)\\s*-?\\s*${UNIT_PATTERN}\\.?`,
    "gi"
  );
}

function quantityFromMeasureMatch(m: RegExpMatchArray): number | null {
  if (m[1] != null && m[2] != null && m[3] != null) {
    return Number(m[1]) + Number(m[2]) / Number(m[3]);
  }
  if (m[4] != null && m[5] != null) {
    return Number(m[4]) / Number(m[5]);
  }
  if (m[6] != null) {
    return Number(m[6]);
  }
  return null;
}

/** Find every qty+unit span on a normalized ingredient line (order = appearance). */
function findMeasures(text: string): MeasureSpan[] {
  const re = measureRegex();
  const out: MeasureSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const quantity = quantityFromMeasureMatch(m);
    const unitRaw = m[7];
    if (quantity == null || !unitRaw || !Number.isFinite(quantity)) {
      if (m[0].length === 0) re.lastIndex++;
      continue;
    }
    out.push({
      quantity,
      unit: canonicalizeUnit(unitRaw),
      index: m.index,
      length: m[0].length,
    });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/**
 * Prefer mass, then metric volume over imperial volume, then a measured
 * amount over a countable package unit; otherwise keep the leading measure.
 */
function preferMeasure(candidates: MeasureSpan[]): MeasureSpan {
  const mass = candidates.filter((c) => unitFamily(c.unit) === "mass");
  if (mass.length) return mass[0];

  const volumes = candidates.filter((c) => unitFamily(c.unit) === "volume");
  const metricVol = volumes.filter((c) => {
    const u = canonicalizeUnit(c.unit);
    return u === "ml" || u === "l";
  });
  const imperialVol = volumes.filter((c) => {
    const u = canonicalizeUnit(c.unit);
    return u !== "ml" && u !== "l";
  });
  if (metricVol.length && imperialVol.length) return metricVol[0];

  const countable = candidates.filter((c) => unitFamily(c.unit) === "countable");
  if (countable.length && volumes.length) return volumes[0];

  return candidates[0];
}

/** Remove measure spans and leftover dual-measure punctuation from the name. */
function stripMeasures(text: string, measures: MeasureSpan[]): string {
  const sorted = [...measures].sort((a, b) => b.index - a.index);
  let result = text;
  for (const m of sorted) {
    result = `${result.slice(0, m.index)} ${result.slice(m.index + m.length)}`;
  }

  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result
      .replace(/\(\s*-\s*/g, "(")
      .replace(/\s*-\s*\)/g, ")")
      .replace(/\(\s*\)/g, " ")
      .replace(/\(\(+/g, "(")
      .replace(/\)\)+/g, ")");
  }

  result = result
    .replace(/\/\s*/g, " ")
    .replace(/(?:^|[\s,;(])-+(?:[\s,;)]|$)/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/^[\s,\-]+|[\s,\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const opens = (result.match(/\(/g) || []).length;
  const closes = (result.match(/\)/g) || []).length;
  if (closes === opens + 1 && result.endsWith(")")) {
    result = result.slice(0, -1).trim();
  }

  return cleanName(result);
}

export function parseIngredientLine(line: string): Ingredient {
  const cleaned = decodeHtmlEntities(line).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { quantity: 0, unit: "", name: "" };
  }

  // to taste (no leading quantity)
  if (/to\s*taste/i.test(cleaned) && !/^\d/.test(cleaned)) {
    const name = stripToTastePhrase(cleaned) || cleaned;
    return withSuggestedKey({ quantity: 0, unit: "to_taste", name });
  }

  // garnish — often appears mid/end of line ("cilantro for garnish", "garnish with dill")
  if (hasGarnishPhrase(cleaned) && !/^\d/.test(cleaned)) {
    const name = stripGarnishPhrase(cleaned) || cleaned;
    return withSuggestedKey({ quantity: 0, unit: "garnish", name });
  }

  let rest = cleaned;
  // Normalize unicode fraction slash (U+2044) and dash-like separators used in mixed numbers
  rest = rest.replace(/\u2044/g, "/").replace(/[\u2012\u2013\u2014\u2212]/g, "-");
  // Collapse thin/narrow/nbsp spaces so "1 1/4" still matches
  rest = rest.replace(/[\u00A0\u2007\u2009\u202F\u2008]/g, " ");

  for (const [char, value] of Object.entries(UNICODE_FRACTIONS)) {
    rest = rest.replace(new RegExp(`(\\d)\\s*${char}`), (_, whole) => `${Number(whole) + value}`);
    rest = rest.replace(char, String(value));
  }

  // Quantity range: 4 to 8 ounces, 4-8 oz (not mixed fractions like 1-1/2)
  const range = rest.match(
    new RegExp(
      `^(\\d+(?:\\.\\d+)?)\\s*(?:to|-)\\s*(\\d+(?:\\.\\d+)?)(?!\\s*\\/)\\s*(?:${SIZE_PATTERN}\\s+)?(?:${UNIT_PATTERN}\\.?)?(?:\\s+(.*))?$`,
      "i"
    )
  );
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    const quantity = Math.min(a, b);
    const quantityMax = Math.max(a, b);
    const result = fromParts(quantity, range[3], range[4], range[5]);
    if (quantityMax !== quantity) result.quantityMax = quantityMax;
    return result;
  }

  // Dual measures on one line: prefer mass, then metric volume (format-agnostic)
  const measures = findMeasures(rest);
  if (measures.length >= 2) {
    const chosen = preferMeasure(measures);
    return finalize({
      quantity: chosen.quantity,
      unit: chosen.unit,
      name: stripMeasures(rest, measures),
    });
  }

  // Parenthetical amount: "1 can (14 oz) tomatoes" or "(8 oz) package cream cheese"
  const paren = rest.match(
    new RegExp(
      `^(?:(\\d+(?:\\.\\d+)?)\\s+)?(?:${SIZE_PATTERN}\\s+)?([\\w\\s]+?)\\s*\\((\\d+(?:\\.\\d+)?)\\s*-?\\s*${UNIT_PATTERN}\\.?\\)\\s*(.*)$`,
      "i"
    )
  );
  if (paren) {
    const outerQty = paren[1] ? Number(paren[1]) : 1;
    const size = parseSize(paren[2]);
    const outerName = paren[3].trim();
    const innerQty = Number(paren[4]);
    const unit = canonicalizeUnit(paren[5]);
    const trailing = cleanName(paren[6] || "");
    // Prefer inner measured amount when it's a mass/volume unit
    const name = cleanName([outerName, trailing].filter(Boolean).join(" "));
    return finalize({
      quantity: innerQty || outerQty,
      unit,
      name: name || outerName,
      size,
    });
  }

  // Mixed number: 1 1/2, 1-1/2, or 1 - 1/2
  const mixed = rest.match(
    new RegExp(
      `^(\\d+)(?:\\s+|\\s*-\\s*)(\\d+)\\/(\\d+)\\s*(?:${SIZE_PATTERN}\\s+)?(?:${UNIT_PATTERN}\\.?)?(?:\\s+(.*))?$`,
      "i"
    )
  );
  if (mixed) {
    const quantity = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    return fromParts(quantity, mixed[4], mixed[5], mixed[6]);
  }

  const frac = rest.match(
    new RegExp(
      `^(\\d+)\\/(\\d+)\\s*(?:${SIZE_PATTERN}\\s+)?(?:${UNIT_PATTERN}\\.?)?(?:\\s+(.*))?$`,
      "i"
    )
  );
  if (frac) {
    const quantity = Number(frac[1]) / Number(frac[2]);
    return fromParts(quantity, frac[3], frac[4], frac[5]);
  }

  // Packed unit: 8oz, 14-oz, 8oz. sugar
  const packed = rest.match(
    new RegExp(
      `^(\\d+(?:\\.\\d+)?)\\s*-?\\s*${UNIT_PATTERN}\\.?\\s*(?:${SIZE_PATTERN}\\s+)?(.*)$`,
      "i"
    )
  );
  if (packed && packed[2]) {
    const sizeInName = parseSize(packed[3]);
    let nameRest = packed[4] || "";
    if (sizeInName && packed[3]) {
      // size was captured between unit and name — already in group 3
    }
    // Also allow "8 oz large eggs" where size follows unit
    const sizeAfter = nameRest.match(new RegExp(`^${SIZE_PATTERN}\\s+(.*)$`, "i"));
    let size = sizeInName;
    if (sizeAfter) {
      size = parseSize(sizeAfter[1]);
      nameRest = sizeAfter[2];
    }
    return finalize({
      quantity: Number(packed[1]),
      unit: canonicalizeUnit(packed[2]),
      name: cleanName(nameRest),
      size,
    });
  }

  const decimal = rest.match(
    new RegExp(
      `^(\\d+(?:\\.\\d+)?)\\s*(?:${SIZE_PATTERN}\\s+)?(?:${UNIT_PATTERN}\\.?)?(?:\\s+(.*))?$`,
      "i"
    )
  );
  if (decimal) {
    return fromParts(Number(decimal[1]), decimal[2], decimal[3], decimal[4]);
  }

  // Bare seasoning unit: "pinch of salt", "a dash of cayenne", "Small pinch of sea salt"
  const bareSeasoning = rest.match(
    new RegExp(
      `^(?:a|an|one)?\\s*(?:${SIZE_PATTERN}\\s+)?${BARE_SEASONING_PATTERN}\\.?\\s+(?:of\\s+)?(.*)$`,
      "i"
    )
  );
  if (bareSeasoning && bareSeasoning[3]?.trim()) {
    return finalize({
      quantity: 1,
      unit: canonicalizeUnit(bareSeasoning[2]),
      name: cleanName(bareSeasoning[3]),
      size: parseSize(bareSeasoning[1]),
    });
  }

  return finalize({ quantity: 0, unit: "", name: cleanName(cleaned) });
}

function parseSize(raw: string | undefined): ProduceSize | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s === "small") return "small";
  if (s === "medium" || s === "med") return "medium";
  if (s === "large") return "large";
  return undefined;
}

function fromParts(
  quantity: number,
  sizeRaw: string | undefined,
  unitRaw: string | undefined,
  nameRaw: string | undefined
): Ingredient {
  const size = parseSize(sizeRaw);
  const unit = unitRaw ? canonicalizeUnit(unitRaw) : "";
  let name = cleanName(nameRaw || "");

  // Size may still be at the start of the name: "1 egg large" is rare; "large" already handled
  if (!size && name) {
    const m = name.match(new RegExp(`^${SIZE_PATTERN}\\s+(.*)$`, "i"));
    if (m) {
      return finalize({
        quantity,
        unit,
        name: cleanName(m[2]),
        size: parseSize(m[1]),
      });
    }
  }

  return finalize({ quantity, unit, name, size });
}

function finalize(ing: {
  quantity: number;
  unit: string;
  name: string;
  size?: ProduceSize;
}): Ingredient {
  let { quantity, unit, name, size } = ing;

  // "6 garlic cloves, smashed…" — produce was captured as unit before clove
  if (unit && PRODUCE_UNIT_SET.has(unit)) {
    const cloveLead = name.match(/^cloves?\b\s*,?\s*(.*)$/i);
    if (cloveLead) {
      const produce = unitLabelForProduce(unit);
      unit = "clove";
      const rest = cleanName(cloveLead[1] || "");
      name = rest ? `${produce}, ${rest}` : produce;
    } else if (!name || name === unit) {
      name = unitLabelForProduce(unit);
      unit = "";
    } else {
      // "2 tomato diced" → tomato belongs in the name, not as a unit
      name = cleanName(`${unitLabelForProduce(unit)} ${name}`);
      unit = "";
    }
  }

  // Strip trailing/mid-line garnish phrases; promote to unit when nothing else measured
  if (hasGarnishPhrase(name) || unit === "garnish") {
    const stripped = stripGarnishPhrase(name);
    if (stripped) name = stripped;
    if (!unit || unit === "garnish") {
      unit = "garnish";
    }
  }

  // "1 tsp salt, to taste" keeps the measure; drop the trailing phrase from the name
  if (/to\s*taste/i.test(name)) {
    name = stripToTastePhrase(name) || name;
  }

  const result: Ingredient = { quantity, unit, name };
  if (size) result.size = size;
  return withDefaultProduceSize(withSuggestedKey(result));
}

/**
 * Pre-fill Measure as… whenever we can infer a catalog base — including exact
 * matches like "water" / "flour" so the select shows the pick for confirmation.
 */
function withSuggestedKey(ing: Ingredient): Ingredient {
  if (!ing.name.trim()) return ing;
  const suggested = inferConversionKey(ing.name);
  if (!suggested) return ing;
  return { ...ing, conversionKey: suggested };
}

/** Counted produce with no size → medium; skip when mass/volume was authored. */
function withDefaultProduceSize(ing: Ingredient): Ingredient {
  const size = defaultProduceSize(ing);
  if (!size) return ing;
  return { ...ing, size };
}

function cleanName(name: string): string {
  return name.replace(/^of\s+/i, "").replace(/\s+/g, " ").trim();
}

/** Prefer spaced produce labels (sweet potato) over underscored canonical units. */
function unitLabelForProduce(unit: string): string {
  return unit.replace(/_/g, " ");
}

export function parseServings(raw: unknown): number {
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw === "string") {
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    if (m) return Number(m[1]);
  }
  if (Array.isArray(raw) && raw.length) return parseServings(raw[0]);
  return 1;
}

/** Decode entities and collapse whitespace in scraped recipe text (steps, notes, …). */
export function cleanRecipeText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/\n|<(?:br|li)[^>]*>/i)
      .map((s) => cleanRecipeText(s))
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return [cleanRecipeText(item)].filter(Boolean);
      if (item && typeof item === "object" && "text" in item) {
        return asStringArray((item as { text: unknown }).text);
      }
      if (item && typeof item === "object" && "itemListElement" in item) {
        return asStringArray((item as { itemListElement: unknown }).itemListElement);
      }
      return [];
    });
  }
  if (typeof value === "object" && value && "itemListElement" in value) {
    return asStringArray((value as { itemListElement: unknown }).itemListElement);
  }
  return [];
}

/** Strip a leading step number marker if present. */
export function stripStepNumber(step: string): string {
  return step.replace(NUMBERED_STEP_PREFIX, "").trim();
}

function alreadyNumbered(step: string): boolean {
  return NUMBERED_STEP_PREFIX.test(step);
}

/** Format steps for an editor textarea: numbered when needed, blank line between. */
export function formatStepsForEditor(steps: string[]): string {
  return steps
    .map((step, i) => {
      const trimmed = cleanRecipeText(step);
      if (!trimmed) return "";
      // Keep an existing leading number, but still decode entities in the body
      if (alreadyNumbered(trimmed)) return trimmed;
      return `${i + 1}. ${trimmed}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Parse editor textarea back to clean step strings (no numbers, no blanks). */
export function parseStepsFromEditor(text: string): string[] {
  return text
    .split("\n")
    .map((line) => stripStepNumber(line))
    .filter(Boolean);
}
