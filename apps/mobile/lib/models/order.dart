import 'package:json_annotation/json_annotation.dart';

part 'order.g.dart';

@JsonSerializable()
class OrderItem {
  final int productId;
  final String name;
  final int priceCents;
  final int qty;

  const OrderItem({
    required this.productId,
    required this.name,
    required this.priceCents,
    required this.qty,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) =>
      _$OrderItemFromJson(json);

  Map<String, dynamic> toJson() => _$OrderItemToJson(this);
}

@JsonSerializable(includeIfNull: false)
class CreateOrderRequest {
  final String customerName;
  final String customerPhone;
  final String? deliveryAddress;
  final String? deliveryQuoteId;
  final String? brand;
  final List<OrderItem> items;
  final String? notes;

  /// The code only — the server re-reserves the coupon and recomputes the
  /// discount, so a client-supplied amount would be ignored anyway.
  final String? couponCode;

  /// pix | cash | card_on_delivery — mirrors the web payment options.
  final String paymentMethod;

  /// "Troco para" amount in cents (cash only).
  final int? changeForCents;

  /// "click" (UI) or "chat" (AI agent) — both equally valid.
  final String channel;

  /// delivery | dine_in. Only a hint: a valid [tableToken] promotes the order to
  /// dine_in server-side whatever this says.
  final String orderType;

  /// The seated table's opaque token. The table *number* is deliberately not
  /// part of this payload — the server re-resolves it from the token, so a
  /// forged client cannot file its order against someone else's table.
  final String? tableToken;

  const CreateOrderRequest({
    required this.customerName,
    required this.customerPhone,
    this.deliveryAddress,
    this.deliveryQuoteId,
    this.brand,
    required this.items,
    this.notes,
    this.couponCode,
    this.paymentMethod = 'pix',
    this.changeForCents,
    this.channel = 'click',
    this.orderType = 'delivery',
    this.tableToken,
  });

  factory CreateOrderRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateOrderRequestFromJson(json);

  Map<String, dynamic> toJson() => _$CreateOrderRequestToJson(this);
}

/// Pix "copia e cola" payload returned by the API for pix orders.
@JsonSerializable()
class PixInfo {
  final String payload;

  const PixInfo({required this.payload});

  factory PixInfo.fromJson(Map<String, dynamic> json) =>
      _$PixInfoFromJson(json);

  Map<String, dynamic> toJson() => _$PixInfoToJson(this);
}

@JsonSerializable(createToJson: false)
class OrderResponse {
  final String orderId;
  @JsonKey(defaultValue: 'pix')
  final String paymentMethod;

  /// delivery | dine_in — the server's verdict, which can differ from what the
  /// client asked for: a valid table token promotes the order to dine_in. Only
  /// this value may drive the confirmation copy.
  @JsonKey(defaultValue: 'delivery')
  final String orderType;
  final int? tableNumber;
  @JsonKey(defaultValue: 0)
  final int totalCents;
  @JsonKey(defaultValue: 0)
  final int deliveryFeeCents;
  final int? deliveryDistanceMeters;
  final int? deliveryDurationSeconds;
  final PixInfo? pix;

  const OrderResponse({
    required this.orderId,
    this.paymentMethod = 'pix',
    this.orderType = 'delivery',
    this.tableNumber,
    this.totalCents = 0,
    this.deliveryFeeCents = 0,
    this.deliveryDistanceMeters,
    this.deliveryDurationSeconds,
    this.pix,
  });

  factory OrderResponse.fromJson(Map<String, dynamic> json) =>
      _$OrderResponseFromJson(json);
}
