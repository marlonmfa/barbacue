import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/chat.dart';
import '../providers/cart_provider.dart';
import '../providers/checkout_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

const _greeting =
    'Oi! 👋 Sou o atendente do BARBACUE. Me diga o que você quer comer que eu já '
    'anoto o pedido — ou use o cardápio, tanto faz! 🍔🔥';

const _suggestions = [
  'Quero um X-Burguer',
  'Qual o mais pedido?',
  'Montar um combo pra 2 pessoas',
];

/// In-app AI ordering agent — the mobile mirror of the web ChatAgent. It applies
/// the agent's resulting state to the SAME cart + checkout stores the UI uses,
/// so typing and tapping produce one identical order.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final List<ChatMessage> _messages = [
    const ChatMessage(role: 'assistant', content: _greeting),
  ];
  bool _loading = false;

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || _loading) return;

    setState(() {
      _messages.add(ChatMessage(role: 'user', content: trimmed));
      _controller.clear();
      _loading = true;
    });
    _scrollToBottom();

    try {
      // Skip the local greeting — only real conversation turns go to the model.
      final outbound = _messages
          .where((m) => m.content != _greeting)
          .toList(growable: false);

      final res = await ApiService.sendChat(
        messages: outbound,
        cart: ref.read(cartProvider),
        checkout: ref.read(checkoutProvider),
      );

      // Sync the agent's resulting state into the shared stores.
      ref.read(cartProvider.notifier).replace(res.cart);
      final c = ref.read(checkoutProvider);
      ref.read(checkoutProvider.notifier).update(
            name: res.customer.name ?? c.name,
            phone: res.customer.phone ?? c.phone,
            address: res.customer.address ?? c.address,
            notes: res.customer.notes ?? c.notes,
            paymentMethod: res.paymentMethod,
          );

      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(role: 'assistant', content: res.reply));
        _loading = false;
      });
      _scrollToBottom();

      if (res.navigate && mounted) {
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted) context.push('/payment');
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(
            role: 'assistant',
            content: e.toString().replaceAll('Exception: ', '')));
        _loading = false;
      });
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalItems = ref.watch(cartTotalItemsProvider);
    final totalCents = ref.watch(cartTotalCentsProvider);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.amber,
        foregroundColor: Colors.white,
        title: const Row(
          children: [
            Text('🍔 ', style: TextStyle(fontSize: 22)),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Atendente BARBACUE',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                Text('Anota seu pedido na conversa',
                    style: TextStyle(fontSize: 11, color: Colors.white70)),
              ],
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length +
                  (_loading ? 1 : 0) +
                  (_messages.length == 1 ? 1 : 0),
              itemBuilder: (context, index) {
                // Suggestions row right after the greeting.
                if (_messages.length == 1 && index == 1) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _suggestions
                          .map((s) => ActionChip(
                                label: Text(s),
                                onPressed: () => _send(s),
                                backgroundColor: AppTheme.amberLight,
                              ))
                          .toList(),
                    ),
                  );
                }
                if (index >= _messages.length) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: AppTheme.amber),
                      ),
                    ),
                  );
                }
                final m = _messages[index];
                final isUser = m.role == 'user';
                return Align(
                  alignment:
                      isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.78),
                    decoration: BoxDecoration(
                      color: isUser ? AppTheme.amber : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: isUser
                          ? null
                          : Border.all(color: const Color(0xFFE5E7EB)),
                    ),
                    child: Text(
                      m.content,
                      style: TextStyle(
                          color: isUser ? Colors.white : AppTheme.textPrimary),
                    ),
                  ),
                );
              },
            ),
          ),

          // Cart strip
          if (totalItems > 0)
            InkWell(
              onTap: () => context.push('/cart'),
              child: Container(
                color: AppTheme.amberLight,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('🛒 $totalItems item(s) no carrinho',
                        style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AppTheme.amberDark)),
                    Text(formatPrice(totalCents),
                        style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.amberDark)),
                  ],
                ),
              ),
            ),

          // Input
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: !_loading,
                      textInputAction: TextInputAction.send,
                      onSubmitted: _send,
                      decoration: InputDecoration(
                        hintText: 'Escreva seu pedido...',
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FloatingActionButton(
                    onPressed: _loading ? null : () => _send(_controller.text),
                    backgroundColor: AppTheme.amber,
                    elevation: 0,
                    child: const Icon(Icons.send, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
