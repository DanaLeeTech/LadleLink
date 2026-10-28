import type { Ingredient, ProduceSize } from "@ladlelink/types";
import {
  canonicalizeUnit,
  defaultProduceSize,
  gramsToMassUnit,
  inferConversionKey,
  massUnitToGrams,
  PRODUCE_UNIT_SET,
  unitFamily,
  unitLabel,
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
const UNIT_BODY = `(?<![a-zA-Z])(?:${UNIT_ALT})(?![a-zA-Z])`;
const UNIT_PATTERN = `(${UNIT_BODY})`;
const SIZE_PATTERN = "(small|medium|med|large)";

/** Seasoning-style countables that often appear without a leading number ("a pinch of salt"). */
const BARE_SEASONING_UNITS =
  "pinch|pinches|dash|dashes|drop|drops|smidgen|smidgens|handful|handfuls|twist|twists|dollop|dollops|knob|knobs";
const BARE_SEASONING_PATTERN = `((?<![a-zA-Z])(?:${BARE_SEASONING_UNITS})(?![a-zA-Z]))`;

const NUMBERED_STEP_PREFIX =
  /^\s*(?:(?:step\s*)?\d+\s*[.):\-–—]\s*(?!\d)|step\s*\d+)/i;

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
  quantityMax?: number;
  unit: string;
  index: number;
  length: number;
};

/** Optional hedge before a quantity (common in parenthetical conversions). */
const QTY_HEDGE = "(?:(?:about|approx\\.?|approximately|~)\\s+)?";

/**
 * Global qty+unit matcher. Named groups: rangeMin/rangeMax, mixed, frac,
 * decimal, unit — a range like "900–1,350 g" strips as one span.
 */
function measureRegex(): RegExp {
  return new RegExp(
    `${QTY_HEDGE}(?:` +
      `(?<rangeMin>\\d+(?:\\.\\d+)?)\\s*(?:-|to)\\s*(?<rangeMax>\\d+(?:\\.\\d+)?)` +
      `|(?<mixedWhole>\\d+)(?:\\s+|\\s*-\\s*)(?<mixedNum>\\d+)/(?<mixedDen>\\d+)` +
      `|(?<fracNum>\\d+)/(?<fracDen>\\d+)` +
      `|(?<decimal>\\d+(?:\\.\\d+)?)` +
      `)\\s*-?\\s*(?<unit>${UNIT_BODY})\\.?`,
    "gi"
  );
}

