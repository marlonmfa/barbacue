// Renders the payment surface to PNGs in test-screenshots/ so the two success
// cards and the discounted Resumo can be reviewed without a simulator build.
//
// Fonts are loaded from the Flutter SDK cache: without them the golden renders
// every glyph as a filled box, which defeats the point of looking at it.
@Tags(['screenshot'])
library;

import 'dart:convert';
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
import 'package:barbacue/providers/checkout_provider.dart';
import 'package:barbacue/screens/payment_screen.dart';
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
    // The order chip and the Pix payload ask for 'monospace', which every real
    // device resolves and the SDK cache ships no face for — unregistered, both
    // capture as rows of solid boxes. Roboto stands in so the capture can be
    // read; the shipped app still resolves a real monospace face.
    await _loadFont('monospace', ['Roboto-Regular.ttf']);
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

  const customer = CheckoutState(
    name: 'Marlon',
    phone: '11999998888',
    address: 'Rua das Flores, 10',
    loaded: true,
  );

  String orderBody({
    required String paymentMethod,
    Map<String, dynamic>? pix,
  }) =>
      jsonEncode({
        'orderId': 'ab12cd34-5678-90ef-1234-567890abcdef',
        'paymentMethod': paymentMethod,
        'orderType': 'delivery',
        'tableNumber': null,
        'totalCents': 4500,
        'pix': pix,
      });

  Future<void> pump(
    WidgetTester tester, {
    required CheckoutState checkout,
    Size size = const Size(390, 844),
  }) async {
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
          checkoutProvider.overrideWith(() => _StubCheckout(checkout)),
        ],
        child: MaterialApp(theme: capturableTheme(), home: const PaymentScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> placeOrder(WidgetTester tester) async {
    final cta = find.byType(FilledButton).last;
    await tester.ensureVisible(cta);
    await tester.pumpAndSettle();
    await tester.tap(cta);
    await tester.pumpAndSettle();
  }

  testWidgets('screenshot: payment with a discount applied', (tester) async {
    ApiService.client = MockClient((_) async => http.Response(
          '{"id":1,"code":"BARBA10","description":"10% de desconto",'
          '"discountType":"percentage","discountValue":10,"discountCents":500}',
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ));

    await pump(
      tester,
      checkout: customer.copyWith(couponCode: 'BARBA10', paymentMethod: 'cash'),
    );

    await expectLater(
      find.byType(PaymentScreen),
      matchesGoldenFile('../../../test-screenshots/payment-coupon-2026-07-17.png'),
    );
  });

  testWidgets('screenshot: pix success', (tester) async {
    ApiService.client = MockClient((req) async => http.Response(
          orderBody(
            paymentMethod: 'pix',
            pix: {
              'payload':
                  '00020126580014BR.GOV.BCB.PIX0136barbacue@example.com5204000053039865802BR'
                      '5913BARBACUE E CO6009SAO PAULO62070503***6304AB12',
            },
          ),
          201,
        ));

    await pump(tester, checkout: customer, size: const Size(390, 1000));
    await placeOrder(tester);

    await expectLater(
      find.byType(PaymentScreen),
      matchesGoldenFile('../../../test-screenshots/payment-success-pix-2026-07-17.png'),
    );
  });

  testWidgets('screenshot: cash success', (tester) async {
    ApiService.client =
        MockClient((_) async => http.Response(orderBody(paymentMethod: 'cash'), 201));

    await pump(tester, checkout: customer.copyWith(paymentMethod: 'cash'));
    await placeOrder(tester);

    await expectLater(
      find.byType(PaymentScreen),
      matchesGoldenFile('../../../test-screenshots/payment-success-cash-2026-07-17.png'),
    );
  });
}

class _StubCart extends CartNotifier {
  _StubCart(this._items);
  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}

/// Skips the async SharedPreferences hydration the real notifier does on build,
/// so the capture shows a returning customer rather than an empty form.
class _StubCheckout extends CheckoutNotifier {
  _StubCheckout(this._initial);
  final CheckoutState _initial;

  @override
  CheckoutState build() => _initial;
}
