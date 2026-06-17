import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const SettingsSchema = z.object({
  storeName: z.string().min(1).optional(),
  tagline: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  openingHours: z.string().optional().nullable(),
  deliveryFeeText: z.string().optional().nullable(),
  isOpen: z.boolean().optional(),
});

export async function GET() {
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return NextResponse.json(settings ?? null);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const [updated] = await db
    .update(storeSettings)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(storeSettings.id, 1))
    .returning();

  return NextResponse.json(updated);
}