function quantityFromMeasureMatch(m: RegExpMatchArray): number | null {
  const g = m.groups ?? {};
  if (g.rangeMin != null) return Number(g.rangeMin);
  if (g.mixedWhole != null && g.mixedNum != null && g.mixedDen != null) {
    return Number(g.mixedWhole) + Number(g.mixedNum) / Number(g.mixedDen);
  }
  if (g.fracNum != null && g.fracDen != null) {
    return Number(g.fracNum) / Number(g.fracDen);
  }
  if (g.decimal != null) {
    return Number(g.decimal);
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
    const unitRaw = m.groups?.unit;
    if (quantity == null || !unitRaw || !Number.isFinite(quantity)) {
      if (m[0].length === 0) re.lastIndex++;
      continue;
    }
    out.push({
      quantity,
      quantityMax:
        m.groups?.rangeMax != null ? Number(m.groups.rangeMax) : undefined,
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

/** Notes worth keeping: "400 g each", "heaped", "plus 2 tbsp". */
const EDGE_JUNK = /^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g;

function trimEdges(text: string): string {
  let out = text.replace(EDGE_JUNK, "");
  const count = (s: string, ch: string) => s.split(ch).length - 1;
  while (out.startsWith("(") && count(out, "(") > count(out, ")")) {
    out = out.slice(1).replace(EDGE_JUNK, "");
  }
  while (out.endsWith(")") && count(out, ")") > count(out, "(")) {
    out = out.slice(0, -1).replace(EDGE_JUNK, "");
  }
  // Whole line wrapped in brackets: "(2 cups flour)"
  while (
    out.startsWith("(") &&
    out.endsWith(")") &&
    count(out, "(") === count(out, ")")
  ) {
    out = trimEdges(out.slice(1, -1));
  }
  return out;
}

/**
 * Unit token used by the notes extractors, without the capturing group offset.
 * Captures: 1 = min, 2 = max, 3 = unit, 4 = imperial duplicate's unit.
 */
const EACH_WEIGHT_RE = new RegExp(
  `\\(?\\s*,?\\s*(?:about|approx\\.?|approximately)?\\s*(\\d+(?:\\.\\d+)?)(?:\\s*(?:-|to)\\s*(\\d+(?:\\.\\d+)?))?\\s*${UNIT_PATTERN}\\.?(?:\\s*\\/\\s*\\d+(?:\\.\\d+)?(?:\\s*(?:-|to)\\s*\\d+(?:\\.\\d+)?)?\\s*${UNIT_PATTERN}\\.?)?\\s+(?:each|apiece)\\)?`,
  "i"
);

/** Text from `from` up to the next bracket — the rest of the current group. */
function upToNextBracket(text: string, from: number): string {
  const next = text.slice(from).search(/[()]/);
  return next === -1 ? text.slice(from) : text.slice(from, from + next);
}

/** "(Note 1)" at the end of a line: note text, not part of the ingredient name. */
const TRAILING_PAREN_NOTE_RE = /\(\s*(?:note|notes|see|optional|photo)\b[^)]*\)\s*$/i;

/** "2 x 400g cans" → countable amount with the pack size as a note. */
const PACKED_MULTIPLIER_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}\\.?\\s+`,
  "i"
);

/** "1 (400g) can chickpeas" — a pack size directly after a bare count is a note. */
const LEADING_PACK_BRACKET_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}\\.?\\s*\\)\\s+`,
  "i"
);

/** "heaped tbsp", "level teaspoon" — the modifier moves to the notes. */
const HEAPED_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s+(heaped|heaping|level|rounded|generous|scant)\\s+(?=${UNIT_PATTERN})`,
  "i"
);
/** "2 tbsp (heaped) flour" / "2 tbsp heaped flour" — same modifier after the unit. */
const HEAPED_AFTER_RE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}\\.?\\s*\\(?\\s*(heaped|heaping|level|rounded|generous|scant)\\s*\\)?\\s+`,
  "i"
);

/**
 * Prep/state phrases that start a comma note ("butter, melted, cooled"). Anchored
 * so a name with its own comma ("2 tomatoes, salt and pepper") is never split.
 */
const COMMA_NOTE_START = new RegExp(
  `^(?:(?:lightly|finely|roughly|coarsely|thinly|thickly|very|well|freshly)\\s+)?` +
    "(?:chopped|diced|minced|sliced|grated|shredded|crushed|beaten|whisked|mashed|" +
    "sifted|melted|cooled|warmed|chilled|softened|peeled|seeded|deseeded|drained|" +
    "rinsed|trimmed|halved|quartered|cubed|torn|juiced|zested|cut|deveined|scrubbed|" +
    "pitted|stemmed|hulled|thawed|defrosted|divided|optional|" +
    "room temperature|at room temperature|as needed|if desired|plus more|" +
    "for serving|to serve|to taste)\\b",
  "i"
);

type PreparedLine = {
  text: string;
  notes: string[];
  /** Notes about the leading amount ("minus 2 tbsp") — kept only if it wins. */
  leadNotes: string[];
  leading?: { quantity: number; unit: string };
};

/**
 * Normalize a line before the core parse: measure typography, French units,
 * plus/package amounts and per-item weights become notes instead of noise.
 */
