// Screenshot-only entrypoint for App Store Connect store assets.
//
// NOT part of the production app — `main.dart` is the only shipped entrypoint.
// This flavor seeds a realistic cart + customer synchronously (via Riverpod
// overrides) so the /cart and /payment screens render fully without manual
// tapping, then lands on whichever route SCREENSHOT_ROUTE points at.
//
// Build once, capture both screens. The target route is read at runtime from a
// file in the app's tmp sandbox (Dart's Directory.systemTemp == <data>/tmp),
// which the host rewrites between launches — so one build serves every screen.
// (iOS does NOT surface simctl SIMCTL_CHILD_* vars via Platform.environment,
// so an env-based switch silently no-ops — a file is the reliable channel.)
//
//   flutter build ios --simulator --debug \
//     --dart-define=API_BASE_URL=https://barbacue.cog.ia.br \
//     -t lib/main_screenshot.dart
//   xcrun simctl install <udid> build/ios/iphonesimulator/Runner.app
//   C=$(xcrun simctl get_app_container <udid> <bundle> data)
//   echo /cart    > "$C/tmp/screenshot_route.txt"; xcrun simctl launch --terminate-running-process <udid> <bundle>
//   echo /payment > "$C/tmp/screenshot_route.txt"; xcrun simctl launch --terminate-running-process <udid> <bundle>

import 'dart:io' show File, Directory;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'models/cart_item.dart';
import 'providers/cart_provider.dart';
import 'providers/checkout_provider.dart';
import 'screens/cart_screen.dart';
import 'screens/payment_screen.dart';
import 'screens/menu_screen.dart';
import 'theme/app_theme.dart';

// Real menu items (pulled from the production /api/products feed) so the cart
// shows authentic names, prices and CDN photos.
final _demoCart = <CartItem>[
  CartItem(
    productId: 1,
    name: 'Barba crunch',
    priceCents: 4500,
    imageUrl:
        'https://client-assets.anota.ai/produtos/6695aa65af020700192a0885/-1763679590179blob',
    qty: 1,
  ),
  CartItem(
    productId: 2,
    name: 'Barba Supreme',
    priceCents: 5200,
    imageUrl:
        'https://client-assets.anota.ai/produtos/6695aa65af020700192a0885/-1770339170594blob',
    qty: 1,
  ),
  CartItem(
    productId: 4,
    name: 'Barba Onion Bbq',
    priceCents: 4200,
    imageUrl:
        'https://client-assets.anota.ai/produtos/6411bab6b76860001994fffc/6411baba853e7d00129b0434/6411babb853e7d00129b0460-1694220979251blob',
    qty: 2,
  ),
];

const _demoCheckout = CheckoutState(
  name: 'Marina Souza',
  phone: '47 99812-3344',
  address: 'Rua das Palmeiras, 240 — Centro',
  notes: 'Ponto da carne ao ponto, sem cebola.',
  paymentMethod: 'pix',
);

class _SeededCart extends CartNotifier {
  @override
  List<CartItem> build() => _demoCart;
}

class _SeededCheckout extends CheckoutNotifier {
  @override
  CheckoutState build() => _demoCheckout;
}

// Reads the desired initial route from a host-writable file in the app's tmp
// sandbox. Synchronous + defensive so a missing file just falls back to /cart.
String _readRoute() {
  try {
    final f = File('${Directory.systemTemp.path}/screenshot_route.txt');
    if (f.existsSync()) {
      final v = f.readAsStringSync().trim();
      if (v.isNotEmpty) return v;
    }
  } catch (_) {/* fall through to default */}
  return '/cart';
}

void main() {
  final route = _readRoute();

  final router = GoRouter(
    initialLocation: route,
    routes: [
      GoRoute(path: '/', builder: (_, _) => const MenuScreen()),
      GoRoute(path: '/cart', builder: (_, _) => const CartScreen()),
      GoRoute(path: '/payment', builder: (_, _) => const PaymentScreen()),
    ],
  );

  runApp(
    ProviderScope(
      overrides: [
        cartProvider.overrideWith(_SeededCart.new),
        checkoutProvider.overrideWith(_SeededCheckout.new),
      ],
      child: MaterialApp.router(
        title: 'BARBACUE',
        theme: AppTheme.theme,
        routerConfig: router,
        debugShowCheckedModeBanner: false,
      ),
    ),
  );
}
