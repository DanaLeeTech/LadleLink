import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Ingredient, RecipeInput, RecipeSection } from "@ladlelink/types";
import { UnitSelect } from "../components/UnitSelect";
import {
  IngredientNameInput,
  MeasureAsSelect,
} from "../components/IngredientNameInput";
import { QuantityInput } from "../components/QuantityInput";
import {
  ServingsInput,
  type ServingsValue,
} from "../components/ServingsInput";
import { StepsTextarea } from "../components/StepsTextarea";
import { useRepository } from "../data/RepositoryProvider";
import { isNotFound } from "../data/repository";
import { formatStepsForEditor, parseStepsFromEditor } from "../lib/steps-text";
import { splitTags, validateRecipeForm } from "../lib/recipe-form";
import { useUnsavedChangesWarning } from "../lib/unsaved-changes";
import {
  formatIngredientPreview,
  measureSelectValue,
  patchFromMeasureSelect,
} from "../lib/ingredient-ui";

const emptyIngredient = (): Ingredient => ({
  quantity: 1,
  unit: "g",
  name: "",
});

function snapshot(fields: {
  title: string;
  servings: ServingsValue;
  ingredients: Ingredient[];
  stepsText: string;
  tagsText: string;
  notes: string;
  sourceUrl: string;
}): string {
  return JSON.stringify(fields);
}

