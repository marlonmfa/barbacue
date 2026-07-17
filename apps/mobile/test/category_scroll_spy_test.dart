// The rail's highlight has to follow a hand-scroll, not just taps — the web nav
// tracks sections with an IntersectionObserver, and before this the highlight
// only ever moved when a chip was tapped.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:barbacue/models/product.dart';
import 'package:barbacue/models/store_settings.dart';
import 'package:barbacue/providers/menu_provider.dart';
import 'package:barbacue/screens/menu_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';

Product _product(int id, String name) => Product(
      id: id,
      categoryId: 1,
      name: name,
      priceCents: 3000,
      available: true,
      sortOrder: 0,
    );

// Both categories are deliberately several rows deep: the tall hero eats most of
// the first screen, so a shorter menu cannot scroll far enough to carry the
// second header past the threshold at all.
final _menu = [
  Category(
    id: 1,
    name: 'Hambúrgueres',
    slug: 'hamburgueres',
    sortOrder: 0,
    products: [for (var i = 1; i <= 6; i++) _product(i, 'Burger $i')],
  ),
  Category(
    id: 2,
    name: 'Bebidas',
    slug: 'bebidas-delivery',
    sortOrder: 1,
    products: [for (var i = 7; i <= 12; i++) _product(i, 'Bebida $i')],
  ),
];

const _settings = StoreSettings(
  storeName: 'Barbacue & Co',
  tagline: 'Burguers na brasa',
  instagramUrl: 'https://example.com/ig',
);

/// The chip's fill is the only readable signal of which category is active.
bool _chipIsActive(WidgetTester tester, String name) {
  final container = tester.widget<AnimatedContainer>(
    find.ancestor(
      of: find.text(name),
      matching: find.byType(AnimatedContainer),
    ),
  );
  return (container.decoration as BoxDecoration).color == AppTheme.brand;
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async =>
          Directory.systemTemp.createTempSync('barbacue_spy').path,
    );
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the rail highlight follows a hand-scroll', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          menuProvider.overrideWith((ref) async => _menu),
          settingsProvider.overrideWith((ref) async => _settings),
          storeStatusProvider.overrideWith(
            (ref) async => const StoreStatus(open: true, reason: 'Aberto'),
          ),
        ],
        child: MaterialApp(theme: AppTheme.theme, home: const MenuScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(_chipIsActive(tester, 'Hambúrgueres'), isTrue);
    expect(_chipIsActive(tester, 'Bebidas'), isFalse);

    // Far enough to carry the Bebidas header past the spy threshold without a
    // tap anywhere near the rail.
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -2000));
    // One frame lays the new offset out, the next carries the spy's verdict.
    await tester.pump();
    await tester.pump();

    expect(_chipIsActive(tester, 'Bebidas'), isTrue);
    expect(_chipIsActive(tester, 'Hambúrgueres'), isFalse);
  });
}
