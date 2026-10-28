// These shortcuts mirror the administrative site. Authorization always remains
// on the server; choosing a shortcut never grants a permission.
export const moduleGroups = [
  { label: 'Operação', items: [
    { id: 'workspace', label: 'Meu trabalho', path: '/admin/workspace' },
    { id: 'dashboard', label: 'Visão geral', path: '/admin' },
    { id: 'orders', label: 'Caixa e pedidos', path: '/admin/orders', accelerator: 'F2' },
    { id: 'whatsapp', label: 'Atendimento / WhatsApp', path: '/whatsapp', accelerator: 'F3' },
    { id: 'ifood', label: 'Gestor iFood', path: '/admin/ifood' },
    { id: 'kitchen', label: 'Cozinha e impressoras', path: '/admin/kitchen', accelerator: 'F4' },
    { id: 'floor', label: 'Salão', path: '/admin/waiter' },
    { id: 'delivery', label: 'Minhas entregas', path: '/admin/delivery' },
    { id: 'service', label: 'Testar pedido', path: '/teste_pedido' },
  ] },
  { label: 'Cardápios', items: [
    { id: 'catalogs', label: 'Produtos e cardápios', path: '/admin/catalogs', accelerator: 'F6' },
    { id: 'products', label: 'Cadastro de produtos', path: '/admin/products' },
    { id: 'categories', label: 'Categorias', path: '/admin/categories' },
    { id: 'coupons', label: 'Ofertas e cupons', path: '/admin/coupons' },
  ] },
  { label: 'Gestão', items: [
    { id: 'erp', label: 'ERP e financeiro', path: '/admin/erp' },
    { id: 'tables', label: 'Mesas e QR codes', path: '/admin/tables' },
    { id: 'customers', label: 'Clientes', path: '/admin/customers' },
    { id: 'team', label: 'Funcionários', path: '/admin/team' },
    { id: 'staff', label: 'Usuários e acessos', path: '/admin/staff' },
    { id: 'settings', label: 'Loja e horários', path: '/admin/settings' },
    { id: 'freight', label: 'Entrega e frete', path: '/admin/delivery-settings' },
  ] },
  { label: 'Sistema', items: [
    { id: 'beta', label: 'Beta do aplicativo', path: '/admin/beta' },
    { id: 'system', label: 'Integrações', path: '/admin/system' },
    { id: 'downloads', label: 'Programa Windows', path: '/admin/downloads' },
    { id: 'access', label: 'Acessos', path: '/admin/impersonate' },
  ] },
];
export const modules = moduleGroups.flatMap(group => group.items);
export const homePath = '/admin/workspace';
export function modulePath(id) {
  const item = modules.find(item => item.id === id);
  if (!item) throw new Error('Escolha uma função válida do programa.');
  return item.path;
}
export function moduleForUrl(value) {
  try {
    const path = new URL(value).pathname;
    return modules.find(item => item.path === path)
      ?? modules.find(item => item.path !== '/admin' && path.startsWith(`${item.path}/`))
      ?? null;
  } catch { return null; }
}
