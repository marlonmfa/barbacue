import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/cart_item.dart';
import '../models/coupon.dart';
import '../providers/cart_provider.dart';
import '../providers/checkout_provider.dart';
import '../providers/table_session_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/header_chip.dart';
import '../widgets/product_thumb.dart';

/// Widest the cart is allowed to grow — beyond this the 64px thumbs float
/// beside dead space on a tablet.
const _kMaxContentWidth = 672.0;

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _notesController = TextEditingController();
  final _couponController = TextEditingController();

  bool _prefilled = false;
  bool _loading = false;

  /// Screen-local by design: only the code is worth persisting, and the API
  /// recomputes the discount at submit, so a stored amount could go stale.
  CouponResult? _coupon;
  String? _couponError;
  bool _couponLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _notesController.dispose();
    _couponController.dispose();
    super.dispose();
  }

  Future<void> _applyCoupon() async {
    final code = _couponController.text.trim();
    if (code.isEmpty) return;

    setState(() {
      _couponError = null;
      _couponLoading = true;
    });

    try {
      final result = await ApiService.validateCoupon(
        code: code,
        subtotalCents: ref.read(cartTotalCentsProvider),
      );
      if (!mounted) return;
      setState(() => _coupon = result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        // A failed re-validation drops the coupon that was already applied —
        // keeping it would show a discount the server has just refused.
        _coupon = null;
        _couponError = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _couponLoading = false);
    }
  }

  void _removeCoupon() {
    setState(() {
      _coupon = null;
      _couponController.clear();
      _couponError = null;
    });
  }

  /// Persist the customer data into the shared checkout store, then advance to
  /// the unified payment screen — the same destination the AI agent uses.
  Future<void> _goToPayment() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final coupon = _coupon;
    final isDineIn = ref.read(tableSessionProvider) != null;
    ref.read(checkoutProvider.notifier).update(
          name: _nameController.text.trim(),
          phone: _phoneController.text.trim(),
          // Blanked rather than left alone: a delivery address typed before the
          // guest sat down must not ride along with a table order.
          address: isDineIn ? '' : _addressController.text.trim(),
          notes: _notesController.text.trim(),
          couponCode: coupon?.code,
          clearCoupon: coupon == null,
        );
    await context.push('/payment');
    // The cart stays mounted underneath the pushed route, so unlike the web —
    // where navigating away unmounts the form — the flag has to be released or
    // the button stays dead for anyone who comes back to edit their order.
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final checkout = ref.watch(checkoutProvider);

    // Watched, not read: the store hydrates from disk asynchronously, so a
    // returning customer's data lands after the first build.
    if (checkout.loaded && !_prefilled) {
      _prefilled = true;
      _fill(_nameController, checkout.name);
      _fill(_phoneController, checkout.phone);
      _fill(_addressController, checkout.address);
      _fill(_notesController, checkout.notes);
    }

    final subtotal = ref.watch(cartTotalCentsProvider);
    final discount = _coupon?.discountCents ?? 0;
    // A flat coupon can exceed the cart — the customer is never owed money.
    final total = (subtotal - discount).clamp(0, subtotal);

    final prefillName = checkout.name;
    final table = ref.watch(tableSessionProvider);
    final isDineIn = table != null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Seu pedido'),
        leading: BackButton(onPressed: () => context.pop()),
        actions: [
          // The table outranks the customer chip: where the food goes matters
          // more than whose name is on it.
          if (isDineIn)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(
                child: HeaderChip(
                  label: '🍽️ Mesa ${table.number}',
                  emphasis: true,
                ),
              ),
            )
          else if (prefillName.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(child: HeaderChip(label: '👤 $prefillName')),
            ),
        ],
      ),
      body: items.isEmpty
          ? const _EmptyCart()
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: _kMaxContentWidth),
                child: SingleChildScrollView(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _ItemsCard(
                        items: items,
                        subtotal: subtotal,
                        discount: discount,
                        total: total,
                        couponCode: _coupon?.code,
                      ),
                      const SizedBox(height: 24),
                      _couponSection(),
                      const SizedBox(height: 24),
                      _formSection(
                        total,
                        prefilled: prefillName.isNotEmpty,
                        tableNumber: table?.number,
                      ),
                      const SizedBox(height: 40),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  /// Never overwrites what the customer has already typed — the hydration this
  /// waits on can land after they start filling the form.
  static void _fill(TextEditingController controller, String value) {
    if (controller.text.isEmpty) controller.text = value;
  }

  Widget _couponSection() {
    final coupon = _coupon;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Card(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Cupom de desconto',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              if (coupon != null)
                _AppliedCoupon(coupon: coupon, onRemove: _removeCoupon)
              else
                _couponInput(),
            ],
          ),
        ),
        if (_couponError != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _couponError!,
              style: const TextStyle(fontSize: 12, color: AppTheme.danger),
            ),
          ),
      ],
    );
  }

  Widget _couponInput() {
    return Row(
      children: [
        Expanded(
          child: Semantics(
            label: 'Código do cupom',
            textField: true,
            child: TextField(
              controller: _couponController,
              textCapitalization: TextCapitalization.characters,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _applyCoupon(),
              // textCapitalization only hints the keyboard; a paste or a
              // hardware keyboard would still deliver lowercase.
              inputFormatters: [_UpperCaseFormatter()],
              onChanged: (_) => setState(() => _couponError = null),
              style: const TextStyle(fontSize: 14, fontFamily: 'monospace'),
              decoration: const InputDecoration(
                hintText: 'CÓDIGO',
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: _couponLoading || _couponController.text.trim().isEmpty
              ? null
              : _applyCoupon,
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            minimumSize: Size.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: Text(
            _couponLoading ? '...' : 'Aplicar',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Widget _formSection(
    int total, {
    required bool prefilled,
    required int? tableNumber,
  }) {
    final isDineIn = tableNumber != null;

    return _Card(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isDineIn ? 'Seus dados (mesa)' : 'Seus dados',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (isDineIn)
                  _MesaChip(number: tableNumber)
                else if (prefilled)
                  const _PrefilledChip(),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Nome *',
                hintText: 'Seu nome',
                prefixIcon: Icon(Icons.person_outline),
              ),
              textCapitalization: TextCapitalization.words,
              validator: (v) {
                if (v == null || v.trim().length < 2) {
                  return 'Digite seu nome (mínimo 2 caracteres)';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phoneController,
              decoration: const InputDecoration(
                labelText: 'Telefone / WhatsApp *',
                hintText: '(47) 99999-9999',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
              keyboardType: TextInputType.phone,
              validator: (v) {
                // Digits, not characters: '(47) 999' is 8 characters but only
                // 5 digits, and would otherwise pass here and fail on the web.
                final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                if (digits.length < 8) return 'Digite um número válido';
                return null;
              },
            ),
            const SizedBox(height: 12),
            // Replaced, not disabled: a greyed-out address field invites the
            // guest to wonder what is wrong with it.
            if (isDineIn)
              _DineInNotice(number: tableNumber)
            else
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: 'Endereço de entrega *',
                  hintText: 'Rua, número, bairro',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
                textCapitalization: TextCapitalization.words,
                validator: (v) {
                  if (v == null || v.trim().length < 4) {
                    return 'Informe o endereço de entrega.';
                  }
                  return null;
                },
              ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Observações',
                hintText: 'Sem cebola, ponto da carne...',
                prefixIcon: Icon(Icons.notes_outlined),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _loading ? null : _goToPayment,
              style: FilledButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: Text(
                _loading
                    ? 'Indo para pagamento...'
                    : 'Ir para pagamento · ${formatPrice(total)}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Uppercases as the customer types so the field always shows what will be sent.
class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      padding: padding,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 2,
            offset: Offset(0, 1),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({
    required this.items,
    required this.subtotal,
    required this.discount,
    required this.total,
    required this.couponCode,
  });

  final List<CartItem> items;
  final int subtotal;
  final int discount;
  final int total;
  final String? couponCode;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            _CartItemRow(item: items[i], divided: i < items.length - 1),
          _TotalsBlock(
            subtotal: subtotal,
            discount: discount,
            total: total,
            couponCode: couponCode,
          ),
        ],
      ),
    );
  }
}

class _TotalsBlock extends StatelessWidget {
  const _TotalsBlock({
    required this.subtotal,
    required this.discount,
    required this.total,
    required this.couponCode,
  });

  final int subtotal;
  final int discount;
  final int total;
  final String? couponCode;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.background,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        children: [
          _row(
            'Subtotal',
            formatPrice(subtotal),
            const TextStyle(fontSize: 14, color: AppTheme.textSecondary),
          ),
          if (discount > 0) ...[
            const SizedBox(height: 4),
            _row(
              'Desconto (${couponCode ?? ''})',
              // U+2212 MINUS: a hyphen beside a currency reads as a stray dash.
              '−${formatPrice(discount)}',
              const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppTheme.successDeep,
              ),
            ),
          ],
          const SizedBox(height: 4),
          const Divider(height: 1, thickness: 1, color: AppTheme.border),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Total',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
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
        ],
      ),
    );
  }

  static Widget _row(String label, String value, TextStyle style) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text(value, style: style),
        ],
      );
}

class _CartItemRow extends ConsumerWidget {
  const _CartItemRow({required this.item, required this.divided});

  final CartItem item;
  final bool divided;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(cartProvider.notifier);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: divided
            ? const Border(bottom: BorderSide(color: AppTheme.border))
            : null,
      ),
      child: Row(
        children: [
          ProductThumb(imageUrl: item.imageUrl, name: item.name),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.textPrimary,
                  ),
                ),
                Text(
                  formatPrice(item.priceCents),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brandTan,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _CircleButton(
            icon: Icons.remove,
            // Decrement is not the primary action — painting it red would give
            // it the same weight as add.
            background: AppTheme.surfaceAlt,
            foreground: AppTheme.textSecondary,
            semanticLabel: 'Diminuir ${item.name}',
            onTap: () => notifier.setQty(item.productId, item.qty - 1),
          ),
          SizedBox(
            width: 28,
            child: Text(
              '${item.qty}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
          _CircleButton(
            icon: Icons.add,
            background: AppTheme.brand,
            foreground: Colors.white,
            semanticLabel: 'Aumentar ${item.name}',
            onTap: () => notifier.setQty(item.productId, item.qty + 1),
          ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    required this.icon,
    required this.onTap,
    required this.background,
    required this.foreground,
    required this.semanticLabel,
  });

  final IconData icon;
  final VoidCallback onTap;
  final Color background;
  final Color foreground;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: background,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkResponse(
          onTap: onTap,
          radius: 20,
          child: SizedBox(
            width: 28,
            height: 28,
            child: Icon(icon, size: 18, color: foreground),
          ),
        ),
      ),
    );
  }
}

