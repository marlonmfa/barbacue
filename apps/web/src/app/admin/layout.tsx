import Link from "next/link";
import { AdminLogout } from "@/components/AdminLogout";
import { requireStaff } from "@/lib/admin-auth";

// `adminOnly` items are hidden from managers. The proxy gate authenticates the
// session; role-based visibility + enforcement happens here and in the routes.
const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/orders", label: "Pedidos", icon: "📋" },
  { href: "/admin/products", label: "Produtos", icon: "🍔" },
  { href: "/admin/categories", label: "Categorias", icon: "📂" },
  { href: "/admin/coupons", label: "Cupons", icon: "🏷️" },
  { href: "/admin/tables", label: "Mesas", icon: "🍽️" },
  { href: "/admin/customers", label: "Clientes", icon: "👥" },
  { href: "/admin/beta", label: "Beta do App", icon: "🧪" },
  { href: "/admin/settings", label: "Configurações", icon: "⚙️" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "💬", adminOnly: true },
  { href: "/admin/staff", label: "Equipe", icon: "🧑‍🍳", adminOnly: true },
  { href: "/admin/system", label: "Sistema", icon: "🔑", adminOnly: true },
  { href: "/admin/impersonate", label: "Impersonar", icon: "👤", adminOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // requireStaff never throws here in practice — the proxy already redirected
  // unauthenticated requests to /admin/login before this layout renders.
  const session = await requireStaff().catch(() => null);
  const role = session?.role ?? "manager";
  const items = navItems.filter((i) => !i.adminOnly || role === "admin");

  return (
    <div className="min-h-screen bg-[#0e0b0a] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[#1a1512] border-r border-[#352b24] flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-[#352b24]">
          <span className="text-lg font-bold text-white">
            <span className="text-[#ed1b24]">🔥</span> Barbacue
          </span>
          <p className="text-[#a89a8c] text-xs mt-0.5">
            {role === "admin" ? "Administrador" : "Gerente"}
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#d8ccbf] hover:bg-[#241d18] hover:text-white text-sm transition-colors"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-[#352b24]">
          <AdminLogout />
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#a89a8c] hover:text-white text-sm transition-colors mt-1"
          >
            <span>🌐</span>
            <span>Ver site</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8 text-[#f6efe8]">{children}</main>
    </div>
  );
}
