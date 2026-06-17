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
  final List<OrderItem> items;
  final String? notes;

  /// pix | cash | card_on_delivery — mirrors the web payment options.
  final String paymentMethod;

  /// "Troco para" amount in cents (cash only).
  final int? changeForCents;

  /// "click" (UI) or "chat" (AI agent) — both equally valid.
  final String channel;

  const CreateOrderRequest({
    required this.customerName,
    required this.customerPhone,
    this.deliveryAddress,
    required this.items,
    this.notes,
    this.paymentMethod = 'pix',
    this.changeForCents,
    this.channel = 'click',
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
  @JsonKey(defaultValue: 0)
  final int totalCents;
  final PixInfo? pix;

  const OrderResponse({
    required this.orderId,
    this.paymentMethod = 'pix',
    this.totalCents = 0,
    this.pix,
  });

  factory OrderResponse.fromJson(Map<String, dynamic> json) =>
      _$OrderResponseFromJson(json);
}
