import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:app_links/app_links.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:url_launcher/url_launcher.dart';

class CogGrant {
  const CogGrant(this.token, this.expires);
  final String token;
  final DateTime expires;
}

/// System-browser authorization code + PKCE. No client secret or persisted token.
/// Identity is resolved by the account API through the issuer's scoped userinfo.
class CogLogin {
  CogLogin({Uri? issuer, this.qa = false, Future<bool> Function(Uri)? open})
    : issuer = issuer ?? Uri.parse('https://id.cog.ia.br'),
      open =
          open ??
          ((uri) => launchUrl(uri, mode: LaunchMode.externalApplication)) {
    if (this.issuer.toString() != 'https://id.cog.ia.br' &&
        !(qa &&
            this.issuer.scheme == 'http' &&
            ['127.0.0.1', 'localhost'].contains(this.issuer.host))) {
      throw ArgumentError('Provedor Cog inválido');
    }
  }
  static const clientId = 'barbacue-native';
  static const mobileCallback =
      'com.lanchesdobarba.gestao://oauth/cog/callback';
  final Uri issuer;
  final bool qa;
  final Future<bool> Function(Uri) open;
  bool _pending = false;
  int _generation = 0;
  HttpServer? _server;
  StreamSubscription<Uri>? _links;
  Completer<Uri?>? _result;
  static String random() => base64UrlEncode(
    List.generate(32, (_) => Random.secure().nextInt(256)),
  ).replaceAll('=', '');
  static String? codeFrom(Uri result, Uri expected, String state) {
    if (result.scheme != expected.scheme ||
        result.host != expected.host ||
        result.port != expected.port ||
        result.path != expected.path ||
        result.userInfo.isNotEmpty ||
        result.fragment.isNotEmpty ||
        result.queryParametersAll['state']?.length != 1 ||
        result.queryParameters['state'] != state ||
        result.queryParameters.containsKey('error') ||
        result.queryParametersAll['code']?.length != 1) {
      return null;
    }
    final code = result.queryParameters['code'];
    return code != null && code.isNotEmpty && code.length <= 2048 ? code : null;
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, String> body,
  ) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final req = await client.postUrl(issuer.resolve(path));
      req.followRedirects = false;
      req.headers.contentType = ContentType(
        'application',
        'x-www-form-urlencoded',
      );
      req.write(
        body.entries
            .map(
              (e) =>
                  '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}',
            )
            .join('&'),
      );
      final response = await req.close().timeout(const Duration(seconds: 8));
      final bytes = <int>[];
      await for (final chunk in response.timeout(const Duration(seconds: 8))) {
        bytes.addAll(chunk);
        if (bytes.length > 65536) {
          throw const FormatException('Resposta inválida');
        }
      }
      if (response.statusCode != 200) {
        throw const HttpException('Sessão Cog indisponível');
      }
      return jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    } finally {
      client.close(force: true);
    }
  }

  Future<CogGrant?> signIn({bool interactive = false}) async {
    if (_pending) return null;
    _pending = true;
    final generation = ++_generation;
    final state = random(), nonce = random(), verifier = random();
    final challenge = base64UrlEncode(
      crypto.sha256.convert(utf8.encode(verifier)).bytes,
    ).replaceAll('=', '');
    final result = Completer<Uri?>();
    _result = result;
    Uri callback;
    try {
      if (Platform.isAndroid || Platform.isIOS) {
        callback = Uri.parse(mobileCallback);
        _links = AppLinks().uriLinkStream.listen((uri) {
          if (!result.isCompleted &&
              uri.scheme == callback.scheme &&
              uri.host == callback.host &&
              uri.path == callback.path &&
              uri.queryParameters['state'] == state) {
            result.complete(uri);
          }
        });
      } else {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        _server = server;
        callback = Uri.parse(
          'http://127.0.0.1:${server.port}/oauth/cog/callback',
        );
        server.listen((req) async {
          req.response.headers.set('Cache-Control', 'no-store');
          req.response.headers.set('Referrer-Policy', 'no-referrer');
          req.response.headers.contentType = ContentType.html;
          final uri = callback.replace(query: req.uri.query);
          final valid =
              req.method == 'GET' &&
              req.headers.value('host') == '127.0.0.1:${server.port}' &&
              req.uri.path == callback.path &&
              req.uri.queryParametersAll['state']?.length == 1 &&
              req.uri.queryParameters['state'] == state;
          req.response.statusCode = valid ? 200 : 400;
          req.response.write(
            '<title>Cog</title><p>${valid ? 'Você pode voltar ao UniversalDrop.' : 'Solicitação inválida.'}</p>',
          );
          await req.response.close();
          if (valid && !result.isCompleted) result.complete(uri);
        });
      }
      final url = issuer
          .resolve('/authorize')
          .replace(
            queryParameters: {
              'response_type': 'code',
              'client_id': clientId,
              'redirect_uri': callback.toString(),
              'scope': 'openid email profile',
              'state': state,
              'nonce': nonce,
              'code_challenge': challenge,
              'code_challenge_method': 'S256',
              'prompt': interactive ? 'login' : 'none',
            },
          );
      if (!await open(url)) return null;
      final response = await result.future.timeout(
        const Duration(seconds: 60),
        onTimeout: () => null,
      );
      if (response == null || generation != _generation) return null;
      final code = codeFrom(response, callback, state);
      if (code == null) return null;
      final token = await _post('/token', {
        'grant_type': 'authorization_code',
        'client_id': clientId,
        'redirect_uri': callback.toString(),
        'code': code,
        'code_verifier': verifier,
      });
      final access = token['access_token'], seconds = token['expires_in'];
      if (generation != _generation ||
          access is! String ||
          access.isEmpty ||
          access.length > 1024 ||
          seconds is! num ||
          !seconds.isFinite ||
          seconds <= 0 ||
          token['token_type']?.toString().toLowerCase() != 'bearer') {
        return null;
      }
      return CogGrant(
        access,
        DateTime.now().add(Duration(seconds: min(3600, seconds.toInt()))),
      );
    } catch (_) {
      return null;
    } finally {
      await _server?.close(force: true);
      _server = null;
      await _links?.cancel();
      _links = null;
      _result = null;
      _pending = false;
    }
  }

  Future<void> revoke(CogGrant grant) async {
    try {
      await _post('/revoke', {'client_id': clientId, 'token': grant.token});
    } catch (_) {
      throw StateError(
        'Não foi possível sair da Cog. Sua sessão foi mantida. Tente novamente.',
      );
    }
  }

  void cancel() {
    ++_generation;
    if (_result?.isCompleted == false) _result!.complete(null);
  }
}
