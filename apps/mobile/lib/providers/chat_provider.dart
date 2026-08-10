import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/chat.dart';

const chatGreeting =
    'Oi! 👋 Sou o atendente do BARBACUE. Me diga o que você quer comer que eu já '
    'anoto o pedido — ou use o cardápio, tanto faz! 🍔🔥';

const _seed = ChatMessage(
  role: 'assistant',
  content: chatGreeting,
  isGreeting: true,
);

class ChatState {
  final List<ChatMessage> messages;
  final bool loading;
  const ChatState({this.messages = const [_seed], this.loading = false});

  ChatState copyWith({List<ChatMessage>? messages, bool? loading}) => ChatState(
        messages: messages ?? this.messages,
        loading: loading ?? this.loading,
      );
}

/// The agent conversation, held above the route rather than in the screen's
/// State: popping /chat with the back arrow would otherwise discard the thread,
/// and re-entering would send a one-turn history to a model that had already
/// taken half the order.
///
/// Deliberately not persisted — the web thread dies on a full reload, and the
/// order state the agent produced lives in the cart + checkout stores anyway.
class ChatNotifier extends Notifier<ChatState> {
  @override
  ChatState build() => const ChatState();

  void addUser(String content) => state = state.copyWith(
        messages: [...state.messages, ChatMessage(role: 'user', content: content)],
      );

  void addAssistant(String content) => state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessage(role: 'assistant', content: content),
        ],
      );

  void setLoading(bool value) => state = state.copyWith(loading: value);

  void reset() => state = const ChatState();
}

final chatProvider =
    NotifierProvider<ChatNotifier, ChatState>(ChatNotifier.new);
