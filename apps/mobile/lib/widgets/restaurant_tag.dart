import 'package:flutter/material.dart';
import '../config/app_brand.dart';

/// Etiqueta do restaurante de um item no carrinho único. Bebidas e itens
/// comuns aos três restaurantes não recebem etiqueta.
class RestaurantTag extends StatelessWidget {
  const RestaurantTag({super.key, required this.brand, required this.label});

  final String brand;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color = brandBySlug(brand)?.primary ?? Colors.black54;
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: .6,
        ),
      ),
    );
  }
}
