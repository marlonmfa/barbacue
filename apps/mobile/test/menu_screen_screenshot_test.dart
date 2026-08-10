// Renders the restructured menu — hero, status pill, pinned category rail and
// section headers — to PNGs in test-screenshots/ so the layout can be reviewed
// without a simulator build. Both store states are captured: the closed one is
// the only place the full-bleed bar and the "Loja fechada" chips appear.
//
// Fonts are loaded from the Flutter SDK cache: without them the golden renders
// every glyph as a filled box, which defeats the point of looking at it. Anton
// comes from the app's own bundle — the section headings are set in it.
@Tags(['screenshot'])
library;

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

/// `<flutter>/bin/cache/dart-sdk/bin/dart` → `<flutter>/bin/cache`
String get _flutterCache =>
    File(Platform.resolvedExecutable).parent.parent.parent.parent.path;

Future<void> _loadSdkFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    final bytes =
        File('$_flutterCache/artifacts/material_fonts/$f').readAsBytesSync();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
}

Future<void> _loadBundledFont(String family, String path) async {
  final loader = FontLoader(family)
    ..addFont(Future.value(ByteData.sublistView(File(path).readAsBytesSync())));
  await loader.load();
}

Product _product(int id, String name, int priceCents, {String? description}) {
  return Product(
    id: id,
    categoryId: 1,
    name: name,
    description: description,
    priceCents: priceCents,
    available: true,
    sortOrder: 0,
  );
}

final _menu = [
  Category(
    id: 1,
    name: 'Hambúrgueres',
    slug: 'hamburgueres',
    sortOrder: 0,
    products: [
      _product(1, 'Barbacue Duplo Bacon', 4500,
          description: 'Dois hambúrgueres artesanais, bacon e cheddar.'),
      _product(2, 'Smash da Casa', 3200,
          description: 'Blend 180g, queijo prato e cebola caramelizada.'),
    ],
  ),
  Category(
    id: 2,
    name: 'Bebidas',
    slug: 'bebidas-delivery',
    sortOrder: 1,
    products: [_product(3, 'Guaraná Lata', 700)],
  ),
];

const _settings = StoreSettings(
  storeName: 'Barbacue & Co',
  tagline: 'Burguers na brasa 🔥',
  instagramUrl: 'https://www.instagram.com/barbacue.burguersnabrasa/',
  whatsapp: '+55 11 99999-9999',
  address: 'Rua das Brasas, 42',
  openingHours: 'Ter a Dom, 18h às 23h',
  deliveryFeeText: 'Entrega R\$ 6,00',
);

Future<void> _pumpMenu(WidgetTester tester, StoreStatus status) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        menuProvider.overrideWith((ref) async => _menu),
        settingsProvider.overrideWith((ref) async => _settings),
        storeStatusProvider.overrideWith((ref) async => status),
      ],
      child: MaterialApp(
        theme: AppTheme.theme,
        home: const MenuScreen(),
      ),
    ),
  );
  // Two frames: one to resolve the overridden futures, one to lay the slivers
  // out with real data. pumpAndSettle would spin forever on the pulsing dot.
  await tester.pump();
  await tester.pump();

  // Decoding an asset needs a live async zone, which pump() does not give it —
  // without this the hero's logo golden is an empty white sign.
  await tester.runAsync(() async {
    final context = tester.element(find.byType(MenuScreen));
    await precacheImage(const AssetImage('assets/brand/logo.png'), context);
  });
  await tester.pump();
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    // The cards ask for category fallback art, so cached_network_image spins up
    // its disk cache. No host implements path_provider under flutter_test; hand
    // it a temp dir. The fetch itself still fails (no network in a widget test),
    // which lands every tile on the branded ember fallback — the state worth
    // reviewing anyway.
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => Directory.systemTemp
          .createTempSync('barbacue_menu_screenshot')
          .path,
    );
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;

    await _loadSdkFont('Roboto', [
      'Roboto-Regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Bold.ttf',
    ]);
    await _loadSdkFont('MaterialIcons', ['MaterialIcons-Regular.otf']);
    await _loadBundledFont('Anton', 'assets/fonts/Anton-Regular.ttf');
  });

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('screenshot: menu with the store open', (tester) async {
    await _pumpMenu(tester, const StoreStatus(open: true, reason: 'Aberto'));

    await expectLater(
      find.byType(MenuScreen),
      matchesGoldenFile('../../../test-screenshots/mobile-menu-open-2026-07-17.png'),
    );
  });

  testWidgets('screenshot: menu with the store closed', (tester) async {
    await _pumpMenu(
      tester,
      const StoreStatus(
        open: false,
        reason: 'Fechado hoje: feriado.',
        nextOpen: 'Abre amanhã às 18:00.',
      ),
    );

    await expectLater(
      find.byType(MenuScreen),
      matchesGoldenFile(
          '../../../test-screenshots/mobile-menu-closed-2026-07-17.png'),
    );
  });
}
