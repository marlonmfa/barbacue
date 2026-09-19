export const BRANDS = { barbacue: "Barbacue", chelas: "Chelas", barbadog: "Barbadog" } as const;
export type Brand = keyof typeof BRANDS;
export function isBrand(value: unknown): value is Brand {
  return typeof value === "string" && Object.hasOwn(BRANDS, value);
}
