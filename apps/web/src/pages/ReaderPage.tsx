import { useEffect, useMemo, useRef, useState } from "react";
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
import { sanitizeRecipe } from "../data/recipe-validation";
import { formatIngredientLine } from "../lib/recipe-card-export";
import { servingsForMultiplier } from "../lib/recipe-form";
import { useWakeLock } from "../lib/wake-lock";

/** Units that cannot convert — show as text, not a dropdown. */
function isFixedReaderUnit(unit: string): boolean {
  const u = canonicalizeUnit(unit);
  return u === "to_taste" || u === "garnish";
}

const QUICK_SCALES: { multiplier: number; label: string }[] = [
  { multiplier: 0.5, label: "½×" },
  { multiplier: 1, label: "1×" },
  { multiplier: 2, label: "2×" },
  { multiplier: 3, label: "3×" },
];

const UNDO_MS = 5000;

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
  const [unreadable, setUnreadable] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletingId = useRef<string | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const wakeLock = useWakeLock(cooking);

  /** Delete now (page hide / unmount), without waiting for the undo timer. */
  function flushPendingDelete() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = null;
    const pending = deletingId.current;
    deletingId.current = null;
    if (pending) void repo.deleteRecipe(pending).catch(() => undefined);
  }

  // Leaving mid-countdown still deletes; Undo always has the full 5 s on screen.
  useEffect(
    () => () => {
      flushPendingDelete();
    },
    [repo]
  );

  // Closing the tab skips React's cleanup, so flush the pending delete now.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") flushPendingDelete();
    }
    window.addEventListener("pagehide", flushPendingDelete);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPendingDelete);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [repo]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!id) return;
    Promise.all([repo.getRecipe(id), repo.getMeasurementPrefs()])
      .then(([stored, p]) => {
        const r = sanitizeRecipe(stored);
        if (!r) {
          setUnreadable(true);
          return;
        }
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

  function onDelete() {
    setMenuOpen(false);
    if (!recipe || deletingId.current) return;
    deletingId.current = recipe.id;
    setPendingDelete(true);
    deleteTimer.current = setTimeout(() => {
      const pending = deletingId.current;
      deletingId.current = null;
      deleteTimer.current = null;
      if (pending) void repo.deleteRecipe(pending).catch(() => undefined);
      navigate("/");
    }, UNDO_MS);
  }

  function onUndo() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = null;
    deletingId.current = null;
    setPendingDelete(false);
  }

  // Damaged stored fields: hand off to the route error boundary for Delete + Back.
  if (unreadable) throw new Error("This recipe couldn't be loaded");

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

  const sectionTitle = (kind: "ingredients" | "steps", at: number): string | null =>
    recipe?.sections?.find((s) => s.kind === kind && s.at === at)?.title ?? null;

  if (pendingDelete) {
    return (
      <main className="panel">
        <h1 className="page-title">Recipe deleted</h1>
        <p className="empty">You can undo this for a few seconds.</p>
        <div className="toast" role="status" aria-live="polite">
          <span>Deleted “{recipe.title}”.</span>
          <button className="btn" type="button" onClick={onUndo} autoFocus>
            Undo
          </button>
        </div>
      </main>
    );
  }

  if (cooking) {
    const step = recipe.steps[stepIndex];
    return (
      <main className="panel cooking">
        <div className="toolbar">
          <h1 className="page-title">{recipe.title}</h1>
          <button className="btn secondary" type="button" onClick={() => setCooking(false)}>
            Exit cooking
          </button>
        </div>

        <h2 className="section-label">Ingredients</h2>
        <ul className="cooking-ingredients">
          {scaled.map((ing, i) => (
            <li key={`${ing.name}-${i}`}>
              <label className={`cooking-ing${checkedIngredients[i] ? " is-done" : ""}`}>
                <input
                  type="checkbox"
                  checked={Boolean(checkedIngredients[i])}
                  onChange={(e) =>
                    setCheckedIngredients((prev) => ({ ...prev, [i]: e.target.checked }))
                  }
                />
                <span>{formatIngredientLine(ing)}</span>
              </label>
            </li>
          ))}
        </ul>

        {recipe.steps.length > 0 && (
          <>
            <h2 className="section-label">
              Step {stepIndex + 1} of {recipe.steps.length}
            </h2>
            <p className="cooking-step">{step}</p>
            <div className="toolbar">
              <button
                className="btn secondary"
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
              <button
                className="btn"
                type="button"
                disabled={stepIndex >= recipe.steps.length - 1}
                onClick={() => setStepIndex((i) => Math.min(recipe.steps.length - 1, i + 1))}
              >
                Next
              </button>
            </div>
          </>
        )}

        {!wakeLock.supported && (
          <p className="hint">
            This browser can’t keep the screen on — raise your screen timeout if it dims.
          </p>
        )}
      </main>
    );
  }

  const activeServings = isValidServings(servings) ? servings : recipe.servings;

  return (
    <main className="panel">
      {recipe.imageUrl && !photoFailed ? (
        <img
          className="recipe-photo"
          src={recipe.imageUrl}
          alt={recipe.title}
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <div className="recipe-photo recipe-photo--placeholder" aria-hidden="true" />
      )}

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
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            setStepIndex(0);
            setCooking(true);
          }}
        >
          Cooking mode
        </button>
        <button className="btn danger reader-delete" type="button" onClick={onDelete}>
          Delete
        </button>
        <div className="more-menu" ref={moreRef}>
          <button
            type="button"
            className="btn secondary icon-btn"
            aria-label="More actions"
            aria-expanded={menuOpen}
            aria-controls="recipe-more-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="more-menu-list" id="recipe-more-menu">
              <button className="btn danger" type="button" onClick={onDelete}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {exportOpen && (
        <RecipeCardExportModal
          recipe={recipe}
          scaled={scaled}
          servings={activeServings}
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
          value={activeServings}
          onChange={(e) => setServings(Number(e.target.value))}
        />
        <ServingsInput
          className="servings-number"
          value={servings}
          onChange={setServings}
          aria-label="Servings number"
        />
        <div className="scale-buttons" role="group" aria-label="Quick scale servings">
          {QUICK_SCALES.map(({ multiplier, label }) => {
            const target = servingsForMultiplier(recipe.servings, multiplier);
            const active = Math.abs(activeServings - target) < 0.001;
            return (
              <button
                key={multiplier}
                type="button"
                className={`btn secondary scale-btn${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => setServings(target)}
              >
                {label}
              </button>
            );
          })}
        </div>
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
              {sectionTitle("ingredients", i) && (
                <h3 className="section-label">{sectionTitle("ingredients", i)}</h3>
              )}
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
            {sectionTitle("steps", i) && (
              <h3 className="section-label">{sectionTitle("steps", i)}</h3>
            )}
            <span className="step-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
