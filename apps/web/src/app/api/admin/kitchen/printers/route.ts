import { withStaff } from "@/lib/admin-auth";
import { printerOverview, printerRouteSchema, savePrinterRoute } from "@/lib/kitchen-printers";

export const runtime = "nodejs";
export const GET = withStaff(async () => Response.json(await printerOverview(), { headers: { "Cache-Control": "no-store" } }));
export const PUT = withStaff(async request => {
  const parsed = printerRouteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Selecione o restaurante, a impressora e o papel." }, { status: 422 });
  if (!await savePrinterRoute(parsed.data)) return Response.json({ error: "Impressora indisponível. Atualize as impressoras no computador e tente novamente." }, { status: 409 });
  return Response.json({ ok: true });
});
