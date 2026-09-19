import '../widgets/privacy_button.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_brand.dart';
import '../models/product.dart';
import '../providers/menu_provider.dart';
import '../theme/app_theme.dart';

class BrandMenuScreen extends ConsumerStatefulWidget {
  const BrandMenuScreen({super.key});

  @override
  ConsumerState<BrandMenuScreen> createState() => _BrandMenuScreenState();
}

class _BrandMenuScreenState extends ConsumerState<BrandMenuScreen> {
  final _scrollController = ScrollController();
  final Map<int, GlobalKey> _categoryKeys = {};

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(menuProvider);
    await ref.read(menuProvider.future);
  }

  void _goToCategory(int index) {
    final context = _categoryKeys[index]?.currentContext;
    if (context == null) return;
    Scrollable.ensureVisible(
      context,
      duration: const Duration(milliseconds: 360),
      curve: Curves.easeOutCubic,
      alignment: .02,
    );
  }

  @override
  Widget build(BuildContext context) {
    final brand = currentBrand;
    final menu = ref.watch(menuProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: menu.when(
          loading: () => _LoadingView(brand: brand),
          error: (_, _) => _ErrorView(
            brand: brand,
            onRetry: () => ref.invalidate(menuProvider),
          ),
          data: (allCategories) {
            final categories = allCategories
                .where((c) => c.products.isNotEmpty)
                .toList();
            for (var i = 0; i < categories.length; i++) {
              _categoryKeys.putIfAbsent(i, GlobalKey.new);
            }

            return RefreshIndicator(
              color: brand.primary,
              onRefresh: _refresh,
              child: CustomScrollView(
                controller: _scrollController,
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                slivers: [
                  SliverToBoxAdapter(
                    child: _MobileHero(
                      brand: brand,
                      itemCount: categories.fold(
                        0,
                        (sum, c) => sum + c.products.length,
                      ),
                    ),
                  ),
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _BrandCategoryRail(
                      brand: brand,
                      categories: categories,
                      onTap: _goToCategory,
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'DO IFOOD PARA VOCÊ',
                            style: TextStyle(
                              color: brand.primary,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.7,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            'CARDÁPIO COMPLETO',
                            style: Theme.of(
                              context,
                            ).textTheme.headlineMedium?.copyWith(fontSize: 38),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Preços e disponibilidade são confirmados no iFood.',
                            style: TextStyle(
                              color: brand.ink.withValues(alpha: .62),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  for (var i = 0; i < categories.length; i++) ...[
                    SliverToBoxAdapter(
                      child: _CategoryHeading(
                        key: _categoryKeys[i],
                        brand: brand,
                        category: categories[i],
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      sliver: SliverList.separated(
                        itemCount: categories[i].products.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 12),
                        itemBuilder: (_, index) => _IfoodProductCard(
                          brand: brand,
                          product: categories[i].products[index],
                          category: categories[i].name,
                        ),
                      ),
                    ),
                  ],
                  const SliverToBoxAdapter(
                    child: Center(child: PrivacyButton()),
                  ),
                  SliverToBoxAdapter(child: _BrandFooter(brand: brand)),
                  const SliverToBoxAdapter(child: SizedBox(height: 86)),
                ],
              ),
            );
          },
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 7, 14, 10),
        child: FilledButton.icon(
          onPressed: () => _open(currentBrand.ifoodUri),
          icon: const Icon(Icons.delivery_dining),
          label: const Text('PEDIR NO IFOOD'),
        ),
      ),
    );
  }
}

Future<void> _open(Uri? uri) async {
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class _MobileHero extends StatelessWidget {
  const _MobileHero({required this.brand, required this.itemCount});

  final BrandConfig brand;
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    final chelas = brand.brand == AppBrand.chelas;
    return Container(
      // SliverToBoxAdapter gives children an unbounded vertical constraint.
      // The hero needs a concrete height because its Column uses Spacer to
      // anchor the headline near the bottom of the first mobile viewport.
      height: 480 + MediaQuery.paddingOf(context).top,
      padding: EdgeInsets.fromLTRB(
        20,
        MediaQuery.paddingOf(context).top + 16,
        20,
        34,
      ),
      decoration: BoxDecoration(
        gradient: chelas
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF991323), Color(0xFFD22B35)],
              )
            : const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF182448), Color(0xFF273965)],
              ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -42,
            top: 58,
            child: Transform.rotate(
              angle: chelas ? -.16 : .12,
              child: Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  color: brand.accent.withValues(alpha: chelas ? .96 : .9),
                  shape: chelas ? BoxShape.circle : BoxShape.rectangle,
                  borderRadius: chelas ? null : BorderRadius.circular(24),
                ),
                child: Icon(brand.menuIcon, color: brand.ink, size: 84),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _Monogram(brand: brand),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Text(
                      brand.name.toUpperCase(),
                      maxLines: 2,
                      style: const TextStyle(
                        color: Colors.white,
                        fontFamily: 'Anton',
                        fontSize: 19,
                        height: 1.05,
                        letterSpacing: .5,
                      ),
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Text(
                'JARAGUÁ DO SUL · SC',
                style: TextStyle(
                  color: brand.accent,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.8,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                brand.tagline.toUpperCase(),
                style: const TextStyle(
                  color: Colors.white,
                  fontFamily: 'Anton',
                  fontSize: 53,
                  height: .9,
                  letterSpacing: -.6,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                brand.description,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: .78),
                  fontSize: 15,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 22),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _FactChip(label: '$itemCount ITENS', brand: brand),
                  _FactChip(
                    label: brand.minimumOrder ?? 'CARDÁPIO COMPLETO',
                    brand: brand,
                  ),
                  _FactChip(label: 'ENTREGA IFOOD', brand: brand),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Monogram extends StatelessWidget {
  const _Monogram({required this.brand});
  final BrandConfig brand;
  @override
  Widget build(BuildContext context) => Transform.rotate(
    angle: brand.brand == AppBrand.chelas ? -.08 : .05,
    child: Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: brand.accent,
        shape: brand.brand == AppBrand.chelas
            ? BoxShape.circle
            : BoxShape.rectangle,
        borderRadius: brand.brand == AppBrand.chelas
            ? null
            : BorderRadius.circular(12),
      ),
      child: Text(
        brand.brand == AppBrand.chelas ? 'CH' : 'BD',
        style: TextStyle(
          color: brand.ink,
          fontWeight: FontWeight.w900,
          fontSize: 16,
          letterSpacing: -.8,
        ),
      ),
    ),
  );
}

