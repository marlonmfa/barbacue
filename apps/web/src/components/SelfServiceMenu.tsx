"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice } from "@/lib/cart";
import { effectivePrice, type PromoPricable } from "@/lib/pricing";
import type { TableSession } from "@/lib/table-session-shared";
import { parsePendingOrder, pendingOrderStorageKey, type PendingSelfServiceOrder } from "@/lib/self-service-pending";
import styles from "./SelfServiceMenu.module.css";

type Brand = "barbacue" | "barbadog" | "chelas";
type Mode = "kiosk" | "table_qr";
type LocalPayment = "cash" | "card_on_delivery";
interface MenuProduct extends PromoPricable {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  available: boolean;
}
interface MenuCategory { id: number; name: string; products: MenuProduct[] }
interface Selection { product: MenuProduct; qty: number; notes: string }
interface StoreStatus { open: boolean; reason: string; nextOpen: string | null }
interface OrderPayload {
  requestId: string;
  channel: Mode;
  tableToken?: string;
  brand: Brand;
  customerName?: string;
  paymentMethod: LocalPayment;
  notes?: string;
  items: { productId: number; qty: number; notes?: string }[];
}
interface Receipt {
  orderId: string;
  orderType: string;
  tableNumber: number | null;
  totalCents: number;
}

const BRAND_NAMES: Record<Brand, string> = { barbacue: "Barbacue", barbadog: "Barbadog", chelas: "Chelas" };
// Shared tablets discard abandoned personal data after a visible 30-second warning.
const IDLE_MS = 3 * 60_000;
const IDLE_WARNING_SECONDS = 30;
const RECEIPT_SECONDS = 25;
const MAX_QTY = 20;

async function readJson(response: Response) {
  return response.json().catch(() => null);
}

