import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/product.dart';
import '../services/api_service.dart';

final menuProvider = FutureProvider<List<Category>>((ref) async {
  return ApiService.fetchMenu();
});
