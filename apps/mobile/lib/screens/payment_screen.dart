import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../models/coupon.dart';
import '../models/order.dart';
import '../models/delivery_quote.dart';
import '../config/app_brand.dart';
import '../providers/cart_provider.dart';
import '../providers/checkout_provider.dart';
import '../providers/table_session_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/header_chip.dart';

/// The orders API's verdict on a token whose table is gone or switched off. It
/// is the only marker the failure carries — the route answers 422 with this
/// prefix and no machine-readable code.
const _staleTableError = 'Mesa inválida ou desativada.';

/// Unified payment step where both the manual cart flow and the AI agent land.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key});

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  final _changeController = TextEditingController();
  final _addressController = TextEditingController();
  bool _addressSeeded = false;
  bool? _deliveryEnabled;
  bool _deliveryLoading = true;
  bool _quoting = false;
  String? _deliveryError;
  DeliveryQuote? _deliveryQuote;
  Timer? _quoteExpiry;
  int _quoteSeq = 0;

  DeliveryQuote? get _currentQuote {
    final quote = _deliveryQuote;
    return !_isDineIn &&
            _deliveryEnabled == true &&
            quote != null &&
            quote.isValidFor(
              ref.read(checkoutProvider).address,
              currentBrand.slug,
            )
        ? quote
        : null;
  }

  bool get _deliveryReady =>
      _isDineIn || _deliveryEnabled == false || _currentQuote != null;
  bool _changeSeeded = false;
  bool _submitting = false;
  String? _error;
  OrderResponse? _order;

  /// Preview only. /api/orders re-reserves the coupon and recomputes the
  /// discount in its own transaction, so this never decides what is charged —
  /// it only keeps the total on screen honest about what will be.
  CouponResult? _coupon;

  /// Monotonic ticket for the preview: the code and the cart can both change
  /// while a request is in flight, and a slow earlier answer must not land on
  /// top of a newer one.
  int _previewSeq = 0;

  /// The live session wins, but the checkout store is a real fallback, not a
  /// belt-and-braces one: the AI agent pushes straight here without /cart ever
  /// being built, and a dine-in order it arranged must still be one.
  bool get _isDineIn =>
      ref.read(tableSessionProvider) != null ||
      ref.read(checkoutProvider).orderType == 'dine_in';

  String? get _tableToken =>
      ref.read(tableSessionProvider)?.token ??
      ref.read(checkoutProvider).tableToken;

  int? get _tableNumber =>
      ref.read(tableSessionProvider)?.number ??
      ref.read(checkoutProvider).tableNumber;

  List<(String, String, String)> get _methods => [
    ('pix', '⚡', 'Pague na hora pelo QR Code ou copia e cola'),
    (
      'cash',
      '💵',
      _isDineIn
          ? 'Pague em dinheiro no caixa'
          : 'Pague em dinheiro quando o pedido chegar',
    ),
    (
      'card_on_delivery',
      '💳',
      _isDineIn
          ? 'Maquininha de cartão na mesa/caixa'
          : 'Maquininha de cartão na entrega',
    ),
  ];

  @override
  void initState() {
    super.initState();
    ref.listenManual(
      checkoutProvider.select((s) => s.couponCode),
      (_, _) => _previewCoupon(),
    );
    ref.listenManual(cartTotalCentsProvider, (_, _) => _previewCoupon());
    _previewCoupon();
    ref.listenManual(checkoutProvider.select((s) => s.address), (_, address) {
      _quoteSeq++;
      _quoteExpiry?.cancel();
      if (_addressController.text != address) _addressController.text = address;
      if (mounted) {
        setState(() {
          _deliveryQuote = null;
          _quoting = false;
          _deliveryError = null;
        });
      }
    });
    ref.listenManual(checkoutProvider.select((s) => s.orderType), (_, _) {
      _quoteSeq++;
      _quoteExpiry?.cancel();
      if (mounted) {
        setState(() {
          _deliveryQuote = null;
          _quoting = false;
        });
      }
      if (!_isDineIn && _deliveryEnabled == null) _checkDelivery();
    });
    if (!_isDineIn) _checkDelivery();
  }

  @override
  void dispose() {
    _changeController.dispose();
    _addressController.dispose();
    _quoteExpiry?.cancel();
    _quoteSeq++;
    super.dispose();
  }

  Future<void> _checkDelivery() async {
    setState(() {
      _deliveryLoading = true;
      _deliveryError = null;
    });
    try {
      final enabled = await ApiService.fetchDeliveryEnabled();
      if (!mounted) return;
      setState(() => _deliveryEnabled = enabled);
    } catch (error) {
      if (mounted) {
        setState(() {
          _deliveryEnabled = null;
          _deliveryError = error.toString();
        });
      }
    } finally {
      if (mounted) setState(() => _deliveryLoading = false);
    }
  }

  Future<void> _calculateDelivery() async {
    if (_quoting || _submitting) return;
    final address = ref.read(checkoutProvider).address.trim();
    if (address.isEmpty) {
      setState(() => _deliveryError = 'Informe o endereço de entrega.');
      return;
    }
    final sequence = ++_quoteSeq;
    _quoteExpiry?.cancel();
    setState(() {
      _quoting = true;
      _deliveryQuote = null;
      _deliveryError = null;
    });
    try {
      final quote = await ApiService.quoteDelivery(address: address);
      if (!mounted || sequence != _quoteSeq) return;
      if (!quote.isValidFor(
        ref.read(checkoutProvider).address,
        currentBrand.slug,
      )) {
        return;
      }
      setState(() => _deliveryQuote = quote);
      _quoteExpiry = Timer(quote.expiresAt.difference(DateTime.now()), () {
        if (!mounted) return;
        setState(() {
          _deliveryQuote = null;
          _deliveryError = 'A cotação expirou. Calcule o frete novamente.';
        });
      });
    } catch (error) {
      if (!mounted || sequence != _quoteSeq) return;
      setState(() {
        if (error is DeliveryApiException &&
            error.code == 'delivery_disabled') {
          _deliveryEnabled = false;
        } else {
          _deliveryError = error.toString();
        }
      });
    } finally {
      if (mounted && sequence == _quoteSeq) setState(() => _quoting = false);
    }
  }

  Future<void> _previewCoupon() async {
    final code = ref.read(checkoutProvider).couponCode;
    final subtotal = ref.read(cartTotalCentsProvider);
    final seq = ++_previewSeq;

    if (code == null || subtotal == 0) {
      if (_coupon != null) setState(() => _coupon = null);
      return;
    }

    try {
      final result = await ApiService.validateCoupon(
        code: code,
        subtotalCents: subtotal,
      );
      if (!mounted || seq != _previewSeq) return;
      setState(() => _coupon = result);
    } catch (_) {
      // A refused code is dropped without a word: the customer applied it in the
      // cart, where the refusal was already explained, and the order goes
      // through undiscounted either way.
      if (!mounted || seq != _previewSeq) return;
      setState(() => _coupon = null);
    }
  }

  Future<void> _placeOrder() async {
    if (_submitting) return;
    final checkout = ref.read(checkoutProvider);
    final items = ref.read(cartProvider);
    final total = _totalCents(ref.read(cartTotalCentsProvider));

    if (checkout.name.trim().isEmpty ||
        checkout.phone.replaceAll(RegExp(r'\D'), '').length < 8) {
      setState(() => _error = 'Preencha nome e telefone na etapa anterior.');
      return;
    }
    if (!_isDineIn && checkout.address.trim().isEmpty) {
      setState(() => _error = 'Informe o endereço de entrega.');
      return;
    }
    if (!_deliveryReady) {
      setState(
        () => _error =
            'Calcule o frete para confirmar o total antes de enviar o pedido.',
      );
      return;
    }
    final change = checkout.changeForCents;
    // Cash covers discounted items plus the confirmed delivery fee.
    if (checkout.paymentMethod == 'cash' &&
        change != null &&
        change > 0 &&
        change < total) {
      setState(
        () => _error = 'O valor do troco não pode ser menor que o total.',
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final res = await ApiService.createOrder(
        CreateOrderRequest(
          brand: currentBrand.slug,
          deliveryQuoteId: _currentQuote?.quoteId,
          customerName: checkout.name,
          customerPhone: checkout.phone,
          deliveryAddress: _isDineIn || checkout.address.isEmpty
              ? null
              : checkout.address,
          notes: checkout.notes.isEmpty ? null : checkout.notes,
          couponCode: _coupon?.code,
          paymentMethod: checkout.paymentMethod,
          changeForCents: checkout.paymentMethod == 'cash'
              ? checkout.changeForCents
              : null,
          channel: 'click',
          orderType: _isDineIn ? 'dine_in' : 'delivery',
          tableToken: _isDineIn ? _tableToken : null,
          items: items
              .map(
                (e) => OrderItem(
                  productId: e.productId,
                  name: e.name,
                  priceCents: e.priceCents,
                  qty: e.qty,
                ),
              )
              .toList(),
        ),
      );
      if (!mounted) return;
      _quoteExpiry?.cancel();
      ref.read(cartProvider.notifier).clear();
      // The coupon is spent — leaving the code behind would re-apply it to the
      // next order the moment the customer opens the cart again.
      ref.read(checkoutProvider.notifier).update(clearCoupon: true);
      if (mounted) setState(() => _order = res);
    } catch (e) {
      if (!mounted) return;
      if (e is DeliveryApiException &&
          [
            'delivery_quote_required',
            'delivery_quote_invalid',
            'delivery_disabled',
          ].contains(e.code)) {
        _quoteExpiry?.cancel();
        setState(() {
          _deliveryQuote = null;
          _deliveryEnabled = e.code != 'delivery_disabled';
          _deliveryLoading = false;
        });
      }
      final message = e.toString().replaceAll('Exception: ', '');
      // Staff rotate a table's token to retire its printed QR, which strands
      // anyone still holding the old one. The server has just proved this
      // session is dead, so drop it — the listener resets checkout to delivery
      // and the guest can order without fighting a token that will never work.
      if (message.startsWith(_staleTableError)) {
        ref.read(tableSessionProvider.notifier).leave();
      }
      setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// A flat coupon can exceed the cart — the customer is never owed money.
  int _totalCents(int subtotal) =>
      (subtotal - (_coupon?.discountCents ?? 0)).clamp(0, subtotal) +
      (_currentQuote?.feeCents ?? 0);

  Widget _deliverySection() {
    final quote = _currentQuote;
    return _Section(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Entrega no seu endereço',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 14),
          TextField(
            key: const ValueKey('delivery-address'),
            controller: _addressController,
            enabled: !_submitting,
            minLines: 1,
            maxLines: 3,
            keyboardType: TextInputType.streetAddress,
            decoration: const InputDecoration(
              labelText: 'Endereço de entrega',
              hintText: 'Rua, número, bairro, cidade e CEP',
            ),
            onChanged: (address) =>
                ref.read(checkoutProvider.notifier).update(address: address),
          ),
          const SizedBox(height: 10),
          if (_deliveryLoading)
            const Text(
              'Verificando as condições de entrega…',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
          if (!_deliveryLoading && _deliveryEnabled == null)
            OutlinedButton(
              onPressed: _submitting ? null : _checkDelivery,
              child: const Text('Verificar entrega'),
            ),
          if (_deliveryEnabled == true && quote == null)
            FilledButton(
              onPressed: _quoting || _submitting ? null : _calculateDelivery,
              child: Text(_quoting ? 'Calculando frete…' : 'Calcular frete'),
            ),
          if (quote != null) ...[
            const Divider(height: 26),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Expanded(
                  child: Text(
                    'Frete para este endereço',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  formatPrice(quote.feeCents),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.brand,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${(quote.distanceMeters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km · cerca de ${(quote.durationSeconds / 60).ceil().clamp(1, 99999)} min de trajeto',
            ),
            const SizedBox(height: 6),
            const Text(
              'Estimativa de deslocamento. O preparo do pedido é contado à parte.',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 8),
            const Text(
              '© OpenStreetMap contributors',
              style: TextStyle(fontSize: 11, color: AppTheme.textSecondary),
            ),
          ],
          if (_deliveryError != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                _deliveryError!,
                style: TextStyle(color: Colors.red.shade700, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Checked before the cart: an order that just succeeded emptied the cart,
    // and the customer must still see their confirmation.
    if (_order != null) return _SuccessView(order: _order!);

    final items = ref.watch(cartProvider);
    final checkout = ref.watch(checkoutProvider);
    // Watched only to rebuild — the getters below read it. Leaving the table
    // from another screen has to re-show the delivery copy here.
    ref.watch(tableSessionProvider);

    // Watched, not read: the store hydrates from disk asynchronously, so a
    // persisted "troco para" lands after the first build — and it is sent with
    // the order whether or not the field shows it.
    if (checkout.loaded && !_addressSeeded) {
      _addressSeeded = true;
      _addressController.text = checkout.address;
    }
    if (checkout.loaded && !_changeSeeded) {
      _changeSeeded = true;
      final change = checkout.changeForCents;
      if (change != null) {
        _changeController.text = (change / 100)
            .toStringAsFixed(2)
            .replaceAll('.', ',');
      }
    }

    final subtotal = ref.watch(cartTotalCentsProvider);
    final discount = (_coupon?.discountCents ?? 0).clamp(0, subtotal);
    final total = _totalCents(subtotal);
    final tableNumber = _tableNumber;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pagamento'),
        leading: BackButton(onPressed: () => context.pop()),
        actions: [
          if (_isDineIn && tableNumber != null)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: HeaderChip(
                  label: '🍽️ Mesa $tableNumber',
                  emphasis: true,
                ),
              ),
            ),
        ],
      ),
      body: items.isEmpty
          ? const _NothingToPay()
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!_isDineIn && _deliveryEnabled != false) ...[
                    _deliverySection(),
                    const SizedBox(height: 24),
                  ],
                  _Section(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Resumo',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ...items.map(
                          (i) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(child: Text('${i.qty}× ${i.name}')),
                                Text(formatPrice(i.priceCents * i.qty)),
                              ],
                            ),
                          ),
                        ),
                        const Divider(),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Subtotal dos itens'),
                            Text(formatPrice(subtotal)),
                          ],
                        ),
                        if (discount > 0)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    'Desconto (${_coupon!.code})',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                      color: AppTheme.successDeep,
                                    ),
                                  ),
                                ),
                                Text(
                                  '−${formatPrice(discount)}',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    color: AppTheme.successDeep,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Frete'),
                            Text(
                              _isDineIn
                                  ? 'Não se aplica'
                                  : _deliveryReady
                                  ? formatPrice(_currentQuote?.feeCents ?? 0)
                                  : 'A calcular',
                            ),
                          ],
                        ),
                        const Divider(),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _deliveryReady ? 'Total' : 'Total parcial',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              formatPrice(total),
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.brandTan,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _RecapLine(
                          isDineIn: _isDineIn,
                          tableNumber: _tableNumber,
                          name: checkout.name,
                          address: checkout.address,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  _Section(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Forma de pagamento',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        for (final m in _methods) ...[
                          _MethodOption(
                            emoji: m.$2,
                            label: paymentLabels[m.$1] ?? m.$1,
                            hint: m.$3,
                            selected: checkout.paymentMethod == m.$1,
                            onTap: () => ref
                                .read(checkoutProvider.notifier)
                                .update(paymentMethod: m.$1),
                          ),
                          if (m != _methods.last) const SizedBox(height: 8),
                        ],
                        if (checkout.paymentMethod == 'cash') ...[
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _changeController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Troco para quanto? (opcional)',
                              hintText: 'Ex: 50',
                              prefixIcon: Icon(Icons.payments_outlined),
                            ),
                            onChanged: (v) {
                              final value = double.tryParse(
                                v.replaceAll(',', '.'),
                              );
                              ref
                                  .read(checkoutProvider.notifier)
                                  .update(
                                    changeForCents: value == null
                                        ? null
                                        : (value * 100).round(),
                                    clearChange: value == null,
                                  );
                            },
                          ),
                        ],
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(color: Colors.red.shade700),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  FilledButton(
                    onPressed: _submitting || !_deliveryReady
                        ? null
                        : _placeOrder,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            !_deliveryReady
                                ? 'Calcule o frete para continuar'
                                : checkout.paymentMethod == 'pix'
                                ? 'Gerar Pix · ${formatPrice(total)}'
                                : 'Confirmar pedido · ${formatPrice(total)}',
                          ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }
}

