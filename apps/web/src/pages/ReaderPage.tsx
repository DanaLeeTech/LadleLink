import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MeasurementPrefs, ProduceSize, Recipe } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { scaleRecipeIngredients } from "@ladlelink/scaling";
import { canonicalizeUnit, pluralUnitLabel, unitFamily } from "@ladlelink/units";
import {
  isValidServings,
  ServingsInput,
  type ServingsValue,
} from "../components/ServingsInput";
import { isProduceSize, UnitSelect } from "../components/UnitSelect";
import { useRepository } from "../data/RepositoryProvider";
import { RecipeCardExportModal } from "../components/RecipeCardExportModal";
import { capitalizeFirst, softenNameCase } from "../lib/ingredient-ui";

/** Units that cannot convert — show as text, not a dropdown. */
function isFixedReaderUnit(unit: string): boolean {
  const u = canonicalizeUnit(unit);
  return u === "to_taste" || u === "garnish";
}

export function ReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const repo = useRepository();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [prefs, setPrefs] = useState<MeasurementPrefs>(DEFAULT_MEASUREMENT_PREFS);
  const [servings, setServings] = useState<ServingsValue>(1);
  const [unitOverrides, setUnitOverrides] = useState<Record<number, string>>({});
  const [sizeOverrides, setSizeOverrides] = useState<Record<number, ProduceSize>>({});
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([repo.getRecipe(id), repo.getMeasurementPrefs()])
      .then(([r, p]) => {
        setRecipe(r);
        setPrefs(p);
        setServings(r.servings);
        const overrides: Record<number, string> = {};
        r.ingredients.forEach((ing, i) => {
          if (ing.displayUnit) overrides[i] = ing.displayUnit;
        });
        setUnitOverrides(overrides);
        setSizeOverrides({});
      })
      .catch((err: Error) => setError(err.message));
  }, [id, repo]);

  const scaled = useMemo(() => {
    if (!recipe) return [];
    const activeServings = isValidServings(servings) ? servings : recipe.servings;
    return scaleRecipeIngredients(recipe.ingredients, recipe.servings, activeServings, {
      prefs,
      unitOverrides,
      sizeOverrides,
    });
  }, [recipe, servings, prefs, unitOverrides, sizeOverrides]);

  function onMeasureChange(index: number, value: string, includeSizes: boolean) {
    if (includeSizes && isProduceSize(value)) {
      setSizeOverrides((prev) => ({ ...prev, [index]: value }));
      // Selecting a size returns to count view (mass-preserved). Clear unit override.
      // If somehow we need to stay on mass/volume, only sizes aren't selectable concurrently
      // in the same control; grams stay stable when re-selected because base mass is authored.
      setUnitOverrides((prev) => {
        if (!(index in prev)) return prev;
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }

    // Stay on mass/volume: keep size override as context but convert via authored mass.
    const family = unitFamily(value);
    if (family === "mass" || family === "volume") {
      setUnitOverrides((prev) => ({ ...prev, [index]: value }));
      return;
    }

    setUnitOverrides((prev) => ({ ...prev, [index]: value }));
  }

  async function onDelete() {
    if (!recipe || !confirm(`Delete “${recipe.title}”?`)) return;
    await repo.deleteRecipe(recipe.id);
    navigate("/");
  }

  if (error) {
    return (
      <main className="panel">
        <p className="error">{error}</p>
        <Link to="/">Back</Link>
      </main>
    );
  }

  if (!recipe) {
    return (
      <main className="panel">
        <p className="empty">Loading recipe…</p>
      </main>
    );
  }

  return (
    <main className="panel">
      <div className="hero-block">
        <h1 className="page-title">{recipe.title}</h1>
        {recipe.sourceUrl && (
          <p className="lede">
            Source:{" "}
            <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              {recipe.sourceUrl}
            </a>
          </p>
        )}
        {recipe.notes && <p className="lede">{recipe.notes}</p>}
      </div>

      <div className="toolbar">
        <Link className="btn secondary" to={`/recipes/${recipe.id}/edit`}>
          Edit
        </Link>
        <button className="btn secondary" type="button" onClick={() => setExportOpen(true)}>
          Export image
        </button>
        <button className="btn danger" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>

      {exportOpen && (
        <RecipeCardExportModal
          recipe={recipe}
          scaled={scaled}
          servings={isValidServings(servings) ? servings : recipe.servings}
          onClose={() => setExportOpen(false)}
        />
      )}

      <div className="servings-row">
        <label htmlFor="servings">
          Servings: {isValidServings(servings) ? servings : "—"}
        </label>
        <input
          id="servings"
          type="range"
          min={1}
          max={Math.max(24, Math.ceil(recipe.servings * 4))}
          step={1}
          value={isValidServings(servings) ? servings : recipe.servings}
          onChange={(e) => setServings(Number(e.target.value))}
        />
        <ServingsInput
          value={servings}
          onChange={setServings}
          aria-label="Servings number"
          style={{ width: "4.5rem" }}
        />
      </div>

      <h2 className="section-label">Ingredients</h2>
      <ul className="ingredient-list">
        {scaled.map((ing, i) => {
          const authored = recipe.ingredients[i]!;
          const includeSizes = Boolean(authored.size);
          const unitText = String(ing.unit || authored.unit || "");
          const fixedUnit = !includeSizes && isFixedReaderUnit(unitText);
          const showMeasure =
            !fixedUnit && (includeSizes || Boolean(ing.unit) || Boolean(authored.unit));
          const measureValue = unitOverrides[i]
            ? unitOverrides[i]!
            : includeSizes
              ? (sizeOverrides[i] ?? authored.size ?? "")
              : String(ing.unit || authored.unit || "");
          const showSize = !includeSizes && Boolean(ing.size);
          const lineStartsWithQty = Boolean(ing.displayQuantity);
          const unitLabel = pluralUnitLabel(unitText, ing.quantityMax ?? ing.quantity);
          const displayName = softenNameCase(ing.name);
          // Match import preview: sentence-case the first token when the line has no qty.
          const nameLeadsLine = !lineStartsWithQty && !showSize && !fixedUnit && !showMeasure;

          return (
            <li key={`${ing.name}-${i}`}>
              <div className="ingredient-main ingredient-main--reader">
                {ing.displayQuantity ? (
                  <span className="qty">{ing.displayQuantity}</span>
                ) : null}
                {showSize ? (
                  <span className="size-label">
                    {!lineStartsWithQty ? capitalizeFirst(ing.size!) : ing.size}
                  </span>
                ) : null}
                {fixedUnit ? (
                  <span className="unit-label">
                    {!lineStartsWithQty && !showSize
                      ? capitalizeFirst(unitLabel)
                      : unitLabel}
                  </span>
                ) : null}
                {showMeasure ? (
                  <UnitSelect
                    className="unit-select unit-select--reader"
                    value={measureValue}
                    allowEmpty={false}
                    includeSizes={includeSizes}
                    allowedCountable={
                      unitFamily(authored.unit) === "countable" && authored.unit
                        ? String(authored.unit)
                        : null
                    }
                    title={includeSizes ? "Change size or unit" : "Change unit"}
                    aria-label={
                      includeSizes
                        ? `Size or unit for ${ing.name}`
                        : `Unit for ${ing.name}`
                    }
                    onChange={(value) => onMeasureChange(i, value, includeSizes)}
                  />
                ) : null}
                <span className="ingredient-name">
                  {nameLeadsLine ? capitalizeFirst(displayName) : displayName}
                </span>
                {ing.notes && <span className="meta">({ing.notes})</span>}
              </div>
              {ing.needsWeight && (
                <span className="hint">
                  Average piece weight unknown for this conversion — try grams/ounces, or pick a
                  different unit.
                </span>
              )}
              {ing.needsDensity && (
                <span className="hint">
                  Density needed for this volume↔mass conversion — try another unit, or edit the
                  ingredient to set density g/ml.
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="section-label">Steps</h2>
      <ol className="step-list">
        {recipe.steps.map((step, i) => (
          <li key={i}>
            <span className="step-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
