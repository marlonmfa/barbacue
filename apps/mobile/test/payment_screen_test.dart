// The payment screen is the endpoint: what it shows as the total is what the
// customer believes they are paying, and the server recomputes that same number
// from the coupon code alone. These lock the two halves together — the preview
// math, the guards that run before the request, and the pt-BR the server sends
// back when it refuses.

import 'dart:convert';

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

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    // Unanswered, the clipboard channel leaves Clipboard.setData pending
    // forever and the copy button never flips.
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (_) async => null,
    );
  });

  tearDown(() {
    ApiService.client = http.Client();
    binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  const customer = CheckoutState(
    name: 'Marlon',
    phone: '11999998888',
    address: 'Rua das Flores, 10',
    loaded: true,
  );

  List<CartItem> cart() =>
      [CartItem(productId: 1, name: 'X-Salada', priceCents: 2500, qty: 2)];

  // Built through formatPrice, never hand-written: intl separates the symbol
  // from the digits with a non-breaking space, so a literal 'R$ 50,00' matches
  // nothing on screen.
  String pixCta(int cents) => 'Gerar Pix · ${formatPrice(cents)}';
  String confirmCta(int cents) => 'Confirmar pedido · ${formatPrice(cents)}';

  /// A 10%-off coupon on a R$ 50,00 cart: R$ 5,00 off, R$ 45,00 to pay.
  String couponBody({int discountCents = 500}) => jsonEncode({
        'id': 1,
        'code': 'BARBA10',
        'description': '10% de desconto',
        'discountType': 'percentage',
        'discountValue': 10,
        'discountCents': discountCents,
      });

  String orderBody({
    int totalCents = 5000,
    String paymentMethod = 'cash',
    Map<String, dynamic>? pix,
    String orderType = 'delivery',
    int? tableNumber,
  }) =>
      jsonEncode({
        'orderId': 'ab12cd34-5678-90ef-1234-567890abcdef',
        'paymentMethod': paymentMethod,
        'orderType': orderType,
        'tableNumber': tableNumber,
        'totalCents': totalCents,
        'pix': pix,
      });

  /// Routes the two endpoints the screen talks to and records every request, so
  /// a test can assert that a client-side guard fired *instead of* a round trip.
  List<http.Request> stubApi({
    http.Response? coupon,
    http.Response? order,
  }) {
    final sent = <http.Request>[];
    ApiService.client = MockClient((req) async {
      sent.add(req);
      if (req.url.path == '/api/coupons') {
        return coupon ?? http.Response('{"error":"Cupom inválido"}', 404);
      }
      return order ?? http.Response(orderBody(), 201);
    });
    return sent;
  }

  Future<void> pump(
    WidgetTester tester, {
    CheckoutState checkout = customer,
    List<CartItem>? items,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cartProvider.overrideWith(() => _StubCart(items ?? cart())),
          checkoutProvider.overrideWith(() => _StubCheckout(checkout)),
        ],
        child: MaterialApp(theme: AppTheme.theme, home: const PaymentScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// The CTA sits below the default 600px test viewport, where a plain tap()
  /// silently misses.
  Future<void> tapCta(WidgetTester tester, String label) async {
    final cta = find.text(label);
    await tester.ensureVisible(cta);
    await tester.pumpAndSettle();
    await tester.tap(cta);
    await tester.pumpAndSettle();
  }

  group('discounted total', () {
    testWidgets('the CTA and the Resumo bill the coupon-discounted total',
        (tester) async {
      stubApi(coupon: http.Response(couponBody(), 200));
      await pump(
        tester,
        checkout: customer.copyWith(
            paymentMethod: 'card_on_delivery', couponCode: 'BARBA10'),
      );

      expect(find.text('Desconto (BARBA10)'), findsOneWidget);
      expect(find.text('−${formatPrice(500)}'), findsOneWidget);
      expect(find.text(formatPrice(4500)), findsOneWidget);
      expect(find.text(confirmCta(4500)), findsOneWidget);
      expect(find.text(confirmCta(5000)), findsNothing);
    });

    testWidgets('a refused preview drops the discount without a word',
        (tester) async {
      stubApi(coupon: http.Response('{"error":"Cupom expirado"}', 422));
      await pump(tester, checkout: customer.copyWith(couponCode: 'EXPIRADO'));

      expect(find.textContaining('Desconto'), findsNothing);
      expect(find.textContaining('Cupom expirado'), findsNothing);
      expect(find.text(pixCta(5000)), findsOneWidget);
    });

    testWidgets('a coupon larger than the cart never owes the customer money',
        (tester) async {
      stubApi(coupon: http.Response(couponBody(discountCents: 9000), 200));
      await pump(
        tester,
        checkout: customer.copyWith(
            paymentMethod: 'card_on_delivery', couponCode: 'BARBA10'),
      );

      expect(find.text(confirmCta(0)), findsOneWidget);
    });

    testWidgets('the previewed code is what gets sent', (tester) async {
      final sent = stubApi(coupon: http.Response(couponBody(), 200));
      await pump(
        tester,
        checkout: customer.copyWith(
            paymentMethod: 'card_on_delivery', couponCode: 'barba10'),
      );
      await tapCta(tester, confirmCta(4500));

      final order = sent.lastWhere((r) => r.url.path == '/api/orders');
      expect(jsonDecode(order.body)['couponCode'], 'BARBA10');
    });
  });

  group('client-side guards', () {
    testWidgets('a phone with fewer than 8 digits never reaches the server',
        (tester) async {
      final sent = stubApi();
      await pump(tester, checkout: customer.copyWith(phone: '(11) 9-9'));
      await tapCta(tester, pixCta(5000));

      expect(find.text('Preencha nome e telefone na etapa anterior.'),
          findsOneWidget);
      expect(sent.where((r) => r.url.path == '/api/orders'), isEmpty);
    });

    testWidgets('troco below the total is blocked before the request',
        (tester) async {
      final sent = stubApi();
      await pump(
        tester,
        checkout:
            customer.copyWith(paymentMethod: 'cash', changeForCents: 4000),
      );
      await tapCta(tester, confirmCta(5000));

      expect(find.text('O valor do troco não pode ser menor que o total.'),
          findsOneWidget);
      expect(sent.where((r) => r.url.path == '/api/orders'), isEmpty);
    });

    testWidgets('troco is judged against the discounted total, not the subtotal',
        (tester) async {
      final sent = stubApi(coupon: http.Response(couponBody(), 200));
      await pump(
        tester,
        checkout: customer.copyWith(
          paymentMethod: 'cash',
          changeForCents: 4600,
          couponCode: 'BARBA10',
        ),
      );
      await tapCta(tester, confirmCta(4500));

      expect(find.text('O valor do troco não pode ser menor que o total.'),
          findsNothing);
      expect(sent.where((r) => r.url.path == '/api/orders'), isNotEmpty);
    });

    testWidgets('an empty troco is not a guard failure', (tester) async {
      final sent = stubApi();
      await pump(tester, checkout: customer.copyWith(paymentMethod: 'cash'));
      await tapCta(tester, confirmCta(5000));

      expect(sent.where((r) => r.url.path == '/api/orders'), isNotEmpty);
    });
  });

  testWidgets('a persisted troco is visible in the field', (tester) async {
    stubApi();
    await pump(
      tester,
      checkout: customer.copyWith(paymentMethod: 'cash', changeForCents: 7550),
    );

    expect(
      tester
          .widget<TextField>(find.byType(TextField))
          .controller
          ?.text,
      '75,50',
    );
  });

  testWidgets("the server's 'Pedido mínimo' refusal surfaces in the error box",
      (tester) async {
    stubApi(
      coupon: http.Response(couponBody(), 200),
      order: http.Response(
        jsonEncode({
          'message': 'Pedido mínimo para esse cupom: R\$ 60,00.',
          'error': {'fieldErrors': {}},
        }),
        422,
      ),
    );
    await pump(
      tester,
      checkout: customer.copyWith(
          paymentMethod: 'card_on_delivery', couponCode: 'BARBA10'),
    );
    await tapCta(tester, confirmCta(4500));

    expect(find.text('Pedido mínimo para esse cupom: R\$ 60,00.'),
        findsOneWidget);
  });

  testWidgets('an empty cart explains itself instead of teleporting away',
      (tester) async {
    stubApi();
    await pump(tester, items: []);

    expect(find.text('Nada para pagar ainda'), findsOneWidget);
    expect(find.text('Ver cardápio'), findsOneWidget);
  });

  group('success view', () {
    testWidgets('a green header and the order chip confirm the order landed',
        (tester) async {
      stubApi(order: http.Response(orderBody(), 201));
      await pump(tester, checkout: customer.copyWith(paymentMethod: 'cash'));
      await tapCta(tester, confirmCta(5000));

      expect(find.text('Pedido recebido! 🎉'), findsOneWidget);
      expect(
        tester.widget<AppBar>(find.byType(AppBar)).backgroundColor,
        AppTheme.success,
      );
      expect(find.text('#AB12CD34'), findsOneWidget);
      expect(find.textContaining('Pagamento na entrega · Dinheiro na entrega'),
          findsOneWidget);
      expect(find.text('Estamos preparando seu pedido. 🍔'), findsOneWidget);
    });

    testWidgets('the response, not local state, decides the dine-in copy',
        (tester) async {
      stubApi(
        order: http.Response(
          orderBody(orderType: 'dine_in', tableNumber: 7),
          201,
        ),
      );
      await pump(tester, checkout: customer.copyWith(paymentMethod: 'cash'));
      await tapCta(tester, confirmCta(5000));

      expect(find.text('#AB12CD34 · Mesa 7'), findsOneWidget);
      expect(find.textContaining('Pagamento no local'), findsOneWidget);
      expect(find.text('Um atendente já foi avisado do seu pedido. 🍔'),
          findsOneWidget);
    });

    testWidgets('the Pix copy button gives the affordance back after 2s',
        (tester) async {
      stubApi(
        order: http.Response(
          orderBody(paymentMethod: 'pix', pix: {'payload': '00020126BR'}),
          201,
        ),
      );
      await pump(tester);
      await tapCta(tester, pixCta(5000));

      const label = 'Copiar código Pix (copia e cola)';
      await tester.ensureVisible(find.text(label));
      await tester.pumpAndSettle();
      // Not pumpAndSettle: that advances the fake clock, which is the very thing
      // under test here.
      await tester.tap(find.text(label));
      // Two frames: the first lets the clipboard channel answer, the second
      // paints the state it unblocked.
      await tester.pump();
      await tester.pump();
      expect(find.text('Código copiado!'), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 1500));
      expect(find.text('Código copiado!'), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 600));
      expect(find.text('Código copiado!'), findsNothing);
      expect(find.text(label), findsOneWidget);
    });

    testWidgets('leaving mid-countdown does not fire setState on a dead state',
        (tester) async {
      stubApi(
        order: http.Response(
          orderBody(paymentMethod: 'pix', pix: {'payload': '00020126BR'}),
          201,
        ),
      );
      await pump(tester);
      await tapCta(tester, pixCta(5000));
      await tester.ensureVisible(find.text('Copiar código Pix (copia e cola)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Copiar código Pix (copia e cola)'));
      await tester.pump();

      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await tester.pump(const Duration(seconds: 3));

      expect(tester.takeException(), isNull);
    });
  });
}

class _StubCart extends CartNotifier {
  _StubCart(this._items);
  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}

/// Skips the async SharedPreferences hydration the real notifier does on build,
/// so the screen sees a returning customer on its first frame.
class _StubCheckout extends CheckoutNotifier {
  _StubCheckout(this._initial);
  final CheckoutState _initial;

  @override
  CheckoutState build() => _initial;
}
