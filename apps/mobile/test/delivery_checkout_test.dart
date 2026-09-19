import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/models/delivery_quote.dart';
import 'package:barbacue/models/order.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/providers/checkout_provider.dart';
import 'package:barbacue/screens/payment_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';

Map<String, dynamic> quoteJson() => {
  'quoteId': 'test-delivery-quote',
  'address': 'Rua da Brasa, 123',
  'distanceMeters': 2500,
  'durationSeconds': 600,
  'feeCents': 850,
  'expiresAt': DateTime.now()
      .add(const Duration(minutes: 15))
      .toIso8601String(),
  'provider': 'osm',
};
http.Response jsonResponse(Object data, [int status = 200]) => http.Response(
  jsonEncode(data),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
const customer = CheckoutState(
  name: 'Cliente',
  phone: '47999998888',
  address: 'Rua da Brasa, 123',
  paymentMethod: 'cash',
  loaded: true,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => ApiService.client = http.Client());

  test('quote is bound to address, brand and expiration', () {
    final quote = DeliveryQuote.fromJson(
      quoteJson(),
      requestedAddress: ' Rua da Brasa, 123 ',
      brand: 'barbacue',
    );
    expect(quote.isValidFor('Rua da Brasa, 123', 'barbacue'), isTrue);
    expect(quote.isValidFor('Rua da Brasa, 124', 'barbacue'), isFalse);
    expect(quote.isValidFor('Rua da Brasa, 123', 'chelas'), isFalse);
    expect(
      quote.isValidFor('Rua da Brasa, 123', 'barbacue', now: quote.expiresAt),
      isFalse,
    );
    for (final bad in [
      <String, dynamic>{},
      {...quoteJson(), 'feeCents': null},
      {...quoteJson(), 'feeCents': -1},
      {...quoteJson(), 'provider': 'unknown'},
      {...quoteJson(), 'expiresAt': 'bad'},
    ]) {
      expect(
        () => DeliveryQuote.fromJson(
          bad,
          requestedAddress: customer.address,
          brand: 'barbacue',
        ),
        throwsFormatException,
      );
    }
  });

  test('settings/provider failures never become free delivery', () async {
    ApiService.client = MockClient(
      (_) async => jsonResponse({'message': 'Serviço indisponível'}, 503),
    );
    await expectLater(
      ApiService.fetchDeliveryEnabled(),
      throwsA(isA<DeliveryApiException>()),
    );
    ApiService.client = MockClient(
      (_) async => jsonResponse({'enabled': 'false'}),
    );
    await expectLater(
      ApiService.fetchDeliveryEnabled(),
      throwsA(isA<DeliveryApiException>()),
    );
    ApiService.client = MockClient(
      (_) async => jsonResponse({'enabled': false}),
    );
    expect(await ApiService.fetchDeliveryEnabled(), isFalse);
    ApiService.client = MockClient(
      (_) async => jsonResponse({
        'error': 'outside_area',
        'message': 'Endereço fora da área atendida.',
      }, 422),
    );
    await expectLater(
      ApiService.quoteDelivery(address: customer.address),
      throwsA(
        isA<DeliveryApiException>().having(
          (error) => error.message,
          'message',
          'Endereço fora da área atendida.',
        ),
      ),
    );
  });

  test('order sends quote ID and decodes canonical shipping fee', () {
    const request = CreateOrderRequest(
      customerName: 'Cliente',
      customerPhone: '47999998888',
      deliveryAddress: 'Rua da Brasa, 123',
      deliveryQuoteId: 'test-delivery-quote',
      brand: 'barbacue',
      items: [],
    );
    expect(request.toJson()['deliveryQuoteId'], 'test-delivery-quote');
    expect(request.toJson().containsKey('deliveryFeeCents'), isFalse);
    final order = OrderResponse.fromJson({
      'orderId': 'order',
      'totalCents': 5850,
      'deliveryFeeCents': 850,
      'deliveryDistanceMeters': 2500,
      'deliveryDurationSeconds': 600,
    });
    expect(order.deliveryFeeCents, 850);
    expect(order.totalCents, 5850);
    expect(OrderResponse.fromJson({'orderId': 'legacy'}).deliveryFeeCents, 0);
  });

  Future<ProviderContainer> pumpPayment(
    WidgetTester tester, {
    CheckoutState initial = customer,
  }) async {
    final container = ProviderContainer(
      overrides: [
        cartProvider.overrideWith(() => _TestCart()),
        checkoutProvider.overrideWith(() => _TestCheckout(initial)),
      ],
    );
    addTearDown(container.dispose);
    addTearDown(() => tester.pumpWidget(const SizedBox()));
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(theme: AppTheme.theme, home: const PaymentScreen()),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  List<http.Request> stub({bool enabled = true, http.Response? quoteFailure}) {
    final sent = <http.Request>[];
    ApiService.client = MockClient((request) async {
      sent.add(request);
      if (request.url.path == '/api/delivery/quote') {
        if (request.method == 'GET') return jsonResponse({'enabled': enabled});
        return quoteFailure ?? jsonResponse(quoteJson(), 201);
      }
      if (request.url.path == '/api/coupons') {
        return jsonResponse({
          'id': 1,
          'code': 'ITEMS',
          'description': null,
          'discountType': 'flat',
          'discountValue': 9999,
          'discountCents': 9999,
        });
      }
      final payload = jsonDecode(request.body) as Map<String, dynamic>;
      return jsonResponse({
        'orderId': 'abc12345-order',
        'paymentMethod': payload['paymentMethod'],
        'orderType': payload['orderType'],
        'totalCents': payload['deliveryQuoteId'] != null ? 5850 : 5000,
        'deliveryFeeCents': payload['deliveryQuoteId'] != null ? 850 : 0,
      }, 201);
    });
    return sent;
  }

  Future<void> tap(WidgetTester tester, String text) async {
    await tester.ensureVisible(find.text(text));
    await tester.pumpAndSettle();
    await tester.tap(find.text(text));
    await tester.pumpAndSettle();
  }

  testWidgets('quote requires a tap and changing destination revokes its fee', (
    tester,
  ) async {
    final sent = stub();
    await pumpPayment(tester);
    expect(sent.where((request) => request.method == 'POST'), isEmpty);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton).last).onPressed,
      isNull,
    );
    await tap(tester, 'Calcular frete');
    expect(
      find.text('Confirmar pedido · ${formatPrice(5850)}'),
      findsOneWidget,
    );
    expect(find.textContaining('2,5 km'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('delivery-address')));
    await tester.enterText(
      find.byKey(const ValueKey('delivery-address')),
      'Rua da Brasa, 124',
    );
    await tester.pumpAndSettle();
    expect(find.text('Calcular frete'), findsOneWidget);
    expect(find.text('Confirmar pedido · ${formatPrice(5850)}'), findsNothing);
    expect(sent.where((request) => request.url.path == '/api/orders'), isEmpty);
  });

  testWidgets('expiration and provider errors block checkout', (tester) async {
    stub();
    await pumpPayment(tester);
    await tap(tester, 'Calcular frete');
    await tester.pump(const Duration(minutes: 16));
    await tester.pumpAndSettle();
    expect(
      find.text('A cotação expirou. Calcule o frete novamente.'),
      findsOneWidget,
    );
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton).last).onPressed,
      isNull,
    );
    stub(
      quoteFailure: jsonResponse({
        'message': 'Endereço fora da área atendida.',
      }, 422),
    );
    await tap(tester, 'Calcular frete');
    expect(find.text('Endereço fora da área atendida.'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton).last).onPressed,
      isNull,
    );
  });

  testWidgets('cash change includes fee and order sends the confirmed quote', (
    tester,
  ) async {
    final sent = stub();
    final container = await pumpPayment(
      tester,
      initial: customer.copyWith(changeForCents: 5000),
    );
    await tap(tester, 'Calcular frete');
    await tap(tester, 'Confirmar pedido · ${formatPrice(5850)}');
    expect(
      find.text('O valor do troco não pode ser menor que o total.'),
      findsOneWidget,
    );
    expect(sent.where((request) => request.url.path == '/api/orders'), isEmpty);
    container.read(checkoutProvider.notifier).update(changeForCents: 6000);
    await tester.pumpAndSettle();
    await tap(tester, 'Confirmar pedido · ${formatPrice(5850)}');
    final order = jsonDecode(
      sent.lastWhere((request) => request.url.path == '/api/orders').body,
    );
    expect(order['deliveryQuoteId'], 'test-delivery-quote');
    expect(order['brand'], 'barbacue');
    expect(find.text('Pedido recebido! 🎉'), findsOneWidget);
  });

  testWidgets(
    'coupon cannot consume freight and dine-in never quotes delivery',
    (tester) async {
      final sent = stub();
      await pumpPayment(
        tester,
        initial: customer.copyWith(couponCode: 'ITEMS'),
      );
      await tap(tester, 'Calcular frete');
      expect(
        find.text('Confirmar pedido · ${formatPrice(850)}'),
        findsOneWidget,
      );
      expect(
        sent.where((request) => request.url.path == '/api/orders'),
        isEmpty,
      );
    },
  );

  testWidgets('dine-in submits without delivery lookup or quote', (
    tester,
  ) async {
    final sent = stub();
    await pumpPayment(
      tester,
      initial: customer.copyWith(
        orderType: 'dine_in',
        tableNumber: 7,
        tableToken: 'table-token',
      ),
    );
    expect(find.text('Calcular frete'), findsNothing);
    expect(find.text('Não se aplica'), findsOneWidget);
    await tap(tester, 'Confirmar pedido · ${formatPrice(5000)}');
    final order = jsonDecode(sent.last.body);
    expect(order['deliveryQuoteId'], isNull);
    expect(order['deliveryAddress'], isNull);
    expect(order['orderType'], 'dine_in');
    expect(
      sent.where((request) => request.url.path == '/api/delivery/quote'),
      isEmpty,
    );
  });
}

class _TestCart extends CartNotifier {
  @override
  List<CartItem> build() => [
    CartItem(productId: 1, name: 'Burger', priceCents: 2500, qty: 2),
  ];
}

class _TestCheckout extends CheckoutNotifier {
  _TestCheckout(this.initial);
  final CheckoutState initial;
  @override
  CheckoutState build() => initial;
}
