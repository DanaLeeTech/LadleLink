import { WebPlugin } from "@capacitor/core";
import type { LlBridgePlugin, FolderInfo } from "./definitions";

export class LlBridgeWeb extends WebPlugin implements LlBridgePlugin {
  async pickFolder(): Promise<FolderInfo> {
    throw this.unavailable("SAF folder picker is only available on Android");
  }

  async getFolder(): Promise<FolderInfo | null> {
    return null;
  }

  async clearFolder(): Promise<void> {
    // no-op on web
  }

  async readTextFile(): Promise<{ content: string }> {
    throw this.unavailable("SAF file access is only available on Android");
  }

  async writeTextFile(): Promise<void> {
    throw this.unavailable("SAF file access is only available on Android");
  }

  async consumeSharedUrl(): Promise<{ url: string | null }> {
    return { url: null };
  }
}
