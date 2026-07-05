// Classification logic for the missing-menu-image backfill (scripts/generate-menu-images.mjs).
//
// Two sourcing strategies, decided by category:
//   - "ai":  house-unique items (artisan burgers, house combos) → generate with OpenAI,
//            because no real-world photo of them exists.
//   - "web": real-world products (drinks, add-ons, sauces, sides, desserts) → fetch a
//            free stock photo, keyed off an EN search query derived from the PT name.
//
// Kept as pure, dependency-free functions so they're unit-testable in isolation.

export type ImageMode = "ai" | "web";

/** Category slugs whose items are unique to the house → generate with OpenAI. */
export const FLAGSHIP_SLUG =
  /^(combos|combos-individuais|combos-para-compartilhar|hamburgueres|hamburguer-vegetariano)$/;

export function classify(categorySlug: string): ImageMode {
  return FLAGSHIP_SLUG.test(categorySlug) ? "ai" : "web";
}

// Ordered, most-specific-first. First hit wins. Matched accent-insensitively.
export const QUERY_RULES: [RegExp, string][] = [
  [/gin\s*t[oô]nica/i, "gin tonic cocktail"],
  [/gin/i, "gin cocktail drink"],
  [/mojito/i, "mojito cocktail"],
  [/caipir|lim[aã]o|morango|abacaxi|hortel/i, "caipirinha cocktail"],
  [/vinho\s*branco|branco/i, "white wine glass"],
  [/vinho|tinto/i, "red wine glass"],
  [/cervej|chopp|beer/i, "beer glass"],
  [/coca|refri|refrigerante/i, "cola soft drink can"],
  [/suco|sabor\s*(manga|maracuj|p[eê]ssego|uva)/i, "fruit juice can"],
  [/g[aá]s|sem\s*g[aá]s|[aá]gua/i, "water bottle"],
  [/bacon/i, "crispy bacon"],
  [/batata.*(waffle)/i, "waffle fries"],
  [/batata.*(crinkle|crinkles)/i, "crinkle cut fries"],
  [/batata|fritas|palito/i, "french fries"],
  [/anel|onion/i, "onion rings"],
  [/queijo\s*brie|brie/i, "brie cheese"],
  [/gouda/i, "gouda cheese"],
  [/cheddar/i, "cheddar cheese slice"],
  [/catupiry|creme\s*de\s*queij|queijo/i, "melted cheese"],
  [/gorgonzola/i, "gorgonzola cheese"],
  [/costela|desfiad/i, "pulled beef brisket"],
  [/entrecot|steak/i, "grilled steak"],
  [/hamburguer|h[aâ]mburguer|burger/i, "hamburger patty"],
  [/chimichurri/i, "chimichurri sauce"],
  [/farofa/i, "farofa brazilian"],
  [/barbecue|barbacue/i, "barbecue sauce"],
  [/chipotle/i, "chipotle sauce"],
  [/sweet\s*chilli|chilli/i, "sweet chilli sauce"],
  [/maionese/i, "aioli mayonnaise dip"],
  [/geleia\s*de\s*tomate/i, "tomato jam"],
  [/chutney/i, "onion chutney"],
  [/jalape/i, "jalapeno peppers"],
  [/pimenta/i, "chili pepper"],
  [/picles/i, "pickles"],
  [/alface/i, "lettuce"],
  [/r[uú]cula/i, "arugula rocket"],
  [/cebola\s*roxa|cebola/i, "red onion"],
  [/cogumelo/i, "mushrooms"],
  [/couve|alho/i, "cauliflower"],
  [/cevad/i, "barley grains"],
  [/nutella/i, "nutella chocolate spread"],
  [/ovomaltine|ovomalt/i, "chocolate malt dessert"],
  [/negresco|oreo/i, "cookies and cream dessert"],
  [/brigadeiro/i, "brigadeiro chocolate"],
  [/doce\s*de\s*leite/i, "dulce de leche"],
  [/prest[ií]gio/i, "coconut chocolate dessert"],
  [/maracuj/i, "passion fruit mousse"],
  [/morango/i, "strawberry dessert"],
  [/uva/i, "grape dessert"],
  [/strogonoff|nozes/i, "walnut dessert"],
  [/churros/i, "churros"],
  [/quesadilha/i, "quesadilla"],
  [/gelad|sobremesa/i, "ice cream dessert"],
  [/salada/i, "green salad bowl"],
  [/tortilh|nachos|milho/i, "tortilla chips nachos"],
  [/beef\s*melt|fries/i, "loaded cheese fries"],
];

const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** PT product name → EN stock-photo search query. Never returns empty. */
export function stockQuery(name: string): string {
  const flat = deaccent(name);
  for (const [re, q] of QUERY_RULES) if (re.test(name) || re.test(flat)) return q;
  // Fallback: strip "adicional/extra/+6/und/ml" noise, romanize, append "food".
  const cleaned = flat
    .replace(/adicion\w*|adicione|extra|\+?\s*\d+\s*(und|g|ml|fatias|mini)?/gi, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .trim();
  return `${cleaned || "food"} food`;
}