function prepareIngredientLine(cleaned: string): PreparedLine {
  const notes: string[] = [];
  const leadNotes: string[] = [];
  let text = cleaned
    // Unicode fraction slash (U+2044), dash-like separators, thin/nbsp spaces
    .replace(/\u2044/g, "/")
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00A0\u2007\u2009\u202F\u2008]/g, " ")
    // "1,350 g" thousands separator, then "0,5 l" decimal comma
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1")
    .replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")
    // Plus/minus amounts read as a range
    .replace(/\s*(?:±|\+\s*\/\s*-)\s*/g, "-");
  text = trimEdges(text);

  // "about 2 cups stock" — the hedge is a note, not part of the amount
  const hedge = text.match(/^(about|approx\.?|approximately|around|~)\s+(?=\d)/i);
  if (hedge) {
    notes.push(hedge[1]!.toLowerCase().replace(/\.$/, ""));
    text = text.slice(hedge[0].length);
  }

  for (const [char, value] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replace(
      new RegExp(`(\\d)\\s*${char}`),
      (_, whole) => `${Number(whole) + value}`
    );
    // replaceAll: a second standalone "½" in the same line must normalize too
    text = text.replaceAll(char, String(value));
  }
  // Mixed numbers → decimal so ranges like "2 1/2 to 3 cups" parse as one amount
  const toDecimal = (_: string, whole: string, num: string, den: string) =>
    String(Number(whole) + Number(num) / Number(den));
  text = text
    .replace(/(\d+)\s*-\s*(\d+)\/(\d+)/g, toDecimal)
    .replace(/(\d+)\s+and\s+(\d+)\/(\d+)/g, toDecimal)
    .replace(/(\d+)\s+(\d+)\/(\d+)/g, toDecimal);

  // "500 gm" / "500 gms"
  text = text.replace(/(?<![a-zA-Z])gms?(?![a-zA-Z])/gi, "g");
  // French spoon measures
  text = text
    .replace(/\b(?:cuill(?:e|è)res?|c\.?)\s*à\s*soupe(?![a-zA-Z])/gi, "tbsp")
    .replace(/\b(?:cuill(?:e|è)res?|c\.?)\s*à\s*caf(?:é|e)(?![a-zA-Z])/gi, "tsp");
  // Centilitres have no canonical unit; keep the amount in millilitres
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*cl\b/gi, (_, n: string) =>
    `${Number(n.replace(",", ".")) * 10} ml`
  );

  // A per-piece weight only counts after the name ("150-180g each"), never the
  // leading amount ("1/2 tsp each salt and pepper").
  const each = text.match(EACH_WEIGHT_RE);
  const eachAfterName =
    each != null && /[a-zA-Z][^a-zA-Z0-9]{0,2}$/.test(text.slice(0, each.index));
  // Skip only when words sit before the closing bracket and the match did not
  // already close it: "(50 g each w/o shell)" is one note, "(150-180g each) x" a weight.
  const eachGroupText = each
    ? upToNextBracket(text, (each.index ?? 0) + each[0].length)
    : "";
  const eachClosedGroup = each != null && each[0].endsWith(")");
  if (each && eachAfterName && (eachClosedGroup || !/[a-zA-Z]/.test(eachGroupText))) {
    const unit = unitLabel(canonicalizeUnit(each[3] ?? ""));
    const amount = each[2] ? `${each[1]}-${each[2]}` : `${each[1]}`;
    notes.push(`${amount} ${unit} each`.replace(/\s+/g, " ").trim());
    text = text.replace(each[0], " ");
  }
  text = trimEdges(text);

  // "(Note 1)" at the end of the line is a note, not the ingredient name.
  const trailingNote = text.match(TRAILING_PAREN_NOTE_RE);
  if (trailingNote) {
    notes.push(cleanNotes(trailingNote[0].replace(/^\(\s*|\s*\)$/g, "")));
    text = text.slice(0, trailingNote.index).trim();
  }

  // "1/2 tsp each salt and pepper" — a bare "each" is a note on the measure
  const leading = findMeasures(text)[0];
  if (leading && leading.index === 0) {
    const after = text.slice(leading.length);
    const plainEach = after.match(/^\s*each\b/i);
    if (plainEach) {
      notes.push("each");
      text = `${text.slice(0, leading.length)}${after.slice(plainEach[0].length)}`;
    }
  }

  const leadPack = text.match(LEADING_PACK_BRACKET_RE);
  if (leadPack) {
    const unit = unitLabel(canonicalizeUnit(leadPack[3] ?? ""));
    notes.push(`${leadPack[2]} ${unit}`.replace(/\s+/g, " ").trim());
    text = text.replace(leadPack[0], `${leadPack[1]} `);
  }

  const packed = text.match(PACKED_MULTIPLIER_RE);
  if (packed) {
    const unit = unitLabel(canonicalizeUnit(packed[3] ?? ""));
    notes.push(`${packed[2]} ${unit} each`.replace(/\s+/g, " ").trim());
    text = text.replace(packed[0], `${packed[1]} `);
  }

  const heaped = text.match(HEAPED_RE);
  if (heaped) {
    notes.push(heaped[2]!.toLowerCase());
    text = text.replace(HEAPED_RE, `${heaped[1]} `);
  }

  const heapedAfter = text.match(HEAPED_AFTER_RE);
  if (heapedAfter) {
    notes.push(heapedAfter[3]!.toLowerCase());
    text = text.replace(HEAPED_AFTER_RE, `${heapedAfter[1]} ${heapedAfter[2]} `);
  }

  // "2 cups plus 2 tbsp flour" / "2 cups minus 2 tbsp" — second amount is a note
  const extraAmount = text.match(/\s+(plus|\+|minus)\s+(.+)$/i);
  if (extraAmount) {
    const extra = findMeasures(extraAmount[2]!)[0];
    if (extra) {
      const raw = extraAmount[2]!.slice(extra.index, extra.index + extra.length).trim();
      const word = extraAmount[1]!.toLowerCase() === "minus" ? "minus" : "plus";
      leadNotes.push(`${word} ${raw}`);
      const tail = extraAmount[2]!.slice(extra.index + extra.length);
      text = `${text.slice(0, extraAmount.index)} ${tail}`;
    }
  }

  text = moveBracketNotes(text, notes, isCountLine(text));
  // Last, so a comma inside a bracket never splits the name
  text = moveCommaNote(text, notes);

  const finalText = trimEdges(text.replace(/\s+/g, " "));
  const leadingMeasure = findMeasures(finalText)[0];
  return {
    text: finalText,
    notes,
    leadNotes,
    leading: leadingMeasure
      ? { quantity: leadingMeasure.quantity, unit: leadingMeasure.unit }
      : undefined,
  };
}

