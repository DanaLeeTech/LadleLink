import type {
  ExportPayload,
  MeasurementPrefs,
  ParsedRecipe,
  Recipe,
  RecipeInput,
} from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { CapacitorHttp } from "@capacitor/core";
import {
  exportLocal,
  getLocalRecipe,
  listLocalRecipes,
  loadConflicts,
  loadMeasurementPrefs,
  loadSyncMeta,
  markDeleted,
  putLocalRecipe,
  replaceAllLocal,
  saveMeasurementPrefs,
  saveSyncMeta,
} from "./local-db";
import type {
  DataSourceMode,
  DockerConfig,
  RecipeRepository,
  SafFolderInfo,
  SyncResult,
  SyncStatus,
} from "./repository";
import { dockerHealth, dockerImportFromUrl } from "./sync/docker-adapter";
import {
  safClearFolder,
  safGetFolder,
  safPickFolder,
} from "./sync/saf-adapter";
import { applyConflictResolution, runSync } from "./sync/engine";
import { newId } from "../lib/id";

function nowIso(): string {
  return new Date().toISOString();
}

async function importViaNativeHttp(url: string): Promise<ParsedRecipe> {
  const { parseRecipeHtml, USER_AGENT, DEFAULT_FETCH_TIMEOUT_MS } = await import(
    "@ladlelink/parser"
  );
  const res = await CapacitorHttp.request({
    url,
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    connectTimeout: DEFAULT_FETCH_TIMEOUT_MS,
    readTimeout: DEFAULT_FETCH_TIMEOUT_MS,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Failed to fetch recipe page: HTTP ${res.status}`);
  }
  const html = typeof res.data === "string" ? res.data : String(res.data ?? "");
  return parseRecipeHtml(html, url);
}

export function createLocalFirstRepository(): RecipeRepository {
  return {
    isNative: () => true,

    async listRecipes(q?: string) {
      return listLocalRecipes(q);
    },

    async getRecipe(id: string) {
      const recipe = await getLocalRecipe(id);
      if (!recipe) throw new Error("Recipe not found");
      return recipe;
    },

    async createRecipe(input: RecipeInput) {
      const ts = nowIso();
      const recipe: Recipe = {
        id: newId(),
        title: input.title,
        servings: input.servings,
        steps: input.steps,
        ingredients: input.ingredients,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        photoPath: input.photoPath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        createdAt: ts,
        updatedAt: ts,
      };
      await putLocalRecipe(recipe, { dirty: true, lastSyncedUpdatedAt: null });
      void runSync().catch(() => undefined);
      return recipe;
    },

    async updateRecipe(id: string, input: RecipeInput) {
      const existing = await getLocalRecipe(id);
      if (!existing) throw new Error("Recipe not found");
      const recipe: Recipe = {
        ...existing,
        title: input.title,
        servings: input.servings,
        steps: input.steps,
        ingredients: input.ingredients,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        photoPath: input.photoPath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        updatedAt: nowIso(),
      };
      await putLocalRecipe(recipe, { dirty: true });
      void runSync().catch(() => undefined);
      return recipe;
    },

    async deleteRecipe(id: string) {
      await markDeleted(id);
      void runSync().catch(() => undefined);
    },

    async importFromUrl(url: string) {
      const meta = await loadSyncMeta();
      if (meta.mode === "docker" && meta.dockerBaseUrl) {
        const parsed = (await dockerImportFromUrl(
          { baseUrl: meta.dockerBaseUrl, authToken: meta.authToken },
          url
        )) as ParsedRecipe;
        return parsed;
      }
      return importViaNativeHttp(url);
    },

    async getMeasurementPrefs() {
      return loadMeasurementPrefs();
    },

    async setMeasurementPrefs(prefs: MeasurementPrefs) {
      await saveMeasurementPrefs(prefs);
      void runSync().catch(() => undefined);
      return prefs;
    },

    async exportAll() {
      return exportLocal();
    },

    async importAll(payload: ExportPayload) {
      if (payload.version !== 1 || !Array.isArray(payload.recipes)) {
        throw new Error("Invalid export payload");
      }
      const existing = await listLocalRecipes();
      const byId = new Map(existing.map((r) => [r.id, r]));
      let imported = 0;
      for (const recipe of payload.recipes) {
        const cur = byId.get(recipe.id);
        if (!cur || recipe.updatedAt > cur.updatedAt) {
          await putLocalRecipe(recipe, { dirty: true, lastSyncedUpdatedAt: null });
          imported += 1;
        }
      }
      if (payload.settings?.measurement) {
        await saveMeasurementPrefs(payload.settings.measurement);
      }
      void runSync().catch(() => undefined);
      return { imported };
    },

    async getMode() {
      return (await loadSyncMeta()).mode;
    },

    async setMode(mode: DataSourceMode) {
      const meta = await loadSyncMeta();
      await saveSyncMeta({ ...meta, mode });
    },

    async getDockerConfig(): Promise<DockerConfig> {
      const meta = await loadSyncMeta();
      return { baseUrl: meta.dockerBaseUrl, authToken: meta.authToken };
    },

    async setDockerConfig(cfg: DockerConfig) {
      const meta = await loadSyncMeta();
      await saveSyncMeta({
        ...meta,
        dockerBaseUrl: cfg.baseUrl.trim(),
        authToken: cfg.authToken,
      });
    },

    async pickSafFolder() {
      const folder = await safPickFolder();
      if (!folder) return null;
      const meta = await loadSyncMeta();
      await saveSyncMeta({
        ...meta,
        mode: "drive",
        safUri: folder.uri,
        safName: folder.name,
      });
      return folder;
    },

    async getSafFolder(): Promise<SafFolderInfo | null> {
      const meta = await loadSyncMeta();
      if (meta.safUri) {
        return { uri: meta.safUri, name: meta.safName || "Folder" };
      }
      return safGetFolder();
    },

    async clearSafFolder() {
      await safClearFolder();
      const meta = await loadSyncMeta();
      await saveSyncMeta({ ...meta, safUri: null, safName: null });
    },

    async syncNow(): Promise<SyncResult> {
      return runSync();
    },

    async getSyncStatus(): Promise<SyncStatus> {
      const meta = await loadSyncMeta();
      const conflicts = await loadConflicts();
      let reachable: boolean | null = null;
      if (meta.mode === "docker" && meta.dockerBaseUrl) {
        const health = await dockerHealth({
          baseUrl: meta.dockerBaseUrl,
          authToken: meta.authToken,
        });
        reachable = health.ok;
      } else if (meta.mode === "drive") {
        reachable = Boolean(meta.safUri);
      }
      return {
        lastSyncAt: meta.lastSyncAt,
        lastError: meta.lastError,
        pendingConflicts: conflicts.length,
        mode: meta.mode,
        reachable,
      };
    },

    async listConflicts() {
      return loadConflicts();
    },

    async resolveConflict(id: string, choice: "local" | "remote") {
      await applyConflictResolution(id, choice);
      void runSync().catch(() => undefined);
    },

    async testConnection() {
      const meta = await loadSyncMeta();
      if (meta.mode === "drive") {
        if (!meta.safUri) return { ok: false, message: "No folder selected" };
        return { ok: true, message: `Folder: ${meta.safName || "selected"}` };
      }
      return dockerHealth({
        baseUrl: meta.dockerBaseUrl,
        authToken: meta.authToken,
      });
    },
  };
}

export async function seedLocalFromExport(payload: ExportPayload): Promise<void> {
  await replaceAllLocal(
    payload.recipes,
    payload.settings?.measurement ?? DEFAULT_MEASUREMENT_PREFS
  );
}
