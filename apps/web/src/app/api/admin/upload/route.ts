import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { validateUpload, sniffImageMime } from "@/lib/upload";

// Node runtime: we read the DB via node-postgres and handle Buffers. Never Edge.
export const runtime = "nodejs";

/**
 * Owner image upload. Accepts multipart/form-data with a single `file` field,
 * validates type/size, stores the raw bytes in Postgres (media_assets), and
 * returns a stable, cacheable URL the caller drops straight into products.imageUrl.
 *
 *   POST /api/admin/upload   (field: file)  →  { url, mime, byteSize, id }
 *
 * Storing in the DB (not the filesystem) is intentional — see the media_assets
 * table comment: rsync --delete deploys would otherwise wipe uploaded files.
 */
export const POST = withStaff(async (req: NextRequest) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envio inválido (esperado multipart/form-data)." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const check = validateUpload({ mime: file.type, size: file.size });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 422 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Re-check the true byte length; also re-enforce the size cap on the decoded
  // bytes (File.size is client-supplied and could understate the real payload).
  const sizeCheck = validateUpload({ mime: check.mime, size: buffer.byteLength });
  if (!sizeCheck.ok) {
    return NextResponse.json({ error: sizeCheck.error }, { status: 422 });
  }

  // Authoritative type from the actual bytes — never the client's declared MIME.
  // A request claiming image/png but carrying HTML is rejected here, so what we
  // store and later serve as Content-Type always matches the real content.
  const mime = sniffImageMime(buffer);
  if (!mime) {
    return NextResponse.json(
      { error: "Conteúdo não é uma imagem válida (JPG, PNG, WebP ou GIF)." },
      { status: 422 },
    );
  }

  const [asset] = await db
    .insert(mediaAssets)
    .values({ mime, data: buffer, byteSize: buffer.byteLength })
    .returning({ id: mediaAssets.id });

  return NextResponse.json(
    { id: asset.id, url: `/api/media/${asset.id}`, mime, byteSize: buffer.byteLength },
    { status: 201 },
  );
});
