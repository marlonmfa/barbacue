import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cart_item.dart';

const _kCartKey = 'barbacue-cart';

class CartNotifier extends Notifier<List<CartItem>> {
  @override
  List<CartItem> build() {
    _loadFromStorage();
    return [];
  }

  Future<void> _loadFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kCartKey);
    if (raw == null) return;
    try {
      final List<dynamic> data = jsonDecode(raw);
      state = data.map((e) => CartItem.fromJson(e)).toList();
    } catch (_) {
      // corrupted storage — start fresh
    }
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _kCartKey,
      jsonEncode(state.map((e) => e.toJson()).toList()),
    );
  }

  void add(CartItem item) {
    final idx = state.indexWhere((e) => e.productId == item.productId);
    if (idx >= 0) {
      final updated = List<CartItem>.from(state);
      updated[idx] = updated[idx].copyWith(qty: updated[idx].qty + 1);
      state = updated;
    } else {
      state = [...state, item];
    }
    _persist();
  }

  void remove(int productId) {
    state = state.where((e) => e.productId != productId).toList();
    _persist();
  }

  void setQty(int productId, int qty) {
    if (qty <= 0) {
      remove(productId);
      return;
    }
    final updated = state.map((e) {
      return e.productId == productId ? e.copyWith(qty: qty) : e;
    }).toList();
    state = updated;
    _persist();
  }

  /// Replace the whole cart — used by the AI agent to sync its resulting cart.
  void replace(List<CartItem> items) {
    state = items;
    _persist();
  }

  void clear() {
    state = [];
    _persist();
  }

  int get totalCents => state.fold(0, (sum, e) => sum + e.priceCents * e.qty);

  int get totalItems => state.fold(0, (sum, e) => sum + e.qty);
}

final cartProvider = NotifierProvider<CartNotifier, List<CartItem>>(
  CartNotifier.new,
);

// Derived selectors (avoids recomputing in UI)
final cartTotalCentsProvider = Provider<int>((ref) {
  final items = ref.watch(cartProvider);
  return items.fold(0, (sum, e) => sum + e.priceCents * e.qty);
});

final cartTotalItemsProvider = Provider<int>((ref) {
  final items = ref.watch(cartProvider);
  return items.fold(0, (sum, e) => sum + e.qty);
});

final itemQtyProvider = Provider.family<int, int>((ref, productId) {
  final items = ref.watch(cartProvider);
  final found = items.where((e) => e.productId == productId);
  return found.isEmpty ? 0 : found.first.qty;
});
