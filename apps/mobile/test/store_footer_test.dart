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
import 'package:barbacue/widgets/instagram_feed.dart';
import 'package:barbacue/widgets/store_footer.dart';

const _settings = StoreSettings(
  storeName: 'Barbacue & Co',
  tagline: 'Burguers na brasa 🔥',
  instagramUrl: 'https://www.instagram.com/barbacue.burguersnabrasa/',
  whatsapp: '+55 11 99999-9999',
  phone: '(11) 99999-9999',
  address: 'Rua das Brasas, 42',
  openingHours: 'Ter a Dom, 18h às 23h',
  deliveryFeeText: 'Entrega R\$ 6,00',
);

List<InstagramPost> _posts(int count) => [
      for (var i = 1; i <= count; i++)
        InstagramPost(
          id: '$i',
          imageUrl: 'http://localhost:3000/instagram/posts/post_0$i.jpg',
          permalink: 'https://www.instagram.com/p/post$i/',
        ),
    ];

Future<void> _pumpFooter(
  WidgetTester tester, {
  required List<InstagramPost> posts,
  StoreSettings settings = _settings,
}) async {
  tester.view.physicalSize = const Size(390, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        settingsProvider.overrideWith((ref) async => settings),
        instagramProvider.overrideWith((ref) async => posts),
      ],
      child: MaterialApp(
        theme: AppTheme.theme,
        home: const Scaffold(
          body: SingleChildScrollView(child: StoreFooter()),
        ),
      ),
    ),
  );
  // One frame to resolve the overridden futures, one to lay the footer out.
  await tester.pump();
  await tester.pump();
}

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    // The thumbnails reach for cached_network_image's disk cache; no host
    // implements path_provider under flutter_test, so hand it a temp dir.
    binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async =>
          Directory.systemTemp.createTempSync('barbacue_store_footer').path,
    );
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('an empty feed renders nothing and the footer still lays out',
      (tester) async {
    await _pumpFooter(tester, posts: const []);

    expect(find.byType(InstagramFeed), findsOneWidget);
    expect(find.byType(GridView), findsNothing);
    expect(find.text('Barbacue & Co'), findsOneWidget);
    expect(find.text('Seguir no Instagram'), findsOneWidget);
    expect(find.text('Pedir no WhatsApp'), findsOneWidget);
    expect(find.text('© Barbacue & Co · Burguers na brasa 🔥'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a feed of eight posts renders exactly six tiles', (tester) async {
    await _pumpFooter(tester, posts: _posts(8));

    expect(find.byType(GridView), findsOneWidget);
    expect(
      find.bySemanticsLabel('Ver no Instagram'),
      findsNWidgets(6),
    );
  });

  testWidgets('WhatsApp CTA is gated on a configured number', (tester) async {
    await _pumpFooter(
      tester,
      posts: const [],
      settings: const StoreSettings(
        storeName: 'Barbacue & Co',
        tagline: 'Burguers na brasa 🔥',
        instagramUrl: 'https://www.instagram.com/barbacue.burguersnabrasa/',
      ),
    );

    expect(find.text('Seguir no Instagram'), findsOneWidget);
    expect(find.text('Pedir no WhatsApp'), findsNothing);
    // Nothing to say: no address, hours, phone or delivery fee.
    expect(find.text('Contato'), findsNothing);
    expect(find.text('Endereço'), findsNothing);
  });
}
