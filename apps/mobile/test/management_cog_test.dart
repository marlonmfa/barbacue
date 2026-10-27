import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:barbacue/management/management_app.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:barbacue/management/cog_login.dart';
import 'package:barbacue/management/management_api.dart';

final defaults = <String, String>{};
String credential(String key) => Platform.environment[key] ?? defaults[key]!;

class FakeCogLogin extends CogLogin {
  CogGrant? grant = CogGrant(
    'c' * 43,
    DateTime.now().add(const Duration(hours: 1)),
  );
  bool fail = true;
  int calls = 0;
  Completer<CogGrant?>? pending;
  @override
  Future<CogGrant?> signIn({bool interactive = false}) async {
    calls++;
    return pending == null ? grant : pending!.future;
  }

  @override
  Future<void> revoke(CogGrant grant) async {
    if (fail) throw StateError('QA revoke unavailable');
  }
}

class Fixture {
  final cog = FakeCogLogin();
  final requests = <http.Request>[];
  bool mapped = true;
  late final api = ManagementApi(
    cogLogin: cog,
    client: MockClient((request) async {
      requests.add(request);
      if (request.method == 'POST' && request.url.path == '/api/admin/auth') {
        expect(
          jsonDecode(request.body)['password'],
          credential('TEST_USER_PASSWORD'),
        );
        return http.Response(
          '{"ok":true}',
          200,
          headers: {
            'content-type': 'application/json',
            'set-cookie':
                'barbacue_admin=qa-native-cookie; HttpOnly; Path=/; Secure',
          },
        );
      }
      expect(request.headers['Cookie'], 'barbacue_admin=qa-native-cookie');
      if (request.method == 'GET' && request.url.path == '/api/admin/auth') {
        final usingCog = mapped && request.headers['X-Barbacue-Cog'] != null;
        return http.Response(
          jsonEncode({
            'session': {
              'userId': usingCog ? 2 : 1,
              'name': usingCog ? 'Pessoa Cog QA' : 'Pessoa Nativa QA',
              'role': usingCog ? 'cashier' : 'admin',
              'permissions': usingCog ? ['dashboard'] : null,
              'authSource': usingCog ? 'cog' : 'native',
            },
            'view': (usingCog ? 'c' : 'n') * 43,
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response(
        '{}',
        200,
        headers: {'content-type': 'application/json'},
      );
    }),
  );
  Future<void> native() => api.login(
    'local-${credential('TEST_USER_EMAIL')}',
    credential('TEST_USER_PASSWORD'),
  );
}

void main() {
  setUpAll(() {
    final file = File('/Users/marlonalcantara/Repos/.env.default');
    if (file.existsSync()) {
      for (final line in file.readAsLinesSync()) {
        final split = line.indexOf('=');
        if (split > 0) {
          defaults[line.substring(0, split)] = line
              .substring(split + 1)
              .replaceAll(RegExp(r'''^["']|["']$'''), '');
        }
      }
    }
    defaults.putIfAbsent('TEST_USER_EMAIL', () => 'teste@teste.com');
    defaults.putIfAbsent('TEST_USER_PASSWORD', () => 'teste123');
  });
  test(
    'existing Cog account takes priority, binds mutations and keeps native cookie on failed/successful logout',
    () async {
      final f = Fixture();
      addTearDown(f.api.dispose);
      await f.native();
      final account = await f.api.restoreCogOrNative();
      expect(account!.authSource, 'cog');
      expect(account.role, 'cashier');
      expect(account.permissions, ['dashboard']);
      await f.api.request('POST', '/api/admin/settings', {});
      expect(f.requests.last.headers['X-Cog-View'], 'c' * 43);
      await expectLater(
        f.api.logout(),
        throwsA(
          isA<ManagementException>().having(
            (e) => e.toString(),
            'message',
            'Não foi possível sair da Cog. Sua sessão foi mantida. Tente novamente.',
          ),
        ),
      );
      expect(f.api.usingCog, true);
      expect((await f.api.session()).authSource, 'cog');
      f.cog.fail = false;
      await f.api.logout();
      expect(f.api.usingCog, false);
      expect((await f.api.session()).name, 'Pessoa Nativa QA');
      expect(
        f.requests.last.headers['Cookie'],
        'barbacue_admin=qa-native-cookie',
      );
      expect(f.requests.where((r) => r.method == 'DELETE'), isEmpty);
    },
  );
  test(
    'unmapped and absent Cog keep the already authenticated native account',
    () async {
      final f = Fixture();
      addTearDown(f.api.dispose);
      await f.native();
      f.mapped = false;
      expect((await f.api.restoreCogOrNative())!.name, 'Pessoa Nativa QA');
      expect(f.api.usingCog, false);
      f.cog.grant = null;
      expect((await f.api.restoreCogOrNative())!.name, 'Pessoa Nativa QA');
      expect(f.api.usingCog, false);
      expect(
        f.requests.last.headers['Cookie'],
        'barbacue_admin=qa-native-cookie',
      );
    },
  );
  test(
    'late startup authorization cannot replace an explicit native login',
    () async {
      final f = Fixture();
      addTearDown(f.api.dispose);
      f.cog.pending = Completer<CogGrant?>();
      final restore = f.api.restoreCogOrNative();
      await Future<void>.delayed(Duration.zero);
      await f.native();
      f.cog.pending!.complete(f.cog.grant);
      expect(await restore, isNull);
      expect(f.api.usingCog, false);
      expect((await f.api.session()).name, 'Pessoa Nativa QA');
      expect(
        f.requests.any((r) => r.headers.containsKey('X-Barbacue-Cog')),
        false,
      );
    },
  );
  test('private callback pins scheme, path, state and single code', () {
    final uri = Uri.parse(CogLogin.mobileCallback),
        state = 'qa-independent-state';
    expect(
      CogLogin.codeFrom(
        uri.replace(queryParameters: {'code': 'qa', 'state': state}),
        uri,
        state,
      ),
      'qa',
    );
    for (final text in [
      'com.other.app://oauth/cog/callback?code=qa&state=$state',
      '${uri.toString()}?code=one&code=two&state=$state',
      '${uri.toString()}?code=qa&state=wrong',
      '${uri.toString()}?code=qa&state=$state#fragment',
    ]) {
      expect(CogLogin.codeFrom(Uri.parse(text), uri, state), isNull);
    }
  });
  testWidgets('failed Cog logout has a plain message and retries revocation', (tester) async {
    final f = Fixture();
    await f.native();
    await tester.pumpWidget(ManagementApp(api: f.api));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text('Pessoa Cog QA'), findsOneWidget);
    await tester.tap(find.text('Sair da Cog'));
    await tester.pumpAndSettle();
    expect(f.api.usingCog, true);
    expect(find.text('Não foi possível sair da Cog. Sua sessão foi mantida. Tente novamente.'), findsOneWidget);
    expect(find.textContaining('Bad state'), findsNothing);
    f.cog.fail = false;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(f.api.usingCog, false);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text('Pessoa Nativa QA'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    f.api.dispose();
  });

}
