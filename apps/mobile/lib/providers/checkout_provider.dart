import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  const CheckoutState({
    this.name = '',
    this.phone = '',
    this.address = '',
    this.notes = '',
    this.paymentMethod = 'pix',
    this.changeForCents,
  });

  CheckoutState copyWith({
    String? name,
    String? phone,
    String? address,
    String? notes,
    String? paymentMethod,
    int? changeForCents,
    bool clearChange = false,
  }) =>
      CheckoutState(
        name: name ?? this.name,
        phone: phone ?? this.phone,
        address: address ?? this.address,
        notes: notes ?? this.notes,
        paymentMethod: paymentMethod ?? this.paymentMethod,
        changeForCents: clearChange ? null : (changeForCents ?? this.changeForCents),
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'phone': phone,
        'address': address,
        'notes': notes,
        'paymentMethod': paymentMethod,
        'changeForCents': changeForCents,
      };

  factory CheckoutState.fromJson(Map<String, dynamic> json) => CheckoutState(
        name: json['name'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        address: json['address'] as String? ?? '',
        notes: json['notes'] as String? ?? '',
        paymentMethod: json['paymentMethod'] as String? ?? 'pix',
        changeForCents: json['changeForCents'] as int?,
      );
}

class CheckoutNotifier extends Notifier<CheckoutState> {
  @override
  CheckoutState build() {
    _load();
    return const CheckoutState();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kCheckoutKey);
    if (raw == null) return;
    try {
      state = CheckoutState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // corrupted storage — ignore
    }
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
  }) {
    state = state.copyWith(
      name: name,
      phone: phone,
      address: address,
      notes: notes,
      paymentMethod: paymentMethod,
      changeForCents: changeForCents,
      clearChange: clearChange,
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
