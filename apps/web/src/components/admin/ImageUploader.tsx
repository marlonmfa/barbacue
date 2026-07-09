"use client";

import { useRef, useState } from "react";
import { ALLOWED_IMAGE_MIMES, validateUpload, MAX_UPLOAD_BYTES } from "@/lib/upload";

interface Props {
  /** Current image URL/path (absolute or root-relative). Empty = no image. */
  value: string;
  /** Called with the new URL once an upload finishes, or "" when removed. */
  onChange: (url: string) => void;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

// Re-encode a picked image in the browser so we never ship a 5 MB phone photo to
// the server (or into Postgres). Downscales the longest edge to `maxDim` and
// re-compresses to WebP. Animated GIFs bypass this (a canvas would freeze them).
async function resizeImageFile(
  file: File,
  maxDim = 1600,
  quality = 0.82,
): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    // Only keep the re-encoded version if it actually helped (some tiny PNGs grow).
    return blob && blob.size > 0 && blob.size < file.size ? blob : file;
  } catch {
    return file; // decode failed → let the server validate the original
  }
}

const ACCEPT = ALLOWED_IMAGE_MIMES.join(",");

/**
 * Drop-in image field for the admin: shows a live preview, lets the owner drag &
 * drop or pick a file (which is downscaled + uploaded to /api/admin/upload), and
 * keeps a collapsed "paste a URL" escape hatch for the rare external link.
 */
export function ImageUploader({ value, onChange, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  async function handleFile(file: File) {
    if (uploading) return; // ignore a second pick/drop while one is in flight
    setError(null);
    // Pre-flight with the SAME rules the server enforces, for instant feedback.
    const pre = validateUpload({ mime: file.type, size: file.size });
    if (!pre.ok) {
      setError(pre.error);
      return;
    }
    setUploading(true);
    try {
      const blob = await resizeImageFile(file);
      if (blob.size > MAX_UPLOAD_BYTES) {
        setError("Imagem muito grande mesmo após compressão. Escolha outra.");
        return;
      }
      const ext = blob.type === "image/gif" ? "gif" : blob.type === "image/png" ? "png" : "webp";
      const fd = new FormData();
      fd.append("file", blob, `produto.${ext}`);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Falha no upload. Tente novamente.");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Falha no upload. Verifique a conexão e tente de novo.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Enviar imagem do produto"
        className={`relative flex items-center gap-4 rounded-xl border border-dashed px-4 py-4 cursor-pointer transition-colors ${
          dragOver
            ? "border-[#ed1b24] bg-[#ed1b24]/10"
            : "border-[#352b24] bg-[#241d18] hover:border-[#5a4a3c]"
        }`}
      >
        {/* Preview / placeholder */}
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#0e0b0a] flex-shrink-0 flex items-center justify-center">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview, any origin/relative path
            <img src={value} alt="Prévia" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">🍔</span>
          )}
        </div>

        <div className="min-w-0">
          {uploading ? (
            <p className="text-sm text-[#c8b89a] font-medium flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-[#ed1b24] border-t-transparent rounded-full animate-spin" />
              Enviando…
            </p>
          ) : (
            <>
              <p className="text-sm text-white font-medium">
                {value ? "Trocar imagem" : "Enviar imagem"}
              </p>
              <p className="text-xs text-[#a89a8c] mt-0.5">
                Arraste uma foto aqui ou clique para escolher. JPG, PNG, WebP ou GIF.
              </p>
            </>
          )}
        </div>

        {value && !uploading && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setError(null);
            }}
            className="ml-auto text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 transition-colors flex-shrink-0"
          >
            Remover
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Advanced escape hatch: paste an external URL directly. */}
      <button
        type="button"
        onClick={() => setShowUrl((s) => !s)}
        className="text-xs text-[#7c6f61] hover:text-[#a89a8c] self-start transition-colors"
      >
        {showUrl ? "▾ Ocultar URL" : "▸ Ou colar uma URL de imagem"}
      </button>
      {showUrl && (
        <input
          type="url"
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-[#241d18] border border-[#352b24] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ed1b24] placeholder-[#7c6f61] w-full"
        />
      )}
    </div>
  );
}
