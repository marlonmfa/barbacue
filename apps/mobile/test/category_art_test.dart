import 'package:barbacue/lib/category_art.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('artKeyFor', () {
    test('resolves the known slugs', () {
      expect(artKeyFor('hamburgueres', 'Hambúrgueres'), ArtKey.burger);
      expect(artKeyFor('cervejas-stannis', 'Cervejas'), ArtKey.beer);
      expect(artKeyFor('sabores-caipirinhas', 'Caipirinhas'), ArtKey.cocktail);
      expect(artKeyFor('mini-churros', 'Mini Churros'), ArtKey.dessert);
      expect(artKeyFor('molhos', 'Molhos'), ArtKey.sauce);
      expect(artKeyFor('suco-lata', 'Sucos'), ArtKey.drink);
      expect(artKeyFor('porcoes', 'Porções'), ArtKey.sides);
      expect(artKeyFor('combos-individuais', 'Combos'), ArtKey.combo);
    });

    // `sabores` maps to dessert despite the ambiguous name — BY_SLUG wins over
    // the keyword ladder, which would otherwise never be consulted for it.
    test('prefers the slug table over the keyword ladder', () {
      expect(artKeyFor('sabores', 'Sabores'), ArtKey.dessert);
    });

    test('falls back to keywords for categories added later', () {
      expect(artKeyFor('smash-week', 'Smash Week'), ArtKey.burger);
      expect(artKeyFor('agua-com-gas', 'Água com gás'), ArtKey.drink);
      expect(artKeyFor('acai-da-casa', 'Açaí da casa'), ArtKey.dessert);
      expect(artKeyFor('batata-frita', 'Batata frita'), ArtKey.sides);
    });

    test('defaults to burger for anything unrecognised', () {
      expect(artKeyFor('xyz', 'Novidade'), ArtKey.burger);
      expect(artKeyFor(null, null), ArtKey.burger);
    });
  });

  group('categoryEmoji', () {
    test('covers every art key', () {
      for (final key in ArtKey.values) {
        expect(categoryEmoji[key], isNotNull, reason: 'missing emoji for $key');
      }
      expect(categoryEmoji[ArtKey.burger], '🍔');
      expect(categoryEmoji[ArtKey.beer], '🍺');
    });
  });

  group('fallbackArtPath', () {
    test('rotates through the three variants by seed', () {
      expect(
        fallbackArtPath('hamburgueres', 'X', 0),
        '/generated/fallback-burger.png',
      );
      expect(
        fallbackArtPath('hamburgueres', 'X', 1),
        '/generated/fallback-burger-2.png',
      );
      expect(
        fallbackArtPath('hamburgueres', 'X', 2),
        '/generated/fallback-burger-3.png',
      );
      expect(
        fallbackArtPath('hamburgueres', 'X', 3),
        '/generated/fallback-burger.png',
      );
    });

    test('is stable for the same seed', () {
      expect(
        fallbackArtPath('molhos', 'Molhos', 92),
        fallbackArtPath('molhos', 'Molhos', 92),
      );
    });

    test('handles a negative seed without a negative index', () {
      expect(
        fallbackArtPath('drinks', 'Drinks', -1),
        '/generated/fallback-cocktail-3.png',
      );
    });

    test('returns a root-relative path for callers to prefix', () {
      expect(fallbackArtPath('sobremesas', 'Sobremesas', 0), startsWith('/'));
    });
  });
}
