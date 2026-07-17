// The coupon route answers with finished pt-BR strings that the cart shows
// verbatim. These lock that pass-through in: a re-derived message here would
// drift from the rules that actually live in the DB.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:barbacue/models/coupon.dart';
import 'package:barbacue/services/api_service.dart';

void main() {
  tearDown(() => ApiService.client = http.Client());

  Future<CouponResult> validate({http.Response? response}) {
    ApiService.client = MockClient((_) async => response!);
    return ApiService.validateCoupon(code: 'BARBA10', subtotalCents: 5000);
  }

  test('200 decodes the coupon', () async {
    late http.Request sent;
    ApiService.client = MockClient((req) async {
      sent = req;
      return http.Response(
        jsonEncode({
          'id': 7,
          'code': 'BARBA10',
          'description': '10% de desconto',
          'discountType': 'percentage',
          'discountValue': 10,
          'discountCents': 500,
        }),
        200,
      );
    });

    final coupon = await ApiService.validateCoupon(
      code: '  BARBA10  ',
      subtotalCents: 5000,
    );

    expect(coupon.id, 7);
    expect(coupon.code, 'BARBA10');
    expect(coupon.description, '10% de desconto');
    expect(coupon.discountType, 'percentage');
    expect(coupon.discountValue, 10);
    expect(coupon.discountCents, 500);

    // The code is trimmed before it leaves the client.
    final body = jsonDecode(sent.body) as Map<String, dynamic>;
    expect(body['code'], 'BARBA10');
    expect(body['subtotalCents'], 5000);
  });

  test('200 tolerates a null description', () async {
    final coupon = await validate(
      response: http.Response(
        jsonEncode({
          'id': 1,
          'code': 'FLAT5',
          'description': null,
          'discountType': 'flat',
          'discountValue': 500,
          'discountCents': 500,
        }),
        200,
      ),
    );
    expect(coupon.description, isNull);
  });

  // Every string the route can return, surfaced exactly as the server wrote it.
  const serverErrors = <String, int>{
    'Código inválido': 400,
    'Cupom não encontrado': 404,
    'Cupom inativo': 400,
    'Cupom expirado': 400,
    'Cupom esgotado': 400,
    'Pedido mínimo para esse cupom: R\$30,00': 400,
  };

  serverErrors.forEach((message, status) {
    test('$status "$message" surfaces verbatim', () async {
      expect(
        () => validate(
          response: http.Response(jsonEncode({'error': message}), status),
        ),
        throwsA(
          isA<Exception>().having((e) => e.toString(), 'message',
              contains(message)),
        ),
      );
    });
  });

  test('prefers `message` over `error` when both are present', () async {
    expect(
      () => validate(
        response: http.Response(
          jsonEncode({'message': 'Humano', 'error': {'fieldErrors': {}}}),
          400,
        ),
      ),
      throwsA(isA<Exception>()
          .having((e) => e.toString(), 'message', contains('Humano'))),
    );
  });

  test('a non-200 with no usable body falls back to "Cupom inválido"', () async {
    expect(
      () => validate(response: http.Response('<html>502</html>', 502)),
      throwsA(isA<Exception>()
          .having((e) => e.toString(), 'message', contains('Cupom inválido'))),
    );
  });

  test('an offline socket failure is reported as unavailable, not invalid',
      () async {
    ApiService.client = MockClient((_) async => throw const SocketException('down'));
    expect(
      () => ApiService.validateCoupon(code: 'X', subtotalCents: 1),
      throwsA(isA<Exception>().having((e) => e.toString(), 'message',
          contains('Não foi possível validar o cupom agora.'))),
    );
  });

  test('a 200 carrying undecodable JSON does not surface as a valid coupon',
      () async {
    expect(
      () => validate(response: http.Response('not json', 200)),
      throwsA(isA<Exception>().having((e) => e.toString(), 'message',
          contains('Não foi possível validar o cupom agora.'))),
    );
  });
}
