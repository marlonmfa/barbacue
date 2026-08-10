import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Small square product image with the branded fallback.
///
/// Two layers only — the product's own photo, then the ember mark. The
/// category fallback photo that the menu card uses is deliberately absent: the
/// cart has no category on a [CartItem], and the web cart likewise passes no
/// fallbackSrc. A surface that does have the category must add that layer
/// itself rather than widening this widget's contract.
class ProductThumb extends StatelessWidget {
  const ProductThumb({
    super.key,
    required this.imageUrl,
    required this.name,
    this.size = 64,
    this.borderRadius = 12,
  });

  final String? imageUrl;
  final String name;
  final double size;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;

    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: SizedBox(
        width: size,
        height: size,
        child: url == null || url.isEmpty
            ? _EmberMark(size: size, name: name)
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                // The anota.ai CDN is slow and flaky, so an unfilled box would
                // otherwise flash through the card while the photo resolves.
                placeholder: (_, _) => const ColoredBox(color: AppTheme.surfaceAlt),
                errorWidget: (_, _, _) => _EmberMark(size: size, name: name),
              ),
      ),
    );
  }
}

class _EmberMark extends StatelessWidget {
  const _EmberMark({required this.size, required this.name});

  final double size;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: name,
      child: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppTheme.emberGradient),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.lunch_dining_outlined,
                size: size * 0.44,
                color: AppTheme.brand,
              ),
              // The wordmark only earns its place once it is legible; below
              // ~56px the icon alone carries the brand.
              if (size >= 56) ...[
                const SizedBox(height: 2),
                Text(
                  'BARBACUE',
                  style: TextStyle(
                    fontSize: size * 0.13,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: AppTheme.brandTan,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
