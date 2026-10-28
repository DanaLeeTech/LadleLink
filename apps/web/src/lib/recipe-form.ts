export type ServingsValue = number | "";

export function isValidServings(value: ServingsValue, min = 1): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

/** Split one or more comma-separated tag strings into clean tags. */
export function splitTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .flatMap((tag) => tag.split(","))
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ];
}

/** Inline errors for the recipe form; empty object means it can be saved. */
export function validateRecipeForm(
  title: string,
  servings: ServingsValue
): { title?: string; servings?: string } {
  const errors: { title?: string; servings?: string } = {};
  if (!title.trim()) errors.title = "Add a title.";
  if (!isValidServings(servings)) errors.servings = "Servings must be 1 or more.";
  return errors;
}

/** Quick-scale buttons: base servings × ½, 1, 2 or 3, never below 1. */
export function servingsForMultiplier(base: number, multiplier: number): number {
  return Math.max(1, Math.round(base * multiplier * 100) / 100);
}
