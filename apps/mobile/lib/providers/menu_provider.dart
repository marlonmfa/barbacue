import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_brand.dart';
import '../models/instagram_post.dart';
import '../models/product.dart';
import '../models/store_settings.dart';
import '../services/api_service.dart';

/// Cardápio de cada restaurante; os três apps mostram os três.
final brandMenuProvider = FutureProvider.family<List<Category>, AppBrand>((
  ref,
  brand,
) async {
  return ApiService.fetchMenu(brand: brand);
});

/// Restaurante aberto no seletor. Cada app começa no próprio restaurante.
final selectedBrandProvider = StateProvider<AppBrand>(
  (ref) => currentBrand.brand,
);

final storeStatusProvider = FutureProvider<StoreStatus>((ref) async {
  return ApiService.fetchStoreStatus();
});

final settingsProvider = FutureProvider<StoreSettings>((ref) async {
  return ApiService.fetchSettings();
});

final instagramProvider = FutureProvider<List<InstagramPost>>((ref) async {
  return ApiService.fetchInstagramPosts();
});
