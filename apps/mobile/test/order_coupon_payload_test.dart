// CreateOrderRequest had no couponCode at all, so a validated discount was
// dropped at submit and the customer was charged full price. These pin the
// field to the wire format /api/orders parses.

import 'package:flutter_test/flutter_test.dart';
import 'package:barbacue/models/order.dart';

void main() {
  CreateOrderRequest request({String? couponCode}) => CreateOrderRequest(
        customerName: 'Marlon',
        customerPhone: '47999999999',
        deliveryAddress: 'Rua A, 100',
        couponCode: couponCode,
        items: const [
          OrderItem(productId: 1, name: 'X-Salada', priceCents: 2500, qty: 2),
        ],
      );

  test('an applied coupon code reaches the order payload', () {
    expect(request(couponCode: 'BARBA10').toJson()['couponCode'], 'BARBA10');
  });

  test('no coupon omits the key entirely rather than sending null', () {
    // The route declares couponCode as `.optional()`, not `.nullable()`, so an
    // explicit null would fail Zod parsing where an absent key passes.
    expect(request().toJson().containsKey('couponCode'), isFalse);
  });
}
