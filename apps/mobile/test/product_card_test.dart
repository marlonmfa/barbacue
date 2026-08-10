// Layout assertions here need real glyph metrics: the test placeholder font
// renders every character as a square, which inflates text ~2x and would report
// overflow that no device ever shows. So the Flutter SDK's Roboto is loaded
// before the layout group runs.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/product.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:barbacue/widgets/product_card.dart';

/// `<flutter>/bin/cache/dart-sdk/bin/dart` → `<flutter>/bin/cache`
String get _flutterCache =>
    File(Platform.resolvedExecutable).parent.parent.parent.parent.path;

Future<void> _loadFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    final bytes =
        File('$_flutterCache/artifacts/material_fonts/$f').readAsBytesSync();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
}

// iPhone SE (375pt) with the grid's 16pt side padding and 12pt gutter is the
// narrowest cell the app supports: (375 - 32 - 12) / 2.
const _narrowCellWidth = 165.5;

/// Space the price is allotted beside the Adicionar button in a narrow cell.
const _priceSpaceInNarrowCell = 51.2;

Product _product({
  int? promoPriceCents,
  String? promoEndsAt,
  int priceCents = 101500,
  String? imageUrl,
}) {
  return Product(
    id: 1,
    categoryId: 1,
    name: 'Barbacue Duplo Bacon Cheddar Artesanal',
    description:
        'Dois hambúrgueres artesanais, bacon crocante, cheddar cremoso e '
        'molho da casa no pão brioche.',
    priceCents: priceCents,
    promoPriceCents: promoPriceCents,
    promoEndsAt: promoEndsAt,
    imageUrl: imageUrl,
    available: true,
    sortOrder: 0,
  );
}

Widget _harness(Product product) {
  return ProviderScope(
    child: MaterialApp(
      theme: AppTheme.theme,
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: _narrowCellWidth,
            height: kProductCardExtent,
            child: ProductCard(product: product),
          ),
        ),
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await _loadFont('Roboto', [
      'Roboto-Regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Bold.ttf',
    ]);
    await _loadFont('MaterialIcons', ['MaterialIcons-Regular.otf']);
  });

  // cartProvider hydrates from disk on build.
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('a non-sale product shows a tan price and no promo badge',
      (tester) async {
    await tester.pumpWidget(_harness(_product()));

    expect(find.text('🔥 PROMO'), findsNothing);
    final style = tester.widget<Text>(find.text(formatPrice(101500))).style!;
    expect(style.color, AppTheme.brandTan);
    expect(style.fontSize, 18);
  });

  testWidgets('a product on sale shows the promo badge and a red price',
      (tester) async {
    await tester.pumpWidget(_harness(_product(promoPriceCents: 4990)));

    expect(find.text('🔥 PROMO'), findsOneWidget);

    final promo = tester.widget<Text>(find.text(formatPrice(4990))).style!;
    expect(promo.color, AppTheme.brand);
    expect(promo.fontSize, 18);

    // The undiscounted price stays as struck-through secondary text above it.
    final struck = tester.widget<Text>(find.text(formatPrice(101500))).style!;
    expect(struck.decoration, TextDecoration.lineThrough);
    expect(struck.color, AppTheme.textSecondary);
    expect(struck.fontSize, 11);
  });

  testWidgets('an expired promo renders as a plain tan price', (tester) async {
    await tester.pumpWidget(_harness(_product(
      promoPriceCents: 4990,
      promoEndsAt: '2020-01-01T00:00:00.000Z',
    )));

    expect(find.text('🔥 PROMO'), findsNothing);
    expect(find.text(formatPrice(4990)), findsNothing);
    final style = tester.widget<Text>(find.text(formatPrice(101500))).style!;
    expect(style.color, AppTheme.brandTan);
  });

  testWidgets('a product without an image falls back to the ember tile',
      (tester) async {
    await tester.pumpWidget(_harness(_product()));

    expect(find.text('BARBACUE'), findsOneWidget);
    expect(find.byIcon(Icons.lunch_dining), findsOneWidget);
  });

  // kProductCardExtent is hand-tuned, so guard both directions: too small clips
  // content, too large leaves dead space between grid rows.
  testWidgets('the tallest card fits the grid extent at the narrowest width',
      (tester) async {
    await tester.pumpWidget(_harness(_product(promoPriceCents: 4990)));
    expect(tester.takeException(), isNull);

    final card = tester.renderObject<RenderBox>(find.byType(Card));
    final needed = card.getMaxIntrinsicHeight(_narrowCellWidth);
    expect(needed, lessThanOrEqualTo(kProductCardExtent));
    expect(kProductCardExtent - needed, lessThan(12));
  });

  // The narrowest cell leaves the price ~51px beside the button — less than any
  // real price needs at 18px. It must scale down whole, never ellipsize.
  group('at the narrowest width the price stays legible and whole', () {
    for (final cents in [500, 4500, 12900, 101500]) {
      testWidgets(formatPrice(cents), (tester) async {
        await tester.pumpWidget(_harness(_product(priceCents: cents)));
        expect(tester.takeException(), isNull);

        final price = find.text(formatPrice(cents));
        // Laid out unconstrained, so the full string survives: it measures wider
        // than the space it has to fit into, and nothing was elided.
        expect(tester.renderObject<RenderParagraph>(price).didExceedMaxLines,
            isFalse);
        expect(tester.getSize(price).width,
            greaterThan(_priceSpaceInNarrowCell));

        // ...and once scaled down it still paints inside the card.
        final painted = tester.getRect(price);
        final card = tester.getRect(find.byType(Card));
        expect(painted.left, greaterThanOrEqualTo(card.left));
        expect(painted.right, lessThanOrEqualTo(card.right));
        expect(find.text('Adicionar'), findsOneWidget);
      });
    }
  });
}
