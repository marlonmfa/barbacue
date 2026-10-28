import 'management_api.dart';
import 'package:flutter/foundation.dart';

/// Mirrors the administrative site and desktop. The server authorizes every
/// page and mutation again; this catalog only controls navigation.
class PanelModule {
  const PanelModule(
    this.id,
    this.title,
    this.path,
    this.group,
    this.permission,
  );
  final String id, title, path, group;
  final String? permission;
  bool availableTo(StaffSession session) =>
      !session.mustChangePassword &&
      (permission == 'admin'
          ? session.role == 'admin'
          : permission == null || session.can(permission!));
}

const panelModules = [
  PanelModule(
    'workspace',
    'Meu trabalho',
    '/admin/workspace',
    'Operação',
    null,
  ),
  PanelModule('dashboard', 'Visão geral', '/admin', 'Operação', 'dashboard'),
  PanelModule(
    'orders',
    'Caixa e pedidos',
    '/admin/orders',
    'Operação',
    'orders',
  ),
  PanelModule(
    'whatsapp',
    'Atendimento / WhatsApp',
    '/whatsapp',
    'Operação',
    'admin',
  ),
  PanelModule('ifood', 'Gestor iFood', '/admin/ifood', 'Operação', 'ifood'),
  PanelModule(
    'kitchen',
    'Cozinha e impressoras',
    '/admin/kitchen',
    'Operação',
    'kitchen',
  ),
  PanelModule('floor', 'Salão', '/admin/waiter', 'Operação', 'floor'),
  PanelModule(
    'delivery',
    'Minhas entregas',
    '/admin/delivery',
    'Operação',
    'deliveries',
  ),
  PanelModule(
    'service',
    'Testar pedido',
    '/teste_pedido',
    'Operação',
    'service',
  ),
  PanelModule(
    'catalogs',
    'Produtos e cardápios',
    '/admin/catalogs',
    'Cardápios',
    'catalog',
  ),
  PanelModule(
    'products',
    'Cadastro de produtos',
    '/admin/products',
    'Cardápios',
    'catalog',
  ),
  PanelModule(
    'categories',
    'Categorias',
    '/admin/categories',
    'Cardápios',
    'catalog',
  ),
  PanelModule(
    'coupons',
    'Ofertas e cupons',
    '/admin/coupons',
    'Cardápios',
    'offers',
  ),
  PanelModule('erp', 'ERP e financeiro', '/admin/erp', 'Gestão', 'admin'),
  PanelModule(
    'tables',
    'Mesas e QR codes',
    '/admin/tables',
    'Gestão',
    'tables',
  ),
  PanelModule(
    'customers',
    'Clientes',
    '/admin/customers',
    'Gestão',
    'customers',
  ),
  PanelModule('team', 'Funcionários', '/admin/team', 'Gestão', 'admin'),
  PanelModule('staff', 'Usuários e acessos', '/admin/staff', 'Gestão', 'admin'),
  PanelModule(
    'settings',
    'Loja e horários',
    '/admin/settings',
    'Gestão',
    'settings',
  ),
  PanelModule(
    'freight',
    'Entrega e frete',
    '/admin/delivery-settings',
    'Gestão',
    'settings',
  ),
  PanelModule('beta', 'Beta do aplicativo', '/admin/beta', 'Sistema', 'beta'),
  PanelModule('system', 'Integrações', '/admin/system', 'Sistema', 'admin'),
  PanelModule(
    'downloads',
    'Programa Windows',
    '/admin/downloads',
    'Sistema',
    'admin',
  ),
  PanelModule('access', 'Acessos', '/admin/impersonate', 'Sistema', 'admin'),
];

class PanelPolicy {
  PanelPolicy(this.origin) {
    if ((origin.scheme != 'https' && !localQa) ||
        origin.host.isEmpty ||
        origin.userInfo.isNotEmpty ||
        origin.hasQuery ||
        origin.hasFragment ||
        !['', '/'].contains(origin.path)) {
      throw ArgumentError('A gestão exige uma origem HTTPS válida.');
    }
  }
  final Uri origin;
  // Only a debug integration-test build can use a loopback HTTP fixture.
  // Release binaries reject HTTP even if this define is accidentally supplied.
  bool get localQa =>
      !kReleaseMode &&
      const bool.fromEnvironment('MANAGEMENT_PANEL_QA') &&
      origin.scheme == 'http' &&
      ['127.0.0.1', 'localhost', '::1'].contains(origin.host);
  // The site's own web SSO can redirect to its issuer. No native bridge,
  // downloads, media permission or session inspection runs on the issuer page.
  bool authentication(Uri uri) =>
      origin.host == 'barbacue.cog.ia.br' &&
      uri.scheme == 'https' &&
      uri.origin == 'https://id.cog.ia.br' &&
      uri.userInfo.isEmpty;
  bool internal(Uri uri) =>
      (uri.scheme == 'https' || (localQa && uri.scheme == 'http')) &&
      uri.origin == origin.origin &&
      uri.userInfo.isEmpty;
  bool downloadable(Uri uri) =>
      internal(uri) ||
      (uri.scheme == 'blob' && internal(Uri.tryParse(uri.path) ?? Uri()));
  bool external(Uri uri) =>
      uri.userInfo.isEmpty &&
      ['https', 'tel', 'mailto', 'geo', 'whatsapp'].contains(uri.scheme);
  PanelModule? moduleFor(Uri uri) {
    if (!internal(uri)) return null;
    for (final module in panelModules) {
      if (uri.path == module.path ||
          (module.path != '/admin' && uri.path.startsWith('${module.path}/'))) {
        return module;
      }
    }
    return null;
  }
}

String panelFileName(String? value) {
  final safe = (value ?? 'arquivo')
      .split(RegExp(r'[/\\]'))
      .last
      .replaceAll(RegExp(r'[^a-zA-Z0-9áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ._ -]'), '_')
      .replaceAll(RegExp(r'^\.+'), '')
      .trim();
  return safe.isEmpty
      ? 'arquivo'
      : safe.substring(0, safe.length.clamp(0, 120));
}
