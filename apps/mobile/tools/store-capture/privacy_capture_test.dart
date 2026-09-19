import 'dart:io';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:barbacue/config/app_brand.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:barbacue/screens/privacy_screen.dart';
import 'package:barbacue/screens/brand_menu_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/providers/menu_provider.dart';

// Widget tests use Ahem for an unspecified button font; Android uses Roboto.
// Resolve that platform default explicitly for faithful store captures.
ThemeData captureTheme() {
  final theme = AppTheme.forBrand(currentBrand);
  return theme.copyWith(
    platform: TargetPlatform.android,
    filledButtonTheme: FilledButtonThemeData(
      style: theme.filledButtonTheme.style!.copyWith(
        textStyle: const WidgetStatePropertyAll(
          TextStyle(fontFamily: 'Roboto', fontWeight: FontWeight.w900),
        ),
      ),
    ),
  );
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final cacheDir = Directory.systemTemp.createTempSync('brand-store-capture');
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => cacheDir.path,
    );
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final cache = File(
      Platform.resolvedExecutable,
    ).parent.parent.parent.parent.path;
    final anton = FontLoader('Anton')
      ..addFont(rootBundle.load('assets/fonts/Anton-Regular.ttf'));
    await anton.load();
    for (final entry in {
      'Roboto': ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf'],
      'MaterialIcons': ['MaterialIcons-Regular.otf'],
    }.entries) {
      final loader = FontLoader(entry.key);
      for (final file in entry.value) {
        loader.addFont(
          Future.value(
            ByteData.sublistView(
              File('$cache/artifacts/material_fonts/$file').readAsBytesSync(),
            ),
          ),
        );
      }
      await loader.load();
    }
  });
  for (final brand in [AppBrand.chelas, AppBrand.barbadog]) {
    testWidgets('menu screenshot ${brand.name}', (tester) async {
      configureBrand(brand);
      tester.view.physicalSize = const Size(432, 768);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final menu = await tester.runAsync(ApiService.fetchMenu);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [menuProvider.overrideWith((ref) async => menu!)],
          child: MaterialApp(
            theme: captureTheme(),
            home: const BrandMenuScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(BrandMenuScreen),
        matchesGoldenFile('../../store-assets/play-${brand.name}/01_menu.png'),
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
    testWidgets('store screenshot ${brand.name}: privacy', (tester) async {
      configureBrand(brand);
      tester.view.physicalSize = const Size(432, 768);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: captureTheme(),
            home: const PrivacyScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(PrivacyScreen),
        matchesGoldenFile(
          '../../store-assets/play-${brand.name}/02_privacy.png',
        ),
      );
    });
  }
}
