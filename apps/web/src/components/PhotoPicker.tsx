import { useState } from "react";
import { uploadPhoto } from "../lib/photo-upload";

interface PhotoPickerProps {
  /** Current photo: an uploaded /api/photos path or a web address. */
  value: string | null;
  /** Every photo the source page offered (import review only). */
  candidates?: string[];
  /** The Android app has no upload server; web and Docker do. */
  canUpload?: boolean;
  onChange: (url: string | null) => void;
}

/** Pick, upload or remove the one photo a recipe keeps. Full app only. */
export function PhotoPicker({ value, candidates, canUpload = true, onChange }: PhotoPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const choices = [...(candidates ?? [])];
  if (value && !choices.includes(value)) choices.push(value);
  const usable = choices.filter((url) => !failed.has(url));

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadPhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      {usable.length > 0 && (
        <div className="photo-choices" role="group" aria-label="Recipe photo">
          {usable.map((url) => (
            <button
              key={url}
              type="button"
              className="photo-choice"
              aria-pressed={url === value}
              aria-label={url === value ? "Current photo" : "Use this photo"}
              onClick={() => onChange(url)}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                onError={() => setFailed((prev) => new Set(prev).add(url))}
              />
            </button>
          ))}
        </div>
      )}
      {(canUpload || value) && (
        <div className="toolbar photo-toolbar">
          {canUpload && (
            <label className="btn secondary" aria-disabled={busy}>
              {busy ? "Uploading…" : "Upload photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={onPick}
                disabled={busy}
              />
            </label>
          )}
          {value && (
            <button type="button" className="btn secondary" onClick={() => onChange(null)}>
              Remove photo
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
