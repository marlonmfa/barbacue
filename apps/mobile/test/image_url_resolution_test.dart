// Unit tests for ApiService.resolveImageUrls — the relative→absolute image URL
// fix so the app renders the backfilled product photos (root-relative paths)
// as well as the legacy anota.ai CDN photos (already absolute).

import 'package:flutter_test/flutter_test.dart';
import 'package:barbacue/services/api_service.dart';

void main() {
  const base = 'https://barbacue.hirableaiagents.com';

  test('rewrites root-relative product paths to absolute', () {
    final data = [
      {
        'products': [
          {'imageUrl': '/generated/products/92.jpg'},
          {'imageUrl': '/generated/products/189.png'},
        ],
      },
    ];
    ApiService.resolveImageUrls(data, base);
    final products = data[0]['products'] as List;
    expect(products[0]['imageUrl'], '$base/generated/products/92.jpg');
    expect(products[1]['imageUrl'], '$base/generated/products/189.png');
  });

  test('leaves absolute anota.ai URLs untouched', () {
    final data = [
      {
        'products': [
          {'imageUrl': 'https://client-assets.anota.ai/produtos/abc.jpg'},
        ],
      },
    ];
    ApiService.resolveImageUrls(data, base);
    expect((data[0]['products'] as List)[0]['imageUrl'],
        'https://client-assets.anota.ai/produtos/abc.jpg');
  });

  test('leaves null image URLs untouched (falls back to emoji in UI)', () {
    final data = [
      {
        'products': [
          {'imageUrl': null},
          {'name': 'no image key at all'},
        ],
      },
    ];
    ApiService.resolveImageUrls(data, base);
    final products = data[0]['products'] as List;
    expect(products[0]['imageUrl'], isNull);
    expect(products[1].containsKey('imageUrl'), isFalse);
  });

  test('tolerates categories with no products list', () {
    final data = [
      {'name': 'empty category'},
      {'products': null},
    ];
    // Must not throw.
    ApiService.resolveImageUrls(data, base);
    expect(data.length, 2);
  });
}
