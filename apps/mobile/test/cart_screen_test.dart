// The cart is where a coupon turns into money. These cover the paths where a
// mistake charges the customer the wrong amount, plus the two rules that used
// to let an unusable order through (address, phone-as-digits).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/screens/cart_screen.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/providers/checkout_provider.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => ApiService.client = http.Client());

  // Built per test rather than shared: CartItem.qty is mutable, so one
  // instance would leak a quantity change from test to test.
  CartItem item() => CartItem(
        productId: 1,
        name: 'X-Salada',
        priceCents: 2500,
        qty: 2,
      );

  void answerCoupon(String body, {int status = 200}) {
    ApiService.client = MockClient((_) async => http.Response(
          body,
          status,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ));
  }

  Future<void> pumpCart(
    WidgetTester tester, {
    List<CartItem>? items,
  }) async {
    // Tall enough that the whole cart — including the submit button under the
    // form — is laid out and hit-testable without scrolling.
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cartProvider.overrideWith(() => _StubCart(items ?? [item()])),
        ],
        child: const MaterialApp(home: CartScreen()),
      ),
    );
    await tester.pump();
  }

  // By hint, not by type: every TextFormField in the form wraps a TextField of
  // its own, so a bare byType would match them all.
  final couponField = find.byWidgetPredicate(
    (w) => w is TextField && w.decoration?.hintText == 'CÓDIGO',
  );

  Future<void> applyCoupon(WidgetTester tester, String code) async {
    await tester.enterText(couponField, code);
    await tester.pump();
    await tester.tap(find.text('Aplicar'));
    await tester.pumpAndSettle();
  }

  testWidgets('an applied coupon renders the discount row and discounts the '
      'submit label', (tester) async {
    answerCoupon(
      '{"id":1,"code":"BARBA10","description":"10% off",'
      '"discountType":"percentage","discountValue":10,"discountCents":500}',
    );
    await pumpCart(tester);

    expect(find.text('Ir para pagamento · ${formatPrice(5000)}'), findsOneWidget);

    await applyCoupon(tester, 'BARBA10');

    expect(find.text('Desconto (BARBA10)'), findsOneWidget);
    expect(find.text('−${formatPrice(500)}'), findsOneWidget);
    // Subtotal stays whole; only the total moves.
    expect(find.text(formatPrice(5000)), findsOneWidget);
    expect(find.text(formatPrice(4500)), findsOneWidget);
    expect(find.text('Ir para pagamento · ${formatPrice(4500)}'), findsOneWidget);
  });

  testWidgets('a coupon worth more than the cart floors the total at zero',
      (tester) async {
    answerCoupon(
      '{"id":2,"code":"MEGA","description":null,"discountType":"flat",'
      '"discountValue":9900,"discountCents":9900}',
    );
    await pumpCart(tester);

    await applyCoupon(tester, 'MEGA');

    // The customer is never owed money, and the button must never offer to
    // take a negative amount.
    expect(find.text(formatPrice(0)), findsOneWidget);
    expect(find.text('Ir para pagamento · ${formatPrice(0)}'), findsOneWidget);
    expect(find.textContaining('-R\$'), findsNothing);
  });

  testWidgets('a failed apply drops the coupon that was already applied',
      (tester) async {
    answerCoupon(
      '{"id":1,"code":"BARBA10","description":null,'
      '"discountType":"percentage","discountValue":10,"discountCents":500}',
    );
    await pumpCart(tester);
    await applyCoupon(tester, 'BARBA10');
    expect(find.text('Desconto (BARBA10)'), findsOneWidget);

    await tester.tap(find.text('Remover'));
    await tester.pump();

    answerCoupon('{"error":"Cupom expirado"}', status: 400);
    await applyCoupon(tester, 'VELHO');

    // The server just refused it — showing the previous discount would promise
    // a price that /api/orders will not honour.
    expect(find.text('Cupom expirado'), findsOneWidget);
    expect(find.text('Desconto (BARBA10)'), findsNothing);
    expect(find.text('Ir para pagamento · ${formatPrice(5000)}'), findsOneWidget);
  });

  testWidgets('submitting hands the applied code to the checkout store',
      (tester) async {
    answerCoupon(
      '{"id":1,"code":"BARBA10","description":null,'
      '"discountType":"percentage","discountValue":10,"discountCents":500}',
    );
    final container = ProviderContainer(
      overrides: [cartProvider.overrideWith(() => _StubCart([item()]))],
    );
    addTearDown(container.dispose);

    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    // A real router: the submit path pushes /payment, and go_router throws
    // without one — so a bare MaterialApp would hide a broken handoff.
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: GoRouter(
            routes: [
              GoRoute(path: '/', builder: (_, _) => const CartScreen()),
              GoRoute(
                path: '/payment',
                builder: (_, _) => const Scaffold(body: Text('pagamento')),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    await applyCoupon(tester, 'BARBA10');
    await tester.enterText(find.widgetWithText(TextFormField, 'Nome *'), 'Ana');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Telefone / WhatsApp *'),
      '47999999999',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Endereço de entrega *'),
      'Rua A, 100',
    );
    await tester.tap(find.textContaining('Ir para pagamento'));
    await tester.pumpAndSettle();

    // The whole point of the item: the code has to survive the hop to the
    // payment screen, or the customer is charged full price.
    expect(container.read(checkoutProvider).couponCode, 'BARBA10');
    expect(find.text('pagamento'), findsOneWidget);
  });

  testWidgets('the empty cart offers a way back instead of ejecting the user',
      (tester) async {
    await pumpCart(tester, items: []);

    expect(find.text('Seu carrinho está vazio'), findsOneWidget);
    expect(find.text('Ver cardápio'), findsOneWidget);
  });

  testWidgets('a phone with too few digits is rejected despite its length',
      (tester) async {
    await pumpCart(tester);

    await tester.enterText(find.widgetWithText(TextFormField, 'Nome *'), 'Ana');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Telefone / WhatsApp *'),
      '(47) 999',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Endereço de entrega *'),
      'Rua A, 100',
    );
    await tester.tap(find.textContaining('Ir para pagamento'));
    await tester.pump();

    // 8 characters but only 5 digits — the old length check let this through.
    expect(find.text('Digite um número válido'), findsOneWidget);
  });

  testWidgets('a delivery order cannot be submitted without an address',
      (tester) async {
    await pumpCart(tester);

    await tester.enterText(find.widgetWithText(TextFormField, 'Nome *'), 'Ana');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Telefone / WhatsApp *'),
      '47999999999',
    );
    await tester.tap(find.textContaining('Ir para pagamento'));
    await tester.pump();

    expect(find.text('Informe o endereço de entrega.'), findsOneWidget);
  });
}

/// Keeps the cart off SharedPreferences so a test's items are present at first
/// build rather than arriving a frame later.
class _StubCart extends CartNotifier {
  _StubCart(this._items);

  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}
