import 'package:flutter/material.dart';
import '../screens/privacy_screen.dart';

class PrivacyButton extends StatelessWidget {
  const PrivacyButton({super.key});

  @override
  Widget build(BuildContext context) => TextButton.icon(
    icon: const Icon(Icons.privacy_tip_outlined, size: 18),
    label: const Text('Privacidade e ajuda'),
    onPressed: () => Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const PrivacyScreen())),
  );
}
