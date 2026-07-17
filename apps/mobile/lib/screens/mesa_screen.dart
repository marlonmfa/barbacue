import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/table_session_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

/// Where a printed table QR lands. The phone's own camera opens
/// `https://<host>/mesa/<token>`, which universal links / app links route here;
/// this resolves the token, seats the guest and hands them the menu in dine-in
/// mode. go_router has no side-effect-only route, so the work happens behind a
/// spinner that is only ever seen for the length of one request.
class MesaScreen extends ConsumerStatefulWidget {
  const MesaScreen({super.key, required this.token});

  final String token;

  @override
  ConsumerState<MesaScreen> createState() => _MesaScreenState();
}

class _MesaScreenState extends ConsumerState<MesaScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    setState(() => _error = null);
    try {
      final session = await ApiService.resolveTable(widget.token);
      if (session == null) {
        if (mounted) setState(() => _error = _invalidQr);
        return;
      }
      await ref.read(tableSessionProvider.notifier).seat(session);
      if (mounted) context.go('/');
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceAll('Exception: ', ''));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;

    return Scaffold(
      appBar: AppBar(title: const Text('Mesa')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: error == null
              ? const CircularProgressIndicator(color: AppTheme.brand)
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      error,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _resolve,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 24, vertical: 10),
                        minimumSize: Size.zero,
                        shape: const StadiumBorder(),
                      ),
                      child: const Text(
                        'Tentar novamente',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => context.go('/'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppTheme.textSecondary,
                      ),
                      child: const Text('Ver cardápio'),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

const _invalidQr =
    '⚠️ QR Code inválido ou mesa desativada. Chame um atendente ou peça para entrega.';
