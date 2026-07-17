import 'package:flutter/material.dart';

/// A pill on a brand-red AppBar — "👤 Ana" on the cart, "🍽️ Mesa 4" on both the
/// cart and payment headers. White on a black wash rather than an AppTheme fill:
/// the bar under it is already brand red.
class HeaderChip extends StatelessWidget {
  const HeaderChip({super.key, required this.label, this.emphasis = false});

  final String label;

  /// The table chip outranks the customer chip when a guest is seated, and is
  /// weighted to say so.
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: emphasis ? 0.25 : 0.2),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          color: Colors.white,
          fontWeight: emphasis ? FontWeight.w600 : null,
        ),
      ),
    );
  }
}
