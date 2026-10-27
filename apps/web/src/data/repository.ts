import type {
  ExportPayload,
  MeasurementPrefs,
  ParsedRecipe,
  Recipe,
  RecipeInput,
} from "@ladlelink/types";

export type DataSourceMode = "docker" | "drive";

export interface DockerConfig {
  baseUrl: string;
  authToken: string;
}

export interface SafFolderInfo {
  uri: string;
  name: string;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  lastError: string | null;
  pendingConflicts: number;
  mode: DataSourceMode;
  reachable: boolean | null;
}

export interface RecipeConflict {
  id: string;
  local: Recipe;
  remote: Recipe;
}

export interface SyncResult {
  conflicts: RecipeConflict[];
  pushed: number;
  pulled: number;
}

export interface RecipeRepository {
  listRecipes(q?: string): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe>;
  createRecipe(input: RecipeInput): Promise<Recipe>;
  updateRecipe(id: string, input: RecipeInput): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  importFromUrl(url: string): Promise<ParsedRecipe>;
  getMeasurementPrefs(): Promise<MeasurementPrefs>;
  setMeasurementPrefs(prefs: MeasurementPrefs): Promise<MeasurementPrefs>;
  exportAll(): Promise<ExportPayload>;
  importAll(payload: ExportPayload): Promise<{ imported: number }>;

  isNative(): boolean;
  getMode(): Promise<DataSourceMode>;
  setMode(mode: DataSourceMode): Promise<void>;
  getDockerConfig(): Promise<DockerConfig>;
  setDockerConfig(cfg: DockerConfig): Promise<void>;
  pickSafFolder(): Promise<SafFolderInfo | null>;
  getSafFolder(): Promise<SafFolderInfo | null>;
  clearSafFolder(): Promise<void>;
  syncNow(): Promise<SyncResult>;
  getSyncStatus(): Promise<SyncStatus>;
  listConflicts(): Promise<RecipeConflict[]>;
  resolveConflict(id: string, choice: "local" | "remote"): Promise<void>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
