import 'dart:io';

import 'package:barbacue/management/management_api.dart';
import 'package:barbacue/management/panel_catalog.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final policy = PanelPolicy(Uri.parse('https://barbacue.cog.ia.br'));
  StaffSession account(String role, [List<String>? permissions]) =>
      StaffSession({'role': role, 'permissions': ?permissions});

  test('mobile covers every desktop module and every page exists', () {
    final desktop = File('../desktop/src/modules.mjs').readAsStringSync();
    final paths = RegExp(
      r"path: '([^']+)'",
    ).allMatches(desktop).map((m) => m[1]).toSet();
    expect(panelModules.map((m) => m.path).toSet(), paths);
    expect(panelModules.map((m) => m.id).toSet().length, panelModules.length);
    for (final module in panelModules) {
      expect(
        File('../web/src/app${module.path}/page.tsx').existsSync(),
        isTrue,
        reason: module.path,
      );
      expect(module.availableTo(account('admin')), isTrue, reason: module.path);
    }
  });

  test(
    'custom permissions and admin-only restrictions apply to every module',
    () {
      final adminOnly = panelModules.where((m) => m.permission == 'admin');
      expect(
        adminOnly.map((m) => m.id),
        containsAll([
          'whatsapp',
          'erp',
          'team',
          'staff',
          'system',
          'downloads',
          'access',
        ]),
      );
      for (final module in adminOnly) {
        expect(module.availableTo(account('manager')), isFalse);
        expect(module.availableTo(account('employee', ['admin'])), isFalse);
      }
      final kitchen = panelModules.where(
        (m) => m.availableTo(account('kitchen')),
      );
      expect(kitchen.map((m) => m.id).toSet(), {'workspace', 'kitchen'});
      expect(
        panelModules
            .where((m) => m.availableTo(account('manager', [])))
            .map((m) => m.id),
        ['workspace'],
      );
      expect(
        panelModules
            .where((m) => m.availableTo(account('employee', ['catalog'])))
            .map((m) => m.id)
            .toSet(),
        {'workspace', 'catalogs', 'products', 'categories'},
      );
    },
  );

  test('mandatory password change blocks all module shortcuts', () {
    final session = StaffSession({'role': 'admin', 'mustChangePassword': true});
    expect(panelModules.any((m) => m.availableTo(session)), isFalse);
  });

  test('panel URLs are pinned to the configured HTTPS origin', () {
    expect(
      policy.internal(Uri.parse('https://barbacue.cog.ia.br/admin/staff')),
      isTrue,
    );
    for (final url in [
      'http://barbacue.cog.ia.br/admin',
      'https://barbacue.cog.ia.br.evil.example/admin',
      'https://barbacue.cog.ia.br@evil.example/admin',
      'https://someone@barbacue.cog.ia.br/admin',
      'https://barbacue.cog.ia.br:8443/admin',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,example',
    ]) {
      expect(policy.internal(Uri.parse(url)), isFalse, reason: url);
    }
    expect(
      policy.downloadable(Uri.parse('blob:https://barbacue.cog.ia.br/id')),
      isTrue,
    );
    expect(
      policy.downloadable(Uri.parse('blob:https://evil.example/id')),
      isFalse,
    );
    expect(policy.downloadable(Uri.parse('blob:null/id')), isFalse);
    expect(policy.external(Uri.parse('intent://example')), isFalse);
    expect(policy.external(Uri.parse('https://maps.google.com/')), isTrue);
    expect(
      policy
          .moduleFor(Uri.parse('https://barbacue.cog.ia.br/admin/orders/123'))
          ?.id,
      'orders',
    );
  });

  test(
    'invalid origins and unsafe download names are rejected or normalized',
    () {
      for (final url in [
        'http://example.com',
        'https://example.com/admin',
        'https://user@example.com',
        'https://example.com?secret=1',
      ]) {
        expect(() => PanelPolicy(Uri.parse(url)), throwsArgumentError);
      }
      expect(panelFileName('../../../../relatorio.csv'), 'relatorio.csv');
      expect(panelFileName(r'C:\private\relatorio.pdf'), 'relatorio.pdf');
      expect(panelFileName('..'), 'arquivo');
      expect(panelFileName('a' * 500).length, 120);
      expect(panelFileName('relatorio\n.csv'), 'relatorio_.csv');
    },
  );
}
