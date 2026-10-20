export const BRANDS = { barbacue: "Barbacue", chelas: "Chelas", barbadog: "Barbadog" } as const;
export type Brand = keyof typeof BRANDS;
export function isBrand(value: unknown): value is Brand {
  return typeof value === "string" && Object.hasOwn(BRANDS, value);
}

/** Identidade visual usada no seletor de marcas do topo (cores das páginas de cada loja). */
export const BRAND_THEME: Record<Brand, { logo: string; icon: string; tagline: string; background: string; accent: string }> = {
  barbacue: { logo: "/brand/icons/barbacue-apple.png", icon: "/brand/icons/barbacue-icon.png", tagline: "Burguers na brasa", background: "#1c1410", accent: "#ed1b24" },
  chelas: { logo: "/brand/icons/chelas-apple.png", icon: "/brand/icons/chelas-icon.png", tagline: "Cocina mexicana", background: "#a90f22", accent: "#f4c93d" },
  barbadog: { logo: "/brand/icons/barbadog-apple.png", icon: "/brand/icons/barbadog-icon.png", tagline: "Hot dogs", background: "#182448", accent: "#ffd34e" },
};

/** Ordem fixa do topo (Chelas, Barbacue, Barbadog); só o tamanho muda conforme o domínio. */
export const SWITCHER_ORDER: Brand[] = ["chelas", "barbacue", "barbadog"];

export function brandSwitcherOrder(active: Brand): { slug: Brand; featured: boolean }[] {
  return SWITCHER_ORDER.map((slug) => ({ slug, featured: slug === active }));
}
