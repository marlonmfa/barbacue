import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/table_session.dart';
import 'table_session_provider.dart';

const _kCheckoutKey = 'barbacue-checkout';

/// Customer + payment state shared by the manual cart form, the AI agent, and
/// the payment screen — the mobile mirror of the web `useCheckout` store. This
/// is what makes "tap the menu" and "chat with the agent" produce one order.
class CheckoutState {
  final String name;
  final String phone;
  final String address;
  final String notes;
  final String paymentMethod; // pix | cash | card_on_delivery
  final int? changeForCents;

  /// Code only — the discount itself is never trusted from local state.
  final String? couponCode;

  /// delivery (needs an address) | dine_in (tied to a table, no address).
  final String orderType;

  /// The seated table, when there is one. The token is what the server acts on;
  /// the number is display-only — /api/orders re-resolves it from the token.
  final String? tableToken;
  final int? tableNumber;

  /// False until the persisted store has been read back. Consumers that prefill
  /// form fields must wait for this: the notifier answers synchronously with the
  /// empty default while SharedPreferences resolves, and a returning customer's
  /// saved data would otherwise be missed on the first read of every launch.
  final bool loaded;

  const CheckoutState({
    this.name = '',
    this.phone = '',
    this.address = '',
    this.notes = '',
    this.paymentMethod = 'pix',
    this.changeForCents,
    this.couponCode,
    this.orderType = 'delivery',
    this.tableToken,
    this.tableNumber,
    this.loaded = false,
  });

  CheckoutState copyWith({
    String? name,
    String? phone,
    String? address,
    String? notes,
    String? paymentMethod,
    int? changeForCents,
    bool clearChange = false,
    String? couponCode,
    bool clearCoupon = false,
    String? orderType,
    String? tableToken,
    int? tableNumber,
    bool clearTable = false,
    bool? loaded,
  }) =>
      CheckoutState(
        name: name ?? this.name,
        phone: phone ?? this.phone,
        address: address ?? this.address,
        notes: notes ?? this.notes,
        paymentMethod: paymentMethod ?? this.paymentMethod,
        changeForCents: clearChange ? null : (changeForCents ?? this.changeForCents),
        couponCode: clearCoupon ? null : (couponCode ?? this.couponCode),
        orderType: orderType ?? this.orderType,
        tableToken: clearTable ? null : (tableToken ?? this.tableToken),
        tableNumber: clearTable ? null : (tableNumber ?? this.tableNumber),
        loaded: loaded ?? this.loaded,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'phone': phone,
        'address': address,
        'notes': notes,
        'paymentMethod': paymentMethod,
        'changeForCents': changeForCents,
        'couponCode': couponCode,
        'orderType': orderType,
        'tableToken': tableToken,
        'tableNumber': tableNumber,
      };

  // `loaded` is deliberately absent from the JSON — it describes this session's
  // hydration, not the customer.
  factory CheckoutState.fromJson(Map<String, dynamic> json) => CheckoutState(
        name: json['name'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        address: json['address'] as String? ?? '',
        notes: json['notes'] as String? ?? '',
        paymentMethod: json['paymentMethod'] as String? ?? 'pix',
        changeForCents: json['changeForCents'] as int?,
        couponCode: json['couponCode'] as String?,
        orderType: json['orderType'] as String? ?? 'delivery',
        tableToken: json['tableToken'] as String?,
        tableNumber: json['tableNumber'] as int?,
      );
}

class CheckoutNotifier extends Notifier<CheckoutState> {
  bool _touched = false;

  @override
  CheckoutState build() {
    // The table session, not this store, decides the order type. Listened to
    // here rather than mirrored from the cart screen: the AI agent can land on
    // /payment without /cart ever being built, and the two must still agree.
    ref.listen(tableSessionProvider, (_, table) => _syncTable(table));
    _load();
    return _withTable(const CheckoutState(), ref.read(tableSessionProvider));
  }

  /// The table is authoritative over all three fields — a seated guest never
  /// keeps a delivery order type, and leaving never keeps a token.
  static CheckoutState _withTable(CheckoutState s, TableSession? table) =>
      table == null
          ? s.copyWith(orderType: 'delivery', clearTable: true)
          : s.copyWith(
              orderType: 'dine_in',
              tableToken: table.token,
              tableNumber: table.number,
            );

  void _syncTable(TableSession? table) {
    state = _withTable(state, table);
    _persist();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kCheckoutKey);
    // A caller that already wrote wins: the read is async, so hydrating over a
    // fresh update() would resurrect the previous order's data.
    if (raw != null && !_touched) {
      try {
        state = CheckoutState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      } catch (_) {
        // corrupted storage — ignore
      }
    }
    // Re-asserted after hydration: the persisted blob carries the *last*
    // session's table, which a lapsed or abandoned one would otherwise restore.
    state = _withTable(state, ref.read(tableSessionProvider))
        .copyWith(loaded: true);
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kCheckoutKey, jsonEncode(state.toJson()));
  }

  void update({
    String? name,
    String? phone,
    String? address,
    String? notes,
    String? paymentMethod,
    int? changeForCents,
    bool clearChange = false,
    String? couponCode,
    bool clearCoupon = false,
    String? orderType,
    int? tableNumber,
  }) {
    _touched = true;
    state = state.copyWith(
      name: name,
      phone: phone,
      address: address,
      notes: notes,
      paymentMethod: paymentMethod,
      changeForCents: changeForCents,
      clearChange: clearChange,
      couponCode: couponCode,
      clearCoupon: clearCoupon,
      orderType: orderType,
      tableNumber: tableNumber,
    );
    _persist();
  }
}

final checkoutProvider =
    NotifierProvider<CheckoutNotifier, CheckoutState>(CheckoutNotifier.new);

const paymentLabels = <String, String>{
  'pix': 'Pix',
  'cash': 'Dinheiro na entrega',
  'card_on_delivery': 'Cartão na entrega',
};
