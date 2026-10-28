import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Recipe } from "@ladlelink/types";
import { useRepository } from "../data/RepositoryProvider";

export function ListPage() {
  const repo = useRepository();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      repo
        .listRecipes(q.trim() || undefined)
        .then((data) => {
          if (!cancelled) {
            setRecipes(data);
            setError(null);
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, repo]);

  const trimmedQ = q.trim();
  const importTo =
    trimmedQ.startsWith("http://") || trimmedQ.startsWith("https://")
      ? `/import?url=${encodeURIComponent(trimmedQ)}`
      : "/import";

  return (
    <main className="panel">
      <div className="hero-block">
        <h1 className="page-title">Your recipes</h1>
        <p className="lede">
          Scale portions, convert units, and import from a URL or pasted text — all on your machine.
        </p>
      </div>

      <div className="toolbar toolbar--list">
        <input
          className="search-input"
          placeholder="Search recipes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search recipes"
        />
        <Link className="btn" to={importTo}>
          Import
        </Link>
        <Link className="btn secondary" to="/new">
          Add recipe
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="empty">Loading…</p>}

      {!loading && recipes.length === 0 && (
        <div className="empty">
          {trimmedQ ? (
            <>
              <p>No recipes match “{trimmedQ}”.</p>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setQ("")}
              >
                Clear search
              </button>
            </>
          ) : (
            <p>No recipes yet. Import one from a URL or paste, or add one by hand.</p>
          )}
        </div>
      )}

      <ul className="recipe-list">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link to={`/recipes/${recipe.id}`}>
              <span>{recipe.title}</span>
              <span className="meta">{recipe.servings} servings</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
