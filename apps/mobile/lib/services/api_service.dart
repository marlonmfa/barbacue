import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../models/product.dart';
import '../models/order.dart';
import '../models/cart_item.dart';
import '../models/chat.dart';
import '../providers/checkout_provider.dart';

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

  static Future<List<Category>> fetchMenu() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/api/products'),
      headers: {'Accept': 'application/json'},
    );

    if (response.statusCode != 200) {
      throw Exception('Falha ao carregar o cardápio: ${response.statusCode}');
    }

    final List<dynamic> data = jsonDecode(response.body);
    return data.map((json) => Category.fromJson(json)).toList();
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
