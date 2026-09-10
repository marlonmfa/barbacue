import 'package:barbacue/config/app_brand.dart';
import 'package:barbacue/providers/menu_provider.dart';
import 'package:barbacue/screens/brand_menu_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('brand content stays below the status bar', (tester) async {
    configureBrand(AppBrand.chelas);
    addTearDown(() => configureBrand(AppBrand.barbacue));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [menuProvider.overrideWith((ref) async => [])],
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: const MediaQueryData(padding: EdgeInsets.only(top: 32)),
            child: child!,
          ),
          home: const BrandMenuScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.byType(CustomScrollView)).dy, 32);
    expect(find.text('PEDIR NO IFOOD'), findsOneWidget);
  });
}