function cleanNotes(note: string): string {
  let out = note;
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/\(\s*\)/g, " ")
      .replace(/\(\s*[,;:]+/g, "(")
      .replace(/[,;:]+\s*\)/g, ")")
      .replace(/\(\(+/g, "(")
      .replace(/\)\)+/g, ")")
      .replace(/^[\s,;:()\[\]\-–—]+|[\s,;:()\[\]\-–—]+$/g, "");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** RecipeTin writes extras as "(, note)" — the leading comma marks a note group. */
const NOTE_GROUP_RE = /^\s*[,;]/;

/** "0.5 inch thick" — a dimension is a note too, though it is not a cooking unit. */
const DIMENSION_RE = /\d+(?:\.\d+)?\s*-?\s*(?:inch(?:es)?|in\.|cm|mm|["”])/gi;

/** Bracket text left once the amounts in it are taken out. */
function bracketExtras(content: string): string {
  let out = content;
  for (const measure of [...findMeasures(content)].sort((a, b) => b.index - a.index)) {
    out = `${out.slice(0, measure.index)} ${out.slice(measure.index + measure.length)}`;
  }
  return out.replace(DIMENSION_RE, " ").replace(/[^a-zA-Z]+/g, " ").trim();
}

/** True when the bracket text holds a cooking measure or a dimension. */
function hasAmount(content: string): boolean {
  return findMeasures(content).length > 0 || content.match(DIMENSION_RE) != null;
}

/** True when a bracket holds an amount and nothing else ("281g", "about 4 cups"). */
function isAmountOnlyBracket(content: string): boolean {
  return hasAmount(content) && !bracketExtras(content);
}

/** "0.5 inch thick", "100 g, per piece; 1 - 2 pieces" — a measure plus extra words. */
function isMeasuredNoteBracket(content: string): boolean {
  return hasAmount(content) && bracketExtras(content).length > 0;
}

/**
 * A count of things ("2 boneless pork chops", "2 overripe bananas"): the word
 * after the number is not a unit, so bracketed amounts describe the items and
 * are facts, not alternative amounts.
 */
function isCountLine(text: string): boolean {
  const head = text.match(/^\d+(?:\.\d+)?\s+[a-zA-Z]+/);
  return head != null && findMeasures(head[0]).length === 0;
}

/**
 * Flatten one bracket group of a count line into a single note: a dual
 * same-family amount reads "100 g / 3.5 oz", nested ";" separators become ", ",
 * and an amount already noted ("0.5 inch" after "0.5 inch thick") is dropped.
 */
function flattenCountNote(content: string, notes: string[]): string {
  const items: { text: string; family: string | null }[] = [];
  for (const fragment of content.replace(/[()]/g, ",").split(/\s*[,;]\s*/)) {
    const text = fragment.trim();
    if (!text || (hasAmount(text) && notes.some((n) => n.includes(text)))) continue;
    const measure = findMeasures(text)[0];
    const family = measure ? unitFamily(measure.unit) : null;
    const prev = items[items.length - 1];
    if (prev && family && family === prev.family) prev.text += ` / ${text}`;
    else items.push({ text, family });
  }
  return items.map((item) => item.text).join(", ");
}

/**
 * Move bracket groups that are notes into `notes`, flattening nested brackets
 * into one note. Amount-only brackets ("(281g)") and other text such as
 * "(warm)" stay in place: the dual-measure and parenthetical rules in
 * parseIngredientCore need them. On a count line ("2 boneless pork chops") every
 * bracket with an amount is a note about the items.
 * shortcut: only a leading comma/colon, a comma before the group, or a measure
 * plus extra words makes a note group; widen this if more sites need it.
 */
function moveBracketNotes(text: string, notes: string[], countLine = false): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("(", i);
    if (open === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, open);
    let depth = 0;
    let close = -1;
    for (let j = open; j < text.length; j += 1) {
      if (text[j] === "(") depth += 1;
      else if (text[j] === ")" && --depth === 0) {
        close = j;
        break;
      }
    }
    // Unbalanced bracket: leave the rest for cleanName to trim
    if (close === -1) {
      out += text.slice(open);
      break;
    }
    const content = text.slice(open + 1, close);
    // "(- 118 milliliters - note)" is the conversion style: core rules own those
    const conversionGroup = /^\s*-/.test(content);
    // Nested brackets are the "((warm) - 118 ml)" conversion style too
    const noteGroup =
      !conversionGroup &&
      ((countLine && hasAmount(content)) ||
        NOTE_GROUP_RE.test(content) ||
        (isMeasuredNoteBracket(content) && !content.includes("(")) ||
        (/,\s*$/.test(out) && !isAmountOnlyBracket(content)));
    if (noteGroup) {
      // Nested groups on a count line were flattened, so their own separators are gone
      const note =
        countLine && content.includes("(")
          ? flattenCountNote(content, notes)
          : cleanNotes(content.replace(/[()]/g, ", ").replace(/\s*,\s*/g, ", "));
      if (note) notes.push(note);
      out += " ";
    } else {
      out += text.slice(open, close + 1);
    }
    i = close + 1;
  }
  return out;
}

