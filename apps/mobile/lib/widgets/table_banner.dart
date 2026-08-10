import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/table_session_provider.dart';
import '../theme/app_theme.dart';

/// The seated bar: "you are at Mesa N", plus the way back out to delivery.
/// Renders nothing when nobody is seated — its appearance IS the confirmation
/// that a table QR worked.
class TableBanner extends ConsumerWidget {
  const TableBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final table = ref.watch(tableSessionProvider);
    if (table == null) return const SizedBox.shrink();

    final label = table.label;

    return Container(
      // Full-bleed with hairlines top and bottom — an inset card would read as
      // one more piece of content rather than a mode the whole menu is in.
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.brand.withValues(alpha: 0.15),
        border: Border.symmetric(
          horizontal: BorderSide(color: AppTheme.brand.withValues(alpha: 0.4)),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        spacing: 12,
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
                children: [
                  const TextSpan(text: '🍽️ Você está na '),
                  TextSpan(
                    text: 'Mesa ${table.number}',
                    style: const TextStyle(color: AppTheme.brand),
                  ),
                  if (label != null && label.isNotEmpty)
                    TextSpan(text: ' · $label'),
                  const TextSpan(text: ' — peça direto da mesa!'),
                ],
              ),
            ),
          ),
          TextButton(
            onPressed: () => _confirmLeave(context, ref),
            style: TextButton.styleFrom(
              foregroundColor: AppTheme.textSecondary,
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'Sair da mesa',
              style: TextStyle(
                fontSize: 12,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Guarded: on the web a mis-tap costs one glance at the QR still sitting on
  /// the table, but here it costs re-opening the camera on a printed code.
  Future<void> _confirmLeave(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sair da mesa?'),
        content: const Text(
          'Seu pedido continuará, mas voltará para modo entrega.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sair'),
          ),
        ],
      ),
    );
    // The cart deliberately survives: leaving the table changes how the order
    // is delivered, not what was ordered.
    if (confirmed ?? false) ref.read(tableSessionProvider.notifier).leave();
  }
}
