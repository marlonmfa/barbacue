import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'cog_login.dart';

typedef Json = Map<String, dynamic>;

class ManagementException implements Exception {
  const ManagementException(this.message, {this.status = 0});
  final String message;
  final int status;
  @override
  String toString() => message;
}

class StaffSession {
  StaffSession(Json data)
    : name = data['name']?.toString() ?? 'Equipe',
      authSource = data['authSource'] == 'cog' ? 'cog' : 'native',
      role = data['role']?.toString() ?? 'employee',
      mustChangePassword = data['mustChangePassword'] == true,
      permissions =
          (data['permissions'] as List? ??
                  defaultPermissions[data['role']] ??
                  [])
              .cast<String>();
  static const defaultPermissions = <String, List<String>>{
    'manager': [
      'dashboard',
      'orders',
      'ifood',
      'kitchen',
      'floor',
      'deliveries',
      'catalog',
      'offers',
      'tables',
      'customers',
      'settings',
      'service',
      'beta',
    ],
    'cashier': ['orders', 'ifood', 'tables'],
    'kitchen': ['kitchen'],
    'waiter': ['floor'],
    'driver': ['deliveries'],
  };
  final String name;
  final String authSource;
  final String role;
  final bool mustChangePassword;
  final List<String> permissions;
  bool can(String permission) =>
      role == 'admin' || permissions.contains(permission);
}

/// An isolated staff session. Credentials and cookies stay in memory and are
/// never shared with the customer apps, preferences, URLs or logs.
class ManagementApi {
  ManagementApi({http.Client? client, Uri? origin, CogLogin? cogLogin})
    : _client = client ?? http.Client(),
      _cogLogin =
          cogLogin ??
          ((Platform.isAndroid || Platform.isIOS) ? CogLogin() : null),
      origin =
          origin ??
          Uri.parse(
            const String.fromEnvironment(
              'MANAGEMENT_API_URL',
              defaultValue: 'https://barbacue.cog.ia.br',
            ),
          ) {
    if (this.origin.scheme != 'https' ||
        this.origin.host.isEmpty ||
        this.origin.userInfo.isNotEmpty ||
        this.origin.hasQuery ||
        this.origin.hasFragment ||
        (this.origin.path != '' && this.origin.path != '/')) {
      throw ArgumentError('A gestão exige uma origem HTTPS válida.');
    }
  }

  final http.Client _client;
  final Uri origin;
  String? _cookie;
  final CogLogin? _cogLogin;
  CogGrant? _cogGrant;
  String? _view;
  int _generation = 0;
  bool get supportsCog =>
      _cogLogin != null &&
      const {
        'https://barbacue.cog.ia.br',
        'https://chelas.hirableaiagents.com',
        'https://barbadog.hirableaiagents.com',
      }.contains(origin.origin);
  bool get usingCog => _cogGrant != null;

  /// Native cookies stay private and unchanged while an existing Cog account is selected.
  Future<StaffSession?> restoreCogOrNative() async {
    if (!supportsCog) return null;
    final generation = _generation;
    final grant = await _cogLogin!.signIn();
    if (generation != _generation) return null;
    _cogGrant = grant;
    try {
      final current = await session();
      if (generation != _generation) return null;
      return current;
    } on ManagementException catch (error) {
      if (generation == _generation) _cogGrant = null;
      if (error.status == 401) return null;
      rethrow;
    }
  }

