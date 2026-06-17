import 'package:json_annotation/json_annotation.dart';

part 'product.g.dart';

@JsonSerializable()
class Product {
  final int id;
  @JsonKey(name: 'externalId')
  final String externalId;
  @JsonKey(name: 'categoryId')
  final int categoryId;
  final String name;
  final String? description;
  @JsonKey(name: 'priceCents')
  final int priceCents;
  @JsonKey(name: 'imageUrl')
  final String? imageUrl;
  final bool available;
  @JsonKey(name: 'sortOrder')
  final int sortOrder;

  const Product({
    required this.id,
    required this.externalId,
    required this.categoryId,
    required this.name,
    this.description,
    required this.priceCents,
    this.imageUrl,
    required this.available,
    required this.sortOrder,
  });

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
