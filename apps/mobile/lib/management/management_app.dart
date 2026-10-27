import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import 'management_api.dart';
import 'management_demo.dart';

Future<void> _privacy() async {
  await launchUrl(
    Uri.https('barbacue.cog.ia.br', '/legal/gestao/privacy.html'),
    mode: LaunchMode.externalApplication,
  );
}

const _red = Color(0xFFC51E2B);
const _ink = Color(0xFF24292E);
const _brands = {
  'barbacue': 'Barbacue',
  'chelas': 'Chelas',
  'barbadog': 'Barbadog',
};
const _statuses = {
  'pending': 'Pendente',
  'confirmed': 'Confirmado',
  'preparing': 'Em preparo',
  'ready': 'Pronto',
  'delivered': 'Concluído',
  'cancelled': 'Cancelado',
};
String _money(dynamic cents) => NumberFormat.currency(
  locale: 'pt_BR',
  symbol: 'R\$',
).format((cents is num ? cents : 0) / 100);
List<Json> _rows(dynamic value) =>
    (value is List ? value : []).whereType<Json>().toList();

class ManagementModule {
  const ManagementModule(this.permission, this.title, this.endpoint, this.icon);
  final String permission, title, endpoint;
  final IconData icon;
}

const managementModules = [
  ManagementModule(
    'dashboard',
    'Visão geral',
    'dashboard',
    Icons.space_dashboard_outlined,
  ),
  ManagementModule('orders', 'Pedidos', 'orders', Icons.receipt_long_outlined),
  ManagementModule(
    'kitchen',
    'Cozinha',
    'kitchen',
    Icons.soup_kitchen_outlined,
  ),
  ManagementModule('floor', 'Salão', 'waiter', Icons.table_restaurant_outlined),
  ManagementModule(
    'deliveries',
    'Minhas entregas',
    'delivery',
    Icons.delivery_dining_outlined,
  ),
  ManagementModule(
    'catalog',
    'Cardápios',
    'catalogs',
    Icons.restaurant_menu_outlined,
  ),
  ManagementModule('tables', 'Mesas', 'tables', Icons.qr_code_outlined),
  ManagementModule('customers', 'Clientes', 'customers', Icons.people_outline),
  ManagementModule('offers', 'Cupons', 'coupons', Icons.local_offer_outlined),
  ManagementModule('settings', 'Loja', 'settings', Icons.storefront_outlined),
];

class ManagementApp extends StatelessWidget {
  const ManagementApp({super.key, this.api});
  final ManagementApi? api;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Barbacue Gestão',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _red,
        primary: _red,
        surface: Colors.white,
      ),
      scaffoldBackgroundColor: const Color(0xFFF3F5F7),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: _ink,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: Color(0xFFF3F5F7),
        border: OutlineInputBorder(),
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontFamily: 'Anton',
          color: _ink,
          fontSize: 36,
        ),
        headlineSmall: TextStyle(
          fontFamily: 'Anton',
          color: _ink,
          fontSize: 25,
        ),
      ),
    ),
    home: _Workspace(api: api),
  );
}

