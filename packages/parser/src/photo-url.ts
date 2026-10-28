/**
 * Resolve a photo URL against the page it came from. Coles and friends publish
 * root-relative og:image paths ("/content/dam/…"), which the app would otherwise
 * resolve against its own origin and show as a broken image.
 */
export function resolvePhotoUrl(raw: string | null | undefined, base: string): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const resolved = new URL(trimmed, base);
    if (resolved.protocol === "http:" || resolved.protocol === "https:") return resolved.href;
  } catch {
    // No usable base URL: keep what the page gave us.
  }
  return trimmed;
}
