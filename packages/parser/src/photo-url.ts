/** How many page images the import review offers as choices. */
export const MAX_PHOTO_CANDIDATES = 8;

/** Resolve a whole page's images into the review's candidate list. */
export function resolvePhotoUrls(raws: Array<string | null | undefined>, base: string): string[] {
  const seen = new Set<string>();
  for (const raw of raws) {
    const url = resolvePhotoUrl(raw, base);
    if (!url) continue;
    // The same photo often appears in several sizes/crops; offer it once.
    let key = url;
    try {
      const parsed = new URL(url);
      key = `${parsed.origin}${parsed.pathname}`;
    } catch {
      // data: URLs and the like compare as they are.
    }
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size >= MAX_PHOTO_CANDIDATES) break;
  }
  return [...seen];
}

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
