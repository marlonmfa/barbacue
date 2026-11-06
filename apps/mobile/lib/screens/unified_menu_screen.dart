import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_brand.dart';
import '../providers/cart_provider.dart';
import '../providers/menu_provider.dart';
import 'brand_menu_screen.dart';
import 'menu_screen.dart';

/// Página inicial dos três apps: o mesmo código, começando no restaurante do
/// app, com um seletor para os outros dois. O carrinho é único.
class UnifiedMenuScreen extends ConsumerWidget {
  const UnifiedMenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedBrandProvider);
    final config = brandConfigs[selected]!;
    return Column(
      children: [
        const BrandSwitcher(),
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeTop: true,
            child: KeyedSubtree(
              key: ValueKey(selected),
              child: selected == AppBrand.barbacue
                  ? const MenuScreen()
                  : BrandMenuScreen(brand: config),
            ),
          ),
        ),
      ],
    );
  }
}

class BrandSwitcher extends ConsumerWidget {
  const BrandSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedBrandProvider);
    final counts = ref.watch(cartItemsByBrandProvider);
    final active = brandConfigs[selected]!;
    return Material(
      color: active.ink,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
          child: Row(
            children: [
              for (final brand in brandSwitcherOrder)
                Expanded(
                  child: _BrandTab(
                    config: brandConfigs[brand]!,
                    selected: brand == selected,
                    count: counts[brandConfigs[brand]!.slug] ?? 0,
                    onTap: () =>
                        ref.read(selectedBrandProvider.notifier).state = brand,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BrandTab extends StatelessWidget {
  const _BrandTab({
    required this.config,
    required this.selected,
    required this.count,
    required this.onTap,
  });

  final BrandConfig config;
  final bool selected;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: 'Cardápio ${config.shortName}',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? config.primary : Colors.white10,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(
                    config.shortName,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: selected ? Colors.white : Colors.white70,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ),
                if (count > 0) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$count',
                      style: TextStyle(
                        color: config.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
