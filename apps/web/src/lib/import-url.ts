/**
 * Accept "recipetineats.com/butter-chicken/" as https — people rarely type the
 * scheme. Returns null when the text cannot be a web address.
 */
export function normalizeImportUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Leave an explicit scheme alone; add https to a bare address.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** The message shown when the address cannot be used. */
export const INVALID_IMPORT_URL_MESSAGE = "Enter a web address such as example.com/recipe";
