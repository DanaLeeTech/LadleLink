import { Router, raw } from "express";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuid } from "uuid";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DIR_BYTES = 500 * 1024 * 1024;

/** Identify an image by its first bytes, not by the client's label. */
function detectImageType(buf: Buffer): { ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg" };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: "png" };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp" };
  }
  const head = buf.length >= 6 ? buf.subarray(0, 6).toString("ascii") : "";
  if (head === "GIF87a" || head === "GIF89a") return { ext: "gif" };
  return null;
}

function dirBytes(dir: string): number {
  let total = 0;
  for (const file of readdirSync(dir)) {
    try {
      total += statSync(join(dir, file)).size;
    } catch {
      // A file removed mid-count just doesn't count.
    }
  }
  return total;
}

/**
 * Upload one photo. The web app downscales before sending; this endpoint still
 * caps per file and for the whole folder, because the full app can be public.
 */
export function photosRouter(photosDir: string): Router {
  const router = Router();

  router.post(
    "/",
    raw({ type: ["image/jpeg", "image/png", "image/webp", "image/gif"], limit: MAX_FILE_BYTES }),
    (req, res) => {
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      if (!buf || !buf.length) {
        res.status(415).json({ error: "Send the image as raw bytes with an image content type" });
        return;
      }
      const kind = detectImageType(buf);
      if (!kind) {
        res.status(415).json({ error: "Only JPEG, PNG, WebP or GIF images are accepted" });
        return;
      }
      if (dirBytes(photosDir) + buf.length > MAX_DIR_BYTES) {
        res.status(507).json({ error: "Photo storage is full" });
        return;
      }
      const name = `${uuid()}.${kind.ext}`;
      writeFileSync(join(photosDir, name), buf);
      res.status(201).json({ url: `/api/photos/${name}` });
    }
  );

  return router;
}
