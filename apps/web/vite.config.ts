import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Absolute "/" for Docker/web deep links; relative "./" for Capacitor;
  // the GitHub Pages demo is served from the repo subpath.
  base:
    process.env.FF_DEMO_BUILD === "1"
      ? "/LadleLink/"
      : process.env.FF_CAPACITOR_BUILD === "1"
        ? "./"
        : "/",
  define: {
    // Demo build: browser-only storage. See apps/web/src/data/demo.ts
    __DEMO_MODE__: JSON.stringify(process.env.FF_DEMO_BUILD === "1"),
    // Optional last-resort fetch Worker for demo import (Pages workflow secret).
    __IMPORT_WORKER_URL__: JSON.stringify(process.env.VITE_IMPORT_WORKER_URL ?? ""),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ["cheerio", "@ladlelink/parser"],
  },
});
