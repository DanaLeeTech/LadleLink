/**
 * Simple English singular/plural variants for food name matching.
 * Not a full inflection engine — good enough for produce density/piece keys.
 */
export function wordForms(word: string): string[] {
  const w = word.toLowerCase();
  if (!w) return [];
  const forms = new Set<string>([w]);

  // Singularize
  if (w.endsWith("ies") && w.length > 4) forms.add(`${w.slice(0, -3)}y`);
  if (w.endsWith("oes") && w.length > 4) forms.add(w.slice(0, -2));
  if (w.endsWith("ses") && w.length > 4) forms.add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) {
    forms.add(w.slice(0, -1));
  }

  // Pluralize from each known form
  for (const form of [...forms]) {
    if (form.endsWith("y") && form.length > 1 && !/[aeiou]y$/i.test(form)) {
      forms.add(`${form.slice(0, -1)}ies`);
    } else if (
      form.endsWith("s") ||
      form.endsWith("x") ||
      form.endsWith("z") ||
      form.endsWith("ch") ||
      form.endsWith("sh")
    ) {
      forms.add(`${form}es`);
    } else if (/[^aeiou]o$/.test(form)) {
      // tomato → tomatoes, potato → potatoes
      forms.add(`${form}es`);
      forms.add(`${form}s`);
    } else if (!form.endsWith("s")) {
      forms.add(`${form}s`);
    }
  }

  return [...forms];
}

/** Expand a multi-word name by varying the last token's singular/plural. */
export function expandNameVariants(name: string): string[] {
  const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  const parts = normalized.split(" ");
  const last = parts[parts.length - 1]!;
  for (const form of wordForms(last)) {
    variants.add([...parts.slice(0, -1), form].join(" ").trim());
  }
  return [...variants];
}
