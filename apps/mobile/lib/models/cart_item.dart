import '../config/app_brand.dart';
import 'product.dart';

class CartItem {
  final int productId;
  final String name;
  final int priceCents;
  final String? imageUrl;

  /// Restaurante do produto (barbacue, chelas ou barbadog). O carrinho é único
  /// para os três apps e o ID do produto só é único dentro da marca.
  final String brand;

  /// Bebidas e itens comuns aos três restaurantes não recebem etiqueta.
  final bool shared;
  int qty;

  CartItem({
    required this.productId,
    required this.name,
    required this.priceCents,
    this.imageUrl,
    String? brand,
    this.shared = false,
    this.qty = 1,
  }) : brand = brand ?? currentBrand.slug;

  /// Identidade da linha no carrinho.
  String get key => cartKey(brand, productId);

  /// Nome curto do restaurante, ou null para itens comuns.
  String? get restaurant => shared ? null : brandBySlug(brand)?.shortName;

  CartItem copyWith({int? qty}) => CartItem(
        productId: productId,
        name: name,
        priceCents: priceCents,
        imageUrl: imageUrl,
        brand: brand,
        shared: shared,
        qty: qty ?? this.qty,
      );

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'name': name,
        'priceCents': priceCents,
        'imageUrl': imageUrl,
        'brand': brand,
        'shared': shared,
        'qty': qty,
      };

  factory CartItem.fromJson(Map<String, dynamic> json) => CartItem(
        productId: json['productId'] as int,
        name: json['name'] as String,
        priceCents: json['priceCents'] as int,
        imageUrl: json['imageUrl'] as String?,
        // Carrinhos salvos antes do carrinho único pertencem à marca do app.
        brand: json['brand'] as String?,
        shared: json['shared'] as bool? ?? false,
        qty: json['qty'] as int,
      );
}

String cartKey(String brand, int productId) => '$brand:$productId';

/// Chave do carrinho para um produto do cardápio.
String productCartKey(Product product) =>
    cartKey(product.brand ?? currentBrand.slug, product.id);
