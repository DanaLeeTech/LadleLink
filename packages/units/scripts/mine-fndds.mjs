/**
 * Mine USDA FNDDS Portions and Weights → density + piece-weight TypeScript tables.
 * Run: node scripts/mine-fndds.mjs
 */
import XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "../data");
const outDir = join(__dirname, "../src/generated");

const ML = { cup: 240, tablespoon: 14.78676478125, teaspoon: 4.92892159375 };

function slug(name) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/,/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function kindFor(name) {
  const n = name.toLowerCase();
  if (
    /milk|cream|oil|juice|sauce|syrup|honey|broth|stock|soup|yogurt|yoghurt|wine|vinegar|water|beverage|drink|beer|coffee|tea\b|smoothie|puree|purée|dressing|gravy/.test(
      n
    )
  ) {
    return "wet";
  }
  if (
    /flour|sugar|salt|rice|oat|bean|lentil|pea|powder|grain|cornmeal|starch|seed|nut|crumb|cocoa|spice|herb|cheese|butter|margarine/.test(
      n
    )
  ) {
    return "dry";
  }
  return "other";
}

function parseVolume(portion) {
  const p = portion.toLowerCase().trim();
  let m = p.match(/^(\d+(?:\.\d+)?)\s+cup\b/);
  if (m) return { ml: Number(m[1]) * ML.cup, kind: "cup" };
  m = p.match(/^(\d+(?:\.\d+)?)\s+tablespoon/);
  if (m) return { ml: Number(m[1]) * ML.tablespoon, kind: "tbsp" };
  m = p.match(/^(\d+(?:\.\d+)?)\s+teaspoon/);
  if (m) return { ml: Number(m[1]) * ML.teaspoon, kind: "tsp" };
  if (p === "1 cup" || p.startsWith("1 cup ")) return { ml: ML.cup, kind: "cup" };
  return null;
}

function parsePiece(portion) {
  const p = portion.toLowerCase().trim();
  if (/quantity not specified|nlea|guideline|fl oz|ounce|gram|\bg\b|ml\b|liter|package|can,|bottle|container|guideline amount/.test(p)) {
    return null;
  }
  let size = "medium";
  if (/\bsmall\b/.test(p)) size = "small";
  else if (/\blarge\b|\bextra large\b|\bextra-large\b/.test(p)) size = "large";

  const unitHints = [];
  if (/\bclove\b/.test(p)) unitHints.push("clove");
  if (/\bstick\b/.test(p)) unitHints.push("stick");
  if (/\bslice\b/.test(p)) unitHints.push("slice");
  if (/\bstalk\b|\brib\b/.test(p)) unitHints.push("stalk");
  if (/\bspear\b/.test(p)) unitHints.push("spear");
  if (/\bsprig\b/.test(p)) unitHints.push("sprig");
  if (/\bbunch\b/.test(p)) unitHints.push("bunch");
  if (/\bfillet\b|\bfilet\b/.test(p)) unitHints.push("fillet");
  if (/\bleaf\b|\bleaves\b/.test(p)) unitHints.push("leaf");
  if (/\bhead\b/.test(p)) unitHints.push("head");
  if (/\bbulb\b/.test(p)) unitHints.push("bulb");
  if (/\bear\b|\bcob\b/.test(p)) unitHints.push("ear");
  if (/\bfloret\b/.test(p)) unitHints.push("floret");
  if (/\brasher\b/.test(p)) unitHints.push("rasher");
  if (/\bpiece\b|\bfruit\b|\bvegetable\b|\begg\b|\blink\b|\bpatty\b|\bbreast\b|\bthigh\b|\bdrumstick\b/.test(p) || unitHints.length) {
    return { size, unitHints };
  }
  // "1 medium", "1 large banana-shaped", "NLEA serving" already filtered
  if (/^1\s+(small|medium|large)\b/.test(p)) return { size, unitHints };
  if (/^1\s/.test(p) && !/cup|tablespoon|teaspoon|oz|gram|ml|liter|packet|bag|box/.test(p)) {
    return { size, unitHints };
  }
  return null;
}

