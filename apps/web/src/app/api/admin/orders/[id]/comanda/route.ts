import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kitchenPrintJobs } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { ticketPartPdf } from "@/lib/ticket-pdf";

type Params = { params: Promise<{ id: string }> };

// PDF da parte N da comanda, exatamente como iria para a impressora Elgin.
export const GET = withStaff(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  const part = Number(req.nextUrl.searchParams.get("parte") ?? "1");
  if (!Number.isInteger(part) || part < 1 || part > 3) return NextResponse.json({ error: "Parte inválida" }, { status: 400 });
  const [job] = await db.select({ ticket: kitchenPrintJobs.ticket }).from(kitchenPrintJobs).where(eq(kitchenPrintJobs.orderId, id));
  if (!job) return NextResponse.json({ error: "Este pedido não gerou comanda" }, { status: 404 });
  let pdf: Buffer | null;
  try { pdf = ticketPartPdf(job.ticket, part); }
  catch { return NextResponse.json({ error: "Comanda inválida para impressão" }, { status: 422 }); }
  if (!pdf) return NextResponse.json({ error: "Parte não encontrada" }, { status: 404 });
  const name = `comanda-${id.slice(0, 8).toUpperCase()}-parte-${part}.pdf`;
  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${req.nextUrl.searchParams.get("baixar") ? "attachment" : "inline"}; filename="${name}"`,
    "Cache-Control": "private, no-store",
  } });
});
