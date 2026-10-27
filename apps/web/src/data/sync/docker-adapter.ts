import type { ExportPayload, MeasurementPrefs } from "@ladlelink/types";
import { CapacitorHttp } from "@capacitor/core";
import { dockerApi } from "../api-repository";
import type { DockerConfig } from "../repository";
import type { RemoteSnapshot } from "./types";

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

async function nativeOrFetch(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<unknown> {
  const url = `${normalizeBase(baseUrl)}${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  try {
    const res = await CapacitorHttp.request({
      url,
      method: (options.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE",
      headers,
      data: options.body,
      connectTimeout: 15000,
      readTimeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) {
      const err =
        typeof res.data === "object" && res.data && "error" in res.data
          ? String((res.data as { error: string }).error)
          : `HTTP ${res.status}`;
      throw new Error(err);
    }
    if (res.status === 204) return undefined;
    return res.data;
  } catch (err) {
    if (String(err).includes("CapacitorHttp") || String(err).includes("not implemented")) {
      return dockerApi(baseUrl, path, {
        method: options.method,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        token: options.token,
      });
    }
    throw err;
  }
}

export async function dockerHealth(cfg: DockerConfig): Promise<{ ok: boolean; message: string }> {
  const base = normalizeBase(cfg.baseUrl);
  if (!base) return { ok: false, message: "Base URL is required" };
  try {
    const res = await CapacitorHttp.request({
      url: `${base}/api/health`,
      method: "GET",
      connectTimeout: 8000,
      readTimeout: 8000,
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, message: "Connected" };
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return { ok: true, message: "Connected" };
      return { ok: false, message: `HTTP ${res.status}` };
    } catch {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }
}

export async function dockerPullSnapshot(cfg: DockerConfig): Promise<RemoteSnapshot> {
  const data = (await nativeOrFetch(cfg.baseUrl, "/api/export", {
    method: "GET",
    token: cfg.authToken || undefined,
  })) as ExportPayload;
  return {
    recipes: data.recipes ?? [],
    measurement: data.settings?.measurement,
  };
}

export async function dockerDeleteRecipe(cfg: DockerConfig, id: string): Promise<void> {
  await nativeOrFetch(cfg.baseUrl, `/api/recipes/${id}`, {
    method: "DELETE",
    token: cfg.authToken || undefined,
  });
}

export async function dockerPushMeasurement(
  cfg: DockerConfig,
  prefs: MeasurementPrefs
): Promise<void> {
  await nativeOrFetch(cfg.baseUrl, "/api/settings/measurement", {
    method: "PUT",
    body: prefs,
    token: cfg.authToken || undefined,
  });
}

export async function dockerImportFromUrl(
  cfg: DockerConfig,
  url: string
): Promise<unknown> {
  return nativeOrFetch(cfg.baseUrl, "/api/recipes/import", {
    method: "POST",
    body: { url },
    token: cfg.authToken || undefined,
  });
}

/** Push merge export so recipe IDs and updatedAt are preserved (LWW on server). */
export async function dockerPushExport(
  cfg: DockerConfig,
  payload: ExportPayload
): Promise<void> {
  await nativeOrFetch(cfg.baseUrl, "/api/import?mode=merge", {
    method: "POST",
    body: payload,
    token: cfg.authToken || undefined,
  });
}
