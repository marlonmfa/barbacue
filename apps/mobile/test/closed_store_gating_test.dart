// The store-closed gate must fail OPEN: only a definitive "closed" from
// /api/store-status may take the add button away. A loading or failed status
// call must never cost the store an order — the server re-checks on POST
// /api/orders anyway.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/product.dart';
import 'package:barbacue/providers/menu_provider.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:barbacue/widgets/product_card.dart';

const _product = Product(
  id: 1,
  categoryId: 1,
  name: 'Barbacue Duplo',
  priceCents: 4500,
  available: true,
  sortOrder: 0,
);

Future<void> _pumpCard(WidgetTester tester, Override statusOverride) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [statusOverride],
      child: MaterialApp(
        theme: AppTheme.theme,
        home: const Scaffold(
          body: SizedBox(
            width: 200,
            height: kProductCardExtent,
            child: ProductCard(product: _product),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  // cartProvider hydrates from disk on build.
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('closed store replaces the add button with a dead chip',
      (tester) async {
    await _pumpCard(
      tester,
      storeStatusProvider.overrideWith(
        (ref) async => const StoreStatus(open: false, reason: 'Fechado hoje.'),
      ),
    );

    expect(find.text('Loja fechada'), findsOneWidget);
    expect(find.text('Adicionar'), findsNothing);
  });

  testWidgets('open store shows the add button', (tester) async {
    await _pumpCard(
      tester,
      storeStatusProvider.overrideWith(
        (ref) async => const StoreStatus(open: true, reason: 'Aberto'),
      ),
    );

    expect(find.text('Adicionar'), findsOneWidget);
    expect(find.text('Loja fechada'), findsNothing);
  });

  testWidgets('a failed status call still allows ordering', (tester) async {
    await _pumpCard(
      tester,
      storeStatusProvider.overrideWith(
        (ref) => Future<StoreStatus>.error(Exception('offline')),
      ),
    );

    expect(find.text('Adicionar'), findsOneWidget);
    expect(find.text('Loja fechada'), findsNothing);
  });

  testWidgets('a pending status call still allows ordering', (tester) async {
    await _pumpCard(
      tester,
      storeStatusProvider.overrideWith(
        (ref) => Completer<StoreStatus>().future,
      ),
    );

    expect(find.text('Adicionar'), findsOneWidget);
    expect(find.text('Loja fechada'), findsNothing);
  });
}
