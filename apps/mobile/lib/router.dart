import 'package:go_router/go_router.dart';
import 'screens/menu_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/payment_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/confirmation_screen.dart';
import 'screens/mesa_screen.dart';
import 'screens/brand_menu_screen.dart';
import 'config/app_brand.dart';

GoRouter createRouter(BrandConfig brand) => GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => brand.hasNativeCheckout
          ? const MenuScreen()
          : const BrandMenuScreen(),
    ),
    if (brand.hasNativeCheckout) ...[
      GoRoute(path: '/cart', builder: (context, state) => const CartScreen()),
      GoRoute(
        path: '/payment',
        builder: (context, state) => const PaymentScreen(),
      ),
      GoRoute(path: '/chat', builder: (context, state) => const ChatScreen()),
      // The target of every printed table QR. Reached from the phone's camera via
      // universal links / app links — never linked to from inside the app.
      GoRoute(
        path: '/mesa/:token',
        builder: (context, state) =>
            MesaScreen(token: state.pathParameters['token']!),
      ),
      GoRoute(
        path: '/confirmation/:orderId',
        builder: (context, state) =>
            ConfirmationScreen(orderId: state.pathParameters['orderId']!),
      ),
    ],
  ],
);

// Tests and the screenshot harness historically import `router` directly.
final router = createRouter(brandConfigs[AppBrand.barbacue]!);
