import { readToken } from "../auth-context";

/** Longest edge kept when a picked photo is shrunk before upload. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file; // canvas would drop the animation
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    return blob ?? file;
  } catch {
    return file; // a format this browser cannot decode goes up untouched
  }
}

/** Upload one photo and return its /api/photos/... address. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await shrink(file);
  const headers = new Headers();
  headers.set("Content-Type", blob.type || file.type || "application/octet-stream");
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch("/api/photos", { method: "POST", headers, body: blob });
  if (!res.ok) {
    let message = `Upload failed (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Keep the status message when the body is not JSON.
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
