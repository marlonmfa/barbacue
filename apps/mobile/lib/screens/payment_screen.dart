import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../models/order.dart';
import '../providers/cart_provider.dart';
import '../providers/checkout_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

/// Unified payment step where both the manual cart flow and the AI agent land.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key});

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  bool _submitting = false;
  String? _error;
  OrderResponse? _order;

  static const _methods = [
    ('pix', '⚡', 'Pague na hora pelo QR Code ou copia e cola'),
    ('cash', '💵', 'Pague em dinheiro quando o pedido chegar'),
    ('card_on_delivery', '💳', 'Maquininha de cartão na entrega'),
  ];

  Future<void> _placeOrder() async {
    final checkout = ref.read(checkoutProvider);
    final items = ref.read(cartProvider);
    if (checkout.name.trim().isEmpty || checkout.phone.trim().length < 8) {
      setState(() => _error = 'Preencha nome e telefone na etapa anterior.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final res = await ApiService.createOrder(CreateOrderRequest(
        customerName: checkout.name,
        customerPhone: checkout.phone,
        deliveryAddress: checkout.address.isEmpty ? null : checkout.address,
        notes: checkout.notes.isEmpty ? null : checkout.notes,
        paymentMethod: checkout.paymentMethod,
        changeForCents:
            checkout.paymentMethod == 'cash' ? checkout.changeForCents : null,
        channel: 'click',
        items: items
            .map((e) => OrderItem(
                  productId: e.productId,
                  name: e.name,
                  priceCents: e.priceCents,
                  qty: e.qty,
                ))
            .toList(),
      ));
      ref.read(cartProvider.notifier).clear();
      if (mounted) setState(() => _order = res);
    } catch (e) {
      setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_order != null) return _SuccessView(order: _order!);

    final items = ref.watch(cartProvider);
    final totalCents = ref.watch(cartTotalCentsProvider);
    final checkout = ref.watch(checkoutProvider);

    if (items.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => context.go('/'));
      return const SizedBox.shrink();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pagamento'),
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Summary
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Resumo',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    ...items.map((i) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(child: Text('${i.qty}× ${i.name}')),
                              Text(formatPrice(i.priceCents * i.qty)),
                            ],
                          ),
                        )),
                    const Divider(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.bold)),
                        Text(formatPrice(totalCents),
                            style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.amberDark)),
                      ],
                    ),
                    if (checkout.name.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Entrega para ${checkout.name}'
                        '${checkout.address.isNotEmpty ? ' · ${checkout.address}' : ''}',
                        style: const TextStyle(
                            color: AppTheme.textSecondary, fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Payment method
            const Text('Forma de pagamento',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ..._methods.map((m) {
              final selected = checkout.paymentMethod == m.$1;
              return Card(
                color: selected ? AppTheme.amberLight : null,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                    color: selected ? AppTheme.amber : Colors.transparent,
                    width: 2,
                  ),
                ),
                child: ListTile(
                  leading: Text(m.$2, style: const TextStyle(fontSize: 26)),
                  title: Text(paymentLabels[m.$1]!,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(m.$3),
                  trailing: Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    color: selected ? AppTheme.amber : AppTheme.textSecondary,
                  ),
                  onTap: () => ref
                      .read(checkoutProvider.notifier)
                      .update(paymentMethod: m.$1),
                ),
              );
            }),

            if (checkout.paymentMethod == 'cash') ...[
              const SizedBox(height: 8),
              TextFormField(
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Troco para quanto? (opcional)',
                  hintText: 'Ex: 50',
                  prefixIcon: Icon(Icons.payments_outlined),
                ),
                onChanged: (v) {
                  final value = double.tryParse(v.replaceAll(',', '.'));
                  ref.read(checkoutProvider.notifier).update(
                        changeForCents: value == null
                            ? null
                            : (value * 100).round(),
                        clearChange: value == null,
                      );
                },
              ),
            ],

            const SizedBox(height: 16),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Text(_error!,
                    style: TextStyle(color: Colors.red.shade700)),
              ),
              const SizedBox(height: 12),
            ],
            FilledButton(
              onPressed: _submitting ? null : _placeOrder,
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(52)),
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(checkout.paymentMethod == 'pix'
                      ? 'Gerar Pix • ${formatPrice(totalCents)}'
                      : 'Confirmar pedido • ${formatPrice(totalCents)}'),
            ),
            const SizedBox(height: 32),
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pedido recebido'),
        automaticallyImplyLeading: false,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Text('🎉', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.amberLight,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('Pedido #$shortId',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.amberDark,
                      letterSpacing: 1.5)),
            ),
            const SizedBox(height: 24),
            if (order.pix != null)
              _PixCard(payload: order.pix!.payload, totalCents: order.totalCents)
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      Text(order.paymentMethod == 'cash' ? '💵' : '💳',
                          style: const TextStyle(fontSize: 40)),
                      const SizedBox(height: 8),
                      Text('Pagamento na entrega · '
                          '${paymentLabels[order.paymentMethod] ?? order.paymentMethod}'),
                      const SizedBox(height: 4),
                      Text('Total: ${formatPrice(order.totalCents)}',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: AppTheme.amberDark)),
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
  const _PixCard({required this.payload, required this.totalCents});
  final String payload;
  final int totalCents;

  @override
  State<_PixCard> createState() => _PixCardState();
}

class _PixCardState extends State<_PixCard> {
  bool _copied = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Text('Pague ${formatPrice(widget.totalCents)} com Pix',
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.amberLight, width: 2),
              ),
              child: QrImageView(
                data: widget.payload,
                version: QrVersions.auto,
                size: 220,
                gapless: false,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: widget.payload));
                if (mounted) setState(() => _copied = true);
              },
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48)),
              icon: Icon(_copied ? Icons.check : Icons.copy),
              label: Text(_copied
                  ? 'Código copiado!'
                  : 'Copiar código Pix (copia e cola)'),
            ),
            const SizedBox(height: 12),
            SelectableText(
              widget.payload,
              style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 8),
            const Text(
              'Após o pagamento, enviaremos a confirmação pelo WhatsApp.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
