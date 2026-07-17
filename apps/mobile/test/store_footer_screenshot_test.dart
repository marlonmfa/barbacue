// Renders the store footer — brand, social CTAs, the Instagram grid, contact
// details — to a PNG in test-screenshots/ so the layout can be reviewed without
// a simulator build. There is no network in a widget test, so every thumbnail
// lands on the branded ember tile: the fallback state is the one that ships
// whenever a thumbnail 404s, so it is worth looking at.
//
// Fonts come from the Flutter SDK cache; without them every glyph renders as a
// filled box, which defeats the point of looking at it.
@Tags(['screenshot'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:barbacue/models/instagram_post.dart';
import 'package:barbacue/models/store_settings.dart';
import 'package:barbacue/providers/menu_provider.dart';
import 'package:barbacue/theme/app_theme.dart';
import 'package:barbacue/widgets/store_footer.dart';

/// `<flutter>/bin/cache/dart-sdk/bin/dart` → `<flutter>/bin/cache`
String get _flutterCache =>
    File(Platform.resolvedExecutable).parent.parent.parent.parent.path;

Future<void> _loadSdkFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    final bytes =
        File('$_flutterCache/artifacts/material_fonts/$f').readAsBytesSync();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
}

const _settings = StoreSettings(
  storeName: 'Barbacue & Co',
  tagline: 'Burguers na brasa 🔥',
  instagramUrl: 'https://www.instagram.com/barbacue.burguersnabrasa/',
  whatsapp: '+55 11 99999-9999',
  phone: '(11) 99999-9999',
  address: 'Rua das Brasas, 42 — Centro',
  openingHours: 'Ter a Dom, 18h às 23h',
  deliveryFeeText: 'Entrega R\$ 6,00',
);

final _posts = [
  for (var i = 1; i <= 8; i++)
    InstagramPost(
      id: '$i',
      imageUrl: 'http://localhost:3000/instagram/posts/post_0$i.jpg',
      permalink: 'https://www.instagram.com/p/post$i/',
    ),
];

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => Directory.systemTemp
          .createTempSync('barbacue_footer_screenshot')
          .path,
    );
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;

    await _loadSdkFont('Roboto', [
      'Roboto-Regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Bold.ttf',
    ]);
    await _loadSdkFont('MaterialIcons', ['MaterialIcons-Regular.otf']);
  });

  testWidgets('screenshot: store footer', (tester) async {
    tester.view.physicalSize = const Size(390, 920);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          settingsProvider.overrideWith((ref) async => _settings),
          instagramProvider.overrideWith((ref) async => _posts),
        ],
        child: MaterialApp(
          theme: AppTheme.theme,
          home: const Scaffold(
            body: SingleChildScrollView(child: StoreFooter()),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    // Decoding an asset needs a live async zone, which pump() does not give it —
    // without this the brand logo is an empty circle.
    await tester.runAsync(() async {
      final context = tester.element(find.byType(StoreFooter));
      await precacheImage(const AssetImage('assets/brand/logo.png'), context);
    });
    await tester.pump();

    await expectLater(
      find.byType(StoreFooter),
      matchesGoldenFile(
          '../../../test-screenshots/mobile-store-footer-2026-07-17.png'),
    );
  });
}
