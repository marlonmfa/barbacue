// Unit tests for the image-upload rules that gate the admin uploader AND the
// /api/admin/upload route (same module, one source of truth).
//
//   ../../node_modules/.bin/tsx --test tests/upload.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateUpload,
  isValidImageRef,
  sniffImageMime,
  ALLOWED_IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
} from "../src/lib/upload";

test("validateUpload: accepts each allowed image type", () => {
  for (const mime of ALLOWED_IMAGE_MIMES) {
    const r = validateUpload({ mime, size: 1024 });
    assert.equal(r.ok, true, `${mime} should be allowed`);
    if (r.ok) assert.equal(r.mime, mime);
  }
});

test("validateUpload: normalizes case/whitespace in the MIME", () => {
  const r = validateUpload({ mime: "  IMAGE/JPEG ", size: 2048 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.mime, "image/jpeg");
});

test("validateUpload: rejects disallowed types (svg is a scripting vector)", () => {
  for (const mime of ["image/svg+xml", "application/pdf", "text/html", ""]) {
    assert.equal(validateUpload({ mime, size: 1024 }).ok, false, `${mime} must be rejected`);
  }
});

test("validateUpload: rejects empty and oversized files", () => {
  assert.equal(validateUpload({ mime: "image/png", size: 0 }).ok, false);
  assert.equal(validateUpload({ mime: "image/png", size: -5 }).ok, false);
  assert.equal(validateUpload({ mime: "image/png", size: MAX_UPLOAD_BYTES + 1 }).ok, false);
  assert.equal(validateUpload({ mime: "image/png", size: MAX_UPLOAD_BYTES }).ok, true);
});

test("isValidImageRef: accepts absolute http(s) URLs", () => {
  assert.equal(isValidImageRef("https://client-assets.anota.ai/x/y-blob"), true);
  assert.equal(isValidImageRef("http://example.com/a.png"), true);
});

test("isValidImageRef: accepts our own root-relative paths", () => {
  assert.equal(isValidImageRef("/api/media/2b1c9e2a-0000-4000-8000-000000000000"), true);
  assert.equal(isValidImageRef("/generated/products/100.jpg"), true);
});

test("isValidImageRef: rejects junk and protocol-relative URLs", () => {
  assert.equal(isValidImageRef("not a url"), false);
  assert.equal(isValidImageRef("//evil.com/x.png"), false); // protocol-relative
  assert.equal(isValidImageRef("javascript:alert(1)"), false);
  assert.equal(isValidImageRef("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isValidImageRef(""), false);
});

test("sniffImageMime: recognizes real image magic bytes", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffImageMime(jpeg), "image/jpeg");
  assert.equal(sniffImageMime(png), "image/png");
  assert.equal(sniffImageMime(gif), "image/gif");
  assert.equal(sniffImageMime(webp), "image/webp");
});

test("sniffImageMime: rejects non-image / spoofed content", () => {
  // HTML masquerading as an upload — the whole point of sniffing.
  const html = new Uint8Array([...'<!DOCTYPE html>'].map((c) => c.charCodeAt(0)));
  const svg = new Uint8Array([...'<svg xmlns'].map((c) => c.charCodeAt(0)));
  assert.equal(sniffImageMime(html), null);
  assert.equal(sniffImageMime(svg), null);
  assert.equal(sniffImageMime(new Uint8Array([])), null);
  assert.equal(sniffImageMime(new Uint8Array([0xff, 0xd8])), null); // truncated JPEG sig
});
