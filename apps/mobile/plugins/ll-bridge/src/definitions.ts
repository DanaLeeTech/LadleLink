export interface FolderInfo {
  uri: string;
  name: string;
}

export interface LlBridgePlugin {
  /** Open SAF folder picker; returns persisted tree URI info. */
  pickFolder(): Promise<FolderInfo>;
  /** Return previously picked folder, if any. */
  getFolder(): Promise<FolderInfo | null>;
  /** Clear persisted SAF tree permission. */
  clearFolder(): Promise<void>;
  /** Read UTF-8 text file relative to the SAF tree (e.g. ladlelink.json). */
  readTextFile(options: { path: string }): Promise<{ content: string }>;
  /** Write UTF-8 text file relative to the SAF tree. Creates or replaces. */
  writeTextFile(options: { path: string; content: string }): Promise<void>;
  /** Return a pending shared URL from Android SEND intent, if any. */
  consumeSharedUrl(): Promise<{ url: string | null }>;
}
