// Maps a category to a generated fallback food photo (in /public/generated), used
// when a product has no imageUrl. 107/197 scraped products lack a CDN image; a
// category-appropriate appetizing photo reads as intentional branding instead of
// a wall of identical placeholders. Art is generated via OpenAI (see REDESIGN_V3.md).

export type ArtKey =
  | "burger"
  | "sides"
  | "sauce"
  | "drink"
  | "beer"
  | "cocktail"
  | "dessert"
  | "combo";

// Explicit slug → art key for the 26 known categories (authoritative).
const BY_SLUG: Record<string, ArtKey> = {
  hamburgueres: "burger",
  "hamburguer-vegetariano": "burger",
  "combos-individuais": "combo",
  "combos-para-compartilhar": "combo",
  combos: "combo",
  acompanhamentos: "sides",
  "para-acompanhar": "sides",
  porcoes: "sides",
  "turbinar-porcao": "sides",
  adicionais: "sauce",
  "adicionais-entrecot": "sauce",
  "turbine-seu-lanche": "sauce",
  molhos: "sauce",
  "bebidas-delivery": "drink",
  "suco-lata": "drink",
  "gas-sem": "drink",
  "cervejas-stannis": "beer",
  vinhos: "beer",
  drinks: "cocktail",
  "sabores-caipirinhas": "cocktail",
  sobremesas: "dessert",
  "sweet-barba": "dessert",
  "sobremesa-gelada": "dessert",
  "brigadeiro-de-colher": "dessert",
  "mini-churros": "dessert",
  sabores: "dessert",
};

// Keyword heuristic for any future category the owner adds (matched against
// slug + name, accent-insensitive). Order matters: most specific first.
const KEYWORDS: [RegExp, ArtKey][] = [
  [/burg|hamb|lanch|sandu|smash/i, "burger"],
  [/combo/i, "combo"],
  [/cervej|chopp|vinho|beer/i, "beer"],
  [/caipir|drink|coquetel|cocktail|gin|vodka/i, "cocktail"],
  [/refri|bebid|suco|agua|água|soda|coca|gas|guarana|guaraná/i, "drink"],
  [/sobremes|doce|sweet|brigadeiro|churros|sorvete|gelad|acai|açai/i, "dessert"],
  [/molho|adicion|turbin|extra|sauce/i, "sauce"],
  [/porc|porç|batata|fritas|acompanh|onion|side/i, "sides"],
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Resolve the fallback art key for a category. */
export function artKeyFor(slug?: string | null, name?: string | null): ArtKey {
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  const hay = `${normalize(slug ?? "")} ${normalize(name ?? "")}`;
  for (const [re, key] of KEYWORDS) if (re.test(hay)) return key;
  return "burger"; // safe, appetizing default
}

// Each art key has 3 variants on disk (`fallback-<key>.png`, `-2`, `-3`). Rotating
// per product by a stable seed avoids a wall of identical photos when a whole
// category lacks images (e.g. 39 sauce add-ons) while staying category-relevant.
const VARIANTS = 3;

/**
 * Public path to the fallback image for a category. `seed` (e.g. product.id) picks
 * a deterministic variant so the same product always shows the same photo, but
 * neighbours in a grid differ.
 */
export function fallbackArt(slug?: string | null, name?: string | null, seed = 0): string {
  const key = artKeyFor(slug, name);
  const idx = (((seed % VARIANTS) + VARIANTS) % VARIANTS);
  const suffix = idx === 0 ? "" : `-${idx + 1}`;
  return `/generated/fallback-${key}${suffix}.png`;
}
