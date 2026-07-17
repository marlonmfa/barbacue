/// A coupon validated by POST /api/coupons. Mirrors that route's 200 body.
///
/// [discountCents] is a PREVIEW computed against the subtotal that was sent.
/// /api/orders re-reserves the coupon in a transaction and recomputes the
/// discount authoritatively at submit, so this value is only ever used to
/// render the cart — never to decide what the customer is charged.
class CouponResult {
  final int id;
  final String code;
  final String? description;

  /// flat | percentage
  final String discountType;
  final int discountValue;
  final int discountCents;

  const CouponResult({
    required this.id,
    required this.code,
    this.description,
    required this.discountType,
    required this.discountValue,
    required this.discountCents,
  });

  factory CouponResult.fromJson(Map<String, dynamic> json) {
    int intOf(String key) => (json[key] as num).toInt();

    return CouponResult(
      id: intOf('id'),
      code: json['code'] as String,
      description: json['description'] as String?,
      discountType: json['discountType'] as String,
      discountValue: intOf('discountValue'),
      discountCents: intOf('discountCents'),
    );
  }
}
