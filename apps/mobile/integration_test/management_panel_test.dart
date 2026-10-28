import 'dart:convert';
import 'dart:io';

import 'package:barbacue/management/management_panel.dart';
import 'package:barbacue/management/panel_catalog.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart' hide Cookie;
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

// Real native WebView with a loopback fixture, never a production account.
// flutter test integration_test/management_panel_test.dart -d emulator-5554
//   --flavor gestao --dart-define=MANAGEMENT_PANEL_QA=true
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'private login, 24 workflows, downloads, revocation and logout',
    (tester) async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final origin = Uri.parse('http://127.0.0.1:${server.port}');
      final visits = <String>{};
      final mutations = <String>[];
      final shares = <List<int>>[];
      final sharedNames = <String>[];
      String role = 'admin';
      var sessionChecks = 0;
      final report = List<int>.generate(150000, (i) => 65 + i % 26);
      server.listen((request) async {
        final response = request.response;
        final path = request.uri.path;
        final authenticated = request.cookies.any(
          (c) => c.name == 'qa_staff' && c.value == '1',
        );
        if (path == '/api/admin/auth') {
          sessionChecks++;
          response.headers.contentType = ContentType.json;
          if (!authenticated) {
            response.statusCode = 401;
            response.write('{"error":"unauthorized"}');
          } else {
            response.write(
              jsonEncode({
                'session': {
                  'role': role,
                  'name': 'Equipe fictícia',
                  'permissions': role == 'admin' ? <String>[] : ['kitchen'],
                },
              }),
            );
          }
        } else if (path == '/login') {
          response.cookies.add(
            Cookie('qa_staff', '1')
              ..httpOnly = true
              ..path = '/',
          );
          response.write('ok');
        } else if (path == '/api/admin/fixture') {
          expectSync(authenticated, isTrue);
          mutations.add(await utf8.decoder.bind(request).join());
          response.headers.contentType = ContentType.json;
          response.write('{"ok":true}');
        } else if (path == '/slow.csv') {
          expectSync(authenticated, isTrue);
          response.headers.contentType = ContentType('text', 'csv');
          response.headers.set(
            'content-disposition',
            'attachment; filename="slow.csv"',
          );
          try {
            response.add([65]);
            await response.flush();
            await Future<void>.delayed(const Duration(seconds: 4));
            response.add([66]);
          } on SocketException {
            /* cancelled by WebView */
          } on HttpException {
            /* cancelled by WebView */
          }
        } else if (path == '/report.csv') {
          expectSync(authenticated, isTrue);
          response.headers.contentType = ContentType('text', 'csv');
          response.headers.set(
            'content-disposition',
            'attachment; filename="relatorio.csv"',
          );
          response.add(report);
        } else if (!authenticated && path != '/admin/login') {
          response.statusCode = 302;
          response.headers.set('location', '/admin/login');
        } else {
          if (authenticated) visits.add(path);
          response.headers.contentType = ContentType.html;
          response.write(
            '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <title>Gestão QA</title><style>body{font:18px sans-serif;padding:16px}button{padding:16px;margin:8px}</style>
          <h1>Dados fictícios</h1><p id="path">$path</p>
          <button id="login" onclick="fetch('/login').then(()=>location.href='/admin/workspace')">Entrar na demonstração</button>
          <button id="save" onclick="fetch('/api/admin/fixture',{method:'POST',body:location.pathname})">Salvar exemplo</button>
          <a id="report" href="/report.csv" download>Exportar CSV</a>
          <button id="blob" onclick="const a=document.createElement('a');a.href=window.URL.createObjectURL(new Blob(['dados ficticios'],{type:'text/csv'}));a.download='exemplo.csv';a.click();window.URL.revokeObjectURL(a.href)">Exportar arquivo local</button>
        ''',
          );
        }
        try {
          await response.close();
        } on SocketException {
          /* cancelled download */
        } on HttpException {
          /* cancelled download */
        }
      });
      InAppWebViewController? controller;
      binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('dev.fluttercommunity.plus/share'),
        (call) async {
          final files = (call.arguments as Map)['paths'] as List;
          shares.add(await File(files.single as String).readAsBytes());
          sharedNames.add(File(files.single as String).uri.pathSegments.last);
          return 'dev.fluttercommunity.plus/share/dismissed';
        },
      );
      Future<void> until(bool Function() condition) async {
        final deadline = DateTime.now().add(const Duration(seconds: 25));
        while (!condition() && DateTime.now().isBefore(deadline)) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        if (!condition()) {
          debugPrint('QA lifecycle: ${binding.lifecycleState}');
          debugPrint(
            'QA native text: ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).toList()}',
          );
          debugPrint('QA URL: ${await controller?.getUrl()}');
          debugPrint(
            'QA page: ${await controller?.evaluateJavascript(source: 'document.body.innerText')}',
          );
        }
        expect(condition(), isTrue);
      }

      Future<void> settledWeb() async {
        for (var i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 100));
        }
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => ManagementPanel(
                        origin: origin,
                        onControllerCreated: (value) => controller = value,
                      ),
                    ),
                  ),
                  child: const Text('Abrir painel de teste'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Abrir painel de teste'));
      await until(() => controller != null && sessionChecks > 0);
      await controller!.evaluateJavascript(
        source: "document.querySelector('#login').click()",
      );
      await until(() => visits.contains('/admin/workspace'));
      await settledWeb();
      expect(
        await controller!.evaluateJavascript(
          source: "document.cookie.includes('qa_staff')",
        ),
        isFalse,
      );
      const downloadsOnly = bool.fromEnvironment(
        'MANAGEMENT_PANEL_DOWNLOAD_QA_ONLY',
      );
      for (final module in downloadsOnly ? <PanelModule>[] : panelModules) {
        debugPrint('QA módulo: ${module.path}');
        await until(
          () => find.byType(IconButton).evaluate().any((element) {
            final button = element.widget as IconButton;
            return button.tooltip == 'Funções do painel' &&
                button.onPressed != null;
          }),
        );
        await tester.tap(find.byTooltip('Funções do painel'));
        await until(() => find.text('Funções do painel').evaluate().isNotEmpty);
        await settledWeb();
        await tester.scrollUntilVisible(
          find.text(module.title),
          350,
          scrollable: find.descendant(
            of: find.byType(BottomSheet),
            matching: find.byType(Scrollable),
          ),
        );
        await tester.pumpAndSettle();
        await Scrollable.ensureVisible(
          tester.element(find.text(module.title)),
          alignment: .5,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(module.title).hitTestable());
        await until(() => visits.contains(module.path));
        await settledWeb();
        await controller!.evaluateJavascript(
          source: "document.querySelector('#save').click()",
        );
        await until(() => mutations.contains(module.path));
      }
      if (!downloadsOnly) {
        expect(mutations.toSet(), panelModules.map((m) => m.path).toSet());
      }
      await controller!.evaluateJavascript(source: "location.href='/slow.csv'");
      await until(() => find.text('Cancelar').evaluate().isNotEmpty);
      await tester.tap(find.text('Cancelar'));
      await settledWeb();
      expect(shares, isEmpty);
      await controller!.evaluateJavascript(
        source: "document.querySelector('#report').click()",
      );
      await until(() => shares.isNotEmpty);
      expect(shares.single, report);
      await settledWeb();
      await controller!.evaluateJavascript(
        source: "document.querySelector('#blob').click()",
      );

      await until(() => shares.length == 2);
      expect(utf8.decode(shares.last), 'dados ficticios');
      expect(sharedNames.last, 'exemplo.csv');
      for (final url in [
        'https://outside.example/file.csv',
        'file:///etc/passwd',
        'blob:${origin.origin}/untracked',
      ]) {
        final rejected = await controller!.callAsyncJavaScript(
          functionBody:
              "return await window.flutter_inappwebview.callHandler('barbacueExport', url);",
          arguments: {'url': url},
        );
        expect(rejected?.value, isFalse);
      }
      expect(shares.length, 2);

      await settledWeb();
      role = 'kitchen';
      await tester.tap(find.byTooltip('Funções do painel'));
      await settledWeb();
      expect(find.text('ERP e financeiro'), findsNothing);
      expect(find.text('Usuários e acessos'), findsNothing);
      expect(find.text('Cozinha e impressoras'), findsOneWidget);
      await tester.tap(find.text('Cozinha e impressoras'));
      await settledWeb();
      await tester.tap(find.byTooltip('Mais opções'));
      await settledWeb();
      await tester.tap(find.text('Sair do painel'));
      await settledWeb();
      await tester.tap(find.widgetWithText(FilledButton, 'Sair do painel'));
      await until(
        () => find.text('Abrir painel de teste').evaluate().isNotEmpty,
      );
      expect(
        await CookieManager.instance().getCookies(url: WebUri.uri(origin)),
        isEmpty,
      );
      await tester.pumpWidget(const SizedBox());
      binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('dev.fluttercommunity.plus/share'),
        null,
      );
      await server.close(force: true);
    },
    timeout: const Timeout(Duration(minutes: 6)),
  );
}
