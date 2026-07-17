import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/cart_provider.dart';
import '../theme/app_theme.dart';

class CartBar extends ConsumerWidget {
  const CartBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final totalItems = ref.watch(cartTotalItemsProvider);
    final totalCents = ref.watch(cartTotalCentsProvider);

    if (totalItems == 0) return const SizedBox.shrink();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        // Rebuilt from scratch each time the cart goes from empty to non-empty,
        // so the tween replays as an entrance rather than only on first launch.
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 1, end: 0),
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          builder: (context, value, child) => FractionalTranslation(
            translation: Offset(0, value),
            child: child,
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.4),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: FilledButton(
              onPressed: () => context.push('/cart'),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.brand,
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: AppTheme.brandTan,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '$totalItems',
                      style: const TextStyle(
                        color: AppTheme.brandTanInk,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Ver carrinho',
                      style:
                          TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                  Text(
                    formatPrice(totalCents),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
