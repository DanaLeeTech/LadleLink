import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, RecipeStore, resolvePaths, sweepOrphanPhotos } from "./db/store.js";
import { authMiddleware } from "./middleware/auth.js";
import { photosRouter } from "./routes/photos.js";
import { recipesRouter } from "./routes/recipes.js";
import { utilRouter } from "./routes/util.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = resolve(process.env.DATA_DIR || join(process.cwd(), "data"));
const AUTH_TOKEN = process.env.AUTH_TOKEN || undefined;

const paths = resolvePaths(DATA_DIR);
const db = openDatabase(paths.dbPath);
const store = new RecipeStore(db, paths.photosDir);

const swept = sweepOrphanPhotos(db, paths.photosDir);
if (swept) console.log(`Removed ${swept} orphaned photo file(s)`);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ladlelink" });
});

app.use("/api", authMiddleware(AUTH_TOKEN));
app.use("/api/photos", photosRouter(paths.photosDir));
app.use("/api/recipes", recipesRouter(store));
app.use("/api", utilRouter(store));

// Serve photos
app.use("/api/photos", express.static(paths.photosDir));

// Serve web UI in production (built into ../web/dist or ../../web/dist)
const webDistCandidates = [
  join(__dirname, "../../web/dist"),
  join(__dirname, "../../../web/dist"),
  join(process.cwd(), "apps/web/dist"),
  join(process.cwd(), "web/dist"),
];
const webDist = webDistCandidates.find((p) => existsSync(join(p, "index.html")));
if (webDist) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(webDist, "index.html"));
  });
}

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express only treats a 4-argument handler as error middleware.
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err instanceof Error ? err.message : "Bad request" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(PORT, () => {
  console.log(`LadleLink listening on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${paths.dataDir}`);
  console.log(`Auth: ${AUTH_TOKEN ? "token required" : "disabled (set AUTH_TOKEN to enable)"}`);
});