function Icon({ name, className }: { name: "bag" | "search" | "table" | "check" | "fire"; className?: string }) {
  const paths = {
    bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    table: <><path d="M3 9h18v4H3zM6 13v8m12-8v8M5 3v6m14-6v6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    fire: <path d="M13 2c1 6-5 6-4 11 1-1 3-2 3-4 5 3 7 6 5 10a6 6 0 0 1-10 0C2 12 11 10 13 2Z" />,
  };
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function SelfServiceMenu({ mode, brand, tableToken }: { mode: Mode; brand: Brand; tableToken?: string }) {
  const tableRequired = mode === "table_qr" || tableToken !== undefined;
  const storageKey = pendingOrderStorageKey({ brand, channel: mode, tableToken });
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [table, setTable] = useState<TableSession | null>(null);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tableError, setTableError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [items, setItems] = useState<Selection[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<LocalPayment>("card_on_delivery");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptSeconds, setReceiptSeconds] = useState(RECEIPT_SECONDS);
  const [idleSeconds, setIdleSeconds] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const cartDialog = useRef<HTMLDialogElement>(null);
  const idleDialog = useRef<HTMLDialogElement>(null);
  const cartTrigger = useRef<HTMLButtonElement>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const pendingRequest = useRef<OrderPayload | null>(null);
  const sending = useRef(false);
  const lastActivity = useRef(0);
  const locked = submitting || uncertain;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      setTableError("");
      if (!pendingRequest.current) {
        // Persist only an in-flight submission, in this tab. Ordinary cart edits
        // and completed customer details never enter browser storage.
        try {
          const recovered = parsePendingOrder(sessionStorage.getItem(storageKey), { brand, channel: mode, tableToken });
          if (recovered) {
            pendingRequest.current = recovered.payload;
            setItems(recovered.payload.items.map((item) => ({
              product: { ...recovered.products.find((product) => product.id === item.productId)!, available: true, description: null },
              qty: item.qty, notes: item.notes ?? "",
            })));
            setCustomerName(recovered.payload.customerName ?? "");
            setNotes(recovered.payload.notes ?? "");
            setPaymentMethod(recovered.payload.paymentMethod);
            setUncertain(true);
            setError("Há um envio aguardando confirmação. Toque em ‘Verificar pedido’ para recuperar a resposta sem fazer outro pedido.");
          }
        } catch { /* Storage availability is checked before sending any new order. */ }
      }
      try {
        const options = { signal: controller.signal, cache: "no-store" as const };
        const [menuResponse, statusResponse, tableResponse] = await Promise.all([
          fetch(`/api/products?brand=${brand}`, options),
          fetch("/api/store-status", options),
          tableRequired && tableToken ? fetch(`/api/tables/resolve?token=${encodeURIComponent(tableToken)}`, options) : Promise.resolve(null),
        ]);
        const [catalog, availability, resolvedTable] = await Promise.all([
          readJson(menuResponse), readJson(statusResponse), tableResponse ? readJson(tableResponse) : Promise.resolve(null),
        ]);
        if (!menuResponse.ok || !Array.isArray(catalog) || !statusResponse.ok || typeof availability?.open !== "boolean") {
          throw new Error("Não foi possível carregar o cardápio. Confira a conexão e tente novamente.");
        }
        setMenu(catalog.map((group: MenuCategory) => ({ ...group, products: group.products.filter((product) => product.available !== false) })).filter((group: MenuCategory) => group.products.length > 0));
        setStatus(availability);
        if (tableRequired) {
          if (!tableResponse?.ok || !resolvedTable?.number || resolvedTable.token !== tableToken) {
            setTable(null);
            setTableError(resolvedTable?.message ?? "Escaneie o QR Code da sua mesa para começar. Se precisar, chame um atendente.");
          } else {
            setTable(resolvedTable);
          }
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setLoadError(cause instanceof Error && cause.message.startsWith("Não foi possível") ? cause.message : "Não foi possível carregar o cardápio. Confira a conexão e tente novamente.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [brand, mode, tableRequired, tableToken, refresh, storageKey]);

  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch("/api/store-status", { cache: "no-store", signal: controller.signal });
        const data = await readJson(response);
        if (response.ok && typeof data?.open === "boolean") setStatus(data);
      } catch { /* The order endpoint checks opening hours again at submission. */ }
    };
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("online", update);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("online", update); };
  }, []);

  const reset = useCallback(() => {
    // Ambiguous requests retain the exact payload until the server confirms a result.
    if (pendingRequest.current || sending.current) return;
    setItems([]); setCustomerName(""); setNotes(""); setPaymentMethod("card_on_delivery");
    setError(""); setReceipt(null); setUncertain(false); setQuery(""); setCategory(null);
    setReceiptSeconds(RECEIPT_SECONDS); setIdleSeconds(null); setAnnouncement("");
    cartDialog.current?.close(); idleDialog.current?.close();
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (mode !== "kiosk") return;
    const activity = () => { if (!idleDialog.current?.open) lastActivity.current = Date.now(); };
    activity();
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const timer = window.setInterval(() => {
      if (locked || receipt || (!items.length && !customerName && !notes)) return;
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= IDLE_MS + IDLE_WARNING_SECONDS * 1000) reset();
      else if (elapsed >= IDLE_MS) setIdleSeconds(Math.ceil((IDLE_MS + IDLE_WARNING_SECONDS * 1000 - elapsed) / 1000));
    }, 1000);
    return () => { window.clearInterval(timer); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); };
  }, [mode, locked, receipt, items.length, customerName, notes, reset]);

  useEffect(() => {
    if (idleSeconds !== null && !idleDialog.current?.open) idleDialog.current?.showModal();
    if (idleSeconds === null) idleDialog.current?.close();
  }, [idleSeconds]);

  useEffect(() => {
    if (!receipt) return;
    receiptHeading.current?.focus();
    if (mode !== "kiosk") return;
    const deadline = Date.now() + RECEIPT_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (!seconds) reset(); else setReceiptSeconds(seconds);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [receipt, mode, reset]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRequest.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const closeOnDesktop = () => { if (window.innerWidth >= 1000) cartDialog.current?.close(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("resize", closeOnDesktop);
    return () => { window.removeEventListener("beforeunload", onBeforeUnload); window.removeEventListener("resize", closeOnDesktop); };
  }, []);

  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const totalCents = items.reduce((sum, item) => sum + effectivePrice(item.product) * item.qty, 0);
  const canOrder = !loading && !loadError && !tableError && status?.open === true && (!tableRequired || Boolean(table));
  const search = query.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const visibleMenu = menu.filter((group) => category === null || group.id === category).map((group) => ({
    ...group,
    products: group.products.filter((product) => `${product.name} ${product.description ?? ""}`.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(search)),
  })).filter((group) => group.products.length > 0);

  function changeQty(product: MenuProduct, delta: number) {
    if (locked || !canOrder) return;
    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!existing && delta > 0) return [...current, { product, qty: 1, notes: "" }];
      return current.map((item) => item.product.id === product.id ? { ...item, qty: Math.min(MAX_QTY, item.qty + delta) } : item).filter((item) => item.qty > 0);
    });
    setError("");
    setAnnouncement(delta > 0 ? `${product.name} adicionado ao pedido.` : `Quantidade de ${product.name} reduzida.`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    if (!pendingRequest.current) {
      if (!canOrder || !items.length) return;
      if (!tableRequired && customerName.trim().length < 2) { setError("Informe seu nome para chamarmos na retirada."); return; }
      pendingRequest.current = {
        requestId: crypto.randomUUID(), channel: mode, brand,
        ...(table ? { tableToken: table.token } : {}),
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        paymentMethod, ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: items.map((item) => ({ productId: item.product.id, qty: item.qty, ...(item.notes.trim() ? { notes: item.notes.trim() } : {}) })),
      };
      const recovery: PendingSelfServiceOrder = {
        payload: pendingRequest.current,
        products: items.map(({ product }) => ({ id: product.id, name: product.name, priceCents: effectivePrice(product), imageUrl: product.imageUrl })),
      };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(recovery));
      } catch {
        pendingRequest.current = null;
        setError("Este navegador não conseguiu guardar a confirmação do envio. Libere o armazenamento desta aba ou chame um atendente para fazer o pedido.");
        return;
      }
    }
    sending.current = true;
    setSubmitting(true); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/self-service/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingRequest.current), signal: controller.signal,
      });
      const data = await readJson(response);
      if (!response.ok) {
        // A timeout/5xx can follow a committed order. Keep the UUID and payload frozen.
        if (response.status >= 500 || response.status === 408 || response.status === 409 || response.status === 429) throw new Error("uncertain");
        pendingRequest.current = null;
        try { sessionStorage.removeItem(storageKey); } catch { /* No customer data is written again. */ }
        setUncertain(false);
        setError(typeof data?.message === "string" ? data.message : "Não foi possível enviar este pedido. Confira os itens e tente novamente.");
        if (data?.storeClosed || data?.error === "store_closed") setStatus({ open: false, reason: data.message, nextOpen: null });
        return;
      }
      if (typeof data?.orderId !== "string" || typeof data?.totalCents !== "number") throw new Error("uncertain");
      pendingRequest.current = null;
      try { sessionStorage.removeItem(storageKey); } catch { /* A replay remains safe if removal is unavailable. */ }
      setUncertain(false); setItems([]); setCustomerName(""); setNotes("");
      setReceipt(data);
      cartDialog.current?.close();
    } catch {
      setUncertain(true);
      setError("Ainda não conseguimos confirmar a resposta. Toque em ‘Verificar pedido’ para consultar reenviando o mesmo pedido, sem duplicá-lo. Mantenha esta tela aberta ou chame um atendente.");
    } finally {
      window.clearTimeout(timeout); sending.current = false; setSubmitting(false);
    }
  }

  function quantityControl(item: Selection, location: string) {
    return <div className={styles.quantity} aria-label={`Quantidade de ${item.product.name}`}>
      <button type="button" aria-label={`Diminuir ${item.product.name}`} disabled={locked || !canOrder} onClick={() => changeQty(item.product, -1)}>−</button>
      <output aria-label={`${item.product.name}: ${item.qty} ${item.qty === 1 ? "unidade" : "unidades"}`} id={`${location}-qty-${item.product.id}`}>{item.qty}</output>
      <button type="button" aria-label={`Aumentar ${item.product.name}`} disabled={locked || !canOrder || item.qty >= MAX_QTY} onClick={() => changeQty(item.product, 1)}>+</button>
    </div>;
  }

  function orderPanel(prefix: string) {
    return <>
      <div className={styles.ticketHeading}>
        <div><h2 id={`${prefix}-title`}>Seu pedido</h2><p>{table ? `Para a mesa ${table.number}` : tableRequired ? "Pedido na mesa" : "Retirada no balcão"}</p></div>
        <span className={styles.ticketCount}>{totalQty}</span>
      </div>
      {!items.length ? <div className={styles.emptyCart}><Icon name="bag" /><h3>Comece pelo seu favorito</h3><p>Os itens escolhidos aparecem aqui.</p></div> : <form className={styles.ticketForm} onSubmit={submit} noValidate={uncertain}>
        <div className={styles.ticketBody}>
        <div className={styles.orderItems}>
          {items.map((item) => <article className={styles.orderItem} key={item.product.id}>
            <div className={styles.orderItemTitle}><h3>{item.product.name}</h3><strong>{formatPrice(effectivePrice(item.product) * item.qty)}</strong></div>
            <div className={styles.orderItemControls}><span>{formatPrice(effectivePrice(item.product))} cada</span>{quantityControl(item, prefix)}</div>
            <details className={styles.itemNotes}>
              <summary>Observação deste item{item.notes ? " · adicionada" : ""}</summary>
              <label className={styles.srOnly} htmlFor={`${prefix}-item-${item.product.id}`}>Observação para {item.product.name}</label>
              <textarea id={`${prefix}-item-${item.product.id}`} rows={2} maxLength={160} placeholder="Ex.: sem cebola" disabled={locked} value={item.notes} onChange={(event) => setItems((current) => current.map((selected) => selected.product.id === item.product.id ? { ...selected, notes: event.target.value } : selected))} />
            </details>
          </article>)}
        </div>
        <div className={styles.checkout}>
          {!tableRequired && <label className={styles.field} htmlFor={`${prefix}-name`}>Nome para retirada <span>Obrigatório</span>
            <input id={`${prefix}-name`} autoComplete="off" type="text" value={customerName} maxLength={80} minLength={2} required disabled={locked} placeholder="Como podemos chamar você?" onChange={(event) => setCustomerName(event.target.value)} />
          </label>}
          <label className={styles.field} htmlFor={`${prefix}-notes`}>Observações do pedido <span>Opcional</span>
            <textarea id={`${prefix}-notes`} rows={2} maxLength={500} value={notes} disabled={locked} placeholder="Algo que a equipe precisa saber?" onChange={(event) => setNotes(event.target.value)} />
          </label>
          <fieldset className={styles.payment} disabled={locked}>
            <legend>Pagamento no local</legend>
            <div>{(["card_on_delivery", "cash"] as const).map((method) => <label key={method} className={paymentMethod === method ? styles.paymentSelected : ""}>
              <input type="radio" name={`${prefix}-payment`} checked={paymentMethod === method} value={method} onChange={() => setPaymentMethod(method)} />
              {method === "cash" ? "Dinheiro" : "Cartão"}
            </label>)}</div>
          </fieldset>
        </div>
        </div>
        <div className={styles.ticketFooter}>
          <div className={styles.total}><span>Total</span><strong>{formatPrice(totalCents)}</strong></div>
          <p className={styles.paymentHint}>Você paga com a equipe {tableRequired ? "na mesa ou no caixa" : "no caixa"}.</p>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <button type="submit" className={styles.primary} disabled={submitting || (!uncertain && !canOrder)}>{submitting ? "Aguardando confirmação…" : uncertain ? "Verificar pedido" : "Enviar pedido"}<Icon name={uncertain ? "search" : "bag"} /></button>
          <p className={styles.sendHint}>Confira os itens antes de enviar para a cozinha.</p>
        </div>
      </form>}
    </>;
  }

  return <div className={styles.shell} data-mode={mode}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.wordmark}><Icon name="fire" /><span>{BRAND_NAMES[brand]}<small>{brand === "barbacue" ? "Burguers na brasa" : brand === "barbadog" ? "Hotdog & sandwich" : "Cocina mexicana"}</small></span></div>
        <div className={styles.location} aria-live="polite"><Icon name={tableRequired ? "table" : "bag"} /><span><strong>{tableRequired ? table ? `Mesa ${table.number}` : loading ? "Identificando mesa…" : "Pedido na mesa" : "Retirada no balcão"}</strong><small>{table?.label || (mode === "kiosk" ? "Autoatendimento" : "Peça sem sair da mesa")}</small></span></div>
      </div>
    </header>

    {receipt ? <main className={styles.receipt}>
      <div className={styles.receiptCheck}><Icon name="check" /></div>
      <h1 ref={receiptHeading} tabIndex={-1}>Pedido recebido</h1>
      <p className={styles.receiptIntro}>{receipt.tableNumber ? `Seu pedido é para a mesa ${receipt.tableNumber}.` : "Vamos chamar você no balcão quando estiver pronto."}</p>
      <div className={styles.receiptTicket}><span>Número do pedido</span><strong>#{receipt.orderId.slice(0, 8).toUpperCase()}</strong><div><span>Total</span><b>{formatPrice(receipt.totalCents)}</b></div><p>Pagamento {paymentMethod === "cash" ? "em dinheiro" : "com cartão"} no local.</p></div>
      <p>A equipe já recebeu seu pedido. Se precisar de algo, chame um atendente.</p>
      <button className={styles.primary} onClick={reset}>{mode === "kiosk" ? "Novo atendimento" : "Fazer outro pedido"}</button>
      {mode === "kiosk" && <p className={styles.resetNotice}>Esta tela será reiniciada em {receiptSeconds}s.</p>}
    </main> : <main className={styles.main}>
      <section className={styles.catalog} aria-label="Cardápio">
        <div className={styles.intro}><div><h1>{brand === "barbacue" ? "Seu pedido, na brasa." : "Escolha seu favorito."}</h1><p>{table ? "Escolha, envie e aproveite. A gente leva até você." : "Escolha seus favoritos. A gente prepara na hora."}</p></div><span className={`${styles.status} ${status?.open ? styles.statusOpen : ""}`}><i />{loading ? "Carregando" : status?.open ? "Recebendo pedidos" : "Pedidos pausados"}</span></div>
        {loading ? <div className={styles.loading} role="status"><div /><p>Preparando o cardápio…</p></div> : tableError ? <div className={styles.notice} role="alert"><Icon name="table" /><h2>Vamos encontrar sua mesa</h2><p>{tableError}</p><button className={styles.secondary} onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button><p>Use o QR Code que está sobre a sua mesa.</p></div> : loadError ? <div className={styles.notice} role="alert"><h2>Não carregou por aqui</h2><p>{loadError}</p><button className={styles.secondary} onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button></div> : <>
          {!status?.open && <div className={styles.closedNotice} role="status"><strong>Pedidos pausados neste momento</strong><p>{status?.reason} {status?.nextOpen}</p><button type="button" onClick={() => setRefresh((value) => value + 1)}>Verificar disponibilidade</button></div>}
          <div className={styles.menuTools}>
            <label className={styles.search}><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar no cardápio" placeholder="O que vai ser hoje?" autoComplete="off" /></label>
            <nav className={styles.categories} aria-label="Categorias do cardápio"><button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>Tudo</button>{menu.map((group) => <button key={group.id} type="button" aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.name}</button>)}</nav>
          </div>
          {visibleMenu.length ? visibleMenu.map((group) => <section className={styles.category} key={group.id} aria-labelledby={`category-${group.id}`}><div className={styles.categoryTitle}><h2 id={`category-${group.id}`}>{group.name}</h2><span>{group.products.length} {group.products.length === 1 ? "opção" : "opções"}</span></div><div className={styles.productGrid}>{group.products.map((product, productIndex) => {
            const selected = items.find((item) => item.product.id === product.id);
            const price = effectivePrice(product);
            return <article className={`${styles.product} ${selected ? styles.productSelected : ""}`} key={product.id}>
              <div className={styles.productPhoto}><ProductImage src={product.imageUrl} alt={product.name} sizes="(max-width: 599px) 116px, (max-width: 999px) 45vw, 280px" priority={productIndex < 2} />{price < product.priceCents && <span className={styles.promo}>Preço especial</span>}</div>
              <div className={styles.productCopy}><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<div className={styles.productBottom}><div className={styles.price}>{price < product.priceCents && <del>{formatPrice(product.priceCents)}</del>}<strong>{formatPrice(price)}</strong></div>{selected ? quantityControl(selected, "menu") : <button className={styles.add} type="button" aria-label={`Adicionar ${product.name}`} disabled={!canOrder || locked} onClick={() => changeQty(product, 1)}><span aria-hidden="true">+</span> Adicionar</button>}</div></div>
            </article>;
          })}</div></section>) : <div className={styles.noResults}><h2>{menu.length ? "Não encontramos esse item" : "O cardápio está sendo preparado"}</h2><p>{menu.length ? "Tente outro nome ou veja todas as categorias." : "Chame um atendente para conhecer as opções disponíveis."}</p>{menu.length > 0 && <button className={styles.secondary} onClick={() => { setQuery(""); setCategory(null); }}>Ver tudo</button>}</div>}
        </>}
        <footer className={styles.catalogFooter}><Icon name="fire" /><p>Feito na hora. Aproveite cada mordida.</p><span>Precisa de ajuda? Chame a equipe.</span></footer>
      </section>
      <aside className={styles.sidebar} aria-label="Resumo do pedido"><div className={styles.ticket}>{orderPanel("sidebar")}</div></aside>
    </main>}

    {!receipt && (uncertain || (!loading && !tableError && !loadError)) && <button ref={cartTrigger} className={styles.mobileCart} disabled={!items.length} onClick={() => cartDialog.current?.showModal()} aria-haspopup="dialog"><span className={styles.mobileCartCount}>{totalQty}</span><span>{uncertain ? "Verificar pedido" : "Ver pedido"}</span><strong>{formatPrice(totalCents)}</strong></button>}
    <dialog className={styles.cartDialog} ref={cartDialog} aria-labelledby="drawer-title" onClose={() => cartTrigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) cartDialog.current?.close(); }}><div className={styles.drawerInner}><button className={styles.closeDialog} type="button" onClick={() => cartDialog.current?.close()} aria-label="Voltar ao cardápio">← Continuar escolhendo</button>{orderPanel("drawer")}</div></dialog>
    <dialog className={styles.idleDialog} ref={idleDialog} aria-labelledby="idle-title" onCancel={(event) => event.preventDefault()}><h2 id="idle-title">Ainda está por aqui?</h2><p>Para liberar o tablet, este atendimento será reiniciado em {idleSeconds}s.</p><button className={styles.primary} onClick={() => { lastActivity.current = Date.now(); setIdleSeconds(null); }}>Continuar meu pedido</button><button className={styles.secondary} onClick={reset}>Encerrar atendimento</button></dialog>
    <div className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</div>
  </div>;
}