/// One panel of the payment stack — Resumo and Forma de pagamento share it.
class _Section extends StatelessWidget {
  const _Section({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(padding: const EdgeInsets.all(20), child: child),
  );
}

class _MethodOption extends StatelessWidget {
  const _MethodOption({
    required this.emoji,
    required this.label,
    required this.hint,
    required this.selected,
    required this.onTap,
  });

  final String emoji;
  final String label;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppTheme.brandSoft : AppTheme.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppTheme.brand : AppTheme.border,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                switch (emoji) {
                  '⚡' => Icons.qr_code_2,
                  '💵' => Icons.payments_outlined,
                  _ => Icons.credit_card,
                },
                size: 24,
                color: selected ? AppTheme.brand : AppTheme.textSecondary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      hint,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                color: selected ? AppTheme.brand : AppTheme.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Who the order is for. Always rendered: an anonymous cart still says so, with
/// an em-dash, rather than quietly dropping the line.
class _RecapLine extends StatelessWidget {
  const _RecapLine({
    required this.isDineIn,
    required this.tableNumber,
    required this.name,
    required this.address,
  });

  final bool isDineIn;
  final int? tableNumber;
  final String name;
  final String address;

  @override
  Widget build(BuildContext context) {
    const emphasis = TextStyle(
      fontWeight: FontWeight.w500,
      color: AppTheme.textPrimary,
    );
    final who = name.isEmpty ? '—' : name;

    return Text.rich(
      TextSpan(
        style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
        children: isDineIn
            ? [
                const TextSpan(text: 'Consumo na '),
                TextSpan(text: 'Mesa ${tableNumber ?? ''}', style: emphasis),
                TextSpan(text: ' · $who'),
              ]
            : [
                const TextSpan(text: 'Entrega para '),
                TextSpan(text: who, style: emphasis),
                if (address.isNotEmpty) TextSpan(text: ' · $address'),
              ],
      ),
    );
  }
}

class _NothingToPay extends StatelessWidget {
  const _NothingToPay();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🛒', style: TextStyle(fontSize: 60)),
            const SizedBox(height: 16),
            const Text(
              'Nada para pagar ainda',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w500,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => context.go('/'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 10,
                ),
                minimumSize: Size.zero,
                shape: const StadiumBorder(),
              ),
              child: const Text(
                'Ver cardápio',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.order});
  final OrderResponse order;

