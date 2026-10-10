import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./api";
import { isDemoMode } from "./data/demo";
import { RepositoryProvider } from "./data/RepositoryProvider";
import { isNativePlatform } from "./data/platform";
import "./styles.css";

// Hash routing for native and the GitHub Pages demo: no server rewrites needed,
// so deep links and refresh work from any subpath.
const Router = isNativePlatform() || isDemoMode() ? HashRouter : BrowserRouter;

// Mark the demo build before first paint so the sticky banner and the header
// band are spaced correctly from the start (no layout jump).
if (isDemoMode()) {
  document.documentElement.classList.add("demo-mode");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <RepositoryProvider>
          <App />
        </RepositoryProvider>
      </AuthProvider>
    </Router>
  </StrictMode>
);
