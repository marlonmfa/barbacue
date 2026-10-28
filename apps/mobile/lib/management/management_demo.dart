import 'management_api.dart';

/// Local, explicitly labelled demonstration for store review and first use.
/// It never calls the server and contains no real accounts or customer data.
class ManagementDemoApi extends ManagementApi {
  final List<Json> orders = [
    for (final entry in ['barbacue', 'chelas', 'barbadog'].indexed)
      {
        'id': 'demo-${entry.$1 + 1}',
        'brand': entry.$2,
        'customerName': 'Cliente de demonstração',
        'status': 'confirmed',
        'createdAt': DateTime.now().toIso8601String(),
        'totalCents': 4200,
        'orderType': entry.$1 == 1 ? 'dine_in' : 'delivery',
        'tableNumber': entry.$1 == 1 ? 2 : null,
        'items': [
          {
            'name': ['Hambúrguer da casa', 'Burrito', 'Hot dog'][entry.$1],
            'qty': 1,
            'notes': 'Pedido fictício',
          },
        ],
        'paymentStatus': 'paid',
        'deliveryStatus': 'assigned',
        'amountToCollectCents': 0,
      },
  ];
  final List<Json> products = [
    for (final entry in ['barbacue', 'chelas', 'barbadog'].indexed)
      {
        'id': entry.$1 + 1,
        'brand': entry.$2,
        'name': ['Hambúrguer da casa', 'Burrito', 'Hot dog'][entry.$1],
        'category': 'Exemplos',
        'description': 'Produto fictício para conhecer o aplicativo.',
        'priceCents': 4200,
        'available': true,
      },
  ];
  final Json settings = {
    'storeName': 'Loja de demonstração',
    'isOpen': true,
    'openingHours': 'Dados fictícios',
    'address': 'Endereço de demonstração',
  };

  @override
  Future<StaffSession> session() async => StaffSession({
    'name': 'Demonstração',
    'role': 'admin',
    'mustChangePassword': false,
  });

  @override
  Future<dynamic> request(String method, String path, [Json? body]) async {
    final endpoint = path.split('/')[3];
    if (endpoint == 'auth') return {'ok': true};
    if (method == 'GET') {
      return switch (endpoint) {
        'dashboard' => {
          'metrics': {
            'orders': orders.length,
            'products': products.length,
            'customers': 1,
            'coupons': 1,
          },
          'brands': [
            for (final brand in ['barbacue', 'chelas', 'barbadog'])
              {
                'id': brand,
                'name': brand == 'barbacue'
                    ? 'Barbacue'
                    : brand == 'chelas'
                    ? 'Chelas'
                    : 'Barbadog',
                'detail': 'Dados fictícios',
                'itemCount': 1,
              },
          ],
          'recentOrders': orders,
        },
        'orders' || 'delivery' => orders,
        'kitchen' =>
          orders
              .where(
                (row) =>
                    ['confirmed', 'preparing', 'ready'].contains(row['status']),
              )
              .toList(),
        'waiter' => {
          'tables': [
            {'id': 1, 'number': 2},
          ],
          'orders': orders
              .where((row) => row['orderType'] == 'dine_in')
              .toList(),
        },
        'catalogs' => products,
        'settings' => settings,
        'customers' => [
          {
            'name': 'Cliente de demonstração',
            'phone': 'Dados fictícios',
            'email': '',
          },
        ],
        'tables' => [
          {'number': 2, 'label': 'Mesa de exemplo', 'active': true},
        ],
        'coupons' => [
          {
            'code': 'EXEMPLO',
            'description': 'Cupom fictício',
            'discountType': 'percentage',
            'discountValue': 10,
            'active': true,
          },
        ],
        _ => [],
      };
    }
    if (endpoint == 'catalogs') {
      if (method == 'POST') {
        products.add({...?body, 'id': products.length + 1});
      } else {
        products
            .firstWhere(
              (row) =>
                  '${row['id']}' == path.split('/').last &&
                  row['brand'] == path.split('/')[4],
            )
            .addAll(body!);
      }
    } else if (endpoint == 'settings') {
      settings.addAll(body!);
    } else {
      final id = endpoint == 'orders' ? path.split('/').last : body?['id'];
      final order = orders.firstWhere((row) => row['id'] == id);
      order.addAll(body!);
      if (body['deliveryStatus'] == 'delivered') order['status'] = 'delivered';
    }
    return {'ok': true};
  }
}