class _Workspace extends StatefulWidget {
  const _Workspace({this.api});
  final ManagementApi? api;
  @override
  State<_Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<_Workspace> with WidgetsBindingObserver {
  late ManagementApi api = widget.api ?? ManagementApi();
  bool demo = false;
  StaffSession? session;
  ManagementModule? module;
  dynamic data;
  String? error;
  String brand = 'all', search = '', status = 'active';
  bool loading = false, saving = false, signingOut = false;
  bool logoutFailed = false;
  int revision = 0;
  Timer? timer;
  List<ManagementModule> get modules =>
      managementModules.where((m) => session!.can(m.permission)).toList();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (api.supportsCog) unawaited(restoreCog());
    timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed &&
          [
            'orders',
            'kitchen',
            'waiter',
            'delivery',
          ].contains(module?.endpoint)) {
        unawaited(load());
      }
    });
  }

  Future<void> restoreCog() async {
    final version = revision;
    try {
      final current = await api.restoreCogOrNative();
      if (mounted && version == revision && current != null) signedIn(current);
    } catch (_) {
      // Existing local login remains available when Cog cannot be confirmed.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        session != null &&
        !session!.mustChangePassword) {
      unawaited(load());
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    if (widget.api == null || demo) api.dispose();
    super.dispose();
  }

  void signedIn(StaffSession value) {
    setState(() {
      session = value;
      module = modules.firstOrNull;
      data = null;
      error = null;
      logoutFailed = false;
    });
    if (!value.mustChangePassword) unawaited(load());
  }

  void expired() {
    revision++;
    api.clear();
    setState(() {
      session = null;
      module = null;
      data = null;
      error = null;
      logoutFailed = false;
      loading = false;
    });
  }

  Future<void> load() async {
    if (session == null ||
        session!.mustChangePassword ||
        loading ||
        saving ||
        signingOut) {
      return;
    }
    final version = ++revision;
    setState(() {
      loading = true;
      error = null;
      logoutFailed = false;
    });
    try {
      final current = await api.session();
      if (!mounted || version != revision) return;
      if (current.mustChangePassword) {
        setState(() {
          session = current;
          data = null;
        });
        return;
      }
      session = current;
      if (module == null || !current.can(module!.permission)) {
        module = modules.firstOrNull;
        data = null;
      }
      if (module == null) return;
      final result = await api.request('GET', '/api/admin/${module!.endpoint}');
      if (mounted && version == revision) setState(() => data = result);
    } catch (e) {
      if (!mounted || version != revision) return;
      if (e is ManagementException && e.status == 401) {
        expired();
        return;
      }
      setState(() {
        error = e.toString();
        data = null;
      });
    } finally {
      if (mounted && version == revision) setState(() => loading = false);
    }
  }

  Future<bool> mutate(String method, String path, Json body) async {
    if (saving || loading) return false;
    setState(() => saving = true);
    var success = false;
    try {
      await api.request(method, path, body);
      success = true;
    } catch (e) {
      if (!mounted) return false;
      if (e is ManagementException && e.status == 401) expired();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => saving = false);
    }
    if (success && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Alteração salva.')));
      await load();
    }
    return success;
  }

  Future<void> logout() async {
    if (signingOut || saving) return;
    setState(() {
      signingOut = true;
      logoutFailed = false;
      error = null;
    });
    // Invalidate in-flight reads before the logout response arrives.
    revision++;
    final cog = api.usingCog;
    try {
      await api.logout();
      if (cog) {
        StaffSession? local;
        try {
          local = await api.session();
        } catch (_) {
          /* no native account */
        }
        if (mounted) {
          setState(() => signingOut = false);
          if (local != null) {
            signedIn(local);
          } else {
            expired();
          }
        }
        return;
      }
    } catch (failure) {
      if (cog) {
        if (mounted) {
          setState(() {
            error = failure.toString();
            logoutFailed = true;
            signingOut = false;
          });
        }
        return;
      }
      api.clear();
    }
    if (mounted) {
      if (demo) {
        api.dispose();
        api = widget.api ?? ManagementApi();
        demo = false;
      }
      expired();
      setState(() => signingOut = false);
    }
  }

  Future<void> openDemo() async {
    revision++;
    api.cancelCog();
    if (widget.api == null) api.dispose();
    api = ManagementDemoApi();
    demo = true;
    signedIn(await api.session());
  }

  @override
  Widget build(BuildContext context) {
    if (session == null) {
      return _AccessForm(api: api, onSession: signedIn, onDemo: openDemo);
    }
    if (session!.mustChangePassword) {
      return _AccessForm(
        api: api,
        onSession: signedIn,
        changePassword: true,
        onLogout: logout,
      );
    }
    final hasBrand = [
      'orders',
      'kitchen',
      'waiter',
      'delivery',
      'catalogs',
    ].contains(module?.endpoint);
    return Scaffold(
      appBar: AppBar(
        title: Text(module?.title ?? 'Gestão'),
        actions: [
          IconButton(
            tooltip: 'Privacidade e ajuda',
            onPressed: _privacy,
            icon: const Icon(Icons.privacy_tip_outlined),
          ),
          IconButton(
            tooltip: 'Atualizar',
            onPressed: loading || saving ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Barbacue Gestão',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(session!.name),
                    const Text('Barbacue • Chelas • Barbadog'),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView(
                  children: [
                    for (final item in modules)
                      ListTile(
                        selected: item == module,
                        leading: Icon(item.icon),
                        title: Text(item.title),
                        onTap: loading || saving
                            ? null
                            : () {
                                Navigator.pop(context);
                                setState(() {
                                  module = item;
                                  data = null;
                                  search = '';
                                  status = 'active';
                                });
                                unawaited(load());
                              },
                      ),
                  ],
                ),
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: Text(api.usingCog ? 'Sair da Cog' : 'Sair da conta'),
                onTap: saving || signingOut
                    ? null
                    : () {
                        Navigator.pop(context);
                        unawaited(logout());
                      },
              ),
            ],
          ),
        ),
      ),
      floatingActionButton:
          module?.endpoint == 'catalogs' && !loading && !saving && error == null
          ? FloatingActionButton.extended(
              onPressed: () => editProduct(),
              icon: const Icon(Icons.add),
              label: const Text('Novo produto'),
            )
          : null,
      body: SafeArea(
        child: Column(
          children: [
            if (demo)
              Container(
                width: double.infinity,
                color: const Color(0xFFFFE8AA),
                padding: const EdgeInsets.all(10),
                child: const Text(
                  'Demonstração · dados fictícios',
                  textAlign: TextAlign.center,
                ),
              ),
            if (loading || saving) const LinearProgressIndicator(minHeight: 3),
            if (hasBrand)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: SizedBox(
                  width: double.infinity,
                  child: Wrap(
                    spacing: 8,
                    children: [
                      for (final entry in {'all': 'Todas', ..._brands}.entries)
                        ChoiceChip(
                          label: Text(entry.value),
                          selected: brand == entry.key,
                          onSelected: saving
                              ? null
                              : (_) => setState(() => brand = entry.key),
                        ),
                    ],
                  ),
                ),
              ),
            if (module?.endpoint == 'catalogs' ||
                module?.endpoint == 'customers')
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  key: ValueKey(module!.endpoint),
                  decoration: const InputDecoration(
                    labelText: 'Buscar por nome',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (value) =>
                      setState(() => search = value.toLowerCase().trim()),
                ),
              ),
            if (module?.endpoint == 'orders')
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration: const InputDecoration(labelText: 'Etapa'),
                  items: [
                    for (final entry in {
                      'active': 'Em andamento',
                      'all': 'Todas as etapas',
                      ..._statuses,
                    }.entries)
                      DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value),
                      ),
                  ],
                  onChanged: (value) =>
                      setState(() => status = value ?? 'active'),
                ),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: load,
                child: LayoutBuilder(
                  builder: (context, constraints) => SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 900),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                          child: content(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget content() {
    if (error != null) {
      return _Message(
        icon: Icons.cloud_off_outlined,
        text: error!,
        action: logoutFailed ? logout : load,
      );
    }
    if (module == null) {
      return const _Message(
        icon: Icons.lock_outline,
        text:
            'Sua conta ainda não tem funções disponíveis neste aplicativo. Peça ao administrador para revisar seus acessos.',
      );
    }
    if (data == null) {
      return _Message(
        icon: module!.icon,
        text: loading ? 'Atualizando…' : 'Nenhum registro disponível.',
      );
    }
    if (module!.endpoint == 'dashboard') return dashboard(data as Json);
    if (module!.endpoint == 'settings') return settings(data as Json);
    var rows = module!.endpoint == 'waiter'
        ? _rows(data['orders'])
        : _rows(data);
    if ([
          'orders',
          'kitchen',
          'waiter',
          'delivery',
          'catalogs',
        ].contains(module!.endpoint) &&
        brand != 'all') {
      rows = rows.where((r) => r['brand'] == brand).toList();
    }
    if (search.isNotEmpty) {
      rows = rows
          .where((r) => '${r['name'] ?? ''}'.toLowerCase().contains(search))
          .toList();
    }
    if (module!.endpoint == 'orders') {
      rows = rows
          .where(
            (r) =>
                status == 'all' ||
                (status == 'active'
                    ? !['cancelled', 'delivered'].contains(r['status'])
                    : r['status'] == status),
          )
          .toList();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (module!.endpoint == 'waiter')
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              '${_rows(data['tables']).length} mesas ativas',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ),
        if (rows.isEmpty)
          const _Message(
            icon: Icons.check_circle_outline,
            text: 'Nenhum registro para esta seleção.',
          ),
        for (final row in rows)
          switch (module!.endpoint) {
            'orders' || 'kitchen' || 'waiter' || 'delivery' => orderCard(row),
            'catalogs' => productCard(row),
            'customers' => _Panel(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${row['name'] ?? 'Cliente'}'),
                subtitle: Text('${row['phone'] ?? ''}\n${row['email'] ?? ''}'),
              ),
            ),
            'tables' => _Panel(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.table_restaurant_outlined),
                title: Text('Mesa ${row['number']}'),
                subtitle: Text('${row['label'] ?? ''}'),
                trailing: Text(row['active'] == true ? 'Ativa' : 'Inativa'),
              ),
            ),
            'coupons' => _Panel(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${row['code']}'),
                subtitle: Text(
                  '${row['description'] ?? ''}\n${row['discountType'] == 'percentage' ? '${row['discountValue']}%' : _money(row['discountValue'])} de desconto',
                ),
                trailing: Text(row['active'] == true ? 'Ativo' : 'Inativo'),
              ),
            ),
            _ => const SizedBox.shrink(),
          },
      ],
    );
  }

  Widget dashboard(Json value) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        'A casa em movimento',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 8),
      const Text('Resumo acumulado da operação das três marcas.'),
      const SizedBox(height: 24),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final entry in {
            'orders': 'Pedidos',
            'products': 'Produtos',
            'customers': 'Clientes',
            'coupons': 'Cupons ativos',
          }.entries)
            SizedBox(
              width: 150,
              child: _Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${value['metrics']?[entry.key] ?? 0}',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    Text(entry.value),
                  ],
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: 16),
      for (final row in _rows(value['brands']))
        _Panel(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset(
                row['id'] == 'barbacue'
                    ? 'assets/icon/icon.png'
                    : 'assets/brands/${row['id']}-icon.png',
                width: 44,
                height: 44,
                semanticLabel: '${row['name']}',
              ),
            ),
            title: Text('${row['name']}'),
            subtitle: Text('${row['detail']}'),
            trailing: Text(
              '${row['itemCount']} ${row['itemCount'] == 1 ? 'item' : 'itens'}',
            ),
          ),
        ),
      const SizedBox(height: 16),
      Text('Últimos pedidos', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 12),
      if (_rows(value['recentOrders']).isEmpty)
        const Text('Os pedidos recebidos aparecerão aqui.'),
      for (final row in _rows(value['recentOrders']))
        orderCard(row, readOnly: true),
    ],
  );

  Widget orderCard(Json row, {bool readOnly = false}) {
    final id = '${row['id']}';
    final stage = '${row['status']}';
    final endpoint = module!.endpoint;
    final next = switch (endpoint) {
      'kitchen' => switch (stage) {
        'confirmed' => 'preparing',
        'preparing' => 'ready',
        _ => null,
      },
      'waiter' => stage == 'ready' ? 'delivered' : null,
      'delivery' =>
        row['deliveryStatus'] == 'assigned' && stage == 'ready'
            ? 'out_for_delivery'
            : row['deliveryStatus'] == 'out_for_delivery' && stage == 'ready'
            ? 'delivered'
            : null,
      _ => switch (stage) {
        'pending' => 'confirmed',
        'confirmed' => 'preparing',
        'preparing' => 'ready',
        'ready' => 'delivered',
        _ => null,
      },
    };
    final labels = {
      'confirmed': 'Confirmar pedido',
      'preparing': 'Iniciar preparo',
      'ready': 'Marcar pronto',
      'out_for_delivery': 'Iniciar entrega',
      'delivered': endpoint == 'waiter' ? 'Marcar servido' : 'Concluir pedido',
    };
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                '#${id.substring(0, id.length < 8 ? id.length : 8)}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                ),
              ),
              Text(_brands[row['brand']] ?? '${row['brand'] ?? ''}'),
              Chip(
                label: Text(_statuses[stage] ?? stage),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          if (row['customerName'] != null)
            Text(
              '${row['customerName']}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
          if (row['createdAt'] != null)
            Text(
              _date('${row['createdAt']}'),
              style: const TextStyle(color: Color(0xFF59636D)),
            ),
          if (row['tableNumber'] != null) Text('Mesa ${row['tableNumber']}'),
          if (row['deliveryAddress'] != null) Text('${row['deliveryAddress']}'),
          if (row['customerPhone'] != null) Text('${row['customerPhone']}'),
          const SizedBox(height: 10),
          for (final item in _rows(row['items']))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '${item['qty'] ?? 1} × ${item['name'] ?? 'Item'}${item['notes'] == null ? '' : '\n   ${item['notes']}'}',
              ),
            ),
          if (row['notes'] != null && '${row['notes']}'.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Observações: ${row['notes']}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          if (row['totalCents'] != null)
            Text(
              _money(row['totalCents']),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
          if (row['paymentStatus'] != null)
            Text(
              row['paymentStatus'] == 'paid'
                  ? 'Pagamento confirmado'
                  : 'Pagamento pendente',
            ),
          if (row['amountToCollectCents'] != null)
            Text('A cobrar: ${_money(row['amountToCollectCents'])}'),
          if (!readOnly && next != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: FilledButton(
                onPressed: saving || loading
                    ? null
                    : () => advanceOrder(row, next, labels[next]!),
                child: Text(labels[next]!),
              ),
            ),
          if (!readOnly &&
              endpoint == 'orders' &&
              !['cancelled', 'delivered'].contains(stage))
            TextButton(
              onPressed: saving || loading
                  ? null
                  : () => advanceOrder(row, 'cancelled', 'Cancelar pedido'),
              child: const Text('Cancelar pedido'),
            ),
        ],
      ),
    );
  }

  String _date(String value) {
    final date = DateTime.tryParse(value);
    return date == null ? '' : DateFormat('dd/MM HH:mm').format(date.toLocal());
  }

  Future<void> advanceOrder(Json row, String next, String label) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(label),
        content: Text(
          'Aplicar esta alteração ao pedido de ${row['customerName'] ?? 'mesa ${row['tableNumber'] ?? ''}'}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    final endpoint = module!.endpoint;
    await mutate(
      'PATCH',
      endpoint == 'orders'
          ? '/api/admin/orders/${Uri.encodeComponent('${row['id']}')}'
          : '/api/admin/$endpoint',
      endpoint == 'orders'
          ? {'status': next}
          : {
              'id': row['id'],
              endpoint == 'delivery' ? 'deliveryStatus' : 'status': next,
            },
    );
  }

  Widget productCard(Json row) => _Panel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${_brands[row['brand']]} / ${row['category']}',
          style: const TextStyle(color: Color(0xFF59636D)),
        ),
        const SizedBox(height: 8),
        Text(
          '${row['name']}',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        Text(_money(row['priceCents']), style: const TextStyle(fontSize: 18)),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(row['available'] == true ? 'Disponível' : 'Indisponível'),
          value: row['available'] == true,
          onChanged: saving || loading
              ? null
              : (available) => mutate(
                  'PATCH',
                  '/api/admin/catalogs/${row['brand']}/${row['id']}',
                  {'available': available},
                ),
        ),
        OutlinedButton.icon(
          onPressed: saving || loading ? null : () => editProduct(row),
          icon: const Icon(Icons.edit_outlined),
          label: const Text('Editar produto'),
        ),
      ],
    ),
  );

  Future<void> editProduct([Json? row]) async {
    final result = await showDialog<Json>(
      context: context,
      builder: (context) => _ProductForm(
        product: row,
        initialBrand: brand == 'all' ? 'barbacue' : brand,
      ),
    );
    if (result == null || !mounted) return;
    await mutate(
      row == null ? 'POST' : 'PATCH',
      row == null
          ? '/api/admin/catalogs'
          : '/api/admin/catalogs/${row['brand']}/${row['id']}',
      result,
    );
  }

  Widget settings(Json value) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        '${value['storeName'] ?? 'Loja'}',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 16),
      _Panel(
        child: SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Receber pedidos'),
          subtitle: const Text(
            'Os horários e dias de fechamento também são considerados.',
          ),
          value: value['isOpen'] == true,
          onChanged: saving || loading
              ? null
              : (open) =>
                    mutate('PATCH', '/api/admin/settings', {'isOpen': open}),
        ),
      ),
      _Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final entry in {
              'address': 'Endereço',
              'phone': 'Telefone',
              'openingHours': 'Horário',
              'deliveryFeeText': 'Entrega',
            }.entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  '${entry.value}\n${value[entry.key] ?? 'Não informado'}',
                ),
              ),
          ],
        ),
      ),
    ],
  );
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFE0E5E9)),
    ),
    child: child,
  );
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, this.action});
  final IconData icon;
  final String text;
  final VoidCallback? action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 48),
    child: Column(
      children: [
        Icon(icon, size: 40, color: const Color(0xFF59636D)),
        const SizedBox(height: 16),
        Text(text, textAlign: TextAlign.center),
        if (action != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: OutlinedButton(
              onPressed: action,
              child: const Text('Tentar novamente'),
            ),
          ),
      ],
    ),
  );
}

