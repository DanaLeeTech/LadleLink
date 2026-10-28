import type {
  ExportPayload,
  MeasurementPrefs,
  ParsedRecipe,
  Recipe,
  RecipeInput,
} from "@ladlelink/types";
import type {
  DataSourceMode,
  DockerConfig,
  ImportResult,
  RecipeConflict,
  RecipeRepository,
  SafFolderInfo,
  SyncResult,
  SyncStatus,
} from "./repository";

const TOKEN_KEY = "ff-auth-token";

async function api<T>(
  path: string,
  options: RequestInit & { token?: string; baseUrl?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = options.token ?? localStorage.getItem(TOKEN_KEY) ?? "";
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const base = (options.baseUrl ?? "").replace(/\/$/, "");
  const url = `${base}${path}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createApiRepository(): RecipeRepository {
  const unsupported = async (): Promise<never> => {
    throw new Error("This action is only available in the Android app");
  };

  return {
    listRecipes: (q?: string) =>
      api<Recipe[]>(`/api/recipes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    getRecipe: (id: string) => api<Recipe>(`/api/recipes/${id}`),
    createRecipe: (input: RecipeInput) =>
      api<Recipe>("/api/recipes", { method: "POST", body: JSON.stringify(input) }),
    updateRecipe: (id: string, input: RecipeInput) =>
      api<Recipe>(`/api/recipes/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    deleteRecipe: (id: string) => api<void>(`/api/recipes/${id}`, { method: "DELETE" }),
    importFromUrl: (url: string, options?: { signal?: AbortSignal }) =>
      api<ParsedRecipe>("/api/recipes/import", {
        method: "POST",
        body: JSON.stringify({ url }),
        signal: options?.signal,
      }),
    getMeasurementPrefs: () => api<MeasurementPrefs>("/api/settings/measurement"),
    setMeasurementPrefs: (prefs: MeasurementPrefs) =>
      api<MeasurementPrefs>("/api/settings/measurement", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
    exportAll: () => api<ExportPayload>("/api/export"),
    importAll: (payload: ExportPayload) =>
      api<ImportResult>("/api/import", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    isNative: () => false,
    getMode: async () => "docker" as DataSourceMode,
    setMode: async () => undefined,
    getDockerConfig: async (): Promise<DockerConfig> => ({
      baseUrl: "",
      authToken: localStorage.getItem(TOKEN_KEY) ?? "",
    }),
    setDockerConfig: async (cfg: DockerConfig) => {
      if (cfg.authToken) localStorage.setItem(TOKEN_KEY, cfg.authToken);
      else localStorage.removeItem(TOKEN_KEY);
    },
    pickSafFolder: unsupported,
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
    listConflicts: async () => [] as RecipeConflict[],
    resolveConflict: unsupported,
    testConnection: async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
        return { ok: true, message: "Connected" };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Connection failed",
        };
      }
    },
  };
}

/** Low-level API helpers used by Docker sync adapter (absolute base URL). */
export async function dockerApi<T>(
  baseUrl: string,
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  return api<T>(path, { ...options, baseUrl, token: options.token });
}
