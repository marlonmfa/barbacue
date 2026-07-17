// The route falls back to its bundled posts server-side whenever the Graph call
// is unavailable — the normal state, since no token is configured — and those
// carry root-relative imageUrls. The body below is the live response, verbatim:
// without the resolution these lock in, every thumbnail 404s by default.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:barbacue/services/api_service.dart';

/// package:http decodes a body as latin1 unless the charset says otherwise, so
/// an accented or emoji caption only survives with the header the route sends.
http.Response _json(String body, [int status = 200]) => http.Response(
      body,
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

const _fallbackBody = '''
{"posts":[
  {"id":"1","imageUrl":"/instagram/posts/post_01.jpg","permalink":"https://www.instagram.com/p/DFlux-xy3rX/"},
  {"id":"2","imageUrl":"/instagram/posts/post_02.jpg","permalink":"https://www.instagram.com/p/DLIgWgXRdTW/"}
],"source":"fallback"}
''';

void main() {
  tearDown(() => ApiService.client = http.Client());

  test('root-relative fallback images resolve against the API host', () async {
    late http.Request sent;
    ApiService.client = MockClient((req) async {
      sent = req;
      return _json(_fallbackBody);
    });

    final posts = await ApiService.fetchInstagramPosts();

    expect(sent.url.path, '/api/instagram');
    expect(posts, hasLength(2));
    expect(posts.first.imageUrl, '${ApiService.baseUrl}/instagram/posts/post_01.jpg');
    expect(posts.first.permalink, 'https://www.instagram.com/p/DFlux-xy3rX/');
  });

  test('absolute Graph urls are left untouched', () async {
    ApiService.client = MockClient(
      (_) async => _json(
        jsonEncode({
          'posts': [
            {
              'id': '18042',
              'imageUrl': 'https://scontent.cdninstagram.com/v/t51/abc.jpg',
              'permalink': 'https://www.instagram.com/p/DFlux-xy3rX/',
              'caption': 'Brasa acesa 🔥',
            },
          ],
          'source': 'instagram',
        }),
      ),
    );

    final posts = await ApiService.fetchInstagramPosts();

    expect(posts.single.imageUrl, 'https://scontent.cdninstagram.com/v/t51/abc.jpg');
    expect(posts.single.caption, 'Brasa acesa 🔥');
  });

  test('a post with no image or no destination is dropped', () async {
    ApiService.client = MockClient(
      (_) async => _json(
        jsonEncode({
          'posts': [
            {'id': '1', 'imageUrl': '', 'permalink': 'https://insta/p/1/'},
            {'id': '2', 'imageUrl': '/instagram/posts/post_02.jpg'},
            {'id': '3', 'imageUrl': '/x.jpg', 'permalink': 'https://insta/p/3/'},
          ],
        }),
      ),
    );

    final posts = await ApiService.fetchInstagramPosts();

    expect(posts.map((p) => p.id), ['3']);
  });

  // The feed is decoration: it must never surface an error to the customer.
  test('a failing route yields an empty feed, not a throw', () async {
    ApiService.client = MockClient((_) async => _json('<html>502</html>', 502));
    expect(await ApiService.fetchInstagramPosts(), isEmpty);

    ApiService.client = MockClient((_) async => throw const SocketExceptionStub());
    expect(await ApiService.fetchInstagramPosts(), isEmpty);

    ApiService.client = MockClient((_) async => _json('not json'));
    expect(await ApiService.fetchInstagramPosts(), isEmpty);

    ApiService.client = MockClient((_) async => _json('{"posts":null}'));
    expect(await ApiService.fetchInstagramPosts(), isEmpty);
  });
}

class SocketExceptionStub implements Exception {
  const SocketExceptionStub();
}
