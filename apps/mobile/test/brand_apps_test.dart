import 'package:barbacue/config/app_brand.dart';
import 'package:barbacue/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() {
    configureBrand(AppBrand.barbacue);
    ApiService.client = http.Client();
  });

  test('the three store apps have independent product identities', () {
    final apps = brandConfigs.values.toList();
    expect(apps.map((app) => app.bundleId).toSet(), hasLength(3));
    expect(apps.map((app) => app.domain).toSet(), hasLength(3));
    expect(apps.map((app) => app.name).toSet(), hasLength(3));
    expect(brandConfigs[AppBrand.barbacue]!.hasNativeCheckout, isTrue);
    expect(brandConfigs[AppBrand.chelas]!.hasNativeCheckout, isFalse);
    expect(brandConfigs[AppBrand.barbadog]!.hasNativeCheckout, isFalse);
  });

  test(
    'Chelas keeps the complete scraped menu when the API is offline',
    () async {
      configureBrand(AppBrand.chelas);
      ApiService.client = MockClient((_) async => http.Response('', 503));

      final menu = await ApiService.fetchMenu();
      expect(menu, hasLength(9));
      expect(menu.expand((category) => category.products), hasLength(66));
      expect(
        menu
            .expand((category) => category.products)
            .every((p) => p.ifoodUrl != null),
        isTrue,
      );
    },
  );

  test(
    'Barbadog keeps the complete scraped menu when the API is offline',
    () async {
      configureBrand(AppBrand.barbadog);
      ApiService.client = MockClient((_) async => http.Response('', 503));

      final menu = await ApiService.fetchMenu();
      expect(menu, hasLength(10));
      expect(menu.expand((category) => category.products), hasLength(71));
      expect(
        menu
            .expand((category) => category.products)
            .every((p) => p.ifoodUrl != null),
        isTrue,
      );
    },
  );

}
