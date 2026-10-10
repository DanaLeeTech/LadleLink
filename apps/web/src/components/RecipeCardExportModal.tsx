import { useEffect, useMemo, useRef, useState } from "react";
import type { Recipe } from "@ladlelink/types";
import type { ScaledIngredient } from "@ladlelink/scaling";
import {
  DEFAULT_RECIPE_CARD_COLORS,
  RECIPE_CARD_HEIGHT,
  RECIPE_CARD_WIDTH,
  buildExportPayload,
  downloadBlob,
  formatIngredientLine,
  generateQrDataUrl,
  renderRecipeCardPng,
  slugFilename,
  type RecipeCardColors,
} from "../lib/recipe-card-export";

interface Props {
  recipe: Recipe;
  scaled: ScaledIngredient[];
  servings: number;
  onClose: () => void;
}

export function RecipeCardExportModal({
  recipe,
  scaled,
  servings,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<RecipeCardColors>(DEFAULT_RECIPE_CARD_COLORS);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(0.28);

  const payload = useMemo(
    () => buildExportPayload(recipe, scaled, servings),
    [recipe, scaled, servings]
  );

  const ingredientLines = useMemo(
    () => scaled.map((ing) => formatIngredientLine(ing)),
    [scaled]
  );

  const dense =
    ingredientLines.length + recipe.steps.length > 18 ||
    recipe.steps.some((s) => s.length > 160);

  useEffect(() => {
    let cancelled = false;
    void generateQrDataUrl(payload)
      .then(({ dataUrl }) => {
        if (!cancelled) setQrUrl(dataUrl);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not generate QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    function updateScale() {
      const maxW = Math.min(window.innerWidth - 48, 360);
      const maxH = Math.min(window.innerHeight * 0.45, 520);
      const s = Math.min(maxW / RECIPE_CARD_WIDTH, maxH / RECIPE_CARD_HEIGHT);
      setPreviewScale(Math.max(0.18, s));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  function setColor<K extends keyof RecipeCardColors>(key: K, value: string) {
    setColors((prev) => ({ ...prev, [key]: value }));
  }

  async function onDownload() {
    if (!qrUrl) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderRecipeCardPng({
        title: recipe.title,
        ingredients: ingredientLines,
        steps: recipe.steps,
        colors,
        qrDataUrl: qrUrl,
        payload,
        dense,
      });
      downloadBlob(blob, slugFilename(recipe.title));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel recipe-card-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-card-title"
      >
        <div className="hero-block">
          <h2 id="export-card-title" className="page-title" style={{ fontSize: "1.75rem" }}>
            Export image
          </h2>
          <p className="lede">
            1080×1920 recipe card. Notes and source link are stored in the QR and file data, not
            shown on the card.
          </p>
        </div>

        <div className="recipe-card-export-layout">
          <div className="recipe-card-export-preview-shell">
            <div
              className="recipe-card-export-preview-scaler"
              style={{
                width: RECIPE_CARD_WIDTH * previewScale,
                height: RECIPE_CARD_HEIGHT * previewScale,
              }}
            >
              <div
                ref={cardRef}
                className={`recipe-card-canvas${dense ? " recipe-card-canvas--dense" : ""}`}
                style={{
                  width: RECIPE_CARD_WIDTH,
                  height: RECIPE_CARD_HEIGHT,
                  transform: `scale(${previewScale})`,
                  background: colors.background,
                  color: colors.body,
                }}
              >
                <div
                  className="recipe-card-paper"
                  style={{ background: colors.card, color: colors.body }}
                >
                  <h1 className="recipe-card-title" style={{ color: colors.title }}>
                    {recipe.title}
                  </h1>

                  <h2 className="recipe-card-section" style={{ color: colors.section }}>
                    Ingredients
                  </h2>
                  <div className="recipe-card-ingredients-row">
                    <ul className="recipe-card-ingredients">
                      {ingredientLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                    {qrUrl ? (
                      <div className="recipe-card-qr-block">
                        <img
                          className="recipe-card-qr"
                          src={qrUrl}
                          alt=""
                          width={320}
                          height={320}
                          crossOrigin="anonymous"
                        />
                        <p
                          className="recipe-card-qr-note"
                          style={{ color: colors.body }}
                        >
                          Import into LadleLink
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <h2 className="recipe-card-section" style={{ color: colors.section }}>
                    Steps
                  </h2>
                  <ol className="recipe-card-steps">
                    {recipe.steps.map((step, i) => (
                      <li key={i}>
                        <span className="recipe-card-step-num" style={{ color: colors.section }}>
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="recipe-card-export-controls">
            <h3 className="section-label">Colours</h3>
            <div className="recipe-card-color-grid">
              {(
                [
                  ["background", "Background"],
                  ["card", "Card"],
                  ["title", "Title"],
                  ["body", "Body text"],
                  ["section", "Section labels"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="recipe-card-color-field">
                  <span>{label}</span>
                  <input
                    type="color"
                    value={toColorInputValue(colors[key])}
                    onChange={(e) => setColor(key, e.target.value)}
                  />
                </label>
              ))}
            </div>

            {error && <p className="error">{error}</p>}

            <div className="toolbar">
              <button className="btn" type="button" onClick={onDownload} disabled={busy || !qrUrl}>
                {busy ? "Exporting…" : "Download PNG"}
              </button>
              <button className="btn secondary" type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toColorInputValue(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return "#000000";
}
