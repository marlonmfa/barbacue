/// A "seated" guest: which restaurant table this device is ordering from.
///
/// The table's database id is deliberately absent — it never leaves the server,
/// and the number is never trusted from here either: /api/orders re-resolves the
/// table from [token], so only the token can decide which table an order is for.
class TableSession {
  final int number;
  final String token;
  final String? label;

  const TableSession({
    required this.number,
    required this.token,
    this.label,
  });

  /// Returns null for anything that is not a well-formed session, rather than
  /// throwing: the two callers are persisted storage and a network body, and
  /// neither should be able to crash the app with a malformed blob.
  static TableSession? fromJson(Object? json) {
    if (json is! Map) return null;
    final number = json['number'];
    final token = json['token'];
    if (number is! int || token is! String) return null;
    final label = json['label'];
    return TableSession(
      number: number,
      token: token,
      label: label is String ? label : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'number': number,
        'token': token,
        'label': label,
      };
}
