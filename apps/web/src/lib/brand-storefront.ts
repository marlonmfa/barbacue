import chelasMenu from "@/data/chelas.json";
import barbadogMenu from "@/data/barbadog.json";

export type BrandSlug = "chelas" | "barbadog";

export interface ScrapedMenuItem {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  originalPriceCents: number | null;
  imageUrl: string | null;
  category: string;
  ifoodUrl: string;
}

export interface BrandStorefront {
  slug: BrandSlug;
  name: string;
  kicker: string;
  tagline: string;
  description: string;
  monogram: string;
  ifoodUrl: string;
  minimumOrder: string;
  rating: string;
  delivery: string;
  scrapedAt: string;
  items: ScrapedMenuItem[];
}

const storefronts: Record<BrandSlug, BrandStorefront> = {
  chelas: {
    slug: "chelas",
    name: "Chelas Cocina Mexicana",
    kicker: "Cocina mexicana · Jaraguá do Sul",
    tagline: "Mucho sabor. Cero cerimônia.",
    description:
      "Quesadillas, burritos e nachos preparados para chegar à mesa com crocância, molho e personalidade.",
    monogram: "CH",
    ifoodUrl: process.env.IFOOD_CHELAS_URL ?? chelasMenu.ifoodUrl,
    minimumOrder: "Pedido mínimo R$ 30",
    rating: "4,9 no iFood",
    delivery: "Entrega pelo iFood",
    scrapedAt: chelasMenu.scrapedAt,
    items: chelasMenu.items,
  },
  barbadog: {
    slug: "barbadog",
    name: "Barbadog",
    kicker: "Hotdog & sandwich · Jaraguá do Sul",
    tagline: "Um dog de respeito, sem economia.",
    description:
      "Hot dogs de 25 cm, sanduíches e porções com molhos da casa, muito recheio e aquela assinatura Barbacue.",
    monogram: "BD",
    ifoodUrl: process.env.IFOOD_BARBADOG_URL ?? barbadogMenu.ifoodUrl,
    minimumOrder: "Confira o mínimo no iFood",
    rating: "Cardápio completo",
    delivery: "Entrega pelo iFood",
    scrapedAt: barbadogMenu.scrapedAt,
    items: barbadogMenu.items,
  },
};

function normalizeHost(value: string | null) {
  return (value ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
}

export function brandFromHost(value: string | null): BrandSlug | null {
  const host = normalizeHost(value);
  const chelasDomain = normalizeHost(process.env.DOMAIN_CHELAS ?? "chelas.hirableaiagents.com");
  const hotdogDomain = normalizeHost(process.env.DOMAIN_HOTDOG ?? "barbadog.hirableaiagents.com");

  if (host === chelasDomain || host.startsWith("chelas.")) return "chelas";
  if (host === hotdogDomain || host.startsWith("barbadog.")) return "barbadog";
  return null;
}

export function getBrandStorefront(slug: BrandSlug) {
  return storefronts[slug];
}
