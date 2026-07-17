import 'package:barbacue/theme/app_theme.dart';
import 'package:flutter_test/flutter_test.dart';

// intl separates the symbol from the digits with a non-breaking space (U+00A0),
// and which space it picks has moved between intl versions. The grouping and
// decimal separators — not the whitespace — are what this test is pinning, so
// assertions compare against whitespace-normalised output.
String normalized(int cents) =>
    formatPrice(cents).replaceAll(RegExp(r'\s'), ' ');

void main() {
  group('formatPrice', () {
    test('formats a plain price with comma decimals', () {
      expect(normalized(1290), 'R\$ 12,90');
    });

    test('groups thousands with a dot, like pt-BR web', () {
      expect(normalized(123456), 'R\$ 1.234,56');
      expect(normalized(101500), 'R\$ 1.015,00');
    });

    test('always shows two decimal places', () {
      expect(normalized(0), 'R\$ 0,00');
      expect(normalized(500), 'R\$ 5,00');
    });
  });
}