class _AppliedCoupon extends StatelessWidget {
  const _AppliedCoupon({required this.coupon, required this.onRemove});

  final CouponResult coupon;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.successSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.successBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  coupon.code,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.successDark,
                  ),
                ),
                if (coupon.description != null)
                  Text(
                    coupon.description!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.successDeep,
                    ),
                  ),
                Text(
                  '−${formatPrice(coupon.discountCents)} aplicado',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.successDeep,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onRemove,
            style: TextButton.styleFrom(
              foregroundColor: AppTheme.successDeep,
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            ),
            child: const Text(
              'Remover',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

/// Stands in for the address field while seated — says why it is gone.
class _DineInNotice extends StatelessWidget {
  const _DineInNotice({required this.number});

  final int number;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Text.rich(
        TextSpan(
          style: const TextStyle(fontSize: 14, color: AppTheme.textSecondary),
          children: [
            const TextSpan(text: '🍽️ Pedido para consumo na '),
            TextSpan(
              text: 'Mesa $number',
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            const TextSpan(text: '. Não precisa de endereço.'),
          ],
        ),
      ),
    );
  }
}

/// The "Mesa N" tag beside the form heading — the brand-red counterpart of
/// _PrefilledChip, which it replaces while seated.
class _MesaChip extends StatelessWidget {
  const _MesaChip({required this.number});

  final int number;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.brandSoft,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.brand.withValues(alpha: 0.4)),
      ),
      child: Text(
        'Mesa $number',
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppTheme.brand,
        ),
      ),
    );
  }
}

class _PrefilledChip extends StatelessWidget {
  const _PrefilledChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.surfaceAlt,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.border),
      ),
      child: const Text(
        'Pré-preenchido',
        style: TextStyle(fontSize: 12, color: AppTheme.brandTan),
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();

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
              'Seu carrinho está vazio',
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
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
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
