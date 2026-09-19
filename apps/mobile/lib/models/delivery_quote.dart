/// Short-lived delivery estimate kept in memory only. The order API revalidates
/// the quote ID; none of these amounts are submitted as authoritative prices.
class DeliveryQuote {
  final String quoteId;
  final String address;
  final String requestedAddress;
  final String brand;
  final int distanceMeters;
  final int durationSeconds;
  final int feeCents;
  final DateTime expiresAt;
  final String provider;

  const DeliveryQuote({
    required this.quoteId,
    required this.address,
    required this.requestedAddress,
    required this.brand,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.feeCents,
    required this.expiresAt,
    required this.provider,
  });

  factory DeliveryQuote.fromJson(
    Map<String, dynamic> json, {
    required String requestedAddress,
    required String brand,
  }) {
    final expires = DateTime.tryParse(json['expiresAt']?.toString() ?? '');
    if (json['quoteId'] is! String ||
        (json['quoteId'] as String).isEmpty ||
        json['address'] is! String ||
        expires == null ||
        !expires.isAfter(DateTime.now()) ||
        json['provider'] != 'osm' ||
        ![
          'feeCents',
          'distanceMeters',
          'durationSeconds',
        ].every((key) => json[key] is int && (json[key] as int) >= 0)) {
      throw const FormatException(
        'Não foi possível confirmar o valor do frete. Calcule novamente.',
      );
    }
    return DeliveryQuote(
      quoteId: json['quoteId'] as String,
      address: json['address'] as String,
      requestedAddress: requestedAddress.trim(),
      brand: brand,
      distanceMeters: json['distanceMeters'] as int,
      durationSeconds: json['durationSeconds'] as int,
      feeCents: json['feeCents'] as int,
      expiresAt: expires,
      provider: json['provider'] as String,
    );
  }

  bool isValidFor(String destination, String currentBrand, {DateTime? now}) =>
      destination.trim() == requestedAddress &&
      currentBrand == brand &&
      expiresAt.isAfter(now ?? DateTime.now());
}

/// Preserves delivery error codes without exposing provider payloads or keys.
class DeliveryApiException implements Exception {
  final String message;
  final String? code;
  const DeliveryApiException(this.message, {this.code});
  @override
  String toString() => message;
}
