import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/instagram_post.dart';
import '../models/product.dart';
import '../models/store_settings.dart';
import '../services/api_service.dart';

final menuProvider = FutureProvider<List<Category>>((ref) async {
  return ApiService.fetchMenu();
});

final storeStatusProvider = FutureProvider<StoreStatus>((ref) async {
  return ApiService.fetchStoreStatus();
});

final settingsProvider = FutureProvider<StoreSettings>((ref) async {
  return ApiService.fetchSettings();
});

final instagramProvider = FutureProvider<List<InstagramPost>>((ref) async {
  return ApiService.fetchInstagramPosts();
});
