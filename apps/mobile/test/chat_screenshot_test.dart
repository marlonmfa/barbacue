// Renders the chat surface to PNGs in test-screenshots/ so the bubbles, typing
// indicator, chips and cart strip can be reviewed without a simulator build.
//
// Fonts are loaded from the Flutter SDK cache: without them the golden renders
// every glyph as a filled box, which defeats the point of looking at it.
@Tags(['screenshot'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/models/chat.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/providers/chat_provider.dart';
import 'package:barbacue/screens/chat_screen.dart';
import 'package:barbacue/theme/app_theme.dart';

/// `<flutter>/bin/cache/dart-sdk/bin/dart` → `<flutter>/bin/cache`
String get _flutterCache =>
    File(Platform.resolvedExecutable).parent.parent.parent.parent.path;

Future<void> _loadFont(String family, List<String> files) async {
  final loader = FontLoader(family);
  for (final f in files) {
    final bytes =
        File('$_flutterCache/artifacts/material_fonts/$f').readAsBytesSync();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
}

void main() {
  setUpAll(() async {
    await _loadFont('Roboto', [
      'Roboto-Regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Bold.ttf',
    ]);
    await _loadFont('MaterialIcons', ['MaterialIcons-Regular.otf']);
  });

  setUp(() => SharedPreferences.setMockInitialValues({}));

  /// The AppBar title names no font family, so on a device it resolves to the
  /// platform default — but in a test that is the placeholder font, which draws
  /// every glyph as a solid box. Naming Roboto here keeps the capture readable
  /// without changing what ships.
  ThemeData capturableTheme() {
    final base = AppTheme.theme;
    return base.copyWith(
      appBarTheme: base.appBarTheme.copyWith(
        titleTextStyle:
            base.appBarTheme.titleTextStyle?.copyWith(fontFamily: 'Roboto'),
      ),
    );
  }

  Future<void> pump(
    WidgetTester tester, {
    required ChatState chat,
    List<CartItem> cart = const [],
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          cartProvider.overrideWith(() => _StubCart(cart)),
          chatProvider.overrideWith(() => _StubChat(chat)),
        ],
        child: MaterialApp(theme: capturableTheme(), home: const ChatScreen()),
      ),
    );
    // Not pumpAndSettle: the typing dots repeat forever, so settling never
    // returns. This lands mid-cycle, with the dots at different heights.
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('screenshot: greeting with suggestion chips', (tester) async {
    await pump(tester, chat: const ChatState());

    await expectLater(
      find.byType(ChatScreen),
      matchesGoldenFile('../../../test-screenshots/chat-greeting-2026-07-17.png'),
    );
  });

  testWidgets('screenshot: conversation, typing bubble and cart strip',
      (tester) async {
    await pump(
      tester,
      chat: const ChatState(
        messages: [
          ChatMessage(
              role: 'assistant', content: chatGreeting, isGreeting: true),
          ChatMessage(role: 'user', content: 'Quero dois X-Burguer e uma batata'),
          ChatMessage(
            role: 'assistant',
            content: 'Fechou! 🔥 Anotei 2x X-Burguer e 1x Batata Frita.\n'
                'Quer alguma bebida pra acompanhar?',
          ),
          ChatMessage(role: 'user', content: 'Manda uma coca lata também'),
        ],
        loading: true,
      ),
      cart: [
        CartItem(productId: 1, name: 'X-Burguer', priceCents: 2500, qty: 2),
        CartItem(productId: 2, name: 'Batata Frita', priceCents: 1800, qty: 1),
      ],
    );

    await expectLater(
      find.byType(ChatScreen),
      matchesGoldenFile('../../../test-screenshots/chat-typing-2026-07-17.png'),
    );
  });
}

class _StubCart extends CartNotifier {
  _StubCart(this._items);
  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}

class _StubChat extends ChatNotifier {
  _StubChat(this._initial);
  final ChatState _initial;

  @override
  ChatState build() => _initial;
}