class _FactChip extends StatelessWidget {
  const _FactChip({required this.label, required this.brand});
  final String label;
  final BrandConfig brand;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
    decoration: BoxDecoration(
      border: Border.all(color: Colors.white.withValues(alpha: .27)),
      borderRadius: BorderRadius.circular(999),
      color: Colors.black.withValues(alpha: .08),
    ),
    child: Text(
      label,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 10,
        fontWeight: FontWeight.w800,
        letterSpacing: .4,
      ),
    ),
  );
}

class _BrandCategoryRail extends SliverPersistentHeaderDelegate {
  const _BrandCategoryRail({
    required this.brand,
    required this.categories,
    required this.onTap,
  });
  final BrandConfig brand;
  final List<Category> categories;
  final ValueChanged<int> onTap;

  @override
  double get minExtent => 61;
  @override
  double get maxExtent => 61;
  @override
  bool shouldRebuild(covariant _BrandCategoryRail oldDelegate) =>
      oldDelegate.categories != categories || oldDelegate.brand != brand;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => Material(
    color: brand.background.withValues(alpha: .96),
    elevation: overlapsContent ? 5 : 0,
    shadowColor: Colors.black26,
    child: ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      scrollDirection: Axis.horizontal,
      itemCount: categories.length,
      separatorBuilder: (_, _) => const SizedBox(width: 8),
      itemBuilder: (_, i) => ActionChip(
        onPressed: () => onTap(i),
        side: BorderSide(color: brand.ink.withValues(alpha: .16)),
        backgroundColor: brand.surface,
        label: Text(
          categories[i].name,
          style: TextStyle(
            color: brand.ink,
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    ),
  );
}

class _CategoryHeading extends StatelessWidget {
  const _CategoryHeading({
    super.key,
    required this.brand,
    required this.category,
  });
  final BrandConfig brand;
  final Category category;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 34, 16, 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Text(
            category.name.toUpperCase(),
            style: Theme.of(
              context,
            ).textTheme.headlineMedium?.copyWith(fontSize: 30),
          ),
        ),
        Text(
          '${category.products.length} ITENS',
          style: TextStyle(
            color: brand.ink.withValues(alpha: .55),
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 1,
          ),
        ),
      ],
    ),
  );
}

