// Shared rules for owner-uploaded images. Kept dependency-free and pure so the
// upload API route can enforce them server-side AND a unit test can exercise them
// without a DB or HTTP. The admin ImageUploader downscales client-side before
// sending, so the server cap is a safety net for oversized/hand-crafted requests.

/** MIME types we accept for menu/product images. GIF is allowed for the rare
 *  animated item badge; SVG is deliberately excluded (it can carry scripts). */
export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

/** Hard server-side ceiling. The client downscales to well under this (~1600px,
 *  ~0.82 quality → typically 80–300 KB); anything above 6 MB is almost certainly
 *  an un-resized original or an abusive request, so we reject it outright. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export interface UploadCheck {
  mime: string;
  size: number;
}

export type UploadValidation =
  | { ok: true; mime: AllowedImageMime }
  | { ok: false; error: string };

/**
 * Validate an incoming image upload. Returns a discriminated result rather than
 * throwing so the caller can map it straight to an HTTP status + pt-BR message.
 */
export function validateUpload({ mime, size }: UploadCheck): UploadValidation {
  const normalized = mime.trim().toLowerCase();
  if (!ALLOWED_IMAGE_MIMES.includes(normalized as AllowedImageMime)) {
    return {
      ok: false,
      error: "Formato inválido. Envie uma imagem JPG, PNG, WebP ou GIF.",
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Arquivo vazio ou ilegível." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `Imagem muito grande (máx. ${mb} MB).` };
  }
  return { ok: true, mime: normalized as AllowedImageMime };
}

/**
 * Identify an image by its magic bytes, ignoring any client-declared type. The
 * upload route uses THIS (not the multipart part's `type`) as the authoritative
 * MIME it stores and later serves, so a hand-crafted request can't get us to
 * label an HTML/script payload as an image. Returns null for anything that isn't
 * one of our allowed raster formats.
 */
export function sniffImageMime(bytes: Uint8Array): AllowedImageMime | null {
  const b = bytes;
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "image/png";
  // GIF: "GIF87a" / "GIF89a"
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  // WEBP: "RIFF"...."WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  return null;
}

/**
 * True when a string is an acceptable value for products.imageUrl: either an
 * absolute http(s) URL (e.g. the legacy anota.ai CDN links) or a root-relative
 * path (our own "/api/media/<id>" or "/generated/..." self-hosted images).
 * The old create-product route required a fully-qualified URL, which silently
 * rejected every self-hosted/uploaded image — this predicate is the shared fix.
 */
export function isValidImageRef(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//"); // root-relative, not protocol-relative
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
