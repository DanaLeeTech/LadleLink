import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  ExportPayload,
  MeasurementPrefs,
  Recipe,
} from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import type { DataSourceMode, DockerConfig, RecipeConflict } from "./repository";

export interface RecipeMeta {
  id: string;
  dirty: boolean;
  lastSyncedUpdatedAt: string | null;
  deleted: boolean;
}

export interface SyncMeta {
  mode: DataSourceMode;
  dockerBaseUrl: string;
  authToken: string;
  safUri: string | null;
  safName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface SettingsRow {
  key: string;
  value: unknown;
}

interface FfDb extends DBSchema {
  recipes: {
    key: string;
    value: Recipe;
    indexes: { "by-title": string; "by-updated": string };
  };
  meta: {
    key: string;
    value: RecipeMeta;
  };
  settings: {
    key: string;
    value: SettingsRow;
  };
}

const DB_NAME = "ladlelink";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FfDb>> | null = null;

export function getDb(): Promise<IDBPDatabase<FfDb>> {
  if (!dbPromise) {
    dbPromise = openDB<FfDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const recipes = db.createObjectStore("recipes", { keyPath: "id" });
        recipes.createIndex("by-title", "title");
        recipes.createIndex("by-updated", "updatedAt");
        db.createObjectStore("meta", { keyPath: "id" });
        db.createObjectStore("settings", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

const DEFAULT_SYNC_META: SyncMeta = {
  mode: "docker",
  dockerBaseUrl: "",
  authToken: "",
  safUri: null,
  safName: null,
  lastSyncAt: null,
  lastError: null,
};

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.get("settings", key);
  if (!row) return fallback;
  return row.value as T;
}

async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put("settings", { key, value });
}

export async function loadSyncMeta(): Promise<SyncMeta> {
  const stored = await getSetting<Partial<SyncMeta> | null>("sync", null);
  return stored ? { ...DEFAULT_SYNC_META, ...stored } : { ...DEFAULT_SYNC_META };
}

export async function saveSyncMeta(meta: SyncMeta): Promise<void> {
  await setSetting("sync", meta);
}

export async function loadMeasurementPrefs(): Promise<MeasurementPrefs> {
  return getSetting("measurement", { ...DEFAULT_MEASUREMENT_PREFS });
}

export async function saveMeasurementPrefs(prefs: MeasurementPrefs): Promise<void> {
  await setSetting("measurement", prefs);
}

export async function loadConflicts(): Promise<RecipeConflict[]> {
  return getSetting<RecipeConflict[]>("conflicts", []);
}

export async function saveConflicts(conflicts: RecipeConflict[]): Promise<void> {
  await setSetting("conflicts", conflicts);
}

export async function listLocalRecipes(q?: string): Promise<Recipe[]> {
  const db = await getDb();
  const all = await db.getAll("recipes");
  const metas = await db.getAll("meta");
  const deleted = new Set(metas.filter((m) => m.deleted).map((m) => m.id));
  let recipes = all.filter((r) => !deleted.has(r.id));
  if (q) {
    const needle = q.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        r.tags.some((t) => t.toLowerCase().includes(needle)) ||
        (r.notes || "").toLowerCase().includes(needle)
    );
  }
  return recipes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLocalRecipe(id: string): Promise<Recipe | undefined> {
  const db = await getDb();
  const meta = await db.get("meta", id);
  if (meta?.deleted) return undefined;
  return db.get("recipes", id);
}

export async function putLocalRecipe(
  recipe: Recipe,
  opts: { dirty: boolean; lastSyncedUpdatedAt?: string | null; clearDeleted?: boolean } = {
    dirty: true,
  }
): Promise<void> {
  const db = await getDb();
  await db.put("recipes", recipe);
  const existing = await db.get("meta", recipe.id);
  await db.put("meta", {
    id: recipe.id,
    dirty: opts.dirty,
    lastSyncedUpdatedAt:
      opts.lastSyncedUpdatedAt !== undefined
        ? opts.lastSyncedUpdatedAt
        : (existing?.lastSyncedUpdatedAt ?? null),
    deleted: opts.clearDeleted ? false : (existing?.deleted ?? false),
  });
}

export async function markDeleted(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get("meta", id);
  await db.put("meta", {
    id,
    dirty: true,
    lastSyncedUpdatedAt: existing?.lastSyncedUpdatedAt ?? null,
    deleted: true,
  });
  await db.delete("recipes", id);
}

export async function getAllMeta(): Promise<RecipeMeta[]> {
  const db = await getDb();
  return db.getAll("meta");
}

export async function setMeta(meta: RecipeMeta): Promise<void> {
  const db = await getDb();
  await db.put("meta", meta);
}

export async function removeMeta(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("meta", id);
  await db.delete("recipes", id);
}

export async function exportLocal(): Promise<ExportPayload> {
  const recipes = await listLocalRecipes();
  const measurement = await loadMeasurementPrefs();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes,
    settings: { measurement },
  };
}

export async function getDockerConfigFromStore(): Promise<DockerConfig> {
  const meta = await loadSyncMeta();
  return { baseUrl: meta.dockerBaseUrl, authToken: meta.authToken };
}

export async function replaceAllLocal(
  recipes: Recipe[],
  measurement?: MeasurementPrefs
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["recipes", "meta", "settings"], "readwrite");
  await tx.objectStore("recipes").clear();
  await tx.objectStore("meta").clear();
  for (const recipe of recipes) {
    await tx.objectStore("recipes").put(recipe);
    await tx.objectStore("meta").put({
      id: recipe.id,
      dirty: false,
      lastSyncedUpdatedAt: recipe.updatedAt,
      deleted: false,
    });
  }
  if (measurement) {
    await tx.objectStore("settings").put({ key: "measurement", value: measurement });
  }
  await tx.done;
}

/** Remove every locally stored recipe, tag, and setting (demo reset). */
export async function clearAllLocal(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["recipes", "meta", "settings"], "readwrite");
  await tx.objectStore("recipes").clear();
  await tx.objectStore("meta").clear();
  await tx.objectStore("settings").clear();
  await tx.done;
}
