/** One catalog drives navigation, account editing and server authorization. */
export const STAFF_ROLES = ["admin", "manager", "cashier", "kitchen", "waiter", "driver", "employee"] as const;
export type AccessRole = typeof STAFF_ROLES[number];
export const ROLE_LABELS: Record<AccessRole, string> = { admin: "Administrador", manager: "Gerente", cashier: "Caixa", kitchen: "Cozinha", waiter: "Garçom", driver: "Entregador", employee: "Funcionário" };
export const ROLE_DESCRIPTIONS: Record<AccessRole, string> = {
  admin: "Acompanhe a operação, configure a loja e distribua os acessos da equipe.",
  manager: "Acompanhe os pedidos, o salão e o andamento da operação.",
  cashier: "Receba pedidos e organize a saída das entregas.",
  kitchen: "Prepare os pedidos e avise quando estiverem prontos.",
  waiter: "Acompanhe as mesas e leve os pedidos que estão prontos.",
  driver: "Veja suas entregas, abra a rota e registre cada conclusão.",
  employee: "Acesse as funções liberadas para o seu trabalho.",
};
export const PERMISSIONS = [
  { id: "dashboard", label: "Visão geral", description: "Consultar indicadores e resumo da operação", href: "/admin" },
  { id: "orders", label: "Caixa e pedidos", description: "Consultar pedidos e gerenciar atendimento e entrega", href: "/admin/orders" },
  { id: "kitchen", label: "Preparo na cozinha", description: "Ver itens e observações; iniciar e concluir o preparo", href: "/admin/kitchen" },
  { id: "floor", label: "Salão", description: "Acompanhar mesas, lançar pedidos e registrar quando foram servidos", href: "/admin/waiter" },
  { id: "deliveries", label: "Minhas entregas", description: "Consultar somente as entregas atribuídas à sua conta e registrar a saída e conclusão", href: "/admin/delivery" },
  { id: "catalog", label: "Cardápios", description: "Editar produtos, categorias, preços e imagens", href: "/admin/catalogs" },
  { id: "offers", label: "Ofertas e cupons", description: "Definir descontos para visitantes e clientes da casa", href: "/admin/coupons" },
  { id: "tables", label: "Mesas", description: "Administrar mesas e seus códigos de acesso", href: "/admin/tables" },
  { id: "customers", label: "Clientes", description: "Consultar o cadastro de clientes", href: "/admin/customers" },
  { id: "settings", label: "Loja e horários", description: "Editar dados públicos e funcionamento da loja", href: "/admin/settings" },
  { id: "service", label: "Atendimento", description: "Atender pelo WhatsApp e testar pedidos", href: "/whatsapp" },
  { id: "beta", label: "Beta do aplicativo", description: "Consultar inscritos no programa de testes", href: "/admin/beta" },
] as const;
export type Permission = typeof PERMISSIONS[number]["id"];
export const PERMISSION_IDS = PERMISSIONS.map(p => p.id);
export const DEFAULT_PERMISSIONS: Record<AccessRole, Permission[]> = {
  admin: [...PERMISSION_IDS], manager: [...PERMISSION_IDS], cashier: ["orders", "tables"], kitchen: ["kitchen"], waiter: ["floor"], driver: ["deliveries"], employee: [],
};
export interface Access { role: AccessRole; permissions?: Permission[] | null }
export function effectivePermissions(access: Access): Permission[] {
  return access.role === "admin" ? [...PERMISSION_IDS] : access.permissions ?? DEFAULT_PERMISSIONS[access.role];
}
export function can(access: Access, permission: Permission) { return effectivePermissions(access).includes(permission); }
export function permissionForPath(path: string): Permission | "admin" | null {
  const normalized = path.replace(/^\/api\/admin(?=\/|$)/, "/admin");
  const section = normalized.split("/")[2];
  if (normalized === "/admin" || normalized === "/admin/") return "dashboard";
  if (path === "/whatsapp" || path.startsWith("/whatsapp/") || path === "/teste_pedido") return "service";
  const map: Record<string, Permission | "admin"> = {
    orders: "orders", kitchen: "kitchen", waiter: "floor", delivery: "deliveries", catalogs: "catalog", products: "catalog", categories: "catalog", upload: "catalog",
    coupons: "offers", tables: "tables", customers: "customers", settings: "settings", "delivery-settings": "settings", "closed-days": "settings",
    whatsapp: "service", beta: "beta", team: "admin", employees: "admin", staff: "admin", system: "admin", downloads: "admin", impersonate: "admin",
  };
  return map[section] ?? null;
}
export function canAccessPath(access: Access, path: string): boolean {
  if (path === "/admin/workspace") return true;
  const permission = permissionForPath(path);
  if (permission === "admin") return access.role === "admin";
  return permission !== null && can(access, permission);
}
export function landingPath(access: Access): string {
  const permissions = effectivePermissions(access);
  const primary: Record<AccessRole, Permission | null> = { admin: "dashboard", manager: "dashboard", cashier: "orders", kitchen: "kitchen", waiter: "floor", driver: "deliveries", employee: null };
  const preferred = primary[access.role];
  if (preferred && permissions.includes(preferred)) return PERMISSIONS.find(p => p.id === preferred)!.href;
  if (permissions.includes("dashboard")) return "/admin";
  if (permissions.length === 1) return PERMISSIONS.find(p => p.id === permissions[0])!.href;
  return "/admin/workspace";
}
export type Audience = "all" | "visitor" | "member";
export function offerApplies(audience: Audience, member: boolean) { return audience === "all" || audience === (member ? "member" : "visitor"); }