/**
 * Everything after the first comma outside brackets is a note when it starts with
 * a prep/state phrase: "50 g butter, melted, cooled". The whole tail stays one
 * note, and a segment already held by a bracket note ("(, finely chopped)") is
 * dropped. A tail that is only a garnish phrase stays for the garnish branch.
 */
function moveCommaNote(text: string, notes: string[]): string {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth = Math.max(0, depth - 1);
    else if (text[i] === "," && depth === 0) {
      at = i;
      break;
    }
  }
  if (at === -1) return text;
  const head = text.slice(0, at);
  const tail = text.slice(at + 1).trim();
  const garnishOnly = hasGarnishPhrase(tail) && !stripGarnishPhrase(tail);
  if (garnishOnly || !COMMA_NOTE_START.test(tail)) return text;

  const segments = tail
    .replace(/[()]/g, ", ")
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !notes.some((note) => note.includes(segment)));
  const note = cleanNotes(segments.join(", "));
  if (note) notes.push(note);
  return trimEdges(head);
}

export function parseIngredientLine(line: string): Ingredient {
  const cleaned = decodeHtmlEntities(line).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { quantity: 0, unit: "", name: "" };
  }

  const prep = prepareIngredientLine(cleaned);
  if (!prep.text.trim()) {
    const empty: Ingredient = { quantity: 0, unit: "", name: "" };
    const note = cleanNotes([...prep.notes, ...prep.leadNotes].join(", "));
    return note ? { ...empty, notes: note } : empty;
  }

  const ing = parseIngredientCore(prep.text);
  // "minus 2 tbsp" only describes the leading amount: drop it when a bracketed
  // weight ("(8 ½ ounces)") wins the dual-measure rule instead.
  const leadingWon =
    prep.leading != null &&
    prep.leading.unit === ing.unit &&
    Math.abs(prep.leading.quantity - ing.quantity) < 1e-9;
  const allNotes = cleanNotes(
    [...prep.notes, ...(leadingWon ? prep.leadNotes : []), ing.notes]
      .filter(Boolean)
      .join(", ")
  );
  return allNotes ? { ...ing, notes: allNotes } : ing;
}

