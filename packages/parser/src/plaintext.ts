import type { ParsedRecipe } from "@ladlelink/types";
import {
  cleanRecipeText,
  parseIngredientLine,
  parseServings,
  stripStepNumber,
} from "./ingredient-line.js";

/** "Ingredients", "Ingredients:", "Ingredients List", etc. */
const INGREDIENTS_HEADER = /^ingredients?(?:\s+list)?\b[:\s\-–—]*$/i;
/** "Instructions", "Method:", "Directions", "Steps", etc. */
const STEPS_HEADER = /^(instructions?|directions?|method|steps?)\b[:\s\-–—]*$/i;
const METADATA_LINE =
  /^(prep(?:\s*time)?|bake(?:\s*time)?|cook(?:\s*time)?|total(?:\s*time)?|temperature|temp|servings?|serves|yield|makes)\b/i;
const SERVINGS_LINE = /^(servings?|serves|yield|makes)\b/i;
/** Common bullets plus frequent emoji used as list markers in social captions. */
const BULLET_PREFIX = /^\s*(?:[-*•●◦▪▫✅✔☑☐🥣🥄🧂🍪]|[\u{1F300}-\u{1F9FF}])\s*/u;

const LEADING_QTY =
  /^(?:\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\b/;

const IG_CHROME =
  /^(?:liked by|view (?:all )?(?:\d+ )?comments?|what do you think(?: of this)?\??|add a comment(?:\.\.\.)?|suggested for you|sponsored|follow|following|message|share|save|send|reel|reels|posts?|tagged|original audio|see translation|view replies?|hours? ago|minutes? ago|days? ago|just now|\d+\s*(?:h|m|d|w)$)/i;

const HASHTAG_OR_HANDLE_LINE =
  /^(?:#\w[\w.]*|\@\w[\w.]*)(?:\s+(?:#\w[\w.]*|\@\w[\w.]*))*$/;
const URL_LINE = /^https?:\/\/\S+$/i;
const PRICING_CHATTER =
  /^(?:that's just|thats just|only\s+\$|approx\.?\s+\$|\$[\d.]+(?:\s*each)?|[\d.]+\s*c(?:ents?)?\s+each)\b/i;

/** Units that often appear after a quantity in ingredient lines (OCR-friendly). */
const UNIT_WORD =
  /\b(?:cups?|tbsps?|tbsp|tsps?|tsp|tablespoons?|teaspoons?|tins?|cans?|jars?|packets?|packages?|oz|ounces?|lbs?|pounds?|kg|g|ml|l|grams?|kilograms?|millilitres?|milliliters?|pints?|quarts?|cloves?|slices?|pinches?)\b/i;

/**
 * Repair common OCR mistakes on recipe lines (½→%, glued units).
 */
export function repairOcrLine(line: string): string {
  let s = line;
  // Unicode ½ / ¼ often become % / 4% in phone screenshots
  s = s.replace(/^%\s+/g, "1/2 ");
  s = s.replace(/(?<=^|\s)%\s+(?=[A-Za-z])/g, "1/2 ");
  s = s.replace(/\b4%\s+/g, "1/4 ");
  s = s.replace(/\b3%\s+/g, "3/4 ");
  s = s.replace(/\b2%\s+/g, "1/2 ");
  s = s.replace(/\b8%\s+/g, "1/8 ");
  // "1tin" / "2cups" → "1 tin" / "2 cups"
  s = s.replace(
    /(\d)(tins?|cups?|tbsp|tbsps?|tsp|tsps?|cans?|jars?|packets?|packages?|oz|lbs?|kg|mg|ml)\b/gi,
    "$1 $2"
  );
  // "1in condensed milk" — OCR dropped the "t" from "tin"
  s = s.replace(
    /(\d)\s*in\s+(condensed|evaporated|coconut|tomato|soup|beans|chickpeas|tuna)\b/gi,
    "$1 tin $2"
  );
  return s;
}

function normalizeLine(raw: string): string {
  return cleanRecipeText(repairOcrLine(raw.replace(BULLET_PREFIX, "")));
}

function isBlank(line: string): boolean {
  return !line.trim();
}

/** True for status-bar clocks and other weak title candidates. */
export function isWeakTitleCandidate(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^\d{1,2}:\d{2}\b/.test(t)) return true;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 3) return true;
  if (/^[^A-Za-z0-9]*$/.test(t)) return true;
  // Need at least one real word (filters OCR crumbs like "Rs A")
  if (!/\b[A-Za-z]{3,}\b/.test(t)) return true;
  return false;
}

/** Drop hashtags, @handles, URLs, IG chrome, pricing chatter, OCR junk. */
export function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (HASHTAG_OR_HANDLE_LINE.test(t)) return true;
  if (URL_LINE.test(t)) return true;
  if (IG_CHROME.test(t)) return true;
  if (PRICING_CHATTER.test(t)) return true;
  if (/^\d{1,2}:\d{2}\b/.test(t)) return true;
  if (/^#[\w.\s#]+$/.test(t) && t.includes("#")) return true;
  // Lone Instagram-style username
  if (/^[a-z0-9._]{3,30}$/i.test(t) && !LEADING_QTY.test(t)) {
    if (!/\b(?:cup|tsp|tbsp|ball|balls|mix|bake|recipe|flour|milk|egg|oat|oats)\b/i.test(t)) {
      return true;
    }
  }
  if (isLowQualityOcrJunk(t)) return true;
  return false;
}

function isLowQualityOcrJunk(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return true;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters === 0) return true;
  if (letters / t.length < 0.4 && !UNIT_WORD.test(t) && !LEADING_QTY.test(t)) return true;
  // Short lines with UI/OCR symbols and no measure
  if (
    t.length < 28 &&
    /[#\[\]|¥©®]/.test(t) &&
    !looksLikeIngredientLine(t) &&
    !UNIT_WORD.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * True when a line looks like an ingredient (qty/unit parsed, or leading measure).
 */
export function looksLikeIngredientLine(line: string): boolean {
  const t = line.trim();
  if (!t || METADATA_LINE.test(t)) return false;
  if (INGREDIENTS_HEADER.test(t) || STEPS_HEADER.test(t)) return false;
  // Avoid recursion via isNoiseLine → isLowQualityOcrJunk → looksLikeIngredientLine
  if (HASHTAG_OR_HANDLE_LINE.test(t) || URL_LINE.test(t) || IG_CHROME.test(t)) return false;

  const parsed = parseIngredientLine(t);
  const wordCount = t.split(/\s+/).length;
  if (parsed.quantity > 0 || (parsed.unit && parsed.unit.length > 0)) {
    // Bare number + long marketing prose is a caption title, not an ingredient
    // e.g. "28 Milo Weet-Bix Balls for LESS than $5!"
    if (!parsed.unit) {
      if (wordCount > 8) return false;
      if (/[!?]/.test(t)) return false;
      if (/\b(?:for less|recipe|lunchbox|ingredients?|perfect for)\b/i.test(t)) {
        return false;
      }
    }
    if (wordCount > 14 && !parsed.unit) return false;
    return parsed.name.trim().length > 0;
  }

  if (LEADING_QTY.test(t) && parsed.name.trim().length > 0) {
    if (/[!?]/.test(t) || wordCount > 8) return false;
    return true;
  }

  // OCR-damaged qty but clear unit + short name ("cup desiccated coconut")
  if (UNIT_WORD.test(t) && t.split(/\s+/).length <= 10 && !/^(mix|stir|bake|roll|cook|add)\b/i.test(t)) {
    return true;
  }

  return false;
}

function isNumberedStep(line: string): boolean {
  return /^\d+\s*[.):\-]\s+\S/.test(line);
}

function findServingsRaw(lines: string[]): string | undefined {
  for (const line of lines) {
    if (SERVINGS_LINE.test(line) && !PRICING_CHATTER.test(line)) return line;
  }
  return undefined;
}

function coalesceStepLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (
      out.length &&
      /^[a-z]/.test(line) &&
      !looksLikeIngredientLine(line) &&
      !isNumberedStep(line) &&
      !STEPS_HEADER.test(line)
    ) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * Split body lines into ingredients then steps when there is no Steps header.
 */
function splitIngredientsAndSteps(body: string[]): {
  ingredientLines: string[];
  stepLines: string[];
} {
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];
  let inSteps = false;

  for (const line of body) {
    if (isBlank(line) || INGREDIENTS_HEADER.test(line)) continue;
    if (isNoiseLine(line)) continue;
    if (METADATA_LINE.test(line) && SERVINGS_LINE.test(line)) continue;
    if (METADATA_LINE.test(line) && !looksLikeIngredientLine(line)) {
      if (!inSteps) continue;
    }

    if (!inSteps) {
      if (STEPS_HEADER.test(line)) {
        inSteps = true;
        continue;
      }
      if (isNumberedStep(line) || (!looksLikeIngredientLine(line) && ingredientLines.length > 0)) {
        inSteps = true;
        stepLines.push(line);
        continue;
      }
      if (looksLikeIngredientLine(line)) {
        ingredientLines.push(line);
        continue;
      }
      if (ingredientLines.length === 0) continue;
      inSteps = true;
      stepLines.push(line);
      continue;
    }

    if (STEPS_HEADER.test(line)) continue;
    if (METADATA_LINE.test(line) && SERVINGS_LINE.test(line)) continue;
    if (isNoiseLine(line)) continue;
    stepLines.push(line);
  }

  return { ingredientLines, stepLines: coalesceStepLines(stepLines) };
}

/**
 * Parse a pasted plain-text recipe into a ParsedRecipe.
 * Supports structured headers and social-caption styles (loose headers,
 * freeform method, hashtags / chrome noise, common OCR repairs).
 */
export function parseRecipeText(text: string): ParsedRecipe {
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = rawLines.map(normalizeLine);

  let ingredientsIdx = -1;
  let stepsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ingredientsIdx < 0 && INGREDIENTS_HEADER.test(line)) {
      ingredientsIdx = i;
      continue;
    }
    if (ingredientsIdx >= 0 && stepsIdx < 0 && STEPS_HEADER.test(line)) {
      stepsIdx = i;
      break;
    }
  }

  const noteLines: string[] = [];
  let title = "";

  const preambleEnd = ingredientsIdx >= 0 ? ingredientsIdx : -1;
  const preamble =
    preambleEnd >= 0
      ? lines.slice(0, preambleEnd).filter((l) => !isBlank(l) && !isNoiseLine(l))
      : [];

  for (const line of preamble) {
    if (METADATA_LINE.test(line)) {
      noteLines.push(line);
      continue;
    }
    if (!title && !isWeakTitleCandidate(line) && !looksLikeIngredientLine(line)) {
      title = line;
    }
  }

  let ingredientLines: string[];
  let stepLines: string[];

  if (ingredientsIdx >= 0 && stepsIdx >= 0) {
    ingredientLines = lines
      .slice(ingredientsIdx + 1, stepsIdx)
      .filter(
        (l) =>
          !isBlank(l) &&
          !INGREDIENTS_HEADER.test(l) &&
          !isNoiseLine(l) &&
          !METADATA_LINE.test(l)
      );
    stepLines = coalesceStepLines(
      lines
        .slice(stepsIdx + 1)
        .filter((l) => !isBlank(l) && !STEPS_HEADER.test(l) && !isNoiseLine(l))
    );
  } else if (ingredientsIdx >= 0) {
    const body = lines.slice(ingredientsIdx + 1);
    const split = splitIngredientsAndSteps(body);
    ingredientLines = split.ingredientLines;
    stepLines = split.stepLines;
  } else {
    const usable = lines.filter((l) => !isBlank(l));
    let start = 0;
    for (let i = 0; i < usable.length; i++) {
      const line = usable[i];
      if (isNoiseLine(line)) continue;
      if (METADATA_LINE.test(line)) {
        noteLines.push(line);
        continue;
      }
      if (!title) {
        if (looksLikeIngredientLine(line)) {
          start = i;
          break;
        }
        if (isWeakTitleCandidate(line)) continue;
        title = line;
        start = i + 1;
        while (start < usable.length) {
          const next = usable[start];
          if (isNoiseLine(next) || METADATA_LINE.test(next)) {
            if (METADATA_LINE.test(next)) noteLines.push(next);
            start++;
            continue;
          }
          if (looksLikeIngredientLine(next) || isNumberedStep(next) || STEPS_HEADER.test(next)) {
            break;
          }
          start++;
        }
        break;
      }
    }

    const body = usable.slice(start).filter((l) => !isNoiseLine(l));
    const split = splitIngredientsAndSteps(body);
    ingredientLines = split.ingredientLines;
    stepLines = split.stepLines;
  }

  const candidateLines = ingredientLines.some((l) => looksLikeIngredientLine(l))
    ? ingredientLines.filter((l) => looksLikeIngredientLine(l))
    : ingredientLines;

  const ingredients = candidateLines
    .map(parseIngredientLine)
    .filter((ing) => ing.name.trim().length > 0);

  if (!ingredients.length) {
    throw new Error("Could not extract ingredients from this text");
  }

  const steps = stepLines
    .filter((l) => !isNoiseLine(l) && !SERVINGS_LINE.test(l))
    .map(stripStepNumber)
    .map(cleanRecipeText)
    .filter(Boolean);

  const servingsRaw = findServingsRaw(lines) ?? findServingsRaw(noteLines);

  for (const line of lines) {
    if (METADATA_LINE.test(line) && !noteLines.includes(line) && !isNoiseLine(line)) {
      if (SERVINGS_LINE.test(line) || /time|temp/i.test(line)) {
        noteLines.push(line);
      }
    }
  }

  // Strip trailing OCR/social crumbs on titles ("… $5! @ #4")
  const cleanedTitle = (title || "Untitled recipe")
    .replace(/\s*[@#][\s#\d!?.]*$/g, "")
    .trim();

  return {
    title: cleanedTitle || "Untitled recipe",
    servings: parseServings(servingsRaw || 1),
    ingredients,
    steps,
    notes: noteLines.length ? noteLines.join("\n") : null,
    sourceUrl: "",
  };
}

/** Rough quality score for choosing among OCR candidates. */
export function scoreParsedRecipe(recipe: ParsedRecipe): number {
  let score = recipe.ingredients.length * 10;
  score += Math.min(recipe.steps.length, 5) * 3;
  const title = recipe.title || "";
  if (title && title !== "Untitled recipe") {
    if (isWeakTitleCandidate(title) || looksLikeIngredientLine(title)) {
      score -= 12;
    } else {
      score += 8;
      // Prefer longer descriptive titles (social captions)
      if (title.length >= 20) score += 4;
    }
  }
  if (recipe.servings > 1) score += 2;
  // Prefer ingredients that have a real quantity
  score += recipe.ingredients.filter((i) => i.quantity > 0).length * 2;
  // Prefer a real method sentence over leftover ingredient fragments as steps
  if (recipe.steps.some((s) => s.length > 40)) score += 4;
  return score;
}
