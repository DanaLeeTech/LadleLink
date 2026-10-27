import type { ExportPayload, Recipe } from "@ladlelink/types";
import {
  exportLocal,
  getAllMeta,
  listLocalRecipes,
  loadConflicts,
  loadMeasurementPrefs,
  loadSyncMeta,
  putLocalRecipe,
  removeMeta,
  saveConflicts,
  saveMeasurementPrefs,
  saveSyncMeta,
  setMeta,
} from "../local-db";
import type { RecipeConflict, SyncResult } from "../repository";
import {
  dockerDeleteRecipe,
  dockerHealth,
  dockerPullSnapshot,
  dockerPushExport,
  dockerPushMeasurement,
} from "./docker-adapter";
import { safPullSnapshot, safPushSnapshot } from "./saf-adapter";
import { mergeRecipe, type RemoteSnapshot } from "./types";

export async function runSync(): Promise<SyncResult> {
  const syncMeta = await loadSyncMeta();
  const conflicts: RecipeConflict[] = [];
  let pushed = 0;
  let pulled = 0;

  try {
    let remote: RemoteSnapshot | null = null;

    if (syncMeta.mode === "docker") {
      const health = await dockerHealth({
        baseUrl: syncMeta.dockerBaseUrl,
        authToken: syncMeta.authToken,
      });
      if (!health.ok) {
        throw new Error(health.message);
      }
      remote = await dockerPullSnapshot({
        baseUrl: syncMeta.dockerBaseUrl,
        authToken: syncMeta.authToken,
      });
    } else {
      if (!syncMeta.safUri) {
        throw new Error("No cloud folder selected");
      }
      remote = await safPullSnapshot();
      if (!remote) {
        const payload = await exportLocal();
        await safPushSnapshot(payload);
        await saveSyncMeta({
          ...syncMeta,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        });
        return { conflicts: [], pushed: payload.recipes.length, pulled: 0 };
      }
    }

    const localRecipes = await listLocalRecipes();
    const metas = await getAllMeta();
    const metaById = new Map(metas.map((m) => [m.id, m]));
    const localById = new Map(localRecipes.map((r) => [r.id, r]));
    const remoteById = new Map((remote?.recipes ?? []).map((r) => [r.id, r]));
    const allIds = new Set([...localById.keys(), ...remoteById.keys(), ...metaById.keys()]);

    const toPush: Recipe[] = [];
    const toDeleteRemote: string[] = [];
    const existingConflicts = await loadConflicts();
    const conflictIds = new Set(existingConflicts.map((c) => c.id));

    for (const id of allIds) {
      if (conflictIds.has(id)) continue;
      const decision = mergeRecipe(localById.get(id), remoteById.get(id), metaById.get(id));
      switch (decision.type) {
        case "keep-local":
          toPush.push(decision.recipe);
          break;
        case "apply-remote":
          await putLocalRecipe(decision.recipe, {
            dirty: false,
            lastSyncedUpdatedAt: decision.recipe.updatedAt,
            clearDeleted: true,
          });
          pulled += 1;
          break;
        case "conflict":
          conflicts.push({ id, local: decision.local, remote: decision.remote });
          break;
        case "delete-remote":
          toDeleteRemote.push(decision.id);
          break;
        default:
          break;
      }
    }

    if (remote?.measurement) {
      await saveMeasurementPrefs(remote.measurement);
    }

    for (const recipe of toPush) {
      await putLocalRecipe(recipe, {
        dirty: false,
        lastSyncedUpdatedAt: recipe.updatedAt,
      });
      pushed += 1;
    }

    for (const id of toDeleteRemote) {
      await removeMeta(id);
      pushed += 1;
    }

    const measurement = await loadMeasurementPrefs();
    const payload: ExportPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: await listLocalRecipes(),
      settings: { measurement },
    };

    if (syncMeta.mode === "docker") {
      const cfg = { baseUrl: syncMeta.dockerBaseUrl, authToken: syncMeta.authToken };
      await dockerPushExport(cfg, payload);
      for (const id of toDeleteRemote) {
        try {
          await dockerDeleteRecipe(cfg, id);
        } catch {
          // ignore missing
        }
      }
      await dockerPushMeasurement(cfg, measurement);
    } else {
      await safPushSnapshot(payload);
    }

    for (const recipe of await listLocalRecipes()) {
      await setMeta({
        id: recipe.id,
        dirty: false,
        lastSyncedUpdatedAt: recipe.updatedAt,
        deleted: false,
      });
    }

    const allConflicts = [
      ...existingConflicts.filter((c) => !conflicts.some((n) => n.id === c.id)),
      ...conflicts,
    ];
    await saveConflicts(allConflicts);

    await saveSyncMeta({
      ...syncMeta,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });

    return { conflicts: allConflicts, pushed, pulled };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await saveSyncMeta({
      ...syncMeta,
      lastError: message,
    });
    throw err;
  }
}

export async function applyConflictResolution(
  id: string,
  choice: "local" | "remote"
): Promise<void> {
  const conflicts = await loadConflicts();
  const found = conflicts.find((c) => c.id === id);
  if (!found) return;
  const recipe = choice === "local" ? found.local : found.remote;
  const now = new Date().toISOString();
  const resolved: Recipe =
    choice === "local" ? { ...recipe, updatedAt: now } : recipe;
  await putLocalRecipe(resolved, {
    dirty: true,
    lastSyncedUpdatedAt: choice === "remote" ? recipe.updatedAt : null,
    clearDeleted: true,
  });
  await saveConflicts(conflicts.filter((c) => c.id !== id));
}