  @override
  Widget build(BuildContext context) {
    final shortId = order.orderId.length >= 8
        ? order.orderId.substring(0, 8).toUpperCase()
        : order.orderId.toUpperCase();
    // The server decides the order type — a valid table token promotes an order
    // the client sent as delivery, so local checkout state cannot be trusted.
    final isDineIn = order.orderType == 'dine_in';
    final table = order.tableNumber;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.success,
        title: const Text('Pedido recebido! 🎉'),
        automaticallyImplyLeading: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.surfaceAlt,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '#$shortId${isDineIn && table != null ? ' · Mesa $table' : ''}',
                style: const TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: AppTheme.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: 24),
            if (order.pix != null)
              _PixCard(
                payload: order.pix!.payload,
                totalCents: order.totalCents,
                isDineIn: isDineIn,
              )
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Text(
                        order.paymentMethod == 'cash' ? '💵' : '💳',
                        style: const TextStyle(fontSize: 36),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        '${isDineIn ? 'Pagamento no local' : 'Pagamento na entrega'} · '
                        '${paymentLabels[order.paymentMethod] ?? order.paymentMethod}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text.rich(
                        TextSpan(
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppTheme.textSecondary,
                          ),
                          children: [
                            const TextSpan(text: 'Total a pagar: '),
                            TextSpan(
                              text: formatPrice(order.totalCents),
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppTheme.brandTan,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        isDineIn
                            ? 'Um atendente já foi avisado do seu pedido. 🍔'
                            : 'Estamos preparando seu pedido. 🍔',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: () => context.go('/'),
              icon: const Icon(Icons.restaurant_menu),
              label: const Text('Voltar ao cardápio'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PixCard extends StatefulWidget {
  const _PixCard({
    required this.payload,
    required this.totalCents,
    required this.isDineIn,
  });
  final String payload;
  final int totalCents;
  final bool isDineIn;

  @override
  State<_PixCard> createState() => _PixCardState();
}

class _PixCardState extends State<_PixCard> {
  bool _copied = false;
  Timer? _copyTimer;

  @override
  void dispose() {
    _copyTimer?.cancel();
    super.dispose();
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.payload));
    if (!mounted) return;
    setState(() => _copied = true);
    // Re-copying a Pix payload is a common retry, so the affordance has to come
    // back rather than leaving a permanent "copiado!".
    _copyTimer?.cancel();
    _copyTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Text(
              'Pague ${formatPrice(widget.totalCents)} com Pix',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: QrImageView(
                data: widget.payload,
                version: QrVersions.auto,
                size: 224,
                gapless: false,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _copy,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              icon: Icon(_copied ? Icons.check : Icons.copy),
              // Styled here rather than through styleFrom's textStyle, which
              // would replace the button's resolved font family outright.
              label: Text(
                _copied
                    ? 'Código copiado!'
                    : 'Copiar código Pix (copia e cola)',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.background,
                borderRadius: BorderRadius.circular(8),
              ),
              child: SelectableText(
                widget.payload,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  fontFamily: 'monospace',
                  color: AppTheme.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              widget.isDineIn
                  ? 'Mostre o comprovante ao atendente da sua mesa.'
                  : 'Após o pagamento, enviaremos a confirmação pelo WhatsApp.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
