"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminIcon, type AdminIconName } from "./AdminIcons";
import styles from "./OperationsDashboard.module.css";

type BrandId = "all" | "barbacue" | "barbadog" | "chelas";

type BrandSummary = {
  id: Exclude<BrandId, "all">;
  name: string;
  monogram: string;
  itemCount: number;
  detail: string;
};

type OrderSummary = {
  id: string;
  customerName: string;
  totalCents: number;
  status: string;
  itemCount: number;
  createdAt: string | null;
  brand: Exclude<BrandId, "all">;
};

type Props = {
  metrics: {
    orders: number;
    products: number;
    customers: number;
    coupons: number;
  };
  brands: BrandSummary[];
  recentOrders: OrderSummary[];
  pixConfigured: boolean;
  gmailConfigured: boolean;
};

const statusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: styles.statusPending },
  confirmed: { label: "Confirmado", className: styles.statusConfirmed },
  preparing: { label: "Em preparo", className: styles.statusPreparing },
  ready: { label: "Pronto", className: styles.statusReady },
  delivered: { label: "Entregue", className: styles.statusDone },
  cancelled: { label: "Cancelado", className: styles.statusCancelled },
};
const orderBrandMeta = {
  barbacue: { label: "Barbacue", color: "#e4413f" },
  barbadog: { label: "Barbadog", color: "#e4ad37" },
  chelas: { label: "Chelas", color: "#3b9e75" },
} as const;

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function orderTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function BrandButton({ brand, active, onSelect }: { brand: BrandSummary; active: boolean; onSelect: () => void }) {
  const brandClass = brand.id === "barbacue" ? styles.brandBarbacue : brand.id === "barbadog" ? styles.brandBarbadog : styles.brandChelas;
  return (
    <button className={`${styles.brandCard} ${brandClass} ${active ? styles.brandActive : ""}`} onClick={onSelect} aria-pressed={active}>
      <span className={styles.monogram}>{brand.monogram}</span>
      <span className={styles.brandCopy}>
        <span className={styles.brandName}><i className={styles.statusDot} />{brand.name}</span>
        <p>{brand.detail}</p>
      </span>
      <span className={styles.brandCount}><strong>{brand.itemCount}</strong> itens</span>
    </button>
  );
}

function PanelTitle({ icon, title, description }: { icon: AdminIconName; title: string; description: string }) {
  return (
    <div className={styles.panelTitle}>
      <span><AdminIcon name={icon} size={17} /></span>
      <div><h2>{title}</h2><p>{description}</p></div>
    </div>
  );
}

