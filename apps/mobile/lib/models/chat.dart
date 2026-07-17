import '../models/cart_item.dart';

/// One chat turn shown in the agent conversation.
class ChatMessage {
  final String role; // "user" | "assistant"
  final String content;

  /// Marks the locally seeded opening line. The model never sent it, so it is
  /// excluded from the outbound history — flagging the turn rather than matching
  /// its text keeps that from also dropping a customer who types the same words.
  final bool isGreeting;

  const ChatMessage({
    required this.role,
    required this.content,
    this.isGreeting = false,
  });

  Map<String, dynamic> toJson() => {'role': role, 'content': content};
}

/// A failed /api/chat turn.
///
/// [message] carries the route's own pt-BR copy ('Mensagem vazia', 'AI
/// indisponível…') when the failure envelope had one, and is null when the
/// response has nothing fit to show a customer — an nginx HTML 502 against a
/// route that wraps a 6-step LLM loop is routine. [offline] separates transport
/// failure, which reads differently to the user than a server that answered.
class ChatException implements Exception {
  final String? message;
  final bool offline;
  const ChatException({this.message, this.offline = false});

  @override
  String toString() => 'ChatException(${message ?? (offline ? 'offline' : '-')})';
}

/// Result of a /api/chat turn: the agent's reply plus the resulting order state.
/// The app overwrites its cart + checkout stores with this — same declarative
/// end-state model the web client uses.
class ChatResponse {
  final String reply;

  /// Image-less by design: the route answers with its own cart shape, which
  /// carries no imageUrl. The caller re-attaches images it already holds.
  final List<CartItem> cart;
  final ChatCustomer customer;
  final String paymentMethod;
  final String? couponCode;

  /// delivery | dine_in, and the table the route resolved from the token sent
  /// with the turn. Both are nullable so that a response without them preserves
  /// the local session rather than dropping the guest back to delivery.
  final String? orderType;
  final int? tableNumber;
  final bool navigate;

  const ChatResponse({
    required this.reply,
    required this.cart,
    required this.customer,
    required this.paymentMethod,
    this.couponCode,
    this.orderType,
    this.tableNumber,
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
      couponCode: json['couponCode'] as String?,
      orderType: json['orderType'] as String?,
      tableNumber: json['tableNumber'] as int?,
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
