import type { Ingredient, ParsedRecipe, RecipeInput } from "@ladlelink/types";
import { splitTags } from "./recipe-form";

/** The review draft after the servings field has been validated. */
export type DraftForSave = Omit<ParsedRecipe, "servings"> & { servings: number };

/** Map a reviewed import draft to the recipe that gets saved (keeps the page image). */
export function recipeInputFromDraft(
  draft: DraftForSave,
  ingredients: Ingredient[],
  steps: string[]
): RecipeInput {
  return {
    title: draft.title,
    servings: draft.servings,
    ingredients,
    steps,
    sections: draft.sections?.filter(
      (s) => s.at <= (s.kind === "steps" ? steps.length : ingredients.length)
    ),
    tags: splitTags(draft.tags ?? []),
    notes: draft.notes ?? null,
    imageUrl: draft.photoUrl ?? null,
    sourceUrl: draft.sourceUrl || null,
  };
}
