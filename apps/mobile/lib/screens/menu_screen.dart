import 'package:barbacue/lib/category_art.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/product.dart';
import '../providers/menu_provider.dart';
import '../widgets/hero_header.dart';
import '../widgets/product_card.dart';
import '../widgets/store_footer.dart';
import '../widgets/table_banner.dart';
import '../widgets/cart_bar.dart';
import '../theme/app_theme.dart';

const _railHeight = 50.0;

/// Fraction of the viewport below which a section header counts as "the section
/// you are reading" — mirrors the web nav's `-30% 0px -60% 0px` rootMargin.
const _spyThreshold = 0.3;

class MenuScreen extends ConsumerStatefulWidget {
  const MenuScreen({super.key});

  @override
  ConsumerState<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends ConsumerState<MenuScreen>
    with WidgetsBindingObserver {
  final _scrollController = ScrollController();
  final _categoryScrollController = ScrollController();
  final _scrollViewKey = GlobalKey();
  int _activeCategoryIndex = 0;
  bool _spyScheduled = false;
  final Map<int, GlobalKey> _sectionKeys = {};
  final Map<int, GlobalKey> _chipKeys = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scrollController.addListener(_syncActiveCategory);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scrollController.removeListener(_syncActiveCategory);
    _scrollController.dispose();
    _categoryScrollController.dispose();
    super.dispose();
  }

  /// The store can close while the app sits in the background; nothing else
  /// re-reads the status for the life of the process.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(storeStatusProvider);
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(menuProvider);
    ref.invalidate(storeStatusProvider);
    ref.invalidate(settingsProvider);
    await ref.read(storeStatusProvider.future);
  }

  /// A scroll notification arrives *before* the frame that lays the new offset
  /// out, so the section headers still carry the previous frame's geometry.
  /// Measuring is deferred to the end of that frame; the flag keeps a burst of
  /// notifications from queueing a callback each.
  void _syncActiveCategory() {
    if (_spyScheduled) return;
    _spyScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _spyScheduled = false;
      if (mounted) _measureActiveCategory();
    });
  }

  /// Highlights the last section whose header has passed the spy threshold.
  void _measureActiveCategory() {
    final viewport =
        _scrollViewKey.currentContext?.findRenderObject() as RenderBox?;
    if (viewport == null || !viewport.attached) return;

    final threshold = viewport.size.height * _spyThreshold;
    var active = _activeCategoryIndex;
    for (var i = 0; i < _sectionKeys.length; i++) {
      final box =
          _sectionKeys[i]?.currentContext?.findRenderObject() as RenderBox?;
      // Sections outside the viewport's cache extent are not laid out; the ones
      // above simply keep their earlier verdict.
      if (box == null || !box.attached) continue;
      final top = viewport.globalToLocal(box.localToGlobal(Offset.zero)).dy;
      if (top <= threshold) {
        active = i;
      } else {
        break;
      }
    }

    if (active != _activeCategoryIndex) {
      setState(() => _activeCategoryIndex = active);
    }
  }

  void _scrollToCategory(int index) {
    final section = _sectionKeys[index]?.currentContext;
    if (section != null) {
      Scrollable.ensureVisible(
        section,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
        alignmentPolicy: ScrollPositionAlignmentPolicy.explicit,
        alignment: 0.0,
      );
    }
    // Chips are variable-width (emoji + name), so the rail is centred on the
    // chip itself rather than a computed offset.
    final chip = _chipKeys[index]?.currentContext;
    if (chip != null) {
      Scrollable.ensureVisible(
        chip,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
        alignment: 0.5,
      );
    }
  }

  void _scrollToMenu() {
    final section = _sectionKeys[0]?.currentContext;
    if (section == null) return;
    Scrollable.ensureVisible(
      section,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      alignmentPolicy: ScrollPositionAlignmentPolicy.explicit,
      alignment: 0.0,
    );
  }

  @override
  Widget build(BuildContext context) {
    final menuAsync = ref.watch(menuProvider);

    return Scaffold(
      body: menuAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.brand),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.wifi_off,
                size: 64,
                color: AppTheme.textSecondary,
              ),
              const SizedBox(height: 16),
              Text(
                'Não foi possível carregar o cardápio',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => ref.invalidate(menuProvider),
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
        data: (categories) {
          final populated = categories
              .where((c) => c.products.isNotEmpty)
              .toList();
          for (var i = 0; i < populated.length; i++) {
            _sectionKeys.putIfAbsent(i, () => GlobalKey());
            _chipKeys.putIfAbsent(i, () => GlobalKey());
          }

          return SafeArea(
            bottom: false,
            child: RefreshIndicator(
              color: AppTheme.brand,
              onRefresh: _refresh,
              child: CustomScrollView(
                key: _scrollViewKey,
                controller: _scrollController,
                slivers: [
                  SliverToBoxAdapter(
                    child: HeroHeader(onSeeMenu: _scrollToMenu),
                  ),
                  const SliverToBoxAdapter(child: TableBanner()),
                  const SliverToBoxAdapter(child: _ClosedBanner()),
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _CategoryRail(
                      categories: populated,
                      activeCategoryIndex: _activeCategoryIndex,
                      categoryScrollController: _categoryScrollController,
                      chipKeys: _chipKeys,
                      onCategoryTap: _scrollToCategory,
                    ),
                  ),
                  if (populated.isEmpty)
                    const SliverToBoxAdapter(child: _EmptyMenu()),
                  for (var i = 0; i < populated.length; i++) ...[
                    SliverToBoxAdapter(
                      // The key rides the header box, not the sliver: the spy
                      // measures it against the viewport, and a sliver has no
                      // RenderBox geometry to measure.
                      child: _SectionHeader(
                        key: _sectionKeys[i],
                        name: populated[i].name,
                        count: populated[i].products.length,
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      sliver: SliverGrid(
                        gridDelegate:
                            const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 220,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              mainAxisExtent: kProductCardExtent,
                            ),
                        delegate: SliverChildBuilderDelegate(
                          (context, idx) => ProductCard(
                            product: populated[i].products[idx],
                            categorySlug: populated[i].slug,
                            categoryName: populated[i].name,
                          ),
                          childCount: populated[i].products.length,
                        ),
                      ),
                    ),
                  ],
                  const SliverToBoxAdapter(child: StoreFooter()),
                  // Last: the CartBar is a bottomSheet and floats over the tail.
                  const SliverToBoxAdapter(child: SizedBox(height: 120)),
                ],
              ),
            ),
          );
        },
      ),
      floatingActionButton: _ChatFab(onPressed: () => context.push('/chat')),
      bottomSheet: const CartBar(),
    );
  }
}

