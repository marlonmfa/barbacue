import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/table_session.dart';

const _kTableKey = 'barbacue_table';

/// How long a scan seats someone. The web equivalent is the table cookie's
/// 3h maxAge — a dining session, then it lapses. A cookie expires itself;
/// SharedPreferences does not, so the timestamp is stored alongside the session
/// and enforced on read. It is deliberately NOT refreshed on activity: the web
/// cookie is not re-issued on navigation either, so the 3h runs from the scan.
const _kMaxAge = Duration(hours: 3);

class TableNotifier extends Notifier<TableSession?> {
  bool _touched = false;

  @override
  TableSession? build() {
    _load();
    return null;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kTableKey);
    if (raw == null) return;

    final session = _decode(raw);
    if (session == null) {
      await prefs.remove(_kTableKey);
      return;
    }
    // A scan that landed while the read was in flight wins — hydrating over it
    // would seat the guest at the previous table.
    if (!_touched) state = session;
  }

  /// Expired or malformed both answer null; the caller drops the key either way.
  static TableSession? _decode(String raw) {
    try {
      final data = jsonDecode(raw);
      if (data is! Map) return null;
      final seatedAt = data['seatedAtEpochMs'];
      if (seatedAt is! int) return null;
      if (DateTime.now().millisecondsSinceEpoch - seatedAt >
          _kMaxAge.inMilliseconds) {
        return null;
      }
      return TableSession.fromJson(data['session']);
    } catch (_) {
      return null;
    }
  }

  Future<void> seat(TableSession session) async {
    _touched = true;
    state = session;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _kTableKey,
      jsonEncode({
        'session': session.toJson(),
        'seatedAtEpochMs': DateTime.now().millisecondsSinceEpoch,
      }),
    );
  }

  Future<void> leave() async {
    _touched = true;
    state = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kTableKey);
  }
}

final tableSessionProvider =
    NotifierProvider<TableNotifier, TableSession?>(TableNotifier.new);