function parseIngredientCore(cleaned: string): Ingredient {
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

  // Combined mass: "1 lb 4 oz", "1 kg 200 g"
  const combined = rest.match(
    new RegExp(
      `^(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}\\.?\\s+(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}\\.?(?:\\s+(.*))?$`,
      "i"
    )
  );
  if (combined) {
    const big = canonicalizeUnit(combined[2]!);
    const small = canonicalizeUnit(combined[4]!);
    const bigGrams = massUnitToGrams(1, big);
    const smallGrams = massUnitToGrams(1, small);
    if (bigGrams != null && smallGrams != null && bigGrams > smallGrams) {
      const grams = Number(combined[1]) * bigGrams + Number(combined[3]) * smallGrams;
      const quantity = gramsToMassUnit(grams, big);
      if (quantity != null) {
        return fromParts(Math.round(quantity * 1e4) / 1e4, undefined, big, combined[5]);
      }
    }
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
    const dual = finalize({
      quantity: chosen.quantity,
      unit: chosen.unit,
      name: stripMeasures(rest, measures),
    });
    if (chosen.quantityMax != null) dual.quantityMax = chosen.quantityMax;
    return dual;
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

  // "2 overripe medium bananas" — a size word inside a counted name is the size,
  // not part of the name; a trailing size ("1 egg large") is left alone
  if (!size && unitFamily(unit) === "countable") {
    const m = name.match(new RegExp(`^(.+?)\\s+${SIZE_PATTERN}\\s+(.+)$`, "i"));
    if (m) {
      return finalize({
        quantity,
        unit,
        name: cleanName(`${m[1]} ${m[3]}`),
        size: parseSize(m[2]),
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
 * French ingredient words → English, for conversion-key inference only.
 * The displayed name stays exactly as written.
 */
const FRENCH_INFER_WORDS: Record<string, string> = {
  farine: "flour",
  sucre: "sugar",
  lait: "milk",
  beurre: "butter",
  oeuf: "egg",
  oeufs: "eggs",
  // "œ" (U+0153) has no NFD decomposition, so the ligature needs its own keys
  "œuf": "egg",
  "œufs": "eggs",
  pomme: "apple",
  pommes: "apples",
};

function frenchInferName(name: string): string {
  return name.replace(/[\p{L}'’-]+/gu, (word) => {
    const key = word
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return FRENCH_INFER_WORDS[key] ?? word;
  });
}

/**
 * Pre-fill Measure as… whenever we can infer a catalog base — including exact
 * matches like "water" / "flour" so the select shows the pick for confirmation.
 */
function withSuggestedKey(ing: Ingredient): Ingredient {
  if (!ing.name.trim()) return ing;
  const suggested =
    inferConversionKey(ing.name) || inferConversionKey(frenchInferName(ing.name));
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
  let out = name;
  let prev = "";
  while (prev !== out) {
    prev = out;
    // Leading French article ("150g de farine", "2 c. à soupe d'huile")
    out = trimEdges(
      out
        .replace(/^of\s+/i, "")
        .replace(/^(?:de|du|des)\s+/i, "")
        .replace(/^d['’]\s*/i, "")
        .replace(/\(\s*\)/g, " ")
        .replace(/\(\s*[,;:]+/g, "(")
        .replace(/[,;:]+\s*\)/g, ")")
        .replace(/\(\(+/g, "(")
        .replace(/\)\)+/g, ")")
    );
  }
  return out.replace(/\s+/g, " ").trim();
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

/** Drop Markdown emphasis markers: "**Scones**" → "Scones". */
export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/___(.+?)___/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1$2")
    // A lone marker left at an edge (a bullet-stripped "**Scones**")
    .replace(/^[*_]+|[*_]+$/g, "");
}

/**
 * Shared title cleanup for scraped and pasted recipes: Markdown emphasis and a
 * trailing " | Site name", keeping any earlier segments ("A | B | Site" → "A | B").
 */
export function cleanRecipeTitle(title: string): string {
  const plain = stripMarkdownEmphasis(title);
  const parts = plain.split("|");
  if (parts.length < 2) return plain.trim();
  parts.pop();
  return parts.join("|").trim() || plain.trim();
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
