import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_brand.dart';
import '../providers/chat_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/checkout_provider.dart';
import '../providers/table_session_provider.dart';
import '../services/privacy_consent.dart';

class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  Future<void> _open(BuildContext context, String page) async {
    try {
      final opened = await launchUrl(
        currentBrand.legalUri(page),
        mode: LaunchMode.externalApplication,
      );
      if (opened) return;
    } catch (_) {
      // Keep the public address available if the device has no browser.
    }
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Acesse ${currentBrand.legalUri(page)}')),
      );
    }
  }

  Future<void> _eraseLocalData(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Apagar dados deste aparelho?'),
        content: const Text(
          'Remove carrinho, nome, telefone, endereço e preferências salvos neste app. '
          'Pedidos já enviados ao restaurante não são cancelados nem excluídos. '
          'Use Solicitar exclusão de dados para informações mantidas pelo estabelecimento.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Apagar dados'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(tableSessionProvider.notifier).leave();
      await ref.read(cartProvider.notifier).eraseLocalData();
      await ref.read(checkoutProvider.notifier).eraseLocalData();
      await PrivacyConsent.revokeAi();
      ref.read(chatProvider.notifier).reset();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Dados deste aparelho apagados.')),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível apagar todos os dados. Tente novamente.',
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Privacidade e ajuda')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          currentBrand.name,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 12),
        const Text(
          'Você pode consultar o cardápio sem criar uma conta. '
          'Conheça o uso dos seus dados e os canais de atendimento.',
        ),
        for (final entry in const {
          'privacy': 'Política de privacidade',
          'terms': 'Termos de uso',
          'consent': 'Consentimentos e preferências',
          'data-deletion': 'Solicitar exclusão de dados',
          'support': 'Suporte e contato',
        }.entries)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(entry.value),
            trailing: const Icon(Icons.open_in_new),
            onTap: () => _open(context, entry.key),
          ),
        const Divider(),
        const Text(
          'Não há conta de usuário neste app. Você pode apagar os dados salvos neste aparelho a qualquer momento.',
        ),
        TextButton.icon(
          onPressed: () => _eraseLocalData(context, ref),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Apagar dados deste aparelho'),
        ),
        if (currentBrand.hasAiChat) ...[
          const Divider(),
          const Text(
            'O atendimento com IA é opcional. Ao revogar, novas mensagens '
            'só serão enviadas à OpenAI depois de uma nova autorização. '
            'Você pode continuar pedindo pelo cardápio.',
          ),
          TextButton(
            onPressed: ref.watch(chatProvider).loading
                ? null
                : () async {
                    try {
                      await PrivacyConsent.revokeAi();
                      ref.read(chatProvider.notifier).reset();
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Consentimento de IA revogado.'),
                          ),
                        );
                      }
                    } catch (_) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Não foi possível salvar. Tente novamente.',
                            ),
                          ),
                        );
                      }
                    }
                  },
            child: const Text('Revogar consentimento de IA'),
          ),
        ],
      ],
    ),
  );
}
