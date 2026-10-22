import images from "@/data/generated-brand-images.json";
import type { BrandSlug } from "./brand-storefront";

/** Only use illustrations reviewed for the exact product identity and name. */
export function generatedBrandImage(brand: BrandSlug, externalId: string, name: string): string | null {
  return images.find((image) => image.brand === brand && image.id === externalId && image.name === name)?.imageUrl ?? null;
}
