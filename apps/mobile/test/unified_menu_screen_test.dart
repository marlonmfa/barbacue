import 'dart:convert';
import 'dart:io';

import 'package:barbacue/config/app_brand.dart';
import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/router.dart';
import 'package:barbacue/screens/unified_menu_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Finder switcherTab(String name) => find.descendant(
  of: find.byType(BrandSwitcher),
  matching: find.text(name),
);

/// Mesmo ID nas três marcas de propósito: o ID só é único dentro da marca.
List<Map<String, Object>> _catalog(String brand) => [
  {
    'id': 1,
    'name': 'Especialidades',
    'slug': 'especialidades',
    'sortOrder': 0,
    'products': [
      {
        'id': 7,
        'categoryId': 1,
        'name': 'Prato $brand',
        'description': 'Preparado na hora.',
        'priceCents': 3000,
        'available': true,
        'sortOrder': 0,
      },
    ],
  },
];

void main() {
  // Sem as fontes reais o teste usa blocos largos e o cabeçalho transborda.
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
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

  group('carrinho único', () {
    test('o mesmo ID em duas marcas fica em linhas separadas', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final cart = container.read(cartProvider.notifier);
      CartItem item(String brand) => CartItem(
        productId: 7,
        name: 'Prato $brand',
        priceCents: 3000,
        brand: brand,
      );

      cart
        ..add(item('chelas'))
        ..add(item('barbadog'))
        ..add(item('chelas'));

      expect(container.read(cartProvider), hasLength(2));
      expect(container.read(itemQtyProvider('chelas:7')), 2);
      expect(container.read(itemQtyProvider('barbadog:7')), 1);
      expect(container.read(itemQtyProvider('barbacue:7')), 0);
      expect(container.read(cartItemsByBrandProvider), {
        'chelas': 2,
        'barbadog': 1,
      });

      cart.setQty('chelas:7', 0);
      expect(container.read(cartProvider).single.brand, 'barbadog');
    });

    test('carrinho salvo antes da mudança pertence à marca do app', () {
      configureBrand(AppBrand.chelas);
      final item = CartItem.fromJson({
        'productId': 7,
        'name': 'Burrito',
        'priceCents': 3000,
        'qty': 1,
      });
      expect(item.key, 'chelas:7');
      expect(item.restaurant, 'Chelas');
    });

    test('item comum aos restaurantes não recebe etiqueta', () {
      final item = CartItem(
        productId: 7,
        name: 'Refrigerante',
        priceCents: 800,
        brand: 'chelas',
        shared: true,
      );
      expect(item.restaurant, isNull);
    });

    test('o atendente só recebe os itens do Barbacue', () {
      final visible = barbacueCartItems([
        CartItem(productId: 7, name: 'B', priceCents: 1, brand: 'barbacue'),
        CartItem(productId: 7, name: 'C', priceCents: 1, brand: 'chelas'),
        CartItem(productId: 8, name: 'D', priceCents: 1, brand: 'barbadog'),
      ]);
      expect(visible.map((item) => item.key), ['barbacue:7']);
    });
  });

  testWidgets('a página inicial começa na marca do app e troca de cardápio', (
    tester,
  ) async {
    configureBrand(AppBrand.chelas);
    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final requested = <String?>[];
    ApiService.client = MockClient((req) async {
      Object response = <String, Object>{};
      if (req.url.path == '/api/products') {
        final brand = req.url.queryParameters['brand']!;
        requested.add(brand);
        response = _catalog(brand);
      } else if (req.url.path == '/api/store-status') {
        response = {'open': true, 'reason': ''};
      } else if (req.url.path.contains('instagram')) {
        response = <Object>[];
      }
      return http.Response(
        jsonEncode(response),
        200,
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
    expect(requested, ['chelas']);
    expect(find.text('Prato chelas'), findsOneWidget);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile(
        '../../../test-screenshots/unified-home-chelas-2026-11-06.png',
      ),
    );

    await tester.tap(switcherTab('Barbadog'));
    await tester.pumpAndSettle();
    expect(requested, ['chelas', 'barbadog']);
    expect(find.text('Prato barbadog'), findsOneWidget);
    expect(find.text('Prato chelas'), findsNothing);

    await tester.tap(switcherTab('Barbacue'));
    // O cardápio do Barbacue tem animação contínua: pumpAndSettle não termina.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(requested, ['chelas', 'barbadog', 'barbacue']);
    expect(find.text('Prato barbadog'), findsNothing);
    expect(tester.takeException(), isNull);
    // Encerra a animação contínua antes do fim do teste.
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
