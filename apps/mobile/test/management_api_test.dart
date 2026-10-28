import 'dart:async';
import 'dart:convert';

import 'package:barbacue/management/management_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response json(
  dynamic body, {
  int status = 200,
  Map<String, String>? headers,
}) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json', ...?headers},
);

void main() {
  test('an older server explains the missing session API', () async {
    final api = ManagementApi(
      client: MockClient((_) async => http.Response('', 405)),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.session(),
      throwsA(
        isA<ManagementException>().having(
          (e) => e.message,
          'message',
          contains('atualização no servidor'),
        ),
      ),
    );
  });
  test(
    'staff login carries only its session cookie and logout removes it',
    () async {
      var loggedIn = false;
      final api = ManagementApi(
        client: MockClient((request) async {
          expect(request.url.origin, 'https://barbacue.cog.ia.br');
          expect(request.followRedirects, isFalse);
          if (request.method == 'POST') {
            expect(jsonDecode(request.body), {
              'username': 'equipe',
              'password': 'secret',
            });
            expect(request.headers['cookie'], isNull);
            loggedIn = true;
            return json(
              {'ok': true},
              headers: {
                'set-cookie':
                    'barbacue_admin=staff-session; Path=/; HttpOnly; Secure; SameSite=Lax',
              },
            );
          }
          if (loggedIn) {
            expect(request.headers['cookie'], 'barbacue_admin=staff-session');
          }
          if (request.method == 'DELETE') {
            loggedIn = false;
            return json({'ok': true});
          }
          if (!loggedIn) {
            expect(request.headers['cookie'], isNull);
            return json({'error': 'unauthorized'}, status: 401);
          }
          return json({
            'session': {
              'name': 'Equipe',
              'role': 'kitchen',
              'permissions': null,
            },
          });
        }),
      );
      addTearDown(api.dispose);
      final session = await api.login(' equipe ', 'secret');
      expect(session.can('kitchen'), isTrue);
      expect(session.can('orders'), isFalse);
      await api.logout();
      await expectLater(
        api.session(),
        throwsA(
          isA<ManagementException>().having((e) => e.status, 'status', 401),
        ),
      );
    },
  );

  test('explicit empty permissions override defaults', () {
    expect(
      StaffSession({'role': 'manager', 'permissions': []}).can('orders'),
      isFalse,
    );
    expect(
      StaffSession({'role': 'admin', 'permissions': []}).can('orders'),
      isTrue,
    );
  });

  test(
    'rejects unsafe origins and routes before sending credentials',
    () async {
      for (final origin in [
        'http://example.com',
        'https://user:pass@example.com',
        'https://example.com/other',
      ]) {
        expect(
          () => ManagementApi(origin: Uri.parse(origin)),
          throwsArgumentError,
        );
      }
      final api = ManagementApi(
        client: MockClient((_) async => fail('Must not send')),
      );
      addTearDown(api.dispose);
      for (final path in [
        'https://example.com',
        '//example.com',
        '/api/admin/../auth',
        '/api/admin/orders?brand=x',
      ]) {
        await expectLater(api.request('GET', path), throwsArgumentError);
      }
    },
  );

  test(
    'redirects and HTML responses never become authenticated data',
    () async {
      for (final response in [
        http.Response('', 302, headers: {'location': 'https://elsewhere.test'}),
        http.Response('<html/>', 200),
      ]) {
        final api = ManagementApi(client: MockClient((_) async => response));
        await expectLater(api.session(), throwsA(isA<ManagementException>()));
        api.dispose();
      }
    },
  );

  test('a failed mutation is never retried automatically', () async {
    var count = 0;
    final api = ManagementApi(
      client: MockClient((_) async {
        count++;
        return json({
          'error': 'Este pedido mudou de etapa. Atualize a fila.',
        }, status: 409);
      }),
    );
    addTearDown(api.dispose);
    await expectLater(
      api.request('PATCH', '/api/admin/kitchen', {
        'id': 'order',
        'status': 'ready',
      }),
      throwsA(
        isA<ManagementException>().having((e) => e.status, 'status', 409),
      ),
    );
    expect(count, 1);
  });

  test(
    'a late login response cannot restore a cleared staff session',
    () async {
      final pending = Completer<http.Response>();
      final started = Completer<void>();
      var requests = 0;
      final api = ManagementApi(
        client: MockClient((request) async {
          if (requests++ == 0) {
            started.complete();
            return pending.future;
          }
          expect(request.headers['cookie'], isNull);
          return json({'error': 'unauthorized'}, status: 401);
        }),
      );
      addTearDown(api.dispose);
      final login = api.login('staff', 'secret');
      final assertion = expectLater(login, throwsA(isA<ManagementException>()));
      await started.future;
      api.clear();
      pending.complete(
        json(
          {'ok': true},
          headers: {'set-cookie': 'barbacue_admin=late; Path=/'},
        ),
      );
      await assertion;
      await expectLater(api.session(), throwsA(isA<ManagementException>()));
    },
  );
}