export function EditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const repo = useRepository();
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState<ServingsValue>(4);
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);
  const [stepsText, setStepsText] = useState("");
  const [sections, setSections] = useState<RecipeSection[]>([]);
  const [loadedStepCount, setLoadedStepCount] = useState<number | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; servings?: string }>({});
  const [baseline, setBaseline] = useState(() =>
    snapshot({
      title: "",
      servings: 4,
      ingredients: [emptyIngredient()],
      stepsText: "",
      tagsText: "",
      notes: "",
      sourceUrl: "",
    })
  );

  const current = snapshot({
    title,
    servings,
    ingredients,
    stepsText,
    tagsText,
    notes,
    sourceUrl,
  });
  useUnsavedChangesWarning(current !== baseline);

  useEffect(() => {
    if (!id) return;
    repo
      .getRecipe(id)
      .then((recipe) => {
        const loadedIngredients = recipe.ingredients.length
          ? recipe.ingredients
          : [emptyIngredient()];
        const loadedSteps = formatStepsForEditor(recipe.steps);
        const loadedTags = recipe.tags.join(", ");
        const loadedNotes = recipe.notes || "";
        const loadedSource = recipe.sourceUrl || "";
        setTitle(recipe.title);
        setServings(recipe.servings);
        setIngredients(loadedIngredients);
        setStepsText(loadedSteps);
        setSections(recipe.sections ?? []);
        setLoadedStepCount(recipe.steps.length);
        setTagsText(loadedTags);
        setNotes(loadedNotes);
        setSourceUrl(loadedSource);
        setBaseline(
          snapshot({
            title: recipe.title,
            servings: recipe.servings,
            ingredients: loadedIngredients,
            stepsText: loadedSteps,
            tagsText: loadedTags,
            notes: loadedNotes,
            sourceUrl: loadedSource,
          })
        );
      })
      .catch((err: Error) => {
        if (isNotFound(err)) setNotFound(true);
        else setError(err.message);
      });
  }, [id, repo]);

  function updateIngredient(
    index: number,
    patch: Omit<Partial<Ingredient>, "quantityMax" | "conversionKey"> & {
      quantityMax?: number | null;
      conversionKey?: string | null;
    }
  ) {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const next: Ingredient = { ...ing };
        if (patch.quantity != null) next.quantity = patch.quantity;
        if ("quantityMax" in patch) {
          if (patch.quantityMax == null) delete next.quantityMax;
          else next.quantityMax = patch.quantityMax;
        }
        if (patch.unit !== undefined) next.unit = patch.unit;
        if (patch.name !== undefined) next.name = patch.name;
        if ("conversionKey" in patch) {
          if (patch.conversionKey == null || patch.conversionKey === "") {
            delete next.conversionKey;
          } else next.conversionKey = patch.conversionKey;
        }
        if ("size" in patch) {
          if (patch.size) next.size = patch.size;
          else delete next.size;
        }
        return next;
      })
    );
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
    // Section headings are index-based: shift them down and drop the one on the removed row.
    setSections((prev) =>
      prev
        .map((s) =>
          s.kind === "ingredients" && s.at > index ? { ...s, at: s.at - 1 } : s
        )
        .filter((s) => !(s.kind === "ingredients" && s.at === index))
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateRecipeForm(title, servings);
    setFieldErrors(found);
    if (found.title || found.servings) return;
    setSaving(true);
    setError(null);
    const keptIngredients = ingredients.filter((i) => i.name.trim());
    const steps = parseStepsFromEditor(stepsText);
    // Headings are index-based: clear step headings when the step rows changed shape,
    // and remap ingredient headings when unnamed rows are dropped on save.
    let safeSections =
      steps.length === loadedStepCount
        ? sections
        : sections.filter((s) => s.kind !== "steps");
    if (keptIngredients.length !== ingredients.length) {
      const rowMap = new Map<number, number>();
      ingredients.forEach((ing, i) => {
        if (ing.name.trim()) rowMap.set(i, rowMap.size);
      });
      safeSections = safeSections
        .filter((s) => s.kind !== "ingredients" || rowMap.has(s.at))
        .map((s) => (s.kind === "ingredients" ? { ...s, at: rowMap.get(s.at)! } : s));
    }
    const input: RecipeInput = {
      title: title.trim(),
      servings: servings as number,
      ingredients: keptIngredients,
      steps,
      sections: safeSections,
      tags: splitTags([tagsText]),
      notes: notes.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
    };
    try {
      const recipe = isNew
        ? await repo.createRecipe(input)
        : await repo.updateRecipe(id!, input);
      setBaseline(current);
      navigate(`/recipes/${recipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <main className="panel">
        <p className="error">Recipe not found.</p>
        <Link to="/">Back to recipes</Link>
      </main>
    );
  }

  return (
    <main className="panel">
      <div className="hero-block">
        <h1 className="page-title">{isNew ? "Add recipe" : "Edit recipe"}</h1>
        <p className="lede">Ingredients, steps, tags, and notes for this recipe.</p>
      </div>

      <form className="form-grid" noValidate onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
            }}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
            required
          />
          {fieldErrors.title && (
            <p className="field-error" id="title-error" role="alert">
              {fieldErrors.title}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="servings">Servings</label>
          <ServingsInput
            id="servings"
            value={servings}
            onChange={(value) => {
              setServings(value);
              if (fieldErrors.servings) {
                setFieldErrors((prev) => ({ ...prev, servings: undefined }));
              }
            }}
            required
          />
          {fieldErrors.servings && (
            <p className="field-error" id="servings-error" role="alert">
              {fieldErrors.servings}
            </p>
          )}
        </div>

        <h2 className="section-label">Ingredients</h2>
        <div className="ingredient-col-headers ingredient-col-headers--edit" aria-hidden="true">
          <span>Qty</span>
          <span>Unit</span>
          <span>Ingredient</span>
          <span>Advanced</span>
          <span />
        </div>
        <ul className="ingredient-list">
          {ingredients.map((ing, i) => (
            <li key={i}>
              <div className="ingredient-main ingredient-review-row">
                <QuantityInput
                  quantity={ing.quantity}
                  quantityMax={ing.quantityMax}
                  onCommit={(next) => updateIngredient(i, next)}
                />
                <UnitSelect
                  value={measureSelectValue(ing)}
                  includeSizes
                  aria-label="Size or unit"
                  title="Change size or unit"
                  onChange={(value) =>
                    updateIngredient(i, patchFromMeasureSelect(value))
                  }
                />
                <IngredientNameInput
                  value={ing.name}
                  onChangeName={(name) => updateIngredient(i, { name })}
                  required={i === 0}
                />
                <details
                  className="measure-advanced"
                  open={ing.conversionKey ? true : undefined}
                >
                  <summary className="measure-advanced-toggle">Advanced</summary>
                  <MeasureAsSelect
                    name={ing.name}
                    conversionKey={ing.conversionKey}
                    onChange={(conversionKey) =>
                      updateIngredient(i, { conversionKey: conversionKey ?? null })
                    }
                  />
                </details>
                <button
                  type="button"
                  className="btn secondary icon-btn"
                  onClick={() => removeIngredient(i)}
                  disabled={ingredients.length === 1}
                  aria-label="Remove ingredient"
                  title="Remove ingredient"
                >
                  ×
                </button>
              </div>
              <p className="ingredient-preview">{formatIngredientPreview(ing)}</p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn secondary"
          onClick={() => setIngredients((prev) => [...prev, emptyIngredient()])}
        >
          Add ingredient
        </button>

        <div className="field">
          <label htmlFor="steps">Steps</label>
          <StepsTextarea
            id="steps"
            rows={10}
            value={stepsText}
            onChange={setStepsText}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="tags">Tags (comma-separated)</label>
          <input id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="sourceUrl">Source URL</label>
          <input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="toolbar">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save recipe"}
          </button>
          <Link className="btn secondary" to={id ? `/recipes/${id}` : "/"}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
