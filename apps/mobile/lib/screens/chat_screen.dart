import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/cart_item.dart';
import '../models/chat.dart';
import '../providers/cart_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/checkout_provider.dart';
import '../providers/table_session_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

const _suggestions = [
  'Quero um X-Burguer',
  'Qual o mais pedido?',
  'Montar um combo pra 2 pessoas',
];

const _genericError = 'Ops, tive um problema. Pode repetir?';
const _offlineError = 'Sem conexão agora. Tente de novo num instante.';

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

  /// Only the scroll is gated on `mounted` — the conversation now outlives this
  /// widget, so backing out mid-request must still land the turn and clear the
  /// spinner, or re-entering would show a typing bubble that never resolves.
  void _fail(ChatNotifier chat, String message) {
    chat
      ..addAssistant(message)
      ..setLoading(false);
    if (mounted) _scrollToBottom();
  }

  Future<void> _send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || ref.read(chatProvider).loading) return;

    // Everything `ref` is needed for is resolved up front: `ref` is illegal once
    // this State is disposed, but the notifiers it hands back belong to the
    // container and stay valid across the await.
    final chat = ref.read(chatProvider.notifier);
    final cart = ref.read(cartProvider.notifier);
    final checkoutNotifier = ref.read(checkoutProvider.notifier);
    // The response's cart is the agent's end-state and the route answers with no
    // imageUrl at all, so the thumbnails have to come from what we already hold.
    final currentCart = ref.read(cartProvider);
    final checkout = ref.read(checkoutProvider);
    // Read from the session rather than the checkout store: the session is what
    // the scan established, and it is the only thing entitled to seat an order.
    final tableToken = ref.read(tableSessionProvider)?.token;

    chat
      ..addUser(trimmed)
      ..setLoading(true);
    setState(_controller.clear);
    _scrollToBottom();

    try {
      final outbound = ref
          .read(chatProvider)
          .messages
          .where((m) => !m.isGreeting)
          .toList(growable: false);

      final res = await ApiService.sendChat(
        messages: outbound,
        cart: currentCart,
        checkout: checkout,
        tableToken: tableToken,
      );

      // Sync the agent's resulting state into the shared stores. Re-attaching the
      // images is not cosmetic: replace() persists, so dropping them here would
      // blank every thumbnail for good — including items the agent never touched.
      final imageById = {for (final i in currentCart) i.productId: i.imageUrl};
      cart.replace([
        for (final i in res.cart)
          CartItem(
            productId: i.productId,
            name: i.name,
            priceCents: i.priceCents,
            qty: i.qty,
            imageUrl: imageById[i.productId],
          ),
      ]);

      checkoutNotifier.update(
        name: res.customer.name ?? checkout.name,
        phone: res.customer.phone ?? checkout.phone,
        address: res.customer.address ?? checkout.address,
        notes: res.customer.notes ?? checkout.notes,
        paymentMethod: res.paymentMethod,
        // A null here means "the agent didn't touch the coupon", not "clear it"
        // — only apply_coupon ever sets one.
        couponCode: res.couponCode ?? checkout.couponCode,
        orderType: res.orderType ?? checkout.orderType,
        tableNumber: res.tableNumber ?? checkout.tableNumber,
      );

      chat
        ..addAssistant(res.reply)
        ..setLoading(false);
      if (mounted) _scrollToBottom();

      if (res.navigate && mounted) {
        Future.delayed(const Duration(milliseconds: 600), () {
          if (mounted) context.push('/payment');
        });
      }
    } on ChatException catch (e) {
      // The route writes finished pt-BR copy ('Mensagem vazia', 'AI
      // indisponível…'); anything it didn't phrase gets our own line rather than
      // a raw SocketException in a speech bubble.
      _fail(chat, e.offline ? _offlineError : (e.message ?? _genericError));
    } catch (_) {
      _fail(chat, _offlineError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalItems = ref.watch(cartTotalItemsProvider);
    final totalCents = ref.watch(cartTotalCentsProvider);
    final chat = ref.watch(chatProvider);
    final messages = chat.messages;
    final loading = chat.loading;
    final canSend = !loading && _controller.text.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        // Terminates at a different red than the chat FAB by design — keep them
        // distinct. Container, not DecoratedBox: flexibleSpace is laid out with
        // a loose height, so a childless DecoratedBox would collapse to nothing.
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppTheme.brand, Color(0xFF8F0F15)],
            ),
          ),
        ),
        title: const Row(
          children: [
            Text('🔥 ', style: TextStyle(fontSize: 24)),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Atendente BARBACUE',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
              itemCount: messages.length +
                  (loading ? 1 : 0) +
                  (messages.length == 1 ? 1 : 0),
              itemBuilder: (context, index) {
                // Suggestions row right after the greeting.
                if (messages.length == 1 && index == 1) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _suggestions
                          .map((s) => ActionChip(
                                label: Text(s),
                                onPressed: () => _send(s),
                                backgroundColor: AppTheme.surfaceAlt,
                                side: BorderSide(
                                    color: AppTheme.brand.withValues(alpha: 0.4)),
                                labelStyle: const TextStyle(
                                    fontSize: 12, color: AppTheme.brandTan),
                                shape: const StadiumBorder(),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 6),
                                visualDensity: VisualDensity.compact,
                              ))
                          .toList(),
                    ),
                  );
                }
                if (index >= messages.length) return const _TypingBubble();

                final m = messages[index];
                final isUser = m.role == 'user';
                return Align(
                  alignment:
                      isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    // ListView margins don't collapse, so this is half the 12px
                    // gap the web flex column gets from gap-3.
                    margin: const EdgeInsets.symmetric(vertical: 6),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    constraints: BoxConstraints(
                        maxWidth: MediaQuery.of(context).size.width * 0.85),
                    decoration: isUser
                        ? const BoxDecoration(
                            color: AppTheme.brand,
                            borderRadius: _userBubbleRadius,
                          )
                        : _assistantBubble,
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
                decoration: BoxDecoration(
                  color: AppTheme.brandSoft,
                  border: Border(
                    top: BorderSide(color: AppTheme.brand.withValues(alpha: 0.3)),
                  ),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('🛒 $totalItems item(s) no carrinho',
                        style: const TextStyle(
                            fontWeight: FontWeight.w500,
                            color: AppTheme.brandTan)),
                    Text(formatPrice(totalCents),
                        style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.brandTan)),
                  ],
                ),
              ),
            ),

          // Input
          Container(
            decoration: const BoxDecoration(
              color: AppTheme.surface,
              border: Border(top: BorderSide(color: AppTheme.border)),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        enabled: !loading,
                        textInputAction: TextInputAction.send,
                        onSubmitted: _send,
                        // Drives the send button's enabled state, which reads the
                        // controller rather than mirroring the text into state.
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'Escreva seu pedido...',
                          hintStyle:
                              const TextStyle(color: AppTheme.textSecondary),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 10),
                          border: _pill(AppTheme.border, 1),
                          enabledBorder: _pill(AppTheme.border, 1),
                          focusedBorder: _pill(AppTheme.brand, 2),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Opacity(
                      opacity: canSend ? 1 : 0.4,
                      child: SizedBox.square(
                        dimension: 44,
                        child: Material(
                          color: AppTheme.brand,
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap:
                                canSend ? () => _send(_controller.text) : null,
                            child: const Icon(Icons.send,
                                color: Colors.white, size: 20),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

OutlineInputBorder _pill(Color color, double width) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(24),
      borderSide: BorderSide(color: color, width: width),
    );

// The corner on the speaker's side is squared off into a tail.
const _userBubbleRadius = BorderRadius.only(
  topLeft: Radius.circular(16),
  topRight: Radius.circular(16),
  bottomLeft: Radius.circular(16),
  bottomRight: Radius.circular(2),
);

const _assistantBubbleRadius = BorderRadius.only(
  topLeft: Radius.circular(16),
  topRight: Radius.circular(16),
  bottomLeft: Radius.circular(2),
  bottomRight: Radius.circular(16),
);

const _assistantBubble = BoxDecoration(
  color: AppTheme.surfaceAlt,
  borderRadius: _assistantBubbleRadius,
  border: Border.fromBorderSide(BorderSide(color: AppTheme.border)),
);

/// Three bouncing dots in an assistant-shaped bubble — a bare spinner reads as
/// "the page is loading" rather than "the attendant is typing".
class _TypingBubble extends StatefulWidget {
  const _TypingBubble();

  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: _assistantBubble,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 4,
          // Leading dot first: the phases run the wave left to right.
          children: [
            for (final phase in const [0.3, 0.15, 0.0])
              _Dot(controller: _controller, phase: phase),
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.controller, required this.phase});
  final AnimationController controller;
  final double phase;
  static const _size = 8.0;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, child) {
        final t = (controller.value + phase) % 1.0;
        // Folded so the dot is up at both ends of the cycle and down at the
        // midpoint, matching the CSS bounce keyframes.
        final fold = t <= 0.5 ? t * 2 : (1 - t) * 2;
        final lift = 1 - Curves.easeInOut.transform(fold);
        return Transform.translate(
          offset: Offset(0, -_size * 0.25 * lift),
          child: child,
        );
      },
      child: Container(
        width: _size,
        height: _size,
        decoration: const BoxDecoration(
          color: AppTheme.textSecondary,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
