import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/admin-auth";
import { getCoverageDocument } from "@/lib/document-coverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const document = getCoverageDocument(id);
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const root = path.resolve(process.env.DOCUMENT_COVERAGE_DIR || path.join(process.cwd(), ".data", "document-coverage"));
  const filePath = path.join(root, document.storedName);
  try {
    const info = await stat(filePath);
    const extension = path.extname(document.storedName).toLowerCase() || ".bin";
    const contentType = extension === ".pdf"
      ? "application/pdf"
      : extension === ".csv"
        ? "text/csv; charset=utf-8"
        : extension === ".txt"
          ? "text/plain; charset=utf-8"
          : extension === ".ofx"
            ? "application/x-ofx"
            : "application/octet-stream";
    const asciiName = document.name.replace(/[^A-Za-z0-9._ -]/g, "_") + extension;
    const disposition = extension === ".pdf" ? "inline" : "attachment";
    const headers = {
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(`${document.name}${extension}`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.method === "HEAD") return new Response(null, { headers });
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers });
  } catch {
    return NextResponse.json({ error: "O arquivo não está disponível no armazenamento protegido." }, { status: 404 });
  }
}

export const GET = withRole("admin", serve);
export const HEAD = withRole("admin", serve);
