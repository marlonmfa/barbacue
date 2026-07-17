/// Public store profile (hero + footer). Mirrors GET /api/settings, which
/// deliberately omits the pix credentials and the open/closed state that live on
/// the same row — /api/store-status owns status.
class StoreSettings {
  final String storeName;
  final String tagline;
  final String instagramUrl;
  final String? phone;
  final String? whatsapp;
  final String? address;
  final String? openingHours;
  final String? deliveryFeeText;

  const StoreSettings({
    required this.storeName,
    required this.tagline,
    required this.instagramUrl,
    this.phone,
    this.whatsapp,
    this.address,
    this.openingHours,
    this.deliveryFeeText,
  });

  // Defaults match the web home page's, so a missing settings row renders the
  // same store identity on both clients. The live row sets all three.
  factory StoreSettings.fromJson(Map<String, dynamic> json) {
    String? str(String key) => json[key]?.toString();

    return StoreSettings(
      storeName: str('storeName') ?? 'Barbacue',
      tagline: str('tagline') ?? 'Burguers na brasa 🔥',
      instagramUrl:
          str('instagramUrl') ??
          'https://www.instagram.com/barbacue.burguersnabrasa/',
      phone: str('phone'),
      whatsapp: str('whatsapp'),
      address: str('address'),
      openingHours: str('openingHours'),
      deliveryFeeText: str('deliveryFeeText'),
    );
  }

  /// wa.me link for the configured WhatsApp number, or null when unset — the
  /// number is stored formatted, and wa.me only accepts digits.
  String? get waHref {
    final w = whatsapp;
    if (w == null || w.isEmpty) return null;
    return 'https://wa.me/${w.replaceAll(RegExp(r'\D'), '')}';
  }
}