  Future<dynamic> request(String method, String path, [Json? body]) async {
    if (!path.startsWith('/api/admin/') ||
        path.contains('..') ||
        path.contains('?')) {
      throw ArgumentError('Rota administrativa inválida.');
    }
    final generation = _generation;
    final cog =
        supportsCog &&
            _cogGrant != null &&
            _cogGrant!.expires.isAfter(DateTime.now())
        ? _cogGrant
        : null;
    final request = http.Request(method, origin.resolve(path))
      ..followRedirects = false
      ..headers['Accept'] = 'application/json';
    if (_cookie != null) request.headers['Cookie'] = _cookie!;
    if (cog != null) request.headers['X-Barbacue-Cog'] = cog.token;
    if (!['GET', 'HEAD'].contains(method) && _view != null) {
      request.headers['X-Cog-View'] = _view!;
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    try {
      final response = await http.Response.fromStream(
        await _client.send(request),
      ).timeout(const Duration(seconds: 25));
      if (generation != _generation) {
        throw const ManagementException('A sessão foi encerrada.', status: 401);
      }
      if (method == 'GET' &&
          path == '/api/admin/auth' &&
          [404, 405].contains(response.statusCode)) {
        throw const ManagementException(
          'A gestão precisa de uma atualização no servidor. Peça ao administrador para publicar a API de sessão.',
          status: 405,
        );
      }
      // Reject redirects so the staff cookie never follows an external origin.
      if (response.statusCode >= 300 && response.statusCode < 400) {
        throw const ManagementException(
          'O servidor redirecionou a solicitação. Entre novamente.',
        );
      }
      final contentType = response.headers['content-type'] ?? '';
      if (!contentType.contains('application/json')) {
        throw const ManagementException(
          'O servidor não respondeu como esperado. Tente atualizar.',
        );
      }
      final dynamic data = jsonDecode(response.body);
      if (response.statusCode == 401) {
        if (cog != null) {
          _cogGrant = null;
        } else {
          _cookie = null;
        }
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = data is Map ? (data['error'] ?? data['message']) : null;
        throw ManagementException(
          message is String && message != 'unauthorized'
              ? message
              : response.statusCode == 401
              ? 'Entre novamente para continuar.'
              : 'Não foi possível concluir. Atualize e tente novamente.',
          status: response.statusCode,
        );
      }
      final header = response.headers['set-cookie'];
      if (header != null) {
        final cookie = Cookie.fromSetCookieValue(header);
        if (cookie.name == 'barbacue_admin') {
          _cookie = cookie.maxAge == 0
              ? null
              : '${cookie.name}=${cookie.value}';
        }
      }
      return data;
    } on TimeoutException {
      throw ManagementException(
        method == 'GET'
            ? 'A conexão demorou. Tente atualizar.'
            : 'A confirmação demorou. Atualize antes de repetir a alteração.',
      );
    } on http.ClientException {
      throw const ManagementException(
        'Sem conexão. Verifique sua internet e tente atualizar.',
      );
    } on SocketException {
      throw const ManagementException(
        'Sem conexão. Verifique sua internet e tente atualizar.',
      );
    } on FormatException {
      throw const ManagementException(
        'Resposta inválida do servidor. Tente atualizar.',
      );
    }
  }

  Future<StaffSession> session() async {
    final data = await request('GET', '/api/admin/auth');
    final current = StaffSession(data['session'] as Json);
    final view = data['view'];
    _view = view is String && RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(view)
        ? view
        : null;
    if (current.authSource != 'cog') _cogGrant = null;
    if (current.authSource == 'cog' && _view == null) {
      throw const ManagementException(
        'Atualize o servidor antes de usar a sessão Cog.',
      );
    }
    return current;
  }

  Future<StaffSession> login(String username, String password) async {
    clear();
    try {
      await request('POST', '/api/admin/auth', {
        'username': username.trim(),
        'password': password,
      });
      return await session();
    } catch (_) {
      clear();
      rethrow;
    }
  }

  Future<void> logout() async {
    if (_cogGrant != null) {
      final grant = _cogGrant!, generation = ++_generation;
      _cogLogin!.cancel();
      try {
        await _cogLogin.revoke(grant);
      } catch (_) {
        throw const ManagementException(
          'Não foi possível sair da Cog. Sua sessão foi mantida. Tente novamente.',
        );
      }
      if (generation == _generation) {
        _cogGrant = null;
        _view = null;
      }
      return;
    }
    try {
      await request('DELETE', '/api/admin/auth');
    } finally {
      clear();
    }
  }

  void cancelCog() {
    _generation++;
    _cogLogin?.cancel();
    _cogGrant = null;
    _view = null;
  }

  void clear() {
    cancelCog();
    _cookie = null;
  }

  void dispose() {
    clear();
    _client.close();
  }
}
