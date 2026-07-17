// The table session is the only thing that can seat an order, and it comes from
// two places that can both hand over garbage: persisted storage and the network.
// These lock down that a malformed blob is refused rather than thrown on, and
// that the 3h dining window is actually enforced — SharedPreferences, unlike the
// web's cookie, will happily hand back a session from last week.

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/order.dart';
import 'package:barbacue/models/table_session.dart';
import 'package:barbacue/providers/checkout_provider.dart';
import 'package:barbacue/providers/table_session_provider.dart';
import 'package:barbacue/services/api_service.dart';

const _kTableKey = 'barbacue_table';

String _stored(Map<String, dynamic> session, Duration ago) => jsonEncode({
      'session': session,
      'seatedAtEpochMs':
          DateTime.now().subtract(ago).millisecondsSinceEpoch,
    });

void main() {
  tearDown(() => ApiService.client = http.Client());

  group('TableSession.fromJson', () {
    test('decodes a well-formed session', () {
      final s = TableSession.fromJson(
        {'number': 4, 'token': 'abc', 'label': 'Varanda 2'},
      );
      expect(s, isNotNull);
      expect(s!.number, 4);
      expect(s.token, 'abc');
      expect(s.label, 'Varanda 2');
    });

    test('a null label is allowed — most tables have none', () {
      final s = TableSession.fromJson({'number': 1, 'token': 't', 'label': null});
      expect(s?.label, isNull);
    });

    test('rejects malformed blobs rather than throwing', () {
      for (final bad in <Object?>[
        null,
        'not a map',
        <String, dynamic>{},
        {'number': '4', 'token': 't'}, // number must be an int
        {'number': 4}, // no token
        {'number': 4, 'token': 7}, // token must be a String
      ]) {
        expect(TableSession.fromJson(bad), isNull, reason: 'for $bad');
      }
    });
  });

  group('tableSessionProvider', () {
    test('hydrates a session seated within the window', () async {
      SharedPreferences.setMockInitialValues({
        _kTableKey: _stored(
          {'number': 7, 'token': 'tok-7', 'label': null},
          const Duration(hours: 2, minutes: 59),
        ),
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(tableSessionProvider);
      await Future<void>.delayed(Duration.zero);

      expect(container.read(tableSessionProvider)?.number, 7);
    });

    test('a session older than 3h nulls AND deletes the key', () async {
      SharedPreferences.setMockInitialValues({
        _kTableKey: _stored(
          {'number': 7, 'token': 'tok-7', 'label': null},
          const Duration(hours: 3, minutes: 1),
        ),
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(tableSessionProvider);
      await Future<void>.delayed(Duration.zero);

      expect(container.read(tableSessionProvider), isNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(_kTableKey), isNull);
    });

    test('a corrupted blob nulls AND deletes the key', () async {
      SharedPreferences.setMockInitialValues({_kTableKey: '{not json'});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(tableSessionProvider);
      await Future<void>.delayed(Duration.zero);

      expect(container.read(tableSessionProvider), isNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(_kTableKey), isNull);
    });

    test('seat() persists with a fresh timestamp; leave() removes it', () async {
      SharedPreferences.setMockInitialValues({});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container
          .read(tableSessionProvider.notifier)
          .seat(const TableSession(number: 3, token: 'tok-3'));

      final prefs = await SharedPreferences.getInstance();
      final raw = jsonDecode(prefs.getString(_kTableKey)!) as Map;
      expect(raw['session']['number'], 3);
      expect(
        DateTime.now().millisecondsSinceEpoch - (raw['seatedAtEpochMs'] as int),
        lessThan(5000),
      );

      await container.read(tableSessionProvider.notifier).leave();
      expect(container.read(tableSessionProvider), isNull);
      expect(prefs.getString(_kTableKey), isNull);
    });
  });

  group('checkout follows the table session', () {
    test('seating switches the order type and carries the token', () async {
      SharedPreferences.setMockInitialValues({});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(checkoutProvider).orderType, 'delivery');

      await container
          .read(tableSessionProvider.notifier)
          .seat(const TableSession(number: 9, token: 'tok-9'));
      await Future<void>.delayed(Duration.zero);

      final seated = container.read(checkoutProvider);
      expect(seated.orderType, 'dine_in');
      expect(seated.tableToken, 'tok-9');
      expect(seated.tableNumber, 9);
    });

    test('leaving resets to delivery and drops the token', () async {
      SharedPreferences.setMockInitialValues({});
      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container
          .read(tableSessionProvider.notifier)
          .seat(const TableSession(number: 9, token: 'tok-9'));
      await Future<void>.delayed(Duration.zero);
      await container.read(tableSessionProvider.notifier).leave();
      await Future<void>.delayed(Duration.zero);

      final left = container.read(checkoutProvider);
      expect(left.orderType, 'delivery');
      expect(left.tableToken, isNull);
      expect(left.tableNumber, isNull);
    });

    test('a stale persisted dine-in blob does not resurrect a table', () async {
      // The last session's checkout survives on disk; nothing seats this one.
      SharedPreferences.setMockInitialValues({
        'barbacue-checkout': jsonEncode({
          'name': 'Ana',
          'orderType': 'dine_in',
          'tableToken': 'tok-old',
          'tableNumber': 2,
        }),
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(checkoutProvider);
      await Future<void>.delayed(Duration.zero);

      final c = container.read(checkoutProvider);
      expect(c.name, 'Ana', reason: 'the customer is still restored');
      expect(c.orderType, 'delivery');
      expect(c.tableToken, isNull);
      expect(c.tableNumber, isNull);
    });
  });

  group('CreateOrderRequest dine-in payload', () {
    const items = [OrderItem(productId: 1, name: 'X-Burguer', priceCents: 100, qty: 1)];

    test('sends the token and no address — delivery requires an address, so a '
        'stray one would be rejected against a table order', () {
      final json = const CreateOrderRequest(
        customerName: 'Ana',
        customerPhone: '47999999999',
        items: items,
        orderType: 'dine_in',
        tableToken: 'tok-4',
      ).toJson();

      expect(json['orderType'], 'dine_in');
      expect(json['tableToken'], 'tok-4');
      expect(json.containsKey('deliveryAddress'), isFalse);
      // The server re-resolves the number from the token; sending one would
      // invite a forged client to claim someone else's table.
      expect(json.containsKey('tableNumber'), isFalse);
    });

    test('delivery stays the default and omits the token', () {
      final json = const CreateOrderRequest(
        customerName: 'Ana',
        customerPhone: '47999999999',
        deliveryAddress: 'Rua 1, 100',
        items: items,
      ).toJson();

      expect(json['orderType'], 'delivery');
      expect(json.containsKey('tableToken'), isFalse);
      expect(json['deliveryAddress'], 'Rua 1, 100');
    });
  });

  group('ApiService.resolveTable', () {
    test('200 decodes the table', () async {
      late http.Request sent;
      ApiService.client = MockClient((req) async {
        sent = req;
        return http.Response(
          jsonEncode({'number': 4, 'token': 'tok-4', 'label': 'Balcão'}),
          200,
        );
      });

      final s = await ApiService.resolveTable('tok-4');
      expect(s?.number, 4);
      expect(s?.label, 'Balcão');
      expect(sent.url.queryParameters['token'], 'tok-4');
      expect(sent.url.path, endsWith('/api/tables/resolve'));
    });

    test('404 means an unusable QR, not a failure', () async {
      ApiService.client = MockClient(
        (_) async => http.Response(
          jsonEncode({'error': 'notfound', 'message': 'QR Code inválido...'}),
          404,
        ),
      );
      expect(await ApiService.resolveTable('nope'), isNull);
    });

    test('a server failure throws rather than reading as an invalid QR', () {
      ApiService.client = MockClient((_) async => http.Response('<html>', 502));
      expect(ApiService.resolveTable('tok'), throwsA(isA<Exception>()));
    });
  });
}
