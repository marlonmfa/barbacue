import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/product.dart';
import '../models/order.dart';
import '../models/cart_item.dart';
import '../models/chat.dart';
import '../providers/checkout_provider.dart';

/// Lightweight store-open status (no codegen needed).
class StoreStatus {
  final bool open;
  final String reason;
  final String? nextOpen;
  const StoreStatus({required this.open, required this.reason, this.nextOpen});
}

class ApiService {
  static String get baseUrl {
    // Production: use real domain; dev: localhost differs per platform
    const prod = String.fromEnvironment('API_BASE_URL');
    if (prod.isNotEmpty) return prod;

    // Android emulator routes host via 10.0.2.2; iOS sim uses localhost
    if (Platform.isAndroid) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  static final _client = http.Client();

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
    );
  }

  static Future<List<Category>> fetchMenu() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/products'),
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode != 200) {
      throw Exception('Falha ao carregar o cardápio: ${response.statusCode}');
    }

    final List<dynamic> data = jsonDecode(response.body);
    resolveImageUrls(data, baseUrl);
    return data.map((json) => Category.fromJson(json)).toList();
  }

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

  /// Creates the order and returns the full response (order id, payment method,
  /// total and — for pix — the "copia e cola" payload).
  static Future<OrderResponse> createOrder(CreateOrderRequest request) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/orders'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode == 201) {
      return OrderResponse.fromJson(jsonDecode(response.body));
    }

    if (response.statusCode == 422) {
      final data = jsonDecode(response.body);
      throw Exception(data['error']?.toString() ?? 'Dados inválidos');
    }

    throw Exception('Erro ao realizar pedido: ${response.statusCode}');
  }

  /// Sends the conversation + current order state to the in-site AI agent and
  /// returns the resulting state. The caller overwrites its cart + checkout
  /// stores with the response — identical to the web ChatAgent.
  static Future<ChatResponse> sendChat({
    required List<ChatMessage> messages,
    required List<CartItem> cart,
    required CheckoutState checkout,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/api/chat'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode({
        'messages': messages.map((m) => m.toJson()).toList(),
        'cart': cart
            .map((c) => {
                  'productId': c.productId,
                  'name': c.name,
                  'priceCents': c.priceCents,
                  'qty': c.qty,
                })
            .toList(),
        'customer': {
          if (checkout.name.isNotEmpty) 'name': checkout.name,
          if (checkout.phone.isNotEmpty) 'phone': checkout.phone,
          if (checkout.address.isNotEmpty) 'address': checkout.address,
          if (checkout.notes.isNotEmpty) 'notes': checkout.notes,
        },
        // Pass the phone as identity so the agent can offer "repeat last order".
        if (checkout.phone.isNotEmpty) 'customerPhone': checkout.phone,
        'paymentMethod': checkout.paymentMethod,
      }),
    );

    if (response.statusCode == 200) {
      return ChatResponse.fromJson(jsonDecode(response.body));
    }

    final data = jsonDecode(response.body);
    throw Exception(
        data['error']?.toString() ?? 'Erro no atendente: ${response.statusCode}');
  }
}
