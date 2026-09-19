import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { brandFromHost, getBrandStorefront } from "@/lib/brand-storefront";

export const dynamic = "force-dynamic";

// Public: the mobile app reads this for the hero and footer. The store_settings
// row also carries the pix credentials, so the columns are enumerated one by one
// — a `select().from()` here would leak pixKey to anyone hitting the endpoint.
// Open/closed state is deliberately absent: /api/store-status owns it.
export async function GET() {
  const requestHeaders = await headers();
  const brandSlug = brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  if (brandSlug) {
    const brand = getBrandStorefront(brandSlug);
    return Response.json({
      storeName: brand.name,
      tagline: brand.tagline,
      phone: null,
      whatsapp: null,
      address: "Jaraguá do Sul · Santa Catarina",
      instagramUrl: null,
      openingHours: null,
      deliveryFeeText: brand.delivery,
    });
  }

  const [settings] = await db
    .select({
      storeName: storeSettings.storeName,
      tagline: storeSettings.tagline,
      phone: storeSettings.phone,
      whatsapp: storeSettings.whatsapp,
      address: storeSettings.address,
      instagramUrl: storeSettings.instagramUrl,
      openingHours: storeSettings.openingHours,
      deliveryFeeText: storeSettings.deliveryFeeText,
    })
    .from(storeSettings)
    .where(eq(storeSettings.id, 1));

  return Response.json({
    storeName: settings?.storeName ?? null,
    tagline: settings?.tagline ?? null,
    phone: settings?.phone ?? null,
    whatsapp: settings?.whatsapp ?? null,
    address: settings?.address ?? null,
    instagramUrl: settings?.instagramUrl ?? null,
    openingHours: settings?.openingHours ?? null,
    deliveryFeeText: settings?.deliveryFeeText ?? null,
  });
}
