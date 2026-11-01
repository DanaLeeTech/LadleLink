/** Uploaded photos are served by the full app from this path. */
export const UPLOADED_PHOTO_PREFIX = "/api/photos/";

export function isUploadedPhoto(url: string | null | undefined): boolean {
  return !!url && url.startsWith(UPLOADED_PHOTO_PREFIX);
}