/// Shows a banner when the store is closed (reads /api/store-status). Renders
/// nothing while loading, on error, or when open — so it never blocks browsing.
///
/// Scrolls away with the hero: on the web the category nav sticks at the same
/// offset and paints over this bar, so it too is only ever visible at the top.
class _ClosedBanner extends ConsumerWidget {
  const _ClosedBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(storeStatusProvider);
    return statusAsync.maybeWhen(
      data: (status) {
        if (status.open) return const SizedBox.shrink();
        final detail = status.nextOpen != null && status.nextOpen!.isNotEmpty
            ? '${status.reason} ${status.nextOpen}'
            : status.reason;
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: const BoxDecoration(
            color: AppTheme.brand,
            boxShadow: [
              BoxShadow(
                color: Color(0x1F000000),
                blurRadius: 6,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: Text(
            // The server renders a reason and a next-open time; both beat the
            // web's hardcoded copy, which exists only because the page never
            // calls /api/store-status.
            detail.isNotEmpty
                ? '🔒 $detail'
                : '🔒 A loja está fechada no momento.',
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({super.key, required this.name, required this.count});

  final String name;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 28,
            decoration: BoxDecoration(
              color: AppTheme.brand,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              name.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              // Anton ships a single weight; asking for w700 would only invite a
              // synthetic bold that the web never renders.
              style: const TextStyle(
                fontFamily: 'Anton',
                fontSize: 24,
                height: 1.0,
                letterSpacing: 0.5,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.coal,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: SizedBox(
              height: 1,
              child: ColoredBox(color: AppTheme.border),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyMenu extends StatelessWidget {
  const _EmptyMenu();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 96),
      child: Column(
        children: [
          Text('🍔', style: TextStyle(fontSize: 48)),
          SizedBox(height: 16),
          Text(
            'Cardápio em breve!',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w500,
              color: AppTheme.textSecondary,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Volte mais tarde.',
            style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _CategoryRail extends SliverPersistentHeaderDelegate {
  const _CategoryRail({
    required this.categories,
    required this.activeCategoryIndex,
    required this.categoryScrollController,
    required this.chipKeys,
    required this.onCategoryTap,
  });

  final List<Category> categories;
  final int activeCategoryIndex;
  final ScrollController categoryScrollController;
  final Map<int, GlobalKey> chipKeys;
  final ValueChanged<int> onCategoryTap;

  @override
  double get minExtent => _railHeight;

  @override
  double get maxExtent => _railHeight;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      height: _railHeight,
      decoration: const BoxDecoration(
        color: AppTheme.coal,
        border: Border(bottom: BorderSide(color: AppTheme.brand, width: 2)),
      ),
      child: ListView.builder(
        controller: categoryScrollController,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: categories.length,
        itemBuilder: (context, i) {
          final cat = categories[i];
          final isActive = i == activeCategoryIndex;
          return GestureDetector(
            key: chipKeys[i],
            onTap: () => onCategoryTap(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isActive ? AppTheme.brand : AppTheme.coalSoft,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isActive ? AppTheme.brand : const Color(0xFF3A3230),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    categoryEmoji[artKeyFor(cat.slug, cat.name)]!,
                    style: const TextStyle(fontSize: 12),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    cat.name,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  bool shouldRebuild(_CategoryRail old) =>
      old.activeCategoryIndex != activeCategoryIndex ||
      old.categories != categories;
}

class _ChatFab extends StatelessWidget {
  const _ChatFab({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.coal, AppTheme.brandDark],
        ),
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 18,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: FloatingActionButton.extended(
        onPressed: onPressed,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
        highlightElevation: 0,
        icon: const Text('💬', style: TextStyle(fontSize: 20)),
        label: const Text(
          'Pedir pelo chat',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
