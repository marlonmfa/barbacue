import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/app_brand.dart';
import 'router.dart';
import 'theme/app_theme.dart';

void runBrandApp(AppBrand brand) {
  configureBrand(brand);
  runApp(const ProviderScope(child: RestaurantApp()));
}

class RestaurantApp extends StatelessWidget {
  const RestaurantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: currentBrand.name,
      theme: AppTheme.forBrand(currentBrand),
      routerConfig: createRouter(currentBrand),
      debugShowCheckedModeBanner: false,
    );
  }
}
