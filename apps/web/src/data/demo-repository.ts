/**
 * Demo repository: every recipe lives in the visitor's own browser (IndexedDB).
 *
 * Used only in the demo build (FF_DEMO_BUILD=1). There is no server storage, no
 * sync, and no account. URL import also runs in the browser: the page is fetched
 * through public reader services (see lib/demo-url-import.ts) and parsed locally.
 */
import type {
  ExportPayload,
  MeasurementPrefs,
  Recipe,
  RecipeInput,
} from "@ladlelink/types";
import { importRecipeInBrowser } from "../lib/demo-url-import";
import { checkBackupPayload, validateImportRecipes } from "./recipe-validation";
import {
  clearAllLocal,
  exportLocal,
  getLocalRecipe,
  listLocalRecipes,
  loadMeasurementPrefs,
  markDeleted,
  putLocalRecipe,
  replaceAllLocal,
  saveMeasurementPrefs,
} from "./local-db";
import { newId } from "../lib/id";
import type {
  DataSourceMode,
  DockerConfig,
  ImportUrlOptions,
  RecipeRepository,
  SafFolderInfo,
  SyncResult,
  SyncStatus,
} from "./repository";

function nowIso(): string {
  return new Date().toISOString();
}

export function createDemoRepository(): RecipeRepository {
  const notAvailable = async (): Promise<never> => {
    throw new Error("Not available in the demo");
  };

  return {
    isNative: () => false,

    listRecipes: (q?: string) => listLocalRecipes(q),

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
        sections: input.sections,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        photoPath: input.photoPath ?? null,
        imageUrl: input.imageUrl ?? null,
        sourceUrl: input.sourceUrl ?? null,
        createdAt: ts,
        updatedAt: ts,
      };
      await putLocalRecipe(recipe, { dirty: false, lastSyncedUpdatedAt: ts });
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
        sections: input.sections ?? existing.sections,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        photoPath: input.photoPath ?? null,
        imageUrl: input.imageUrl ?? existing.imageUrl ?? null,
        sourceUrl: input.sourceUrl ?? null,
        updatedAt: nowIso(),
      };
      await putLocalRecipe(recipe, { dirty: false });
      return recipe;
    },

    async deleteRecipe(id: string) {
      await markDeleted(id);
    },

    importFromUrl: (url: string, options?: ImportUrlOptions) =>
      importRecipeInBrowser(url, globalThis.fetch, options),

    getMeasurementPrefs: () => loadMeasurementPrefs(),

    async setMeasurementPrefs(prefs: MeasurementPrefs) {
      await saveMeasurementPrefs(prefs);
      return prefs;
    },

    exportAll: () => exportLocal(),

    async importAll(raw: ExportPayload) {
      const payload = checkBackupPayload(raw);
      // Validate before saving: a damaged entry would otherwise render a blank page.
      const { recipes, reasons } = validateImportRecipes(payload.recipes);
      const existing = await listLocalRecipes();
      const byId = new Map(existing.map((r) => [r.id, r]));
      let imported = 0;
      for (const recipe of recipes) {
        const current = byId.get(recipe.id);
        if (!current || recipe.updatedAt > current.updatedAt) {
          await putLocalRecipe(recipe, {
            dirty: false,
            lastSyncedUpdatedAt: recipe.updatedAt,
            clearDeleted: true,
          });
          imported += 1;
        }
      }
      if (payload.settings?.measurement) {
        await saveMeasurementPrefs(payload.settings.measurement);
      }
      return { imported, skipped: reasons.length, reasons };
    },

    getMode: async () => "docker" as DataSourceMode,
    setMode: async () => undefined,
    getDockerConfig: async (): Promise<DockerConfig> => ({ baseUrl: "", authToken: "" }),
    setDockerConfig: async () => undefined,
    pickSafFolder: notAvailable,
    getSafFolder: async () => null as SafFolderInfo | null,
    clearSafFolder: async () => undefined,
    syncNow: async (): Promise<SyncResult> => ({ conflicts: [], pushed: 0, pulled: 0 }),
    getSyncStatus: async (): Promise<SyncStatus> => ({
      lastSyncAt: null,
      lastError: null,
      pendingConflicts: 0,
      mode: "docker",
      reachable: null,
    }),
    listConflicts: async () => [],
    resolveConflict: notAvailable,
    testConnection: async () => ({
      ok: true,
      message: "Demo mode — recipes live in this browser",
    }),
  };
}

/** Wipe everything the visitor saved in this browser (used by the reset button). */
export async function resetDemoData(): Promise<void> {
  await clearAllLocal();
}