class _IfoodProductCard extends StatelessWidget {
  const _IfoodProductCard({
    required this.brand,
    required this.product,
    required this.category,
  });
  final BrandConfig brand;
  final Product product;
  final String category;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Ver ${product.name} no iFood',
      child: InkWell(
        onTap: () => _open(
          product.ifoodUrl == null
              ? brand.ifoodUri
              : Uri.parse(product.ifoodUrl!),
        ),
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          height: 172,
          decoration: BoxDecoration(
            color: brand.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: brand.ink.withValues(alpha: .13)),
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(19),
                ),
                child: SizedBox(
                  width: 132,
                  height: double.infinity,
                  child: _BrandProductImage(
                    brand: brand,
                    product: product,
                    category: category,
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(15, 15, 13, 13),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 15,
                          height: 1.12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (product.description?.isNotEmpty == true) ...[
                        const SizedBox(height: 6),
                        Text(
                          product.description!,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: brand.ink.withValues(alpha: .6),
                            fontSize: 11.5,
                            height: 1.35,
                          ),
                        ),
                      ],
                      const Spacer(),
                      Row(
                        children: [
                          if (product.onSale) ...[
                            Text(
                              formatPrice(product.priceCents),
                              style: TextStyle(
                                color: brand.ink.withValues(alpha: .45),
                                fontSize: 10,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                            const SizedBox(width: 5),
                          ],
                          Expanded(
                            child: Text(
                              formatPrice(product.effectivePriceCents),
                              style: TextStyle(
                                color: brand.primary,
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          Icon(
                            Icons.north_east_rounded,
                            color: brand.ink,
                            size: 18,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BrandProductImage extends StatelessWidget {
  const _BrandProductImage({
    required this.brand,
    required this.product,
    required this.category,
  });
  final BrandConfig brand;
  final Product product;
  final String category;
  @override
  Widget build(BuildContext context) {
    final fallback = DecoratedBox(
      decoration: BoxDecoration(color: brand.ink),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(brand.menuIcon, size: 36, color: brand.accent),
            const SizedBox(height: 6),
            Text(
              category
                  .substring(0, category.length < 2 ? category.length : 2)
                  .toUpperCase(),
              style: TextStyle(
                color: brand.accent,
                fontFamily: 'Anton',
                fontSize: 18,
              ),
            ),
          ],
        ),
      ),
    );
    final image = product.imageUrl;
    if (image == null || image.isEmpty) return fallback;
    return CachedNetworkImage(
      imageUrl: image,
      fit: BoxFit.cover,
      placeholder: (_, _) =>
          ColoredBox(color: brand.ink.withValues(alpha: .08)),
      errorWidget: (_, _, _) => fallback,
    );
  }
}

class _BrandFooter extends StatelessWidget {
  const _BrandFooter({required this.brand});
  final BrandConfig brand;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 52),
    padding: const EdgeInsets.fromLTRB(20, 34, 20, 38),
    color: brand.ink,
    child: Row(
      children: [
        _Monogram(brand: brand),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                brand.name.toUpperCase(),
                style: const TextStyle(
                  color: Colors.white,
                  fontFamily: 'Anton',
                  fontSize: 19,
                ),
              ),
              Text(
                'Jaraguá do Sul · Santa Catarina',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: .58),
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _LoadingView extends StatelessWidget {
  const _LoadingView({required this.brand});
  final BrandConfig brand;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: brand.background,
    child: Center(child: CircularProgressIndicator(color: brand.primary)),
  );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.brand, required this.onRetry});
  final BrandConfig brand;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => ColoredBox(
    color: brand.background,
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, color: brand.primary, size: 54),
            const SizedBox(height: 16),
            Text(
              'O cardápio não carregou',
              style: TextStyle(
                color: brand.ink,
                fontSize: 19,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              'Confira sua conexão e tente novamente.',
              textAlign: TextAlign.center,
              style: TextStyle(color: brand.ink.withValues(alpha: .62)),
            ),
            const SizedBox(height: 22),
            FilledButton(
              onPressed: onRetry,
              child: const Text('TENTAR NOVAMENTE'),
            ),
          ],
        ),
      ),
    ),
  );
}
