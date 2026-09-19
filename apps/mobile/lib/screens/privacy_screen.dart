import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_brand.dart';
import '../providers/chat_provider.dart';
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
        if (currentBrand.hasNativeCheckout) ...[
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
