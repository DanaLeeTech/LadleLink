import type { Ingredient, ParsedRecipe, RecipeInput } from "@ladlelink/types";
import { isUploadedPhoto } from "./photo";
import { splitTags } from "./recipe-form";

/** The review draft after the servings field has been validated. */
export type DraftForSave = Omit<ParsedRecipe, "servings"> & { servings: number };

/** Map a reviewed import draft to the recipe that gets saved (keeps the chosen image). */
export function recipeInputFromDraft(
  draft: DraftForSave,
  ingredients: Ingredient[],
  steps: string[]
): RecipeInput {
  const photo = draft.photoUrl ?? null;
  const uploaded = isUploadedPhoto(photo);
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
    photoPath: uploaded ? photo : null,
    imageUrl: photo && !uploaded ? photo : null,
    sourceUrl: draft.sourceUrl || null,
  };
}