class _AccessForm extends StatefulWidget {
  const _AccessForm({
    required this.api,
    required this.onSession,
    this.changePassword = false,
    this.onLogout,
    this.onDemo,
  });
  final ManagementApi api;
  final ValueChanged<StaffSession> onSession;
  final bool changePassword;
  final VoidCallback? onLogout;
  final VoidCallback? onDemo;
  @override
  State<_AccessForm> createState() => _AccessFormState();
}

class _AccessFormState extends State<_AccessForm> {
  final form = GlobalKey<FormState>();
  final username = TextEditingController(), password = TextEditingController();
  final nextPassword = TextEditingController(),
      confirmation = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    username.dispose();
    password.dispose();
    nextPassword.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final StaffSession session;
      if (widget.changePassword) {
        await widget.api.request('POST', '/api/admin/change-password', {
          'currentPassword': password.text,
          'password': nextPassword.text,
          'confirmation': confirmation.text,
        });
        session = await widget.api.session();
      } else {
        session = await widget.api.login(username.text, password.text);
      }
      password.clear();
      nextPassword.clear();
      confirmation.clear();
      if (mounted) widget.onSession(session);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _red,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          'assets/icon/icon.png',
                          width: 68,
                          height: 68,
                          semanticLabel: 'Barbacue',
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Barbacue Gestão',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.changePassword
                        ? 'Defina sua nova senha para continuar.'
                        : 'Barbacue, Chelas e Barbadog.\nA operação da casa, na sua mão.',
                  ),
                  const SizedBox(height: 32),
                  if (!widget.changePassword) ...[
                    TextFormField(
                      controller: username,
                      enabled: !busy,
                      decoration: const InputDecoration(
                        labelText: 'Usuário ou e-mail',
                      ),
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      validator: (value) =>
                          value == null || value.trim().isEmpty
                          ? 'Informe seu usuário.'
                          : null,
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    controller: password,
                    enabled: !busy,
                    obscureText: true,
                    enableSuggestions: false,
                    autocorrect: false,
                    decoration: InputDecoration(
                      labelText: widget.changePassword
                          ? 'Senha atual'
                          : 'Senha',
                    ),
                    validator: (value) => value == null || value.isEmpty
                        ? 'Informe sua senha.'
                        : null,
                    onFieldSubmitted: (_) {
                      if (!widget.changePassword) unawaited(submit());
                    },
                  ),
                  if (widget.changePassword) ...[
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: nextPassword,
                      enabled: !busy,
                      obscureText: true,
                      enableSuggestions: false,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Nova senha',
                      ),
                      validator: (value) => value == null || value.length < 8
                          ? 'Use ao menos 8 caracteres.'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: confirmation,
                      enabled: !busy,
                      obscureText: true,
                      enableSuggestions: false,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Confirme a nova senha',
                      ),
                      validator: (value) => value != nextPassword.text
                          ? 'As senhas não coincidem.'
                          : null,
                    ),
                  ],
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(error!, style: const TextStyle(color: _red)),
                    ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: busy ? null : submit,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        busy
                            ? 'Aguarde…'
                            : widget.changePassword
                            ? 'Salvar nova senha'
                            : 'Entrar',
                      ),
                    ),
                  ),
                  if (widget.onLogout != null)
                    TextButton(
                      onPressed: busy ? null : widget.onLogout,
                      child: const Text('Sair da conta'),
                    ),
                  if (widget.onDemo != null)
                    OutlinedButton(
                      onPressed: busy ? null : widget.onDemo,
                      child: const Text('Ver demonstração'),
                    ),
                  TextButton(
                    onPressed: _privacy,
                    child: const Text('Privacidade e ajuda'),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Use sua conta individual da equipe.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _ProductForm extends StatefulWidget {
  const _ProductForm({this.product, required this.initialBrand});
  final Json? product;
  final String initialBrand;
  @override
  State<_ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends State<_ProductForm> {
  final form = GlobalKey<FormState>();
  late String brand = widget.product?['brand'] ?? widget.initialBrand;
  late final name = TextEditingController(text: widget.product?['name']);
  late final description = TextEditingController(
    text: widget.product?['description'],
  );
  late final category = TextEditingController(
    text: widget.product?['category'],
  );
  late final price = TextEditingController(
    text: widget.product == null
        ? ''
        : ((widget.product!['priceCents'] as num) / 100)
              .toStringAsFixed(2)
              .replaceAll('.', ','),
  );
  late bool available = widget.product?['available'] ?? true;
  int? cents(String value) {
    if (!RegExp(r'^\d+([,.]\d{1,2})?$').hasMatch(value.trim())) return null;
    final parsed = double.tryParse(value.trim().replaceAll(',', '.'));
    return parsed == null || parsed <= 0 ? null : (parsed * 100).round();
  }

  @override
  void dispose() {
    name.dispose();
    description.dispose();
    category.dispose();
    price.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.product == null ? 'Novo produto' : 'Editar produto'),
    content: SizedBox(
      width: 420,
      child: SingleChildScrollView(
        child: Form(
          key: form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.product == null) ...[
                DropdownButtonFormField<String>(
                  initialValue: brand,
                  decoration: const InputDecoration(labelText: 'Restaurante'),
                  items: [
                    for (final entry in _brands.entries)
                      DropdownMenuItem(
                        value: entry.key,
                        child: Text(entry.value),
                      ),
                  ],
                  onChanged: (value) => setState(() => brand = value!),
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Nome'),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Informe o nome.' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: category,
                decoration: const InputDecoration(labelText: 'Categoria'),
                validator: (v) => v == null || v.trim().isEmpty
                    ? 'Informe a categoria.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: price,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: 'Preço em reais'),
                validator: (v) => cents(v ?? '') == null
                    ? 'Informe um preço, como 29,90.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: description,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Descrição'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Disponível'),
                value: available,
                onChanged: (value) => setState(() => available = value),
              ),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Voltar'),
      ),
      FilledButton(
        onPressed: () {
          if (!form.currentState!.validate()) return;
          Navigator.pop(context, <String, dynamic>{
            if (widget.product == null) 'brand': brand,
            'name': name.text.trim(),
            'description': description.text.trim(),
            'category': category.text.trim(),
            'priceCents': cents(price.text),
            'available': available,
          });
        },
        child: const Text('Salvar'),
      ),
    ],
  );
}