function aliasFromDescription(desc) {
  const base = desc.toLowerCase().split(",")[0].trim();
  const aliases = new Set([base]);
  // also full description without parentheticals
  aliases.add(
    desc
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
  return [...aliases].filter((a) => a.length > 1 && a.length < 60);
}

const wb = XLSX.readFile(join(dataDir, "portions.xlsx"));
const sheet = wb.Sheets["Portions and Weights"];
const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
// Find header row
let headerIdx = 0;
for (let i = 0; i < 10; i++) {
  if (String(raw[i]?.[0]).toLowerCase().includes("food code")) {
    headerIdx = i;
    break;
  }
}
const rows = raw.slice(headerIdx + 1).map((r) => ({
  code: r[0],
  desc: String(r[1] || "").trim(),
  portion: String(r[5] || "").trim(),
  grams: Number(r[6]),
}));

/** @type {Map<string, { key: string, aliases: Set<string>, densityGPerMl: number, kind: string, samples: number }>} */
const densities = new Map();
/** @type {Map<string, { key: string, aliases: Set<string>, units: Set<string>, grams: { small?: number, medium?: number, large?: number } }>} */
const pieces = new Map();

for (const row of rows) {
  if (!row.desc || !Number.isFinite(row.grams) || row.grams <= 0) continue;
  const vol = parseVolume(row.portion);
  if (vol && vol.ml > 0) {
    const density = row.grams / vol.ml;
    if (density < 0.05 || density > 3.5) continue; // reject nonsense
    const key = slug(row.desc.split(",")[0]);
    if (!key) continue;
    const existing = densities.get(key);
    // Prefer cup measurements over tbsp/tsp for density
    const score = vol.kind === "cup" ? 3 : vol.kind === "tbsp" ? 2 : 1;
    if (!existing || score > (existing._score || 0)) {
      densities.set(key, {
        key,
        aliases: new Set(aliasFromDescription(row.desc)),
        densityGPerMl: Math.round(density * 10000) / 10000,
        kind: kindFor(row.desc),
        _score: score,
        samples: 1,
      });
    } else if (score === (existing._score || 0)) {
      // average
      existing.densityGPerMl =
        Math.round(((existing.densityGPerMl * existing.samples + density) / (existing.samples + 1)) * 10000) /
        10000;
      existing.samples++;
      for (const a of aliasFromDescription(row.desc)) existing.aliases.add(a);
    }
    continue;
  }

  const piece = parsePiece(row.portion);
  if (!piece) continue;
  const keyBase = slug(row.desc.split(",")[0]);
  if (!keyBase) continue;
  let key = keyBase;
  if (piece.unitHints.includes("clove")) key = `${keyBase}_clove`;
  if (piece.unitHints.includes("stick") && /butter|margarine/.test(row.desc.toLowerCase())) {
    key = "butter_stick";
  }
  let entry = pieces.get(key);
  if (!entry) {
    entry = {
      key,
      aliases: new Set(aliasFromDescription(row.desc)),
      units: new Set(piece.unitHints),
      hasUngated: piece.unitHints.length === 0,
      grams: {},
    };
    pieces.set(key, entry);
  }
  for (const a of aliasFromDescription(row.desc)) entry.aliases.add(a);
  if (piece.unitHints.length === 0) {
    // Whole fruit/piece rows unlock name-only lookup (ignore slice/stick gates).
    entry.hasUngated = true;
  } else if (!entry.hasUngated) {
    for (const u of piece.unitHints) entry.units.add(u);
  }
  const g = Math.round(row.grams * 10) / 10;
  // Prefer medium whole-item weights; average same size
  if (entry.grams[piece.size] == null) entry.grams[piece.size] = g;
  else entry.grams[piece.size] = Math.round(((entry.grams[piece.size] + g) / 2) * 10) / 10;
}

// Fill missing S/M/L
for (const entry of pieces.values()) {
  const m =
    entry.grams.medium ??
    entry.grams.large ??
    entry.grams.small ??
    null;
  if (m == null) {
    pieces.delete(entry.key);
    continue;
  }
  if (entry.grams.medium == null) entry.grams.medium = m;
  if (entry.grams.small == null) entry.grams.small = Math.round(m * 0.75 * 10) / 10;
  if (entry.grams.large == null) entry.grams.large = Math.round(m * 1.25 * 10) / 10;
}

// Seed critical specials if missing
const seeds = [
  {
    key: "banana",
    aliases: ["banana", "bananas"],
    units: [],
    grams: { small: 101, medium: 118, large: 136 },
  },
  {
    key: "egg",
    aliases: ["egg", "eggs"],
    units: [],
    grams: { small: 40, medium: 50, large: 60 },
  },
  {
    key: "garlic_clove",
    aliases: ["garlic"],
    units: ["clove"],
    grams: { small: 2, medium: 3, large: 5 },
  },
  {
    key: "butter_stick",
    aliases: ["butter", "unsalted butter", "salted butter"],
    units: ["stick"],
    grams: { small: 113, medium: 113, large: 113 },
  },
];
// Always overwrite critical culinary specials (USDA portion noise is unreliable here).
for (const s of seeds) {
  pieces.set(s.key, {
    key: s.key,
    aliases: new Set(s.aliases),
    units: new Set(s.units),
    hasUngated: s.units.length === 0,
    grams: s.grams,
  });
}

mkdirSync(outDir, { recursive: true });

const densityEntries = [...densities.values()]
  .filter((d) => d.aliases.size)
  .sort((a, b) => a.key.localeCompare(b.key));

const pieceEntries = [...pieces.values()]
  .filter((p) => p.aliases.size && p.grams.medium > 0)
  .map((p) => ({
    ...p,
    // Emit no unit gate when any ungated whole-item portion was seen.
    units: p.hasUngated ? new Set() : p.units,
  }))
  .sort((a, b) => a.key.localeCompare(b.key));

const densityTs = `/* Auto-generated from USDA FNDDS 2021-2023 Portions and Weights — do not edit by hand. */
import type { IngredientKind } from "@ladlelink/types";

export interface GeneratedDensityEntry {
  key: string;
  aliases: string[];
  densityGPerMl: number;
  kind: IngredientKind;
}

export const GENERATED_DENSITY_TABLE: GeneratedDensityEntry[] = [
${densityEntries
  .map(
    (d) =>
      `  { key: ${JSON.stringify(d.key)}, aliases: ${JSON.stringify([...d.aliases].slice(0, 8))}, densityGPerMl: ${d.densityGPerMl}, kind: ${JSON.stringify(d.kind)} },`
  )
  .join("\n")}
];
`;

const pieceTs = `/* Auto-generated from USDA FNDDS 2021-2023 Portions and Weights — do not edit by hand. */
export interface PieceWeightEntry {
  key: string;
  aliases: string[];
  units?: string[];
  grams: { small: number; medium: number; large: number };
}

export const GENERATED_PIECE_WEIGHTS: PieceWeightEntry[] = [
${pieceEntries
  .map((p) => {
    const units = [...p.units];
    return `  { key: ${JSON.stringify(p.key)}, aliases: ${JSON.stringify([...p.aliases].slice(0, 10))},${
      units.length ? ` units: ${JSON.stringify(units)},` : ""
    } grams: { small: ${p.grams.small}, medium: ${p.grams.medium}, large: ${p.grams.large} } },`;
  })
  .join("\n")}
];
`;

writeFileSync(join(outDir, "density.generated.ts"), densityTs);
writeFileSync(join(outDir, "piece-weights.generated.ts"), pieceTs);

console.log(`Wrote ${densityEntries.length} densities, ${pieceEntries.length} piece weights`);
