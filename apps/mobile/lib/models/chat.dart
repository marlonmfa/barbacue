import '../models/cart_item.dart';

/// One chat turn shown in the agent conversation.
class ChatMessage {
  final String role; // "user" | "assistant"
  final String content;
  const ChatMessage({required this.role, required this.content});

  Map<String, dynamic> toJson() => {'role': role, 'content': content};
}

/// Result of a /api/chat turn: the agent's reply plus the resulting order state.
/// The app overwrites its cart + checkout stores with this — same declarative
/// end-state model the web client uses.
class ChatResponse {
  final String reply;
  final List<CartItem> cart;
  final ChatCustomer customer;
  final String paymentMethod;
  final bool navigate;

  const ChatResponse({
    required this.reply,
    required this.cart,
    required this.customer,
    required this.paymentMethod,
    required this.navigate,
  });

  factory ChatResponse.fromJson(Map<String, dynamic> json) {
    final rawCart = (json['cart'] as List<dynamic>? ?? []);
    return ChatResponse(
      reply: json['reply'] as String? ?? '',
      cart: rawCart
          .map((e) => CartItem(
                productId: e['productId'] as int,
                name: e['name'] as String,
                priceCents: e['priceCents'] as int,
                qty: e['qty'] as int,
              ))
          .toList(),
      customer: ChatCustomer.fromJson(
          (json['customer'] as Map<String, dynamic>?) ?? const {}),
      paymentMethod: json['paymentMethod'] as String? ?? 'pix',
      navigate: json['navigate'] as bool? ?? false,
    );
  }
}

class ChatCustomer {
  final String? name;
  final String? phone;
  final String? address;
  final String? notes;
  const ChatCustomer({this.name, this.phone, this.address, this.notes});

  factory ChatCustomer.fromJson(Map<String, dynamic> json) => ChatCustomer(
        name: json['name'] as String?,
        phone: json['phone'] as String?,
        address: json['address'] as String?,
        notes: json['notes'] as String?,
      );
}
