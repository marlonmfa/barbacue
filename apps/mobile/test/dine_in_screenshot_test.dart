// Renders the seated states to PNGs in test-screenshots/ so the dine-in mode can
// be reviewed without printing a QR and pointing a phone at it.
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
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/models/table_session.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/providers/table_session_provider.dart';
import 'package:barbacue/screens/cart_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:barbacue/widgets/table_banner.dart';

/// `<flutter>/bin/cache/dart-sdk/bin/dart` → `<flutter>/bin/cache`
String get _flutterCache => File(Platform.resolvedExecutable)
    .parent
    .parent
    .parent
    .parent
    .path;

Future<void> _loadFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    final bytes =
        File('$_flutterCache/artifacts/material_fonts/$f').readAsBytesSync();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
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

  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => ApiService.client = http.Client());

  ThemeData capturableTheme() {
    final base = AppTheme.theme;
    return base.copyWith(
      appBarTheme: base.appBarTheme.copyWith(
        titleTextStyle:
            base.appBarTheme.titleTextStyle?.copyWith(fontFamily: 'Roboto'),
      ),
    );
  }

  Future<void> pump(WidgetTester tester, Widget home, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cartProvider.overrideWith(() => _StubCart([
                CartItem(
                    productId: 1, name: 'X-Salada', priceCents: 2500, qty: 2),
              ])),
          tableSessionProvider.overrideWith(
            () => _SeatedTable(
              const TableSession(number: 4, token: 'tok-4', label: 'Varanda 2'),
            ),
          ),
        ],
        child: MaterialApp(theme: capturableTheme(), home: home),
      ),
    );
    await tester.pump();
  }

  testWidgets('screenshot: the seated banner on the menu', (tester) async {
    await pump(
      tester,
      const Scaffold(
        backgroundColor: AppTheme.background,
        body: Column(children: [TableBanner()]),
      ),
      const Size(390, 120),
    );

    await expectLater(
      find.byType(TableBanner),
      matchesGoldenFile('../../../test-screenshots/dine-in-banner-2026-07-17.png'),
    );
  });

  testWidgets('screenshot: the cart in dine-in mode', (tester) async {
    await pump(tester, const CartScreen(), const Size(390, 844));

    await expectLater(
      find.byType(CartScreen),
      matchesGoldenFile('../../../test-screenshots/dine-in-cart-2026-07-17.png'),
    );
  });
}

class _StubCart extends CartNotifier {
  _StubCart(this._items);

  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}

class _SeatedTable extends TableNotifier {
  _SeatedTable(this._session);

  final TableSession _session;

  @override
  TableSession? build() => _session;
}
