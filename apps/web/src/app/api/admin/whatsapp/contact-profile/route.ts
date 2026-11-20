import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { barbaContactProfiles, orders, staffUsers } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { barbaContactPhone, barbaOrderPhoneKeys, CONTACT_ROLES, type BarbaContactProfile } from "@/lib/barba-contact";

const inputSchema = z.object({ account: z.literal("cogia"), jid: z.string().max(60) });

async function getProfile(phone: string, canEdit: boolean): Promise<BarbaContactProfile> {
  const keys = barbaOrderPhoneKeys(phone);
  const [[manual], [staff], [history]] = await Promise.all([
    db.select({ role: barbaContactProfiles.role }).from(barbaContactProfiles).where(eq(barbaContactProfiles.phone, phone)),
    db.select({ name: staffUsers.name, role: staffUsers.role }).from(staffUsers)
      .where(and(eq(staffUsers.active, true), inArray(staffUsers.whatsappPhone, keys),
        inArray(staffUsers.role, ["admin", "manager", "driver"])))
      .orderBy(sql`${staffUsers.whatsappPhone} = ${phone} desc`).limit(1),
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
  const manualRole = manual?.role === "customer" && !customer ? null : manual?.role;
  const staffRole = staff?.role === "admin" || staff?.role === "manager" || staff?.role === "driver" ? staff.role : null;
  return {
    role: manualRole ?? staffRole ?? (customer ? "customer" : null),
    source: manualRole ? "manual" : staffRole ? "staff" : customer ? "orders" : null,
    name: staff?.name ?? null,
    customer,
    canEdit,
  };
}

export const GET = withStaff(async (request, _context, session) => {
  const input = inputSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const phone = input.success ? barbaContactPhone(input.data.jid) : null;
  if (!phone) return Response.json({ error: "Informe um contato individual do Barba Delivery." }, { status: 422 });
  return Response.json(await getProfile(phone, session.role === "admin" || session.role === "manager"),
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
  if (role === "customer" && !(await getProfile(phone, true)).customer) {
    return Response.json({ error: "O contato precisa ter um pedido confirmado para ser classificado como cliente." }, { status: 422 });
  }
  if (role === null) {
    await db.delete(barbaContactProfiles).where(eq(barbaContactProfiles.phone, phone));
  } else {
    await db.insert(barbaContactProfiles).values({ phone, role }).onConflictDoUpdate({
      target: barbaContactProfiles.phone, set: { role, updatedAt: new Date() },
    });
  }
  return Response.json(await getProfile(phone, true));
});
