import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons, customers, orders, products, storeSettings } from "@/db/schema";
import { OperationsDashboard } from "@/components/admin/OperationsDashboard";
import barbadogMenu from "@/data/barbadog.json";
import chelasMenu from "@/data/chelas.json";
import { requireStaff } from "@/lib/admin-auth";
import { can, landingPath } from "@/lib/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [[orderCount], [productCount], [availableProducts], [customerCount], [activeCoupons], [settings], recentOrders] = await Promise.all([
    db.select({ count: count() }).from(orders),
    db.select({ count: count() }).from(products),
    db.select({ count: count() }).from(products).where(eq(products.available, true)),
    db.select({ count: count() }).from(customers),
    db.select({ count: count() }).from(coupons).where(eq(coupons.active, true)),
    db.select({ pixKey: storeSettings.pixKey }).from(storeSettings).where(eq(storeSettings.id, 1)),
    db
      .select({
        id: orders.id,
        brand: orders.brand,
        customerName: orders.customerName,
        totalCents: orders.totalCents,
        status: orders.status,
        items: orders.items,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(7),
  ]);

  return {
    metrics: {
      orders: orderCount.count,
      products: productCount.count + barbadogMenu.items.length + chelasMenu.items.length,
      customers: customerCount.count,
      coupons: activeCoupons.count,
    },
    brands: [
      {
        id: "barbacue" as const,
        name: "Barbacue",
        monogram: "B",
        itemCount: productCount.count,
        detail: `${availableProducts.count} disponíveis no cardápio nativo`,
      },
      {
        id: "barbadog" as const,
        name: "Barbadog",
        monogram: "BD",
        itemCount: barbadogMenu.items.length,
        detail: "Catálogo sincronizado com o iFood",
      },
      {
        id: "chelas" as const,
        name: "Chelas",
        monogram: "CH",
        itemCount: chelasMenu.items.length,
        detail: "Catálogo sincronizado com o iFood",
      },
    ],
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      customerName: order.customerName,
      totalCents: order.totalCents,
      status: order.status ?? "pending",
      itemCount: Array.isArray(order.items)
        ? (order.items as { qty?: number }[]).reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
        : 0,
      createdAt: order.createdAt?.toISOString() ?? null,
      brand: order.brand as "barbacue" | "barbadog" | "chelas",
    })),
    pixConfigured: Boolean(settings?.pixKey),
    gmailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
  };
}

export default async function AdminDashboard() {
  const session = await requireStaff();
  if (!can(session, "dashboard")) redirect(landingPath(session));
  const data = await getDashboardData();
  return <OperationsDashboard {...data} />;
}
