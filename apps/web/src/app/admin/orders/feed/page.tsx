import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kitchenPrintJobs, orders, restaurantTables } from "@/db/schema";
import { isBrand } from "@/lib/brands";
import { BRAND_TAG, orderOwner, originTag } from "@/lib/order-owner";
import { ticketPartBrands } from "@/lib/ticket-pdf";
import { AutoRefresh } from "./AutoRefresh";
import "./feed.css";

export const dynamic = "force-dynamic";

const PRINT_STATUS: Record<string, string> = { queued: "Na fila de impressão", leased: "Imprimindo", printed: "Impresso", failed: "Não impresso", uncertain: "Conferir impressão" };
const time = (value: Date | null) => value ? value.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export default async function OrderFeedPage({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const { origem } = await searchParams;
  const rows = await db.select({
    id: orders.id, brand: orders.brand, channel: orders.channel, status: orders.status, orderType: orders.orderType,
    customerName: orders.customerName, notes: orders.notes, totalCents: orders.totalCents, createdAt: orders.createdAt,
    tableNumber: restaurantTables.number, ticket: kitchenPrintJobs.ticket, printStatus: kitchenPrintJobs.status,
  }).from(orders)
    .leftJoin(kitchenPrintJobs, eq(kitchenPrintJobs.orderId, orders.id))
    .leftJoin(restaurantTables, eq(restaurantTables.id, orders.tableId))
    .where(origem ? eq(orders.channel, origem) : undefined)
    .orderBy(desc(orders.createdAt)).limit(100);

  return <main className="order-feed">
    <AutoRefresh />
    <header>
      <div><h1>Feed de pedidos</h1><p>Todos os pedidos das três lojas, com as comandas em PDF exatamente como sairiam na impressora Elgin.</p></div>
      <nav aria-label="Filtrar por origem">
        <Link href="/admin/orders/feed" aria-current={!origem ? "page" : undefined}>Todos</Link>
        {["ifood", "anotaai", "chat", "click"].map((c) => <Link key={c} href={`/admin/orders/feed?origem=${c}`} aria-current={origem === c ? "page" : undefined}>{originTag(c).label}</Link>)}
      </nav>
    </header>
    {rows.length === 0 && <p className="order-feed-empty">Nenhum pedido ainda.</p>}
    <ol>
      {rows.map((o) => {
        const brand = isBrand(o.brand) ? o.brand : "barbacue";
        const origin = originTag(o.channel);
        const owner = orderOwner({ ...o, tableNumber: o.tableNumber ?? null });
        let parts: string[] = [];
        try { parts = o.ticket ? ticketPartBrands(o.ticket as never) : []; } catch { parts = []; }
        return <li key={o.id} data-brand={brand} data-testid="feed-order">
          <div className="order-feed-main">
            <time>{time(o.createdAt)}</time>
            <Link className="order-feed-code" href={`/admin/orders?pedido=${o.id}`}>#{o.id.slice(0, 8).toUpperCase()}</Link>
            <strong>{owner.title}</strong>
            {owner.detail && <span className="order-feed-detail">{owner.detail}</span>}
          </div>
          <div className="order-tags">
            <span className="order-tag" style={{ background: origin.bg, color: origin.fg }}>{origin.label}</span>
            <span className="order-tag" style={{ background: BRAND_TAG[brand].bg, color: BRAND_TAG[brand].fg }}>{BRAND_TAG[brand].label}</span>
          </div>
          <span className="order-feed-total">{money(o.totalCents)}</span>
          <div className="order-feed-pdfs">
            {parts.length === 0 ? <span className="order-feed-muted">Sem comanda</span> : parts.map((b, i) =>
              <a key={b} href={`/api/admin/orders/${o.id}/comanda?parte=${i + 1}`} target="_blank" rel="noopener" data-testid="feed-pdf">
                PDF {parts.length > 1 ? `${i + 1}/${parts.length} · ` : ""}{BRAND_TAG[b as keyof typeof BRAND_TAG].label}
              </a>)}
            {o.printStatus && <span className="order-feed-muted">{PRINT_STATUS[o.printStatus] ?? o.printStatus}</span>}
          </div>
          <Link className="order-feed-open" href={`/admin/orders?pedido=${o.id}`}>Abrir pedido →</Link>
        </li>;
      })}
    </ol>
  </main>;
}
