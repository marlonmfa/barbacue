import 'package:shared_preferences/shared_preferences.dart';

/// A changed disclosure requires a fresh choice before the next AI request.
class PrivacyConsent {
  static const version = '2026-09-08';
  static const key = 'barbacue-ai-consent';

  static Future<bool> hasAiConsent() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key) == version;
  }

  static Future<void> acceptAi() async {
    final prefs = await SharedPreferences.getInstance();
    if (!await prefs.setString(key, version)) {
      throw StateError('Não foi possível salvar sua escolha.');
    }
  }

  static Future<void> revokeAi() async {
    final prefs = await SharedPreferences.getInstance();
    if (!await prefs.remove(key)) {
      throw StateError('Não foi possível salvar sua escolha.');
    }
  }
}
