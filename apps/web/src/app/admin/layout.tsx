import Link from "next/link";
import { AdminLogout } from "@/components/AdminLogout";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/orders", label: "Pedidos", icon: "📋" },
  { href: "/admin/products", label: "Produtos", icon: "🍔" },
  { href: "/admin/categories", label: "Categorias", icon: "📂" },
  { href: "/admin/coupons", label: "Cupons", icon: "🏷️" },
  { href: "/admin/customers", label: "Clientes", icon: "👥" },
  { href: "/admin/settings", label: "Configurações", icon: "⚙️" },
  { href: "/admin/impersonate", label: "Impersonar", icon: "👤" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-neutral-800">
          <span className="text-lg font-bold text-white">🔥 Admin</span>
          <p className="text-neutral-500 text-xs mt-0.5">Barbacue</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-300 hover:bg-neutral-800 hover:text-white text-sm transition-colors"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-neutral-800">
          <AdminLogout />
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-neutral-400 hover:text-white text-sm transition-colors mt-1"
          >
            <span>🌐</span>
            <span>Ver site</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8 text-neutral-100">
        {children}
      </main>
    </div>
  );
}
