import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { barbaContactProfiles, orders } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { barbaContactPhone, barbaOrderPhoneKeys, CONTACT_ROLES, type BarbaContactProfile } from "@/lib/barba-contact";
import { findBarbaContactRole } from "@/lib/barba-contact-role";

const inputSchema = z.object({ account: z.literal("cogia"), jid: z.string().max(60) });

async function getProfile(phone: string, canAssignManagement: boolean, isManager = false): Promise<BarbaContactProfile> {
  const keys = barbaOrderPhoneKeys(phone);
  const [{ manualRole, staffRole, staff }, [history]] = await Promise.all([
    findBarbaContactRole(phone),
    db.select({
      orderCount: sql<number>`count(*)::int`,
      lastOrderAt: sql<string | null>`max(coalesce(${orders.sourceCreatedAt}, ${orders.createdAt}))::text`,
      brands: sql<string[]>`coalesce(array_agg(distinct ${orders.brand} order by ${orders.brand}), array[]::text[])`,
    }).from(orders).where(and(
      inArray(sql`customer_phone_key(${orders.customerPhone})`, keys),
      sql`${orders.channel} IS DISTINCT FROM 'test'`,
      sql`${orders.status} IN ('confirmed', 'preparing', 'ready', 'delivered')`,
    )),
  ]);
  const customer = history.orderCount && history.lastOrderAt
    ? { orderCount: history.orderCount, lastOrderAt: history.lastOrderAt, brands: history.brands }
    : null;
  const role = manualRole ?? staffRole ?? "customer";
  return {
    role,
    source: manualRole ? "manual" : staffRole ? "staff" : customer ? "orders" : null,
    name: staff?.name ?? null,
    customer,
    canEdit: canAssignManagement || (isManager && role !== "admin" && role !== "manager"),
    canAssignManagement,
  };
}

export const GET = withStaff(async (request, _context, session) => {
  const input = inputSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const phone = input.success ? barbaContactPhone(input.data.jid) : null;
  if (!phone) return Response.json({ error: "Informe um contato individual do Barba Delivery." }, { status: 422 });
  return Response.json(await getProfile(phone, session.role === "admin", session.role === "manager"),
    { headers: { "Cache-Control": "no-store" } });
});

export const POST = withStaff(async (request, _context, session) => {
  if (session.role !== "admin" && session.role !== "manager") {
    return Response.json({ error: "Somente administradores e gerentes podem classificar contatos." }, { status: 403 });
  }
  const input = inputSchema.extend({ role: z.enum(CONTACT_ROLES).nullable() }).safeParse(await request.json().catch(() => null));
  const phone = input.success ? barbaContactPhone(input.data.jid) : null;
  if (!input.success || !phone) return Response.json({ error: "Contato ou perfil inválido." }, { status: 422 });
  const { role } = input.data;
  const isAdmin = session.role === "admin";
  if (!isAdmin) {
    const current = await getProfile(phone, false, true);
    if (!current.canEdit || role === "admin" || role === "manager") {
      return Response.json({ error: "Somente administradores podem alterar perfis de gestão." }, { status: 403 });
    }
  }
  const editable = isAdmin ? undefined : sql`${barbaContactProfiles.role} not in ('admin', 'manager')`;
  if (role === null) {
    await db.delete(barbaContactProfiles).where(and(eq(barbaContactProfiles.phone, phone), editable));
  } else {
    await db.insert(barbaContactProfiles).values({ phone, role }).onConflictDoUpdate({
      target: barbaContactProfiles.phone, set: { role, updatedAt: new Date() }, setWhere: editable,
    });
  }
  return Response.json(await getProfile(phone, isAdmin, !isAdmin));
});
