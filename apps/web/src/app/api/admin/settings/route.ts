import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withStaff, type AdminSession } from "@/lib/admin-auth";

const DayHoursSchema = z.object({
  day: z.number().int().min(0).max(6),
  closed: z.boolean(),
  ranges: z
    .array(
      z.object({
        open: z.string().regex(/^\d{1,2}:\d{2}$/),
        close: z.string().regex(/^\d{1,2}:\d{2}$/),
      }),
    )
    .default([]),
});

const SettingsSchema = z.object({
  storeName: z.string().min(1).optional(),
  tagline: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  openingHours: z.string().optional().nullable(),
  weeklyHours: z.array(DayHoursSchema).optional().nullable(),
  timezone: z.string().optional().nullable(),
  deliveryFeeText: z.string().optional().nullable(),
  isOpen: z.boolean().optional(),
  // ─── Pix payment config (admin-only) ───
  pixKey: z.string().optional().nullable(),
  pixMerchantName: z.string().max(25).optional().nullable(),
  pixMerchantCity: z.string().max(15).optional().nullable(),
});

// Fields only an admin may read/write — they configure where money goes.
const ADMIN_ONLY_FIELDS = ["pixKey", "pixMerchantName", "pixMerchantCity"] as const;

export const GET = withStaff(async (_req, _ctx, session: AdminSession) => {
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (!settings) return NextResponse.json(null);
  if (session.role !== "admin") {
    // Redact the payment config from managers.
    const { pixKey: _k, pixMerchantName: _n, pixMerchantCity: _c, ...rest } = settings;
    return NextResponse.json({ ...rest, pixConfigured: Boolean(settings.pixKey) });
  }
  return NextResponse.json(settings);
});

export const PATCH = withStaff(async (req: NextRequest, _ctx, session: AdminSession) => {
  const body = await req.json().catch(() => null);
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(), message: "Dados de configuração inválidos." },
      { status: 422 },
    );
  }

  const data: Record<string, unknown> = { ...parsed.data };

  // Managers may save everything EXCEPT the payment config. Silently strip the
  // admin-only fields rather than 403 the whole save (their general edits still land).
  if (session.role !== "admin") {
    for (const f of ADMIN_ONLY_FIELDS) delete data[f];
  }

  const [updated] = await db
    .update(storeSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(storeSettings.id, 1))
    .returning();

  // Re-redact for the manager response.
  if (session.role !== "admin" && updated) {
    const { pixKey: _k, pixMerchantName: _n, pixMerchantCity: _c, ...rest } = updated;
    return NextResponse.json({ ...rest, pixConfigured: Boolean(updated.pixKey) });
  }
  return NextResponse.json(updated);
});
