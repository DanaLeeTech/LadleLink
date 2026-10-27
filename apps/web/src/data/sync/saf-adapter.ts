import type { ExportPayload } from "@ladlelink/types";
import type { RemoteSnapshot } from "./types";
import { snapshotFromExport } from "./types";

const STORE_FILE = "ladlelink.json";

type LlBridgeLike = {
  pickFolder: () => Promise<{ uri: string; name: string }>;
  getFolder: () => Promise<{ uri: string; name: string } | null>;
  clearFolder: () => Promise<void>;
  readTextFile: (opts: { path: string }) => Promise<{ content: string }>;
  writeTextFile: (opts: { path: string; content: string }) => Promise<void>;
  consumeSharedUrl: () => Promise<{ url: string | null }>;
};

let bridgePromise: Promise<LlBridgeLike | null> | null = null;

async function getBridge(): Promise<LlBridgeLike | null> {
  if (!bridgePromise) {
    bridgePromise = (async () => {
      try {
        const mod = await import("@ladlelink/ll-bridge");
        return mod.LlBridge as LlBridgeLike;
      } catch {
        return null;
      }
    })();
  }
  return bridgePromise;
}

export async function safPickFolder(): Promise<{ uri: string; name: string } | null> {
  const bridge = await getBridge();
  if (!bridge) throw new Error("SAF bridge unavailable");
  return bridge.pickFolder();
}

export async function safGetFolder(): Promise<{ uri: string; name: string } | null> {
  const bridge = await getBridge();
  if (!bridge) return null;
  return bridge.getFolder();
}

export async function safClearFolder(): Promise<void> {
  const bridge = await getBridge();
  if (!bridge) return;
  await bridge.clearFolder();
}

export async function safConsumeSharedUrl(): Promise<string | null> {
  const bridge = await getBridge();
  if (!bridge) return null;
  const { url } = await bridge.consumeSharedUrl();
  return url;
}

export async function safPullSnapshot(): Promise<RemoteSnapshot | null> {
  const bridge = await getBridge();
  if (!bridge) throw new Error("SAF bridge unavailable");
  try {
    const { content } = await bridge.readTextFile({ path: STORE_FILE });
    const payload = JSON.parse(content) as ExportPayload;
    if (payload.version !== 1 || !Array.isArray(payload.recipes)) {
      throw new Error("Invalid ladlelink.json");
    }
    return snapshotFromExport(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found") || message.includes("File not found")) {
      return null;
    }
    throw err;
  }
}

export async function safPushSnapshot(payload: ExportPayload): Promise<void> {
  const bridge = await getBridge();
  if (!bridge) throw new Error("SAF bridge unavailable");
  await bridge.writeTextFile({
    path: STORE_FILE,
    content: JSON.stringify(payload, null, 2),
  });
}

export { STORE_FILE };
