import Link from "next/link";
import { and, eq, or, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { getMember } from "@/lib/member-auth";
import { requireStaff } from "@/lib/admin-auth";
import { landingPath } from "@/lib/permissions";
import { CustomerLogout } from "./CustomerLogout";
export async function CustomerEntry() {
  const [member, staff] = await Promise.all([getMember(), requireStaff().catch(() => null)]);
  const offers = await db.select({ id: coupons.id, code: coupons.code, description: coupons.description, discountType: coupons.discountType, discountValue: coupons.discountValue, minOrderCents: coupons.minOrderCents }).from(coupons).where(and(eq(coupons.active, true), or(eq(coupons.audience, "all"), eq(coupons.audience, member ? "member" : "visitor")), or(isNull(coupons.expiresAt), sql`${coupons.expiresAt} > now()`), or(isNull(coupons.maxUsages), sql`${coupons.usedCount} < ${coupons.maxUsages}`))).limit(6);
  return <section className="w-full max-w-5xl mx-auto px-4 py-5" aria-label="Seu acesso e ofertas"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4"><div><strong>{member ? `Olá, ${member.name}` : "Bem-vindo ao Barbacue"}</strong><p className="text-sm text-[var(--text-muted)]">{member ? "Cliente da casa" : "Você está navegando como cliente visitante."}</p></div><div className="flex flex-wrap items-center gap-4 text-sm">{member ? <CustomerLogout /> : <Link href="/conta" className="btn-brand px-4 py-2 rounded-lg">Entrar ou criar conta</Link>}<Link className="underline" href={staff ? landingPath(staff) : "/admin/login"}>{staff ? "Minha área de trabalho" : "Acesso da equipe"}</Link></div></div>{offers.length > 0 && <div className="mt-5"><h2 className="font-semibold mb-3">Ofertas para {member ? "clientes da casa" : "visitantes"}</h2><div className="flex gap-3 overflow-x-auto pb-2">{offers.map(offer => <article key={offer.id} className="min-w-60 max-w-80 border border-[var(--border-hover)] rounded-lg bg-white p-4"><strong>{offer.discountType === "percentage" ? `${offer.discountValue}% de desconto` : `R$ ${(offer.discountValue / 100).toFixed(2).replace(".", ",")} de desconto`}</strong><p className="text-sm my-2 text-[var(--text-muted)]">{offer.description || "Use o cupom ao finalizar seu pedido."}</p><p className="text-sm">Cupom: <strong>{offer.code}</strong></p>{!!offer.minOrderCents && <p className="text-xs mt-2">Pedido mínimo: R$ {(offer.minOrderCents / 100).toFixed(2).replace(".", ",")}</p>}</article>)}</div></div>}</section>;
}
