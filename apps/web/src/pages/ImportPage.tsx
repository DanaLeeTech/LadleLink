import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { parseRecipeText } from "@ladlelink/parser";
import type { Ingredient, ParsedRecipe } from "@ladlelink/types";
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
import { importRecipeFromImage } from "../lib/recipe-card-import";

const emptyIngredient = (): Ingredient => ({
  quantity: 0,
  unit: "",
  name: "",
});

type ImportDraft = Omit<ParsedRecipe, "servings"> & { servings: ServingsValue };
type ImportMode = "url" | "text" | "image";

export function ImportPage() {
  const navigate = useNavigate();
  const repo = useRepository();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [stepsText, setStepsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importHint, setImportHint] = useState<string | null>(null);

  function applyDraft(parsed: ParsedRecipe) {
    const ingredients = parsed.ingredients.length
      ? parsed.ingredients
      : [emptyIngredient()];
    setDraft({ ...parsed, ingredients });
    setStepsText(formatStepsForEditor(parsed.steps));
  }

  useEffect(() => {
    const shared = searchParams.get("url");
    if (shared) {
      setMode("url");
      setUrl(shared);
      void (async () => {
        setLoading(true);
        setError(null);
        setDraft(null);
        try {
          const parsed = await repo.importFromUrl(shared.trim());
          applyDraft(parsed);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Import failed");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [searchParams, repo]);

  async function onFetch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const parsed = await repo.importFromUrl(url.trim());
      applyDraft(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function onParseText(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLoadingMessage(null);
    setImportHint(null);
    setError(null);
    setDraft(null);
    try {
      const parsed = parseRecipeText(pasteText);
      applyDraft(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function onParseImage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("recipe-image") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose an image file first.");
      return;
    }
    setLoading(true);
    setImportHint(null);
    setError(null);
    setDraft(null);
    try {
      const result = await importRecipeFromImage(file, setLoadingMessage);
      applyDraft(result.recipe);
      if (result.source === "metadata") {
        setImportHint("Loaded exact recipe data from the image file.");
      } else if (result.source === "qr") {
        setImportHint("Loaded recipe data from the QR code on the image.");
      } else {
        setImportHint("Read with OCR — please review ingredients and steps carefully.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }

  function updateIngredient(
    index: number,
    patch: Omit<Partial<Ingredient>, "quantityMax" | "conversionKey"> & {
      quantityMax?: number | null;
      conversionKey?: string | null;
    }
  ) {
    if (!draft) return;
    setDraft({
      ...draft,
      ingredients: draft.ingredients.map((ing, i) => {
        if (i !== index) return ing;
        const next: Ingredient = { ...ing };
        if ("quantity" in patch && patch.quantity != null) next.quantity = patch.quantity;
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
      }),
    });
  }

  async function onSave() {
    if (!draft) return;
    if (!isValidServings(draft.servings)) {
      setError("Enter a servings amount.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ingredients = draft.ingredients.filter(
        (ing) => ing.name.trim() || ing.quantity
      );
      const recipe = await repo.createRecipe({
        title: draft.title,
        servings: draft.servings,
        ingredients,
        steps: parseStepsFromEditor(stepsText),
        tags: draft.tags ?? [],
        notes: draft.notes ?? null,
        sourceUrl: draft.sourceUrl || null,
      });
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
        <h1 className="page-title">Import</h1>
        <p className="lede">
          Paste a recipe link, recipe text, or an image (photo, screenshot, or LadleLink card). We
          extract ingredients and steps, then ask you to review before saving.
        </p>
      </div>

      <div className="toolbar" role="group" aria-label="Import source">
        <button
          type="button"
          className={mode === "url" ? "btn" : "btn secondary"}
          aria-pressed={mode === "url"}
          onClick={() => setMode("url")}
        >
          URL
        </button>
        <button
          type="button"
          className={mode === "text" ? "btn" : "btn secondary"}
          aria-pressed={mode === "text"}
          onClick={() => setMode("text")}
        >
          Text
        </button>
        <button
          type="button"
          className={mode === "image" ? "btn" : "btn secondary"}
          aria-pressed={mode === "image"}
          onClick={() => setMode("image")}
        >
          Image
        </button>
      </div>

      {mode === "url" ? (
        <form className="toolbar" onSubmit={onFetch}>
          <input
            className="search-input"
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Fetching…" : "Fetch recipe"}
          </button>
        </form>
      ) : mode === "text" ? (
        <form className="form-grid" onSubmit={onParseText}>
          <div className="field">
            <label htmlFor="paste-text">Recipe text</label>
            <textarea
              id="paste-text"
              rows={14}
              placeholder="Paste a recipe… Include Ingredients and Instructions headings when you can."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              required
            />
          </div>
          <div className="toolbar">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Parsing…" : "Parse recipe"}
            </button>
          </div>
        </form>
      ) : (
        <form className="form-grid" onSubmit={onParseImage}>
          <div className="field">
            <label htmlFor="recipe-image">Recipe image</label>
            <input
              id="recipe-image"
              name="recipe-image"
              type="file"
              accept="image/*"
              required
            />
            <p className="lede" style={{ marginTop: "0.35rem", fontSize: "0.95rem" }}>
              LadleLink cards restore exactly via embedded data or QR. Other photos use on-device
              OCR.
            </p>
          </div>
          <div className="toolbar">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? loadingMessage || "Reading…" : "Import image"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {importHint && !error && <p className="success">{importHint}</p>}

      {draft && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="servings">Servings</label>
            <ServingsInput
              id="servings"
              value={draft.servings}
              onChange={(servings) => setDraft({ ...draft, servings })}
              required
            />
          </div>

          <h2 className="section-label">Ingredients (review)</h2>
          <div className="ingredient-col-headers ingredient-col-headers--edit" aria-hidden="true">
            <span>Qty</span>
            <span>Unit</span>
            <span>Ingredient</span>
            <span>Measure as</span>
            <span />
          </div>
          <ul className="ingredient-list">
            {draft.ingredients.map((ing, i) => (
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
                    onClick={() =>
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.filter((_, idx) => idx !== i),
                      })
                    }
                    disabled={draft.ingredients.length === 1}
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
            onClick={() =>
              setDraft({
                ...draft,
                ingredients: [...draft.ingredients, emptyIngredient()],
              })
            }
          >
            Add ingredient
          </button>

          <div className="field">
            <label htmlFor="steps">Steps</label>
            <StepsTextarea
              id="steps"
              rows={12}
              value={stepsText}
              onChange={setStepsText}
            />
          </div>

          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="source-url">Source URL</label>
            <input
              id="source-url"
              type="url"
              value={draft.sourceUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
            />
          </div>

          <div className="toolbar">
            <button className="btn" type="button" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save recipe"}
            </button>
            <Link className="btn secondary" to="/">
              Cancel
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
