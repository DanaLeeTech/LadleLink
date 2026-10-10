import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRepository } from "../data/RepositoryProvider";
import type { RecipeConflict } from "../data/repository";

export function ConflictPage() {
  const repo = useRepository();
  const navigate = useNavigate();
  const [conflicts, setConflicts] = useState<RecipeConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const list = await repo.listConflicts();
    setConflicts(list);
    if (list.length === 0) {
      navigate("/settings");
    }
  }

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
  }, [repo]);

  async function resolve(id: string, choice: "local" | "remote") {
    setBusyId(id);
    setError(null);
    try {
      await repo.resolveConflict(id, choice);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="panel">
      <div className="hero-block">
        <h1 className="page-title">Resolve conflicts</h1>
        <p className="lede">
          Both sides changed these recipes since the last sync. Pick which version to keep
          (last-write-wins is applied automatically when only one side changed).
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {conflicts.length === 0 && (
        <p className="empty">
          No conflicts. <Link to="/settings">Back to settings</Link>
        </p>
      )}

      <ul className="recipe-list">
        {conflicts.map((c) => (
          <li key={c.id} style={{ display: "block", padding: "1rem 0" }}>
            <strong>{c.local.title || c.remote.title}</strong>
            <div className="settings-grid" style={{ marginTop: "0.75rem" }}>
              <div className="field">
                <label>Local</label>
                <p className="meta">
                  {c.local.title} · updated {new Date(c.local.updatedAt).toLocaleString()} ·{" "}
                  {c.local.ingredients.length} ingredients
                </p>
                <button
                  className="btn"
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void resolve(c.id, "local")}
                >
                  Keep local
                </button>
              </div>
              <div className="field">
                <label>Remote</label>
                <p className="meta">
                  {c.remote.title} · updated {new Date(c.remote.updatedAt).toLocaleString()} ·{" "}
                  {c.remote.ingredients.length} ingredients
                </p>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void resolve(c.id, "remote")}
                >
                  Keep remote
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
