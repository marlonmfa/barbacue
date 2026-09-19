import 'package:json_annotation/json_annotation.dart';

part 'product.g.dart';

@JsonSerializable()
class Product {
  final int id;
  // Nullable: products created in the admin panel have no anota.ai external id.
  @JsonKey(name: 'externalId')
  final String? externalId;
  @JsonKey(name: 'categoryId')
  final int categoryId;
  final String name;
  final String? description;
  @JsonKey(name: 'priceCents')
  final int priceCents;
  // Promotional pricing (mirrors the web). Effective price = promo when active.
  @JsonKey(name: 'promoPriceCents')
  final int? promoPriceCents;
  @JsonKey(name: 'promoStartsAt')
  final String? promoStartsAt;
  @JsonKey(name: 'promoEndsAt')
  final String? promoEndsAt;
  @JsonKey(name: 'imageUrl')
  final String? imageUrl;
  final bool available;
  @JsonKey(name: 'sortOrder')
  final int sortOrder;
  @JsonKey(name: 'ifoodUrl')
  final String? ifoodUrl;

  const Product({
    required this.id,
    this.externalId,
    required this.categoryId,
    required this.name,
    this.description,
    required this.priceCents,
    this.promoPriceCents,
    this.promoStartsAt,
    this.promoEndsAt,
    this.imageUrl,
    required this.available,
    required this.sortOrder,
    this.ifoodUrl,
  });

  /// True when a discount is active right now (within the optional window).
  bool get onSale {
    final promo = promoPriceCents;
    if (promo == null || promo >= priceCents) return false;
    final now = DateTime.now();
    final start = promoStartsAt != null
        ? DateTime.tryParse(promoStartsAt!)
        : null;
    final end = promoEndsAt != null ? DateTime.tryParse(promoEndsAt!) : null;
    if (start != null && now.isBefore(start)) return false;
    if (end != null && now.isAfter(end)) return false;
    return true;
  }

  /// The price the customer actually pays right now.
  int get effectivePriceCents => onSale ? promoPriceCents! : priceCents;

  factory Product.fromJson(Map<String, dynamic> json) =>
      _$ProductFromJson(json);

  Map<String, dynamic> toJson() => _$ProductToJson(this);
}

@JsonSerializable()
class Category {
  final int id;
  final String name;
  final String slug;
  @JsonKey(name: 'sortOrder')
  final int sortOrder;
  final List<Product> products;

  const Category({
    required this.id,
    required this.name,
    required this.slug,
    required this.sortOrder,
    required this.products,
  });

  factory Category.fromJson(Map<String, dynamic> json) =>
      _$CategoryFromJson(json);

  Map<String, dynamic> toJson() => _$CategoryToJson(this);
}
