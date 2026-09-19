import 'dart:async';
import 'dart:convert';
import 'dart:io';
// Narrowed: foundation also exports a `Category`, which would otherwise clash
// with the menu model of the same name.
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import '../models/product.dart';
import '../models/coupon.dart';
import '../models/order.dart';
import '../models/delivery_quote.dart';
import '../models/cart_item.dart';
import '../models/chat.dart';
import '../models/instagram_post.dart';
import '../models/store_settings.dart';
import '../models/table_session.dart';
import '../providers/checkout_provider.dart';
import '../config/app_brand.dart';

/// Lightweight store-open status (no codegen needed).
///
/// weeklyHours/timezone are intentionally not modelled: the server already
/// renders reason/nextOpen as finished strings, and recomputing the schedule in
/// Dart would drift from lib/store-hours.ts.
class StoreStatus {
  final bool open;
  final String reason;
  final String? nextOpen;
  final String? openingHours;
  const StoreStatus({
    required this.open,
    required this.reason,
    this.nextOpen,
    this.openingHours,
  });
}

class ApiService {
  static String get baseUrl {
    // Production: use real domain; dev: localhost differs per platform
    const prod = String.fromEnvironment('API_BASE_URL');
    if (prod.isNotEmpty) return prod;

    // Release flavor entrypoints carry their own immutable domain. Local
    // debug via main.dart keeps the emulator localhost behavior below.
    const releaseBrand = bool.fromEnvironment('RELEASE_BRAND_ENDPOINT');
    if (releaseBrand) return 'https://${currentBrand.domain}';

    // Android emulator routes host via 10.0.2.2; iOS sim uses localhost
    if (Platform.isAndroid) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  static http.Client _client = http.Client();

  /// Seam for tests to exercise the server's failure envelopes without a live
  /// backend — the coupon and order paths turn status codes into the pt-BR
  /// strings the customer reads, which is exactly what must not regress.
  @visibleForTesting
  static set client(http.Client value) => _client = value;

  /// Whether the store is currently open (structured schedule + closed days +
  /// manual override), plus a human reason. Used for the closed-store banner.
  static Future<StoreStatus> fetchStoreStatus() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/store-status'),
      headers: {'Accept': 'application/json'},
    );
    if (response.statusCode != 200) {
      // Fail open: never block the menu just because the status call failed.
      return const StoreStatus(open: true, reason: '', nextOpen: null);
    }
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return StoreStatus(
      open: data['open'] == true,
      reason: data['reason']?.toString() ?? '',
      nextOpen: data['nextOpen']?.toString(),
      openingHours: data['openingHours']?.toString(),
    );
  }

  /// Public store profile for the hero and footer.
  ///
  /// Fails soft: any transport, status or decode failure yields the defaults, so
  /// the hero still renders a branded store rather than an error.
  static Future<StoreSettings> fetchSettings() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/settings'),
        headers: {'Accept': 'application/json'},
      );
      if (response.statusCode != 200) return StoreSettings.fromJson(const {});
      final data = jsonDecode(response.body);
      if (data is! Map<String, dynamic>) {
        return StoreSettings.fromJson(const {});
      }
      return StoreSettings.fromJson(data);
    } catch (_) {
      return StoreSettings.fromJson(const {});
    }
  }

  /// The store's Instagram thumbnails for the footer grid.
  ///
  /// Fails silently to an empty list: the feed is decoration, and an empty grid
  /// renders nothing rather than an error. The route itself never fails closed —
  /// it answers with its bundled posts whenever the Graph call is unavailable,
  /// and those carry root-relative imageUrls served by the web app, so they need
  /// the same resolution [resolveImageUrls] gives product photos.
  static Future<List<InstagramPost>> fetchInstagramPosts() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/instagram'),
        headers: {'Accept': 'application/json'},
      );
      if (response.statusCode != 200) return const [];

      final data = jsonDecode(response.body);
      final posts = data is Map ? data['posts'] : null;
      if (posts is! List) return const [];

      final resolved = <InstagramPost>[];
      for (final p in posts) {
        if (p is! Map<String, dynamic>) continue;
        final img = p['imageUrl'];
        if (img is String && img.startsWith('/')) {
          p['imageUrl'] = '$baseUrl$img';
        }
        final post = InstagramPost.fromJson(p);
        // A tile with no image or no destination is worse than one fewer tile.
        if (post.imageUrl.isNotEmpty && post.permalink.isNotEmpty) {
          resolved.add(post);
        }
      }
      return resolved;
    } catch (_) {
      return const [];
    }
  }

  static Future<List<Category>> fetchMenu() async {
    // Chelas and Barbadog are iFood-powered storefronts. Their bundled,
    // versioned snapshots make the first screen instant and keep the menu
    // usable on weak mobile connections; each product still opens its live
    // iFood URL for availability and checkout.
    if (!currentBrand.hasNativeCheckout) return _bundledBrandMenu();

    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/products'),
        headers: {'Accept': 'application/json'},
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        resolveImageUrls(data, baseUrl);
        final parsed = data.map((json) => Category.fromJson(json)).toList();
        return parsed;
      }
    } catch (_) {
      rethrow;
    }

    throw Exception('Falha ao carregar o cardápio.');
  }

  /// Offline-safe snapshot made from the same iFood scrape that feeds the site.
  /// It is also a rollout guard: Chelas/Barbadog remain correct even before a
  /// new API bundle reaches every production edge.
  static Future<List<Category>> _bundledBrandMenu() async {
    final raw = await rootBundle.loadString(
      'assets/brands/${currentBrand.slug}-menu.json',
    );
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    final items = (decoded['items'] as List<dynamic>?) ?? const [];
    final names = <String>[];
    for (final item in items) {
      final name = (item as Map<String, dynamic>)['category'].toString();
      if (!names.contains(name)) names.add(name);
    }

    return [
      for (var categoryIndex = 0; categoryIndex < names.length; categoryIndex++)
        Category(
          id: categoryIndex + 1,
          name: names[categoryIndex],
          slug: _slugify(names[categoryIndex]),
          sortOrder: categoryIndex,
          products: [
            for (final entry in items.indexed)
              if ((entry.$2 as Map<String, dynamic>)['category'] ==
                  names[categoryIndex])
                _brandProduct(
                  entry.$2 as Map<String, dynamic>,
                  categoryIndex,
                  entry.$1,
                ),
          ],
        ),
    ];
  }

  static Product _brandProduct(
    Map<String, dynamic> json,
    int categoryIndex,
    int productIndex,
  ) {
    final salePrice = (json['priceCents'] as num).toInt();
    final original = (json['originalPriceCents'] as num?)?.toInt();
    return Product(
      id: (categoryIndex + 1) * 1000 + productIndex + 1,
      externalId: json['id']?.toString(),
      categoryId: categoryIndex + 1,
      name: json['name'].toString(),
      description: json['description']?.toString(),
      priceCents: original ?? salePrice,
      promoPriceCents: original == null ? null : salePrice,
      imageUrl: json['imageUrl']?.toString(),
      available: true,
      sortOrder: productIndex,
      ifoodUrl: json['ifoodUrl']?.toString(),
    );
  }

  static String _slugify(String value) => value
      .toLowerCase()
      .replaceAll(RegExp('[áàãâä]'), 'a')
      .replaceAll(RegExp('[éèêë]'), 'e')
      .replaceAll(RegExp('[íìîï]'), 'i')
      .replaceAll(RegExp('[óòõôö]'), 'o')
      .replaceAll(RegExp('[úùûü]'), 'u')
      .replaceAll('ç', 'c')
      .replaceAll(RegExp('[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');

  /// Rewrites root-relative product image paths to absolute URLs, in place.
  ///
  /// Backfilled product photos are served by the web app as root-relative paths
  /// (e.g. "/generated/products/92.jpg"); anota.ai CDN images are already
  /// absolute. The image widgets need absolute URLs, so this resolves relative
  /// paths against [baseUrl] in one place — so cards, cart and order summaries
  /// all get working URLs. Absolute (http…) and empty values are left untouched.
  static void resolveImageUrls(List<dynamic> categories, String baseUrl) {
    for (final cat in categories) {
      final products = cat is Map ? cat['products'] : null;
      if (products is! List) continue;
      for (final p in products) {
        final img = p is Map ? p['imageUrl'] : null;
        if (img is String && img.startsWith('/')) {
          p['imageUrl'] = '$baseUrl$img';
        }
      }
    }
  }

  /// Resolves a table QR's token into a session, or null when the QR is invalid
  /// or its table has been deactivated.
  ///
  /// The web route the printed QR points at (`/mesa/<token>`) answers with a
  /// redirect + Set-Cookie, which only a browser can act on; this is its JSON
  /// twin. Null means "the server said no", so callers can tell an unusable QR
  /// apart from a transport failure, which throws.
  static Future<TableSession?> resolveTable(String token) async {
    final http.Response response;
    try {
      response = await _client.get(
        Uri.parse(
          '$baseUrl/api/tables/resolve',
        ).replace(queryParameters: {'token': token}),
        headers: {'Accept': 'application/json'},
      );
    } on SocketException {
      throw Exception(_offline);
    } on TimeoutException {
      throw Exception(_offline);
    } on http.ClientException {
      throw Exception(_offline);
    }

    if (response.statusCode == 404) return null;
    if (response.statusCode != 200) {
      throw Exception(_apiMessage(response.body) ?? _tableUnavailable);
    }

    try {
      return TableSession.fromJson(jsonDecode(response.body));
    } catch (_) {
      throw Exception(_tableUnavailable);
    }
  }

  /// An unavailable configuration is not permission to deliver without a fee.
  static Future<bool> fetchDeliveryEnabled() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/api/delivery/quote'),
        headers: {'Accept': 'application/json'},
      ).timeout(const Duration(seconds: 15));
      if (response.statusCode != 200) {
        throw DeliveryApiException(_apiMessage(response.body) ?? 'Não foi possível verificar a entrega.');
      }
      final data = jsonDecode(response.body);
      if (data is! Map<String, dynamic> || data['enabled'] is! bool) {
        throw const DeliveryApiException('Não foi possível verificar a entrega.');
      }
      return data['enabled'] as bool;
    } on DeliveryApiException {
      rethrow;
    } catch (_) {
      throw const DeliveryApiException('Não foi possível verificar a entrega. Confira sua conexão e tente novamente.');
    }
  }

  static Future<DeliveryQuote> quoteDelivery({required String address}) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/api/delivery/quote'),
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: jsonEncode({'address': address.trim(), 'brand': currentBrand.slug}),
      ).timeout(const Duration(seconds: 30));
      if (response.statusCode != 200 && response.statusCode != 201) {
        String? code;
        try {
          final data = jsonDecode(response.body);
          if (data is Map<String, dynamic>) code = (data['code'] ?? data['error']) is String ? (data['code'] ?? data['error']) as String : null;
        } catch (_) {}
        throw DeliveryApiException(_apiMessage(response.body) ?? 'Não foi possível calcular o frete. Confira o endereço e tente novamente.', code: code);
      }
      return DeliveryQuote.fromJson(jsonDecode(response.body) as Map<String, dynamic>, requestedAddress: address, brand: currentBrand.slug);
    } on DeliveryApiException {
      rethrow;
    } catch (_) {
      throw const DeliveryApiException('Não foi possível confirmar o valor do frete. Calcule novamente.');
    }
  }

  /// Creates the order and returns the full response (order id, payment method,
  /// total and — for pix — the "copia e cola" payload).
  static Future<OrderResponse> createOrder(CreateOrderRequest request) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/orders'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: jsonEncode(request.toJson()),
      );
    } on SocketException {
      throw Exception(_offline);
    } on TimeoutException {
      throw Exception(_offline);
    } on http.ClientException {
      throw Exception(_offline);
    }

    if (response.statusCode == 201) {
      return OrderResponse.fromJson(jsonDecode(response.body));
    }

    try {
      final data = jsonDecode(response.body);
      if (data is Map<String, dynamic> && data['code'] is String &&
          (data['code'] as String).startsWith('delivery_')) {
        throw DeliveryApiException(_apiMessage(response.body) ?? 'Confira o frete antes de enviar o pedido.', code: data['code'] as String);
      }
    } on DeliveryApiException {
      rethrow;
    } catch (_) {}
    throw Exception(
      _apiMessage(response.body) ??
          'Não foi possível enviar o pedido. Tente novamente.',
    );
  }

  /// Validates a coupon code against the current subtotal.
  ///
  /// The route answers 200 with the coupon or a non-200 carrying a finished
  /// pt-BR `error` string ('Cupom expirado', 'Pedido mínimo…'), so those are
  /// surfaced verbatim rather than re-derived here — the rules (expiry, max
  /// usages, minimum order) live in the DB and would drift if duplicated.
  static Future<CouponResult> validateCoupon({
    required String code,
    required int subtotalCents,
  }) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/coupons'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: jsonEncode({'code': code.trim(), 'subtotalCents': subtotalCents}),
      );
    } on SocketException {
      throw Exception(_couponUnavailable);
    } on TimeoutException {
      throw Exception(_couponUnavailable);
    } on http.ClientException {
      throw Exception(_couponUnavailable);
    }

    if (response.statusCode == 200) {
      try {
        return CouponResult.fromJson(
          jsonDecode(response.body) as Map<String, dynamic>,
        );
      } catch (_) {
        throw Exception(_couponUnavailable);
      }
    }

    throw Exception(_apiMessage(response.body) ?? 'Cupom inválido');
  }

  static const _offline = 'Sem conexão. Tente novamente.';
  static const _couponUnavailable = 'Não foi possível validar o cupom agora.';
  static const _tableUnavailable = 'Não foi possível abrir a mesa agora.';

  /// Pulls the human pt-BR string out of an API failure body.
  ///
  /// The orders API returns `message` on every failure path, but `error` is only
  /// sometimes a string — the Zod branch puts a flattened issue *object* there,
  /// which would render as a stringified Map to the customer. So: `message`
  /// first, `error` only when it is itself a string. The decode is guarded
  /// because nginx answers 502/504 with HTML.
  static String? _apiMessage(String body) {
    final Object? data;
    try {
      data = jsonDecode(body);
    } catch (_) {
      return null;
    }
    if (data is! Map) return null;
    for (final key in const ['message', 'error']) {
      final v = data[key];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  /// Sends the conversation + current order state to the in-site AI agent and
  /// returns the resulting state. The caller overwrites its cart + checkout
  /// stores with the response — identical to the web ChatAgent.
  static Future<ChatResponse> sendChat({
    required List<ChatMessage> messages,
    required List<CartItem> cart,
    required CheckoutState checkout,
    String? tableToken,
  }) async {
    final http.Response response;
    try {
      response = await _client
          .post(
            Uri.parse('$baseUrl/api/chat'),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            // Saved-customer identity is bot-only by design: the route derives it
            // from a constant-time x-bot-token compare, so a public client cannot
            // load another phone's history. The phone still travels inside
            // `customer`, which is all go_to_payment needs.
            body: jsonEncode({
              'messages': messages.map((m) => m.toJson()).toList(),
              'cart': cart
                  .map(
                    (c) => {
                      'productId': c.productId,
                      'name': c.name,
                      'priceCents': c.priceCents,
                      'qty': c.qty,
                    },
                  )
                  .toList(),
              'customer': {
                if (checkout.name.isNotEmpty) 'name': checkout.name,
                if (checkout.phone.isNotEmpty) 'phone': checkout.phone,
                if (checkout.address.isNotEmpty) 'address': checkout.address,
                if (checkout.notes.isNotEmpty) 'notes': checkout.notes,
              },
              'paymentMethod': checkout.paymentMethod,
              // Must be re-sent every turn: the route re-initialises its coupon
              // from the request body, so omitting it drops a coupon the agent
              // accepted earlier in the same conversation.
              if (checkout.couponCode?.isNotEmpty ?? false)
                'couponCode': checkout.couponCode,
              // Flips the agent to table service: it stops asking a seated guest
              // for a delivery address, and ties the order it places to the table.
              'tableToken': ?tableToken,
            }),
          )
          // The route's own maxDuration is 30s; without a client deadline a hung
          // connection would spin the composer forever.
          .timeout(const Duration(seconds: 30));
    } on SocketException {
      throw const ChatException(offline: true);
    } on TimeoutException {
      throw const ChatException(offline: true);
    } on http.ClientException {
      throw const ChatException(offline: true);
    }

    if (response.statusCode != 200) {
      throw ChatException(message: _apiMessage(response.body));
    }

    try {
      return ChatResponse.fromJson(jsonDecode(response.body));
    } catch (_) {
      throw const ChatException();
    }
  }
}
