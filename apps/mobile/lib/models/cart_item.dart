class CartItem {
  final int productId;
  final String name;
  final int priceCents;
  final String? imageUrl;
  int qty;

  CartItem({
    required this.productId,
    required this.name,
    required this.priceCents,
    this.imageUrl,
    this.qty = 1,
  });

  CartItem copyWith({int? qty}) => CartItem(
        productId: productId,
        name: name,
        priceCents: priceCents,
        imageUrl: imageUrl,
        qty: qty ?? this.qty,
      );

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'name': name,
        'priceCents': priceCents,
        'imageUrl': imageUrl,
        'qty': qty,
      };

  factory CartItem.fromJson(Map<String, dynamic> json) => CartItem(
        productId: json['productId'] as int,
        name: json['name'] as String,
        priceCents: json['priceCents'] as int,
        imageUrl: json['imageUrl'] as String?,
        qty: json['qty'] as int,
      );
}
