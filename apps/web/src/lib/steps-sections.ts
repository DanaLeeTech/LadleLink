import type { RecipeSection } from "@ladlelink/types";

/** One editable slice of the step list, with the heading it starts under. */
export interface StepGroup {
  title: string | null;
  steps: string[];
}

/**
 * Split steps at their "steps" section headings so each group gets its own editor.
 * Steps before the first heading form an untitled first group.
 */
export function splitStepsBySection(
  steps: string[],
  sections: RecipeSection[] = []
): StepGroup[] {
  const marks = sections
    .filter((section) => section.kind === "steps")
    .slice()
    .sort((a, b) => a.at - b.at);
  if (!marks.length) return [{ title: null, steps: [...steps] }];

  const groups: StepGroup[] = [];
  let start = 0;
  let title: string | null = null;
  for (const mark of marks) {
    // A heading past the last step has nothing to edit; drop it.
    if (mark.at >= steps.length) continue;
    const at = Math.max(mark.at, start);
    if (at > start) groups.push({ title, steps: steps.slice(start, at) });
    title = mark.title;
    start = at;
  }
  groups.push({ title, steps: steps.slice(start) });
  return groups;
}

/** Merge edited groups back into one step list plus sections with correct `at`. */
export function mergeStepSections(groups: StepGroup[]): {
  steps: string[];
  sections: RecipeSection[];
} {
  const steps: string[] = [];
  const sections: RecipeSection[] = [];
  for (const group of groups) {
    if (group.title && group.steps.length) {
      sections.push({ kind: "steps", at: steps.length, title: group.title });
    }
    steps.push(...group.steps);
  }
  return { steps, sections };
}
