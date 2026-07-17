/// Maps a category to a generated fallback food photo (served by the web app from
/// /public/generated), used when a product has no imageUrl. A category-appropriate
/// appetizing photo reads as intentional branding instead of a wall of identical
/// placeholders. Ported from apps/web/src/lib/category-art.ts — keep in sync.
library;

enum ArtKey { burger, sides, sauce, drink, beer, cocktail, dessert, combo }

// Explicit slug → art key for the 26 known categories (authoritative).
const _bySlug = <String, ArtKey>{
  'hamburgueres': ArtKey.burger,
  'hamburguer-vegetariano': ArtKey.burger,
  'combos-individuais': ArtKey.combo,
  'combos-para-compartilhar': ArtKey.combo,
  'combos': ArtKey.combo,
  'acompanhamentos': ArtKey.sides,
  'para-acompanhar': ArtKey.sides,
  'porcoes': ArtKey.sides,
  'turbinar-porcao': ArtKey.sides,
  'adicionais': ArtKey.sauce,
  'adicionais-entrecot': ArtKey.sauce,
  'turbine-seu-lanche': ArtKey.sauce,
  'molhos': ArtKey.sauce,
  'bebidas-delivery': ArtKey.drink,
  'suco-lata': ArtKey.drink,
  'gas-sem': ArtKey.drink,
  'cervejas-stannis': ArtKey.beer,
  'vinhos': ArtKey.beer,
  'drinks': ArtKey.cocktail,
  'sabores-caipirinhas': ArtKey.cocktail,
  'sobremesas': ArtKey.dessert,
  'sweet-barba': ArtKey.dessert,
  'sobremesa-gelada': ArtKey.dessert,
  'brigadeiro-de-colher': ArtKey.dessert,
  'mini-churros': ArtKey.dessert,
  'sabores': ArtKey.dessert,
};

const categoryEmoji = <ArtKey, String>{
  ArtKey.burger: '🍔',
  ArtKey.combo: '🍟',
  ArtKey.sides: '🍟',
  ArtKey.sauce: '🥫',
  ArtKey.drink: '🥤',
  ArtKey.beer: '🍺',
  ArtKey.cocktail: '🍹',
  ArtKey.dessert: '🍰',
};

// Keyword heuristic for any future category the owner adds (matched against
// slug + name, accent-insensitive). Order matters: most specific first.
final _keywords = <(RegExp, ArtKey)>[
  (RegExp(r'burg|hamb|lanch|sandu|smash', caseSensitive: false), ArtKey.burger),
  (RegExp(r'combo', caseSensitive: false), ArtKey.combo),
  (RegExp(r'cervej|chopp|vinho|beer', caseSensitive: false), ArtKey.beer),
  (
    RegExp(r'caipir|drink|coquetel|cocktail|gin|vodka', caseSensitive: false),
    ArtKey.cocktail,
  ),
  (
    RegExp(
      r'refri|bebid|suco|agua|soda|coca|gas|guarana',
      caseSensitive: false,
    ),
    ArtKey.drink,
  ),
  (
    RegExp(
      r'sobremes|doce|sweet|brigadeiro|churros|sorvete|gelad|acai',
      caseSensitive: false,
    ),
    ArtKey.dessert,
  ),
  (
    RegExp(r'molho|adicion|turbin|extra|sauce', caseSensitive: false),
    ArtKey.sauce,
  ),
  (
    RegExp(r'porc|batata|fritas|acompanh|onion|side', caseSensitive: false),
    ArtKey.sides,
  ),
];

// Dart has no NFD-strip in core, and the keyword ladder only needs the handful of
// accents that appear in Brazilian food words (água, guaraná, açaí, porção…).
const _accents = <String, String>{
  'á': 'a',
  'à': 'a',
  'â': 'a',
  'ã': 'a',
  'ä': 'a',
  'é': 'e',
  'ê': 'e',
  'è': 'e',
  'í': 'i',
  'ì': 'i',
  'î': 'i',
  'ó': 'o',
  'ô': 'o',
  'õ': 'o',
  'ò': 'o',
  'ú': 'u',
  'ù': 'u',
  'û': 'u',
  'ç': 'c',
};

String _normalize(String s) {
  final lower = s.toLowerCase();
  final buffer = StringBuffer();
  for (final ch in lower.split('')) {
    buffer.write(_accents[ch] ?? ch);
  }
  return buffer.toString();
}

/// Resolve the fallback art key for a category.
ArtKey artKeyFor(String? slug, String? name) {
  final bySlug = slug == null ? null : _bySlug[slug];
  if (bySlug != null) return bySlug;
  final hay = '${_normalize(slug ?? '')} ${_normalize(name ?? '')}';
  for (final (re, key) in _keywords) {
    if (re.hasMatch(hay)) return key;
  }
  return ArtKey.burger; // safe, appetizing default
}

// Each art key has 3 variants on disk (`fallback-<key>.png`, `-2`, `-3`). Rotating
// per product by a stable seed avoids a wall of identical photos when a whole
// category lacks images (e.g. 39 sauce add-ons) while staying category-relevant.
const _variants = 3;

/// Root-relative path to the fallback image for a category. [seed] (e.g.
/// product.id) picks a deterministic variant so the same product always shows the
/// same photo, but neighbours in a grid differ.
///
/// The path is root-relative — [ApiService.resolveImageUrls] only rewrites product
/// imageUrls, so callers must prefix `ApiService.baseUrl` themselves.
String fallbackArtPath(String? slug, String? name, [int seed = 0]) {
  final key = artKeyFor(slug, name);
  final idx = ((seed % _variants) + _variants) % _variants;
  final suffix = idx == 0 ? '' : '-${idx + 1}';
  return '/generated/fallback-${key.name}$suffix.png';
}
