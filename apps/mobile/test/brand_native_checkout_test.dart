import 'dart:convert';
import 'dart:io';
import 'package:barbacue/config/app_brand.dart';
import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/providers/checkout_provider.dart';
import 'package:barbacue/router.dart';
import 'package:barbacue/screens/privacy_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final cache = File(
      Platform.resolvedExecutable,
    ).parent.parent.parent.parent.path;
    for (final family in ['Roboto', 'MaterialIcons']) {
      final loader = FontLoader(family);
      for (final name
          in family == 'Roboto'
              ? ['Roboto-Regular.ttf', 'Roboto-Bold.ttf']
              : ['MaterialIcons-Regular.otf']) {
        loader.addFont(
          Future.value(
            ByteData.sublistView(
              File('$cache/artifacts/material_fonts/$name').readAsBytesSync(),
            ),
          ),
        );
      }
      await loader.load();
    }
    final anton = FontLoader('Anton')
      ..addFont(rootBundle.load('assets/fonts/Anton-Regular.ttf'));
    await anton.load();
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() {
    configureBrand(AppBrand.barbacue);
    ApiService.client = http.Client();
  });

  test(
    'live catalog uses server IDs and resolves images for the requested brand',
    () async {
      configureBrand(AppBrand.chelas);
      ApiService.client = MockClient((req) async {
        expect(req.url.queryParameters['brand'], 'chelas');
        return http.Response(jsonEncode(catalog('Burrito')), 200);
      });
      final menu = await ApiService.fetchMenu();
      expect(menu.single.products.single.id, 410);
      expect(menu.single.products.single.available, isTrue);
    },
  );

  test(
    'erasing local data prevents hydration from restoring customer data',
    () async {
      SharedPreferences.setMockInitialValues({
        'barbacue-checkout': jsonEncode({
          'name': 'Cliente',
          'phone': '47999990000',
        }),
        'barbacue-cart': jsonEncode([
          CartItem(
            productId: 410,
            name: 'Burrito',
            priceCents: 3000,
            qty: 1,
          ).toJson(),
        ]),
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);
      await container.read(cartProvider.notifier).eraseLocalData();
      await container.read(checkoutProvider.notifier).eraseLocalData();
      expect(container.read(cartProvider), isEmpty);
      expect(container.read(checkoutProvider).name, isEmpty);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.containsKey('barbacue-cart'), isFalse);
      expect(prefs.containsKey('barbacue-checkout'), isFalse);
    },
  );

  for (final scenario in [
    (AppBrand.chelas, 430.0),
    (AppBrand.barbadog, 430.0),
    (AppBrand.chelas, 820.0),
    (AppBrand.barbadog, 820.0),
  ]) {
    final brand = scenario.$1;
    final width = scenario.$2;
    final device = width > 600 ? '-ipad' : '';
    testWidgets('${brand.name}$device: menu to native order confirmation', (
      tester,
    ) async {
      configureBrand(brand);
      tester.view.physicalSize = Size(width, width > 600 ? 1180 : 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final name = brand == AppBrand.chelas
          ? 'Burrito de carne'
          : 'Hot dog de 25 cm';
      Map<String, dynamic>? submitted;
      ApiService.client = MockClient((req) async {
        Object response;
        var status = 200;
        switch (req.url.path) {
          case '/api/products':
            response = catalog(name);
          case '/api/store-status':
            response = {'open': true, 'reason': ''};
          case '/api/delivery/quote':
            response = {'enabled': false};
          case '/api/orders':
            submitted = jsonDecode(req.body) as Map<String, dynamic>;
            status = 201;
            response = {
              'orderId': 'test-12345678',
              'paymentMethod': 'cash',
              'totalCents': 3000,
              'orderType': 'delivery',
            };
          default:
            response = {};
        }
        return http.Response(
          jsonEncode(response),
          status,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final router = createRouter(currentBrand);
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp.router(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.forBrand(currentBrand),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text(name),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text(name));
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile(
          '../../../test-screenshots/${brand.name}$device-native-product-2026-09-21.png',
        ),
      );
      await tester.tap(find.text('Adicionar ao pedido'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ver carrinho'));
      await tester.pumpAndSettle();
      for (final entry in {
        'Nome *': 'Cliente Teste',
        'Telefone / WhatsApp *': '47999990000',
        'Endereço de entrega *': 'Rua Teste, 123',
      }.entries) {
        final field = find.widgetWithText(TextFormField, entry.key);
        await tester.ensureVisible(field);
        await tester.enterText(field, entry.value);
      }
      final next = find.textContaining('Ir para pagamento');
      await tester.ensureVisible(next);
      await tester.tap(next);
      await tester.pumpAndSettle();
      final cash = find.text('Dinheiro na entrega');
      await tester.ensureVisible(cash);
      await tester.tap(cash);
      await tester.pumpAndSettle();
      final confirm = find.textContaining('Confirmar pedido ·');
      await tester.ensureVisible(confirm);
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile(
          '../../../test-screenshots/${brand.name}$device-native-checkout-2026-09-21.png',
        ),
      );
      await tester.tap(confirm);
      await tester.pumpAndSettle();
      expect(submitted?['brand'], brand.name);
      expect((submitted?['items'] as List).single['productId'], 410);
      expect(find.textContaining('Pedido recebido'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('privacy: cancel preserves data and confirmed erase clears it', (
    tester,
  ) async {
    configureBrand(AppBrand.chelas);
    tester.view.physicalSize = const Size(430, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.read(checkoutProvider.notifier).update(name: 'Cliente Teste');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.forBrand(currentBrand),
          home: const PrivacyScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final erase = find.text('Apagar dados deste aparelho');
    await tester.ensureVisible(erase);
    await tester.tap(erase);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(container.read(checkoutProvider).name, 'Cliente Teste');
    await tester.tap(erase);
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile(
        '../../../test-screenshots/brand-local-data-erasure-2026-09-21.png',
      ),
    );
    await tester.tap(find.text('Apagar dados'));
    await tester.pumpAndSettle();
    expect(container.read(checkoutProvider).name, isEmpty);
    expect(find.text('Dados deste aparelho apagados.'), findsOneWidget);
  });
}

List<Map<String, Object>> catalog(String name) => [
  {
    'id': 1,
    'name': 'Especialidades',
    'slug': 'especialidades',
    'sortOrder': 0,
    'products': [
      {
        'id': 410,
        'categoryId': 1,
        'name': name,
        'description': 'Preparado na hora com os ingredientes da casa.',
        'priceCents': 3000,
        'available': true,
        'sortOrder': 0,
      },
    ],
  },
];
