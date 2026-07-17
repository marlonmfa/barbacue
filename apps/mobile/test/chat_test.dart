// The agent turn rewrites the whole cart from a response that carries no
// imageUrl, and CartNotifier.replace persists — so a regression here doesn't
// just blank the thumbnails, it blanks them permanently. These lock the
// re-attach, the coupon round-trip, and the customer-facing failure copy.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:barbacue/models/cart_item.dart';
import 'package:barbacue/models/chat.dart';
import 'package:barbacue/providers/cart_provider.dart';
import 'package:barbacue/providers/chat_provider.dart';
import 'package:barbacue/providers/checkout_provider.dart';
import 'package:barbacue/screens/chat_screen.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:barbacue/theme/app_theme.dart';

/// The agent's end-state cart, exactly as the route shapes it: no imageUrl.
String chatBody(List<Map<String, dynamic>> cart, {String? couponCode}) =>
    jsonEncode({
      'reply': 'Anotado!',
      'cart': cart,
      'customer': <String, dynamic>{},
      'paymentMethod': 'pix',
      'couponCode': couponCode,
      'navigate': false,
    });

Map<String, dynamic> agentItem(int id, String name, int qty) =>
    {'productId': id, 'name': name, 'priceCents': 2500, 'qty': qty};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => ApiService.client = http.Client());

  final seeded = <CartItem>[
    CartItem(
        productId: 1,
        name: 'X-Burguer',
        priceCents: 2500,
        qty: 1,
        imageUrl: 'https://cdn/1.jpg'),
    CartItem(
        productId: 2,
        name: 'Batata',
        priceCents: 2500,
        qty: 1,
        imageUrl: 'https://cdn/2.jpg'),
  ];

  Future<ProviderContainer> pumpChat(
    WidgetTester tester, {
    List<CartItem>? cart,
    CheckoutState checkout = const CheckoutState(loaded: true),
  }) async {
    final container = ProviderContainer(overrides: [
      cartProvider.overrideWith(() => _StubCart(cart ?? const [])),
      checkoutProvider.overrideWith(() => _StubCheckout(checkout)),
    ]);
    addTearDown(container.dispose);

    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(theme: AppTheme.theme, home: const ChatScreen()),
    ));
    return container;
  }

  Future<void> sendText(WidgetTester tester, String text) async {
    await tester.enterText(find.byType(TextField), text);
    await tester.pump();
    await tester.tap(find.byIcon(Icons.send));
    await tester.pump();
    await tester.pump();
  }

  group('cart image preservation', () {
    testWidgets('a chat turn keeps images for items already in the cart',
        (tester) async {
      ApiService.client = MockClient((_) async => http.Response(
            // The agent bumped item 1 and added item 3.
            chatBody([
              agentItem(1, 'X-Burguer', 3),
              agentItem(2, 'Batata', 1),
              agentItem(3, 'Refri', 1),
            ]),
            200,
          ));

      final container = await pumpChat(tester, cart: seeded);
      await sendText(tester, 'mais dois burguers e um refri');

      final cart = container.read(cartProvider);
      expect(cart.map((e) => e.productId), [1, 2, 3]);
      // Untouched and touched items alike keep their thumbnail...
      expect(cart[0].imageUrl, 'https://cdn/1.jpg');
      expect(cart[0].qty, 3);
      expect(cart[1].imageUrl, 'https://cdn/2.jpg');
      // ...and an item the agent introduced has none to restore.
      expect(cart[2].imageUrl, isNull);
    });

    testWidgets('the image-less agent cart is never persisted', (tester) async {
      ApiService.client = MockClient(
          (_) async => http.Response(chatBody([agentItem(1, 'X-Burguer', 1)]), 200));

      await pumpChat(tester, cart: seeded);
      await sendText(tester, 'só o burguer');

      final prefs = await SharedPreferences.getInstance();
      final stored =
          jsonDecode(prefs.getString('barbacue-cart')!) as List<dynamic>;
      expect(stored.single['imageUrl'], 'https://cdn/1.jpg');
    });
  });

  group('coupon plumbing', () {
    testWidgets('an accepted coupon lands in checkout', (tester) async {
      ApiService.client = MockClient((_) async =>
          http.Response(chatBody([], couponCode: 'BEMVINDO10'), 200));

      final container = await pumpChat(tester);
      await sendText(tester, 'tenho cupom BEMVINDO10');

      expect(container.read(checkoutProvider).couponCode, 'BEMVINDO10');
    });

    testWidgets('a null couponCode preserves the applied one', (tester) async {
      late http.Request sent;
      ApiService.client = MockClient((req) async {
        sent = req;
        return http.Response(chatBody([]), 200);
      });

      final container = await pumpChat(
        tester,
        checkout: const CheckoutState(loaded: true, couponCode: 'BEMVINDO10'),
      );
      await sendText(tester, 'e uma coca');

      // Re-sent, or the route would drop it mid-conversation...
      expect(jsonDecode(sent.body)['couponCode'], 'BEMVINDO10');
      // ...and a silent response doesn't clear it locally.
      expect(container.read(checkoutProvider).couponCode, 'BEMVINDO10');
    });

    testWidgets('no coupon means no key on the wire', (tester) async {
      late http.Request sent;
      ApiService.client = MockClient((req) async {
        sent = req;
        return http.Response(chatBody([]), 200);
      });

      await pumpChat(tester);
      await sendText(tester, 'oi');

      expect(jsonDecode(sent.body).containsKey('couponCode'), isFalse);
    });
  });

  group('outbound history', () {
    testWidgets('the seeded greeting is not sent to the model', (tester) async {
      late http.Request sent;
      ApiService.client = MockClient((req) async {
        sent = req;
        return http.Response(chatBody([]), 200);
      });

      await pumpChat(tester);
      await sendText(tester, 'oi');

      final messages = jsonDecode(sent.body)['messages'] as List<dynamic>;
      expect(messages, hasLength(1));
      expect(messages.single['content'], 'oi');
    });

    testWidgets('a user turn matching the greeting text still goes out',
        (tester) async {
      late http.Request sent;
      ApiService.client = MockClient((req) async {
        sent = req;
        return http.Response(chatBody([]), 200);
      });

      await pumpChat(tester);
      await sendText(tester, chatGreeting);

      final messages = jsonDecode(sent.body)['messages'] as List<dynamic>;
      expect(messages.single['role'], 'user');
    });
  });

  group('failure copy', () {
    Future<void> expectBubble(WidgetTester tester, String text) async {
      await pumpChat(tester);
      await sendText(tester, 'oi');
      expect(find.text(text), findsOneWidget);
    }

    testWidgets("the route's own pt-BR error shows verbatim", (tester) async {
      ApiService.client = MockClient((_) async => http.Response(
          jsonEncode({'error': 'AI indisponível (sem chave configurada).'}), 503));
      await expectBubble(tester, 'AI indisponível (sem chave configurada).');
    });

    testWidgets('an HTML 502 does not leak a FormatException', (tester) async {
      ApiService.client =
          MockClient((_) async => http.Response('<html>502 Bad Gateway</html>', 502));
      await expectBubble(tester, 'Ops, tive um problema. Pode repetir?');
    });

    testWidgets('a socket failure reads as offline, not as an exception',
        (tester) async {
      ApiService.client =
          MockClient((_) async => throw const SocketException('down'));
      await expectBubble(tester, 'Sem conexão agora. Tente de novo num instante.');
      expect(find.textContaining('SocketException'), findsNothing);
    });
  });

  group('composer', () {
    testWidgets('send is disabled until the field has non-blank text',
        (tester) async {
      await pumpChat(tester);

      Opacity sendOpacity() => tester.widget<Opacity>(find.ancestor(
            of: find.byIcon(Icons.send),
            matching: find.byType(Opacity),
          ));
      InkWell sendInk() => tester.widget<InkWell>(find.ancestor(
            of: find.byIcon(Icons.send),
            matching: find.byType(InkWell),
          ));

      expect(sendOpacity().opacity, 0.4);
      expect(sendInk().onTap, isNull);

      // Whitespace alone is not a message.
      await tester.enterText(find.byType(TextField), '   ');
      await tester.pump();
      expect(sendInk().onTap, isNull);

      await tester.enterText(find.byType(TextField), 'oi');
      await tester.pump();
      expect(sendOpacity().opacity, 1.0);
      expect(sendInk().onTap, isNotNull);
    });
  });

  group('conversation persistence', () {
    testWidgets('backing out mid-request still lands the turn', (tester) async {
      final gate = Completer<http.Response>();
      ApiService.client = MockClient((_) => gate.future);

      final container = await pumpChat(tester, cart: seeded);
      await sendText(tester, 'quero um x-burguer');
      expect(container.read(chatProvider).loading, isTrue);

      // The back arrow disposes the screen while the request is in flight; the
      // conversation now outlives it, so the reply must still arrive.
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      gate.complete(http.Response(chatBody([agentItem(1, 'X-Burguer', 1)]), 200));
      await tester.pumpAndSettle();

      final chat = container.read(chatProvider);
      // A stranded `loading` would render a typing bubble that never resolves
      // and block the composer for the rest of the session.
      expect(chat.loading, isFalse);
      expect(chat.messages.last.content, 'Anotado!');
      expect(container.read(cartProvider).single.imageUrl, 'https://cdn/1.jpg');
    });

    test('the thread outlives the screen but resets on demand', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      container.read(chatProvider.notifier)
        ..addUser('quero um x-burguer')
        ..addAssistant('Anotado!');
      expect(container.read(chatProvider).messages, hasLength(3));

      container.read(chatProvider.notifier).reset();
      final messages = container.read(chatProvider).messages;
      expect(messages, hasLength(1));
      expect(messages.single.isGreeting, isTrue);
    });

    test('the greeting is flagged, not identified by its text', () {
      const seed = ChatMessage(
          role: 'assistant', content: chatGreeting, isGreeting: true);
      // The flag is local bookkeeping — the model has no field for it.
      expect(seed.toJson().containsKey('isGreeting'), isFalse);
    });
  });
}

class _StubCart extends CartNotifier {
  _StubCart(this._items);
  final List<CartItem> _items;

  @override
  List<CartItem> build() => _items;
}

/// Skips the async SharedPreferences hydration, so the turn runs against the
/// checkout state under test rather than an empty default that resolves late.
class _StubCheckout extends CheckoutNotifier {
  _StubCheckout(this._initial);
  final CheckoutState _initial;

  @override
  CheckoutState build() => _initial;
}
