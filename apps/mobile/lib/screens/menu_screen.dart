import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/product.dart';
import '../providers/menu_provider.dart';
import '../widgets/product_card.dart';
import '../widgets/cart_bar.dart';
import '../theme/app_theme.dart';

class MenuScreen extends ConsumerStatefulWidget {
  const MenuScreen({super.key});

  @override
  ConsumerState<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends ConsumerState<MenuScreen> {
  final _scrollController = ScrollController();
  final _categoryScrollController = ScrollController();
  int _activeCategoryIndex = 0;
  final Map<int, GlobalKey> _sectionKeys = {};

  @override
  void dispose() {
    _scrollController.dispose();
    _categoryScrollController.dispose();
    super.dispose();
  }

  void _scrollToCategory(int index, List<Category> categories) {
    setState(() => _activeCategoryIndex = index);
    final key = _sectionKeys[index];
    if (key?.currentContext != null) {
      Scrollable.ensureVisible(
        key!.currentContext!,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
        alignmentPolicy: ScrollPositionAlignmentPolicy.explicit,
        alignment: 0.0,
      );
    }
    // Scroll category nav to keep selected tab visible
    _categoryScrollController.animateTo(
      (index * 110.0).clamp(0, double.infinity),
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final menuAsync = ref.watch(menuProvider);

    return Scaffold(
      body: menuAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.amber),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.wifi_off, size: 64, color: AppTheme.textSecondary),
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
          for (var i = 0; i < categories.length; i++) {
            _sectionKeys.putIfAbsent(i, () => GlobalKey());
          }
          final populated =
              categories.where((c) => c.products.isNotEmpty).toList();

          return CustomScrollView(
            controller: _scrollController,
            slivers: [
              _AppBarSliver(
                categories: populated,
                activeCategoryIndex: _activeCategoryIndex,
                categoryScrollController: _categoryScrollController,
                onCategoryTap: (i) => _scrollToCategory(i, populated),
              ),
              for (var i = 0; i < populated.length; i++) ...[
                SliverToBoxAdapter(
                  key: _sectionKeys[i],
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
                    child: Text(
                      populated[i].name,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
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
                      // Fixed card height (image 140 + 2-line name + 2-line desc +
                      // price row) — independent of cell width so narrower phones
                      // don't clip the content (childAspectRatio overflowed by 13px).
                      mainAxisExtent: 292,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, idx) => ProductCard(
                        product: populated[i].products[idx],
                      ),
                      childCount: populated[i].products.length,
                    ),
                  ),
                ),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 120)),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/chat'),
        backgroundColor: AppTheme.amberDark,
        icon: const Text('💬', style: TextStyle(fontSize: 18)),
        label: const Text('Pedir pelo chat',
            style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      bottomSheet: const CartBar(),
    );
  }
}

class _AppBarSliver extends StatelessWidget {
  const _AppBarSliver({
    required this.categories,
    required this.activeCategoryIndex,
    required this.categoryScrollController,
    required this.onCategoryTap,
  });

  final List<Category> categories;
  final int activeCategoryIndex;
  final ScrollController categoryScrollController;
  final ValueChanged<int> onCategoryTap;

  @override
  Widget build(BuildContext context) {
    return SliverAppBar(
      pinned: true,
      backgroundColor: AppTheme.amber,
      expandedHeight: 120,
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          color: AppTheme.amber,
          alignment: Alignment.bottomLeft,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 60),
          child: const Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '🍔 Lanches do Barba',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'Artesanais feitos com amor',
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Container(
          color: AppTheme.amberDark,
          height: 48,
          child: ListView.builder(
            controller: categoryScrollController,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            itemCount: categories.length,
            itemBuilder: (context, i) {
              final isActive = i == activeCategoryIndex;
              return GestureDetector(
                onTap: () => onCategoryTap(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.only(right: 8),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                  decoration: BoxDecoration(
                    color:
                        isActive ? Colors.white : Colors.white24,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    categories[i].name,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isActive
                          ? AppTheme.amberDark
                          : Colors.white,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
