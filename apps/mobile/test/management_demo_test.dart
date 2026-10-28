import 'package:barbacue/management/management_demo.dart';
import 'package:barbacue/management/management_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('demo edits stay local and cover the three brands', () async {
    final api = ManagementDemoApi();
    addTearDown(api.dispose);
    final rows = await api.request('GET', '/api/admin/catalogs') as List;
    expect(rows.map((row) => row['brand']).toSet(), {
      'barbacue',
      'chelas',
      'barbadog',
    });
    await api.request('PATCH', '/api/admin/catalogs/chelas/2', {
      'priceCents': 2990,
    });
    expect(rows[1]['priceCents'], 2990);
    final summary = await api.request('GET', '/api/admin/dashboard');
    expect(summary['metrics']['orders'], 3);
    await api.request('PATCH', '/api/admin/kitchen', {
      'id': 'demo-1',
      'status': 'preparing',
    });
    expect(
      (await api.request('GET', '/api/admin/orders') as List).first['status'],
      'preparing',
    );
  });

  testWidgets('demo is labelled and logout restores the staff login', (
    tester,
  ) async {
    await tester.pumpWidget(const ManagementApp());
    await tester.ensureVisible(find.text('Ver demonstração'));
    await tester.tap(find.text('Ver demonstração'));
    await tester.pumpAndSettle();
    expect(find.text('Demonstração · dados fictícios'), findsOneWidget);
    expect(find.text('A casa em movimento'), findsOneWidget);
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sair da conta'));
    await tester.pumpAndSettle();
    expect(find.text('Entrar'), findsOneWidget);
    expect(find.text('Demonstração · dados fictícios'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
