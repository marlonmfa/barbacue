// Renders the cart to PNGs in test-screenshots/ so the coupon and empty states
// can be reviewed without a simulator build.
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
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/screens/cart_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';

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
    final bytes = File('$_flutterCache/artifacts/material_fonts/$f')
        .readAsBytesSync();
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

  /// The AppBar title names no font family, so on a device it resolves to the
  /// platform default — but in a test that is the placeholder font, which draws
  /// every glyph as a solid box. Naming Roboto here keeps the capture readable
  /// without changing what ships.
  ThemeData capturableTheme() {
    final base = AppTheme.theme;
    return base.copyWith(
      appBarTheme: base.appBarTheme.copyWith(
        titleTextStyle:
            base.appBarTheme.titleTextStyle?.copyWith(fontFamily: 'Roboto'),
      ),
    );
  }

  Future<void> pump(WidgetTester tester, List<CartItem> items) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [cartProvider.overrideWith(() => _StubCart(items))],
        child: MaterialApp(theme: capturableTheme(), home: const CartScreen()),
      ),
    );
    await tester.pump();
  }

  testWidgets('screenshot: cart with an applied coupon', (tester) async {
    ApiService.client = MockClient((_) async => http.Response(
          '{"id":1,"code":"BARBA10","description":"10% de desconto",'
          '"discountType":"percentage","discountValue":10,"discountCents":500}',
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ));

    await pump(tester, [
      CartItem(productId: 1, name: 'X-Salada', priceCents: 2500, qty: 2),
    ]);

    await tester.enterText(
      find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.hintText == 'CÓDIGO',
      ),
      'BARBA10',
    );
    await tester.pump();
    await tester.tap(find.text('Aplicar'));
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(CartScreen),
      matchesGoldenFile('../../../test-screenshots/cart-coupon-2026-07-17.png'),
    );
  });

  testWidgets('screenshot: empty cart', (tester) async {
    await pump(tester, []);

    await expectLater(
      find.byType(CartScreen),
      matchesGoldenFile('../../../test-screenshots/cart-empty-2026-07-17.png'),
    );
  });
}

class _StubCart extends CartNotifier {
  _StubCart(this._items);

  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}
