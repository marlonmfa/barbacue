import { db } from "@/db";
import { orders, products, customers, coupons } from "@/db/schema";
import { count, eq, desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const [orderCount] = await db.select({ count: count() }).from(orders);
  const [productCount] = await db.select({ count: count() }).from(products);
  const [customerCount] = await db.select({ count: count() }).from(customers);
  const [activeCoupons] = await db
    .select({ count: count() })
    .from(coupons)
    .where(eq(coupons.active, true));

  const recentOrders = await db
    .select({
      id: orders.id,
      customerName: orders.customerName,
      totalCents: orders.totalCents,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(5);

  return {
    orderCount: orderCount.count,
    productCount: productCount.count,
    customerCount: customerCount.count,
    activeCoupons: activeCoupons.count,
    recentOrders,
  };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pendente",   color: "bg-yellow-500/20 text-yellow-300" },
  confirmed: { label: "Confirmado", color: "bg-blue-500/20 text-blue-300" },
  preparing: { label: "Preparando", color: "bg-orange-500/20 text-orange-300" },
  ready:     { label: "Pronto",     color: "bg-green-500/20 text-green-300" },
  delivered: { label: "Entregue",   color: "bg-neutral-500/20 text-neutral-400" },
  cancelled: { label: "Cancelado",  color: "bg-red-500/20 text-red-400" },
};

export default async function AdminDashboard() {
  const stats = await getStats();

  const cards = [
    { label: "Pedidos", value: stats.orderCount, icon: "📋", href: "/admin/orders" },
    { label: "Produtos", value: stats.productCount, icon: "🍔", href: "/admin/products" },
    { label: "Clientes", value: stats.customerCount, icon: "👥", href: "/admin/customers" },
    { label: "Cupons ativos", value: stats.activeCoupons, icon: "🏷️", href: "/admin/coupons" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-neutral-800 rounded-2xl p-5 hover:bg-neutral-700 transition-colors border border-neutral-700"
          >
            <div className="text-3xl mb-2">{card.icon}</div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-neutral-400 text-sm">{card.label}</div>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Pedidos recentes</h2>
          <Link href="/admin/orders" className="text-amber-400 text-sm hover:underline">
            Ver todos →
          </Link>
        </div>

        <div className="bg-neutral-800 rounded-2xl overflow-hidden border border-neutral-700">
          {stats.recentOrders.length === 0 ? (
            <p className="text-neutral-400 text-sm px-5 py-8 text-center">Nenhum pedido ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400 text-left">
                <tr>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Horário</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((o) => {
                  const st = STATUS_LABELS[o.status ?? "pending"];
                  return (
                    <tr key={o.id} className="border-t border-neutral-700 hover:bg-neutral-750">
                      <td className="px-5 py-3 text-white font-medium">{o.customerName}</td>
                      <td className="px-5 py-3 text-amber-400 font-semibold">
                        R${((o.totalCents ?? 0) / 100).toFixed(2).replace(".", ",")}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-neutral-400">
                        {o.createdAt
                          ? new Date(o.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false, dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
