import { getMember } from "@/lib/member-auth";
import { offerApplies } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { code, subtotalCents } = await req.json().catch(() => ({}));

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const [coupon] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.toUpperCase().trim()));

  if (!coupon) {
    return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
  }
  if (!offerApplies(coupon.audience, !!(await getMember()))) return NextResponse.json({ error: "Este cupom não está disponível para o seu perfil de cliente." }, { status: 403 });
  if (!coupon.active) {
    return NextResponse.json({ error: "Cupom inativo" }, { status: 400 });
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Cupom expirado" }, { status: 400 });
  }
  if (coupon.maxUsages !== null && (coupon.usedCount ?? 0) >= coupon.maxUsages) {
    return NextResponse.json({ error: "Cupom esgotado" }, { status: 400 });
  }
  if (subtotalCents && coupon.minOrderCents && subtotalCents < coupon.minOrderCents) {
    return NextResponse.json({
      error: `Pedido mínimo para esse cupom: R$${((coupon.minOrderCents ?? 0) / 100).toFixed(2).replace(".", ",")}`,
    }, { status: 400 });
  }

  const discountCents =
    coupon.discountType === "percentage"
      ? Math.round((subtotalCents ?? 0) * (coupon.discountValue / 100))
      : coupon.discountValue;

  return NextResponse.json({
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountCents,
  });
}
