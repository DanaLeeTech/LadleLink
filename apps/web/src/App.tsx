import { useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { DemoBanner } from "./components/DemoBanner";
import { RecipeErrorBoundary } from "./components/RecipeErrorBoundary";
import { ShareListener } from "./components/ShareListener";
import { useRepository } from "./data/RepositoryProvider";
import { ListPage } from "./pages/ListPage";
import { ReaderPage } from "./pages/ReaderPage";
import { EditPage } from "./pages/EditPage";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ConflictPage } from "./pages/ConflictPage";
import {
  applyTheme,
  getInitialTheme,
  persistTheme,
  toggleTheme,
  type Theme,
} from "./lib/theme";

/** Recipe reader with a boundary so one damaged recipe cannot blank the page. */
function ReaderRoute() {
  const { id } = useParams();
  const repo = useRepository();
  const navigate = useNavigate();
  return (
    <RecipeErrorBoundary
      key={id}
      onDelete={async () => {
        if (id) await repo.deleteRecipe(id);
        navigate("/");
      }}
    >
      <ReaderPage />
    </RecipeErrorBoundary>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const nextLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="theme-toggle" aria-label={nextLabel} onClick={onToggle}>
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 1 0 11.5 11.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.25" />
          <path
            d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.4 5.4l1.06 1.06M17.54 17.54l1.06 1.06M5.4 18.6l1.06-1.06M17.54 6.46l1.06-1.06"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

export function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [navOpen, setNavOpen] = useState(false);
  const navMenuId = useId();
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!navOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setNavOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navOpen]);

  function handleToggleTheme() {
    const next = toggleTheme(theme);
    persistTheme(next);
    setTheme(next);
  }

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <>
      <DemoBanner />
      <div className="app-shell">
        <ShareListener />
        <header className="topbar">
        <div className="topbar-start" ref={navRef}>
          <button
            type="button"
            className="nav-menu-toggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls={navMenuId}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
              </svg>
            ) : (
              <span className="nav-menu-icon" aria-hidden="true" />
            )}
          </button>
          <nav
            id={navMenuId}
            className={`nav-menu${navOpen ? " is-open" : ""}`}
            aria-hidden={!navOpen}
          >
            <Link to="/" onClick={closeNav}>
              Recipes
            </Link>
            <Link to="/new" onClick={closeNav}>
              Add
            </Link>
            <Link to="/import" onClick={closeNav}>
              Import
            </Link>
            <Link to="/settings" onClick={closeNav}>
              Settings
            </Link>
          </nav>
        </div>
        <Link to="/" className="brand" onClick={closeNav}>
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="brand-logo" />
          LadleLink
        </Link>
        <ThemeToggle theme={theme} onToggle={handleToggleTheme} />
      </header>
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/recipes/:id" element={<ReaderRoute />} />
        <Route path="/recipes/:id/edit" element={<EditPage />} />
        <Route path="/new" element={<EditPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/conflicts" element={<ConflictPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </>
  );
}