export function OperationsDashboard({ metrics, brands, recentOrders, pixConfigured, gmailConfigured }: Props) {
  const [activeBrand, setActiveBrand] = useState<BrandId>("all");
  const visibleOrders = useMemo(
    () => activeBrand === "all" ? recentOrders : recentOrders.filter((order) => order.brand === activeBrand),
    [activeBrand, recentOrders],
  );

  function selectBrand(id: Exclude<BrandId, "all">) {
    setActiveBrand((current) => current === id ? "all" : id);
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.kicker}>Operação em tempo real</span>
          <h1>Centro de comando</h1>
          <p>Três restaurantes, um só lugar para acompanhar pedidos, cardápios, atendimento e equipe.</p>
        </div>
        <div className={styles.headActions}>
          <Link href="/whatsapp" className={styles.secondaryAction}><AdminIcon name="whatsapp" size={17} />Abrir atendimento</Link>
          <Link href="/admin/catalogs" className={styles.primaryAction}><AdminIcon name="plus" size={17} />Gerenciar produtos</Link>
        </div>
      </header>

      <section className={styles.brandRail} aria-label="Restaurantes">
        {brands.map((brand) => (
          <BrandButton key={brand.id} brand={brand} active={activeBrand === brand.id} onSelect={() => selectBrand(brand.id)} />
        ))}
      </section>

      <div className={styles.overviewGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <PanelTitle icon="orders" title="Fila única de pedidos" description={activeBrand === "all" ? "Todos os canais, em ordem de chegada" : `Filtro ativo: ${brands.find((brand) => brand.id === activeBrand)?.name}`} />
              <Link className={styles.panelLink} href="/admin/orders">Ver fila completa <AdminIcon name="arrow" size={14} /></Link>
            </div>

            <div className={styles.metricStrip}>
              <div className={styles.metric}><span>Pedidos</span><strong>{metrics.orders}</strong></div>
              <div className={styles.metric}><span>Produtos</span><strong>{metrics.products}</strong></div>
              <div className={styles.metric}><span>Clientes</span><strong>{metrics.customers}</strong></div>
              <div className={styles.metric}><span>Cupons ativos</span><strong>{metrics.coupons}</strong></div>
            </div>

            {visibleOrders.length > 0 ? (
              <div className={styles.orderList}>
                {visibleOrders.map((order) => {
                  const status = statusMeta[order.status] ?? statusMeta.pending;
                  const orderBrand = orderBrandMeta[order.brand];
                  return (
                    <div className={styles.orderRow} key={order.id}>
                      <div className={styles.orderCustomer}>
                        <strong>{order.customerName}</strong>
                        <span>#{order.id.slice(0, 8).toUpperCase()} · {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}</span>
                      </div>
                      <span className={styles.brandPill} style={{ "--order-brand": orderBrand.color } as React.CSSProperties}><i />{orderBrand.label}</span>
                      <span className={styles.orderTotal}>{brl(order.totalCents)}</span>
                      <time className={styles.orderTime}>{orderTime(order.createdAt)}</time>
                      <span className={`${styles.status} ${status.className}`}>{status.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <div><span><AdminIcon name="orders" size={23} /></span><strong>Nenhum pedido para este restaurante</strong><p>Quando um pedido entrar pelo site, app ou atendimento, ele aparecerá aqui na mesma fila.</p></div>
              </div>
            )}
          </section>

          <section>
            <div className={styles.managementGrid}>
              <Link href="/admin/team" className={styles.managementCard}><span><AdminIcon name="team" size={17} /></span><strong>Equipe e folha</strong><p>Funcionários, salários e vínculos</p></Link>
              <Link href="/admin/team" className={styles.managementCard}><span><AdminIcon name="calendar" size={17} /></span><strong>Jornadas e calendário</strong><p>Turnos, cargas e escala semanal</p></Link>
              <Link href="/admin/catalogs" className={styles.managementCard}><span><AdminIcon name="products" size={17} /></span><strong>Catálogos</strong><p>Disponibilidade, preço e promoções</p></Link>
              <Link href="/admin/customers" className={styles.managementCard}><span><AdminIcon name="customers" size={17} /></span><strong>Relacionamento</strong><p>Clientes, histórico e observações</p></Link>
            </div>
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={`${styles.panel} ${styles.channelHero}`}>
            <div className={styles.channelTop}>
              <span className={styles.whatsappMark}><AdminIcon name="whatsapp" size={21} /></span>
              <span className={styles.onlineLabel}><i /> Central disponível</span>
            </div>
            <h2>Atendimento unificado</h2>
            <p>As conversas ficam na mesma caixa de entrada e são identificadas pela marca atendida.</p>
            <div className={styles.agentRoute}><span>Barbacue</span><span>Barbadog</span><span>Chelas</span></div>
            <Link href="/whatsapp" className={styles.channelAction}>Ir para as conversas <AdminIcon name="arrow" size={14} /></Link>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <PanelTitle icon="system" title="Canais e dispositivos" description="Saúde das conexões essenciais" />
            </div>
            <div className={styles.integrationList}>
              <div className={styles.integrationRow}>
                <span className={styles.integrationIcon}><AdminIcon name="printer" size={16} /></span>
                <span className={styles.integrationCopy}><strong>Impressora de pedidos</strong><span>Impressão pelo computador</span></span>
                <span className={`${styles.integrationState} ${styles.integrationStateReady}`}><i /> Pronta</span>
              </div>
              <Link href="/admin/system" className={styles.integrationRow}>
                <span className={styles.integrationIcon}><AdminIcon name="mail" size={16} /></span>
                <span className={styles.integrationCopy}><strong>Gmail Barbacue</strong><span>Caixa de entrada administrativa</span></span>
                <span className={`${styles.integrationState} ${gmailConfigured ? styles.integrationStateReady : ""}`}><i /> {gmailConfigured ? "Ativo" : "Configurar"}</span>
              </Link>
              <Link href="/admin/settings" className={styles.integrationRow}>
                <span className={styles.integrationIcon}><AdminIcon name="spark" size={16} /></span>
                <span className={styles.integrationCopy}><strong>Pagamentos Pix</strong><span>Recebimento no pedido unificado</span></span>
                <span className={`${styles.integrationState} ${pixConfigured ? styles.integrationStateReady : ""}`}><i /> {pixConfigured ? "Ativo" : "Configurar"}</span>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
