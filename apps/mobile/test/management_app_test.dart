import 'dart:convert';

import 'package:barbacue/management/management_api.dart';
import 'package:barbacue/management/management_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  Future<void> enter(WidgetTester tester, ManagementApi api) async {
    await tester.pumpWidget(ManagementApp(api: api));
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Usuário ou e-mail'),
      'cozinha',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Senha'),
      'secret',
    );
    await tester.tap(find.text('Entrar'));
    await tester.pumpAndSettle();
  }

  http.Response json(dynamic body) => http.Response(
    jsonEncode(body),
    200,
    headers: {'content-type': 'application/json'},
  );

  testWidgets(
    'kitchen account sees only its queue and uses the kitchen action',
    (tester) async {
      final mutations = <Map<String, dynamic>>[];
      var stage = 'confirmed';
      final api = ManagementApi(
        client: MockClient((request) async {
          if (request.url.path == '/api/admin/auth') {
            return json({
              'session': {
                'name': 'Cozinha',
                'role': 'kitchen',
                'permissions': ['kitchen'],
              },
            });
          }
          expect(request.url.path, '/api/admin/kitchen');
          if (request.method == 'PATCH') {
            mutations.add(jsonDecode(request.body) as Map<String, dynamic>);
            stage = 'preparing';
            return json({'ok': true});
          }
          return json([
            {
              'id': '12345678-0000-0000-0000-000000000000',
              'brand': 'chelas',
              'status': stage,
              'items': [
                {'name': 'Burrito', 'qty': 2, 'notes': 'Sem pimenta'},
              ],
            },
          ]);
        }),
      );
      await enter(tester, api);
      expect(find.text('2 × Burrito\n   Sem pimenta'), findsOneWidget);
      await tester.tap(find.text('Iniciar preparo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();
      expect(mutations.single, {
        'id': '12345678-0000-0000-0000-000000000000',
        'status': 'preparing',
      });
      expect(find.text('Marcar pronto'), findsOneWidget);
      await tester.tap(find.byTooltip('Open navigation menu'));
      await tester.pumpAndSettle();
      expect(find.text('Cardápios'), findsNothing);
      expect(find.text('Visão geral'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      api.dispose();
    },
  );

  testWidgets(
    'first access requires password change before loading any module',
    (tester) async {
      final paths = <String>[];
      final api = ManagementApi(
        client: MockClient((request) async {
          paths.add(request.url.path);
          return json({
            'session': {
              'name': 'Equipe',
              'role': 'admin',
              'mustChangePassword': true,
            },
          });
        }),
      );
      await enter(tester, api);
      expect(find.text('Salvar nova senha'), findsOneWidget);
      expect(paths.every((p) => p == '/api/admin/auth'), isTrue);
      await tester.pumpWidget(const SizedBox());
      api.dispose();
    },
  );

  testWidgets('expired session removes customer and order data', (
    tester,
  ) async {
    var expired = false;
    final api = ManagementApi(
      client: MockClient((request) async {
        if (expired) {
          return http.Response(
            '{"error":"unauthorized"}',
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('auth')) {
          return json({
            'session': {
              'role': 'cashier',
              'permissions': ['orders'],
            },
          });
        }
        return json([
          {
            'id': '12345678',
            'brand': 'barbacue',
            'customerName': 'Cliente privado',
            'status': 'pending',
            'items': [],
          },
        ]);
      }),
    );
    await enter(tester, api);
    expect(find.text('Cliente privado'), findsOneWidget);
    expired = true;
    await tester.tap(find.byTooltip('Atualizar'));
    await tester.pumpAndSettle();
    expect(find.text('Cliente privado'), findsNothing);
    expect(find.text('Entrar'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    api.dispose();
  });

  testWidgets('management login fits a narrow phone', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ManagementApi(client: MockClient((_) async => json({})));
    await tester.pumpWidget(ManagementApp(api: api));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    api.dispose();
  });
}
