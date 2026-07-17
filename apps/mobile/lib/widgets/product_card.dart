import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:barbacue/lib/category_art.dart';
import '../models/product.dart';
import '../models/cart_item.dart';
import '../providers/cart_provider.dart';
import '../providers/menu_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

const _imageHeight = 176.0;

/// Fixed card height for the menu grid's `mainAxisExtent` (image + 2-line name +
/// 2-line description + price row), hand-tuned against the sizes below and
/// deliberately independent of cell width so narrow phones don't clip content.
/// Retune — and re-run product_card_test — if any of those sizes change.
const kProductCardExtent = 332.0;

class ProductCard extends ConsumerWidget {
  const ProductCard({
    super.key,
    required this.product,
    this.categorySlug,
    this.categoryName,
  });

  final Product product;

  /// Category context. When supplied, a product whose own image fails to load
  /// degrades to a category-appropriate generated photo before the ember tile.
  final String? categorySlug;
  final String? categoryName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final qty = ref.watch(itemQtyProvider(product.id));
    // orElse: false keeps the fail-open posture of the status endpoint — a
    // loading or unreachable /api/store-status must never stop a customer
    // ordering. The server re-checks on POST /api/orders regardless.
    final closed = ref
        .watch(storeStatusProvider)
        .maybeWhen(data: (s) => !s.open, orElse: () => false);

    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              _ProductImage(
                imageUrl: product.imageUrl,
                fallbackUrl: categorySlug == null && categoryName == null
                    ? null
                    : ApiService.baseUrl +
                        fallbackArtPath(categorySlug, categoryName, product.id),
              ),
              const Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: _imageHeight * 0.4,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Color(0x471B1613),
                          Color(0x0A1B1613),
                          Colors.transparent,
                        ],
                        stops: [0, 0.4, 0.65],
                      ),
                    ),
                  ),
                ),
              ),
              if (product.onSale)
                const Positioned(top: 10, left: 10, child: _PromoBadge()),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (product.description != null &&
                    product.description!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    product.description!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Two columns at iPhone SE width leave the price ~51px next
                    // to the button — not enough for even "R$ 5,00" at 18px.
                    // Scale down rather than ellipsize: a smaller-but-whole
                    // price beats a truncated "R$ 1…". Wider phones fit the full
                    // 18px and never scale.
                    Flexible(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (product.onSale)
                              Text(
                                formatPrice(product.priceCents),
                                maxLines: 1,
                                style: const TextStyle(
                                  fontSize: 11,
                                  height: 1,
                                  color: AppTheme.textSecondary,
                                  decoration: TextDecoration.lineThrough,
                                ),
                              ),
                            Text(
                              formatPrice(product.effectivePriceCents),
                              maxLines: 1,
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                                height: 1.2,
                                color: product.onSale
                                    ? AppTheme.brand
                                    : AppTheme.brandTan,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    // Lines already in the cart stay editable from the cart
                    // itself; only new adds are cut off here.
                    if (closed)
                      const _ClosedChip()
                    else
                      qty == 0
                          ? _AddButton(product: product)
                          : _QtyControls(product: product, qty: qty),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Inert stand-in for the add button while the store is closed. Non-interactive
/// on purpose — there is no action to offer, so it takes no tap.
class _ClosedChip extends StatelessWidget {
  const _ClosedChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.border),
      ),
      child: const Text(
        'Loja fechada',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppTheme.textSecondary,
        ),
      ),
    );
  }
}

class _PromoBadge extends StatelessWidget {
  const _PromoBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.brand,
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [BoxShadow(color: Color(0x661B1613), blurRadius: 8)],
      ),
      child: const Text(
        '🔥 PROMO',
        style: TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

/// Layered image, mirroring the web: the product's own photo → a
/// category-appropriate generated photo → the branded ember tile.
class _ProductImage extends StatelessWidget {
  const _ProductImage({required this.imageUrl, this.fallbackUrl});

  final String? imageUrl;
  final String? fallbackUrl;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _imageHeight,
      width: double.infinity,
      child: imageUrl == null || imageUrl!.isEmpty
          ? _fallback()
          : CachedNetworkImage(
              imageUrl: imageUrl!,
              fit: BoxFit.cover,
              placeholder: (_, _) =>
                  const ColoredBox(color: AppTheme.surfaceAlt),
              errorWidget: (_, _, _) => _fallback(),
            ),
    );
  }

  Widget _fallback() {
    if (fallbackUrl == null) return const _EmberTile();
    return CachedNetworkImage(
      imageUrl: fallbackUrl!,
      fit: BoxFit.cover,
      placeholder: (_, _) => const ColoredBox(color: AppTheme.surfaceAlt),
      errorWidget: (_, _, _) => const _EmberTile(),
    );
  }
}

class _EmberTile extends StatelessWidget {
  const _EmberTile();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppTheme.emberGradient),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.lunch_dining, size: 40, color: AppTheme.brand),
          const SizedBox(height: 4),
          Text(
            'BARBACUE',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.5,
              color: AppTheme.brandTan.withValues(alpha: 0.7),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddButton extends ConsumerWidget {
  const _AddButton({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FilledButton(
      onPressed: () {
        ref.read(cartProvider.notifier).add(CartItem(
              productId: product.id,
              name: product.name,
              // Use the promotional price; the server re-sources prices anyway.
              priceCents: product.effectivePriceCents,
              imageUrl: product.imageUrl,
            ));
      },
      style: FilledButton.styleFrom(
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      child: const Text('Adicionar', style: TextStyle(fontSize: 12)),
    );
  }
}

class _QtyControls extends ConsumerStatefulWidget {
  const _QtyControls({required this.product, required this.qty});
  final Product product;
  final int qty;

  @override
  ConsumerState<_QtyControls> createState() => _QtyControlsState();
}

class _QtyControlsState extends ConsumerState<_QtyControls>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 250),
  );

  // Overshoot then settle, so the stepper visibly replaces the Adicionar button
  // rather than swapping in silently.
  late final Animation<double> _pop = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 0.8, end: 1.08), weight: 60),
    TweenSequenceItem(tween: Tween(begin: 1.08, end: 1.0), weight: 40),
  ]).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));

  @override
  void initState() {
    super.initState();
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final notifier = ref.read(cartProvider.notifier);
    return ScaleTransition(
      scale: _pop,
      child: Row(
        children: [
          _CircleButton(
            icon: Icons.remove,
            onTap: () => notifier.setQty(widget.product.id, widget.qty - 1),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              '${widget.qty}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ),
          _CircleButton(
            icon: Icons.add,
            onTap: () => notifier.setQty(widget.product.id, widget.qty + 1),
          ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(
          color: AppTheme.brand,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 18, color: Colors.white),
      ),
    );
  }
}
