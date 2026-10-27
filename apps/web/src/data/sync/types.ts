import type { ExportPayload, MeasurementPrefs, Recipe } from "@ladlelink/types";
import type { RecipeConflict } from "../repository";

export interface RemoteSnapshot {
  recipes: Recipe[];
  measurement?: MeasurementPrefs;
}

export type MergeDecision =
  | { type: "keep-local"; recipe: Recipe }
  | { type: "apply-remote"; recipe: Recipe }
  | { type: "conflict"; local: Recipe; remote: Recipe }
  | { type: "delete-remote"; id: string }
  | { type: "noop" };

export interface LocalSyncState {
  recipes: Recipe[];
  metas: Map<
    string,
    { dirty: boolean; lastSyncedUpdatedAt: string | null; deleted: boolean }
  >;
  measurement: MeasurementPrefs;
  measurementDirty: boolean;
}

/**
 * Merge rules:
 * - Tombstone (local deleted + dirty): delete remote, clear local meta after push
 * - Only local dirty (remote unchanged vs lastSynced): push local
 * - Only remote newer (local not dirty): apply remote
 * - Both changed (local dirty AND remote.updatedAt !== lastSyncedUpdatedAt): conflict
 * - Remote only (new id): apply remote
 * - Local only clean: noop (already synced)
 */
export function mergeRecipe(
  local: Recipe | undefined,
  remote: Recipe | undefined,
  meta:
    | { dirty: boolean; lastSyncedUpdatedAt: string | null; deleted: boolean }
    | undefined
): MergeDecision {
  if (meta?.deleted && meta.dirty) {
    if (remote) return { type: "delete-remote", id: meta ? (local?.id ?? remote.id) : remote.id };
    return { type: "noop" };
  }

  if (!local && remote) {
    return { type: "apply-remote", recipe: remote };
  }

  if (local && !remote) {
    if (meta?.dirty) return { type: "keep-local", recipe: local };
    // Local exists, remote missing, not dirty → was deleted remotely
    return { type: "noop" };
  }

  if (!local || !remote) return { type: "noop" };

  const lastSynced = meta?.lastSyncedUpdatedAt ?? null;
  const localDirty = meta?.dirty ?? false;
  const remoteChanged = lastSynced === null || remote.updatedAt !== lastSynced;

  if (localDirty && remoteChanged && remote.updatedAt !== local.updatedAt) {
    return { type: "conflict", local, remote };
  }

  if (localDirty) {
    return { type: "keep-local", recipe: local };
  }

  if (remoteChanged && remote.updatedAt > (local.updatedAt || "")) {
    return { type: "apply-remote", recipe: remote };
  }

  if (remoteChanged && remote.updatedAt !== local.updatedAt) {
    // Prefer newer timestamp (LWW) when local is clean
    if (remote.updatedAt > local.updatedAt) {
      return { type: "apply-remote", recipe: remote };
    }
  }

  return { type: "noop" };
}

export function collectConflicts(
  decisions: MergeDecision[]
): RecipeConflict[] {
  return decisions
    .filter((d): d is Extract<MergeDecision, { type: "conflict" }> => d.type === "conflict")
    .map((d) => ({ id: d.local.id, local: d.local, remote: d.remote }));
}

export function snapshotFromExport(payload: ExportPayload): RemoteSnapshot {
  return {
    recipes: payload.recipes,
    measurement: payload.settings?.measurement,
  };
}
