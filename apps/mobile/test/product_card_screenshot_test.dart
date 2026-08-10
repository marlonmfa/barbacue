// Renders the product grid to a PNG in test-screenshots/ so the card's image
// height, scrim, promo badge, price colours and ember fallback can be reviewed
// without a simulator build. Captured at iPhone SE width — the tightest cell the
// grid produces, where the price/button row has the least room.
//
// Fonts are loaded from the Flutter SDK cache: without them the golden renders
// every glyph as a filled box, which defeats the point of looking at it.
@Tags(['screenshot'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
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

Product _product({
  required int id,
  required String name,
  required int priceCents,
  String? description,
  int? promoPriceCents,
}) {
  return Product(
    id: id,
    categoryId: 1,
    name: name,
    description: description,
    priceCents: priceCents,
    promoPriceCents: promoPriceCents,
    available: true,
    sortOrder: 0,
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

  testWidgets('screenshot: product grid at iPhone SE width', (tester) async {
    // No image URLs are reachable in a test, so every card exercises the ember
    // fallback — which is precisely the branded state worth reviewing.
    final products = [
      _product(
        id: 1,
        name: 'Barbacue Duplo Bacon Cheddar Artesanal',
        description: 'Dois hambúrgueres artesanais, bacon crocante, cheddar '
            'cremoso e molho da casa no pão brioche.',
        priceCents: 4500,
      ),
      _product(
        id: 2,
        name: 'Combo Barba',
        description: 'Hambúrguer, batata rústica e refrigerante.',
        priceCents: 6900,
        promoPriceCents: 4990,
      ),
      _product(id: 3, name: 'Batata Rústica', priceCents: 1900),
      _product(
        id: 4,
        name: 'Tábua da Casa para Compartilhar',
        description: 'Seleção de carnes, acompanhamentos e molhos.',
        priceCents: 101500,
      ),
    ];

    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.theme,
          home: Scaffold(
            body: GridView(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 220,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                mainAxisExtent: kProductCardExtent,
              ),
              children: [
                for (final p in products) ProductCard(product: p),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    await expectLater(
      find.byType(GridView),
      matchesGoldenFile(
          '../../../test-screenshots/mobile-product-card-2026-07-17.png'),
    );
  });
}
