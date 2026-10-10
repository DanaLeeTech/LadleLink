import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Ingredient, RecipeInput } from "@ladlelink/types";
import { UnitSelect } from "../components/UnitSelect";
import {
  IngredientNameInput,
  MeasureAsSelect,
} from "../components/IngredientNameInput";
import { QuantityInput } from "../components/QuantityInput";
import {
  isValidServings,
  ServingsInput,
  type ServingsValue,
} from "../components/ServingsInput";
import { StepsTextarea } from "../components/StepsTextarea";
import { useRepository } from "../data/RepositoryProvider";
import { formatStepsForEditor, parseStepsFromEditor } from "../lib/steps-text";
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

export function EditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const repo = useRepository();
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState<ServingsValue>(4);
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);
  const [stepsText, setStepsText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    repo
      .getRecipe(id)
      .then((recipe) => {
        setTitle(recipe.title);
        setServings(recipe.servings);
        setIngredients(recipe.ingredients.length ? recipe.ingredients : [emptyIngredient()]);
        setStepsText(formatStepsForEditor(recipe.steps));
        setTagsText(recipe.tags.join(", "));
        setNotes(recipe.notes || "");
        setSourceUrl(recipe.sourceUrl || "");
      })
      .catch((err: Error) => setError(err.message));
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidServings(servings)) {
      setError("Enter a servings amount.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: RecipeInput = {
      title: title.trim(),
      servings,
      ingredients: ingredients.filter((i) => i.name.trim()),
      steps: parseStepsFromEditor(stepsText),
      tags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
    };
    try {
      const recipe = isNew
        ? await repo.createRecipe(input)
        : await repo.updateRecipe(id!, input);
      navigate(`/recipes/${recipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="panel">
      <div className="hero-block">
        <h1 className="page-title">{isNew ? "Add recipe" : "Edit recipe"}</h1>
        <p className="lede">Ingredients, steps, tags, and notes for this recipe.</p>
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="servings">Servings</label>
          <ServingsInput
            id="servings"
            value={servings}
            onChange={setServings}
            required
          />
        </div>

        <h2 className="section-label">Ingredients</h2>
        <div className="ingredient-col-headers ingredient-col-headers--edit" aria-hidden="true">
          <span>Qty</span>
          <span>Unit</span>
          <span>Ingredient</span>
          <span>Measure as</span>
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
                <MeasureAsSelect
                  name={ing.name}
                  conversionKey={ing.conversionKey}
                  onChange={(conversionKey) =>
                    updateIngredient(i, { conversionKey: conversionKey ?? null })
                  }
                />
                <button
                  type="button"
                  className="btn secondary icon-btn"
                  onClick={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))}
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
