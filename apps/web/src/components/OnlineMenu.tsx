"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { orderingImage } from "@/lib/ordering-images";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice } from "@/lib/cart";
import { effectivePrice, type PromoPricable } from "@/lib/pricing";
import type { OnlineOrderInput } from "@/lib/online-payment";
import type { DeliveryQuoteResponse } from "@/lib/delivery";
import s from "./OnlineMenuBase.module.css";
import o from "./OnlineMenu.module.css";

type Brand = "barbacue" | "barbadog" | "chelas";
interface Product extends PromoPricable { id: number; name: string; description: string | null; imageUrl: string | null; available: boolean }
interface Category { id: number; name: string; products: Product[] }
interface Item { product: Product; qty: number; notes: string }
interface Receipt {
  checkoutId: string; orderId: string; orderNumber: string; brand: Brand; orderType: string; tableNumber: number | null;
  status: string; paymentStatus: string; subtotalCents: number; deliveryFeeCents: number; totalCents: number;
  items: { name: string; qty: number; priceCents: number; notes: string | null }[];
  pix: { encodedImage: string; payload: string; expirationDate: string } | null;
  environment: string; message?: string;
}
interface Recovery { id: string; accessToken: string; input?: OnlineOrderInput; savedAt: number }
const KEY = "barbacue:online-checkout:v1";
const NAMES: Record<Brand, string> = { barbacue: "Barbacue", barbadog: "Barbadog", chelas: "Chelas Cocina Mexicana" };
const STAGES: Record<string, string> = { pending: "Aguardando pagamento", confirmed: "Pedido recebido pela cozinha", preparing: "Seu pedido está em preparo", ready: "Seu pedido está pronto", delivered: "Pedido concluído", cancelled: "Pedido cancelado" };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const json = (response: Response) => response.json().catch(() => null);

export function OnlineMenu({ initialBrand, tableToken }: { initialBrand: Brand; tableToken?: string }) {
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [menu, setMenu] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<{ open: boolean; reason: string; nextOpen: string | null } | null>(null);
  const [table, setTable] = useState<{ number: number; token: string } | null>(null);
  const [tableError, setTableError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [notes, setNotes] = useState("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [address, setAddress] = useState("");
  const [quote, setQuote] = useState<DeliveryQuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);
  const sending = useRef(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const cartButton = useRef<HTMLButtonElement>(null);
  const receiptTitle = useRef<HTMLHeadingElement>(null);
  const locked = busy || Boolean(recovery);
  const subtotal = items.reduce((total, item) => total + effectivePrice(item.product) * item.qty, 0);
  const total = subtotal + (orderType === "delivery" && !table ? quote?.feeCents ?? 0 : 0);
  const qty = items.reduce((total, item) => total + item.qty, 0);
  const canOrder = status?.open === true && !loadError && !tableError && !loading;

  useEffect(() => {
    const timer = window.setTimeout(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      if (saved && typeof saved.id === "string" && /^[a-f0-9]{64}$/.test(saved.accessToken) && saved.savedAt > Date.now() - 7 * 86400_000) {
        setRecovery(saved);
        if (saved.input?.brand && saved.input.brand in NAMES) setBrand(saved.input.brand);
      }
    } catch { /* A new request checks storage before submission. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setLoadError(""); setTableError("");
      try {
        const opts = { cache: "no-store" as const, signal: controller.signal };
        const [m, st, delivery, resolved] = await Promise.all([
          fetch(`/api/products?brand=${brand}`, opts), fetch("/api/store-status", opts), fetch("/api/delivery/quote", opts),
          tableToken ? fetch(`/api/tables/resolve?token=${encodeURIComponent(tableToken)}`, opts) : Promise.resolve(null),
        ]);
        const [catalog, availability, deliveryData, tableData] = await Promise.all([json(m), json(st), json(delivery), resolved ? json(resolved) : null]);
        if (!m.ok || !Array.isArray(catalog) || !st.ok) throw new Error("Cardápio indisponível. Tente carregar novamente.");
        setMenu(catalog.map((group: Category) => ({ ...group, products: group.products.filter(p => p.available !== false && Number.isSafeInteger(p.id)) })).filter((g: Category) => g.products.length));
        setStatus(availability); setDeliveryEnabled(delivery.ok && deliveryData?.enabled === true);
        if (tableToken) {
          if (!resolved?.ok || tableData?.token !== tableToken) { setTable(null); setTableError("Não encontramos sua mesa. Escaneie o QR Code novamente ou chame a equipe."); }
          else setTable(tableData);
        }
      } catch {
        if (!controller.signal.aborted) setLoadError("Não foi possível carregar o cardápio. Confira a conexão e tente novamente.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [brand, tableToken, reload]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch("/api/store-status", { cache: "no-store" }).then(async r => { const data = await json(r); if (r.ok && typeof data?.open === "boolean") setStatus(data); }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshPayment = useCallback(async () => {
    if (!recovery || sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      // Until the Pix is available the original request can recover a customer
      // POST too. Both endpoints bind the same capability and idempotency key.
      const response = recovery.input
        ? await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recovery.input), signal: AbortSignal.timeout(70_000) })
        : await fetch(`/api/checkout/${recovery.id}`, { headers: { Authorization: `Bearer ${recovery.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(70_000) });
      const data = await json(response);
      if (!response.ok || !data?.orderId) {
        if ([400, 422].includes(response.status) && recovery.input) {
          sessionStorage.removeItem(KEY); setRecovery(null);
        }
        throw new Error(data?.message ?? "Sem confirmação da resposta. Consulte novamente para recuperar o mesmo pedido.");
      }
      setReceipt(data); setBrand(data.brand); setError(data.message ?? ""); drawer.current?.close();
      if (data.pix || data.paymentStatus === "paid" || data.status === "cancelled") {
        // CPF is needed only to create the provider customer. Remove it from
        // tab storage as soon as the payment can be recovered by its id.
        const minimal: Recovery = { id: recovery.id, accessToken: recovery.accessToken, savedAt: recovery.savedAt };
        sessionStorage.setItem(KEY, JSON.stringify(minimal));
        if (recovery.input) setRecovery(minimal);
        setCpf(""); setCustomerName(""); setCustomerPhone(""); setItems([]); setNotes("");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível consultar. Tente novamente."); }
    finally { sending.current = false; setBusy(false); }
  }, [recovery]);

  useEffect(() => {
    if (!recovery) return;
    const timer = window.setTimeout(() => void refreshPayment(), 0);
    return () => window.clearTimeout(timer);
  }, [recovery, refreshPayment]);
  useEffect(() => {
    if (!recovery) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshPayment(); }, 10_000);
    const resume = () => { if (document.visibilityState === "visible") void refreshPayment(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { window.clearInterval(timer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [recovery, refreshPayment]);
  const receiptId = receipt?.orderId;
  useEffect(() => {
    if (receiptId) {
      receiptTitle.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }, [receiptId]);

  function change(product: Product, delta: number) {
    if (locked || !canOrder) return;
    setItems(current => {
      const selected = current.find(i => i.product.id === product.id);
      if (!selected) return delta > 0 ? [...current, { product, qty: 1, notes: "" }] : current;
      return current.map(i => i.product.id === product.id ? { ...i, qty: Math.min(20, i.qty + delta) } : i).filter(i => i.qty > 0);
    });
    setError("");
  }
  async function calculateFreight() {
    if (locked || quoting) return;
    setQuoting(true); setError(""); setQuote(null);
    try {
      const response = await fetch("/api/delivery/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, address }), signal: AbortSignal.timeout(25_000) });
      const data = await json(response);
      if (!response.ok) throw new Error(data?.message ?? "Não foi possível calcular o frete.");
      setQuote(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível calcular o frete."); }
    finally { setQuoting(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (recovery || sending.current || !canOrder || !items.length) return;
    if (!table && orderType === "delivery" && (!quote || new Date(quote.expiresAt).getTime() <= Date.now())) { setQuote(null); setError("Calcule o frete atualizado antes de pagar."); return; }
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join("");
    const input: OnlineOrderInput = { requestId: crypto.randomUUID(), accessToken: token, brand, customerName, customerPhone, cpf, orderType: table ? "dine_in" : orderType,
      ...(table ? { tableToken: table.token } : {}), ...(!table && orderType === "delivery" ? { deliveryAddress: address, deliveryQuoteId: quote!.quoteId } : {}),
      notes, items: items.map(i => ({ productId: i.product.id, qty: i.qty, notes: i.notes })) };
    const pending: Recovery = { id: input.requestId, accessToken: token, input, savedAt: Date.now() };
    try { sessionStorage.setItem(KEY, JSON.stringify(pending)); }
    catch { setError("Libere o armazenamento desta aba para guardar a confirmação do pedido e tente novamente."); return; }
    setRecovery(pending);
  }
  async function cancelOrder() {
    if (!recovery || sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/checkout/${recovery.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${recovery.accessToken}` }, signal: AbortSignal.timeout(70_000) });
      const data = await json(response);
      if (!response.ok) throw new Error(data?.message ?? "Não foi possível cancelar agora. Consulte novamente.");
      setReceipt(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cancelar agora."); }
    finally { sending.current = false; setBusy(false); }
  }
  function newOrder() {
    sessionStorage.removeItem(KEY); setRecovery(null); setReceipt(null); setItems([]); setError(""); setQuote(null); setAddress("");
  }
  function quantity(product: Product, value: number) {
    return <div className={s.quantity}><button type="button" aria-label={`Diminuir ${product.name}`} disabled={locked || !canOrder} onClick={() => change(product, -1)}>−</button><output aria-label={`Quantidade de ${product.name}`}>{value}</output><button type="button" aria-label={`Aumentar ${product.name}`} disabled={locked || !canOrder || value >= 20} onClick={() => change(product, 1)}>+</button></div>;
  }
  function panel(prefix: string) {
    return <><div className={s.ticketHeading}><div><h2 id={`${prefix}-title`}>Seu pedido</h2><p>{table ? `Mesa ${table.number}` : NAMES[brand]}</p></div><span className={s.ticketCount}>{qty}</span></div>
      {!items.length && !recovery ? <div className={s.emptyCart}><h3>O que vai ser hoje?</h3><p>Escolha seus favoritos no cardápio.</p></div> : <form className={s.ticketForm} onSubmit={submit}>
        <div className={s.ticketBody}><div className={s.orderItems}>{items.map(item => <article className={s.orderItem} key={item.product.id}><div className={s.orderItemTitle}><h3>{item.product.name}</h3><strong>{formatPrice(effectivePrice(item.product) * item.qty)}</strong></div><div className={s.orderItemControls}>{quantity(item.product, item.qty)}</div><label className={o.itemNote}>Observação do item<input maxLength={160} value={item.notes} disabled={locked} placeholder="Ex.: sem cebola" onChange={e => setItems(current => current.map(i => i.product.id === item.product.id ? { ...i, notes: e.target.value } : i))} /></label></article>)}</div>
        <div className={s.checkout}>
          {!table && <fieldset className={s.payment} disabled={locked}><legend>Como você quer receber?</legend><div>{(["pickup", "delivery"] as const).map(type => <label key={type} className={orderType === type ? s.paymentSelected : ""}><input type="radio" name={`${prefix}-type`} checked={orderType === type} disabled={type === "delivery" && !deliveryEnabled} onChange={() => { setOrderType(type); setError(""); }} />{type === "pickup" ? "Retirada" : "Entrega"}</label>)}</div>{!deliveryEnabled && <p className={s.paymentHint}>Hoje, pedidos online para retirada na loja.</p>}</fieldset>}
          {!table && orderType === "delivery" && <><label className={s.field} htmlFor={`${prefix}-address`}>Endereço completo<textarea id={`${prefix}-address`} required minLength={12} maxLength={400} disabled={locked} value={address} onChange={e => { setAddress(e.target.value); setQuote(null); }} placeholder="Rua, número, bairro, cidade e complemento" /></label><button type="button" className={s.secondary} disabled={locked || quoting || address.trim().length < 12} onClick={() => void calculateFreight()}>{quoting ? "Calculando…" : "Calcular frete"}</button>{quote && <p className={o.freight}>Frete: <strong>{formatPrice(quote.feeCents)}</strong></p>}</>}
          <label className={s.field} htmlFor={`${prefix}-name`}>Seu nome<input id={`${prefix}-name`} autoComplete="name" required minLength={2} maxLength={80} value={customerName} disabled={locked} onChange={e => setCustomerName(e.target.value)} /></label>
          <label className={s.field} htmlFor={`${prefix}-phone`}>Telefone com DDD<input id={`${prefix}-phone`} type="tel" autoComplete="tel-national" required minLength={10} maxLength={20} value={customerPhone} disabled={locked} placeholder="(47) 99999-9999" onChange={e => setCustomerPhone(e.target.value)} /></label>
          <label className={s.field} htmlFor={`${prefix}-cpf`}>CPF para pagamento<input id={`${prefix}-cpf`} inputMode="numeric" required minLength={11} maxLength={14} autoComplete="off" value={cpf} disabled={locked} placeholder="000.000.000-00" onChange={e => setCpf(e.target.value)} /><span>Usado para gerar sua cobrança.</span></label>
          <label className={s.field} htmlFor={`${prefix}-notes`}>Observações <span>Opcional</span><textarea id={`${prefix}-notes`} maxLength={500} value={notes} disabled={locked} onChange={e => setNotes(e.target.value)} /></label>
          <div className={o.pixMethod}><strong>Pagamento com Pix</strong><p>Escaneie o QR Code ou use o copia e cola. O preparo começa após a confirmação.</p></div>
        </div></div>
        <div className={s.ticketFooter}><div className={s.total}><span>{orderType === "delivery" && !table && !quote ? "Produtos (frete a calcular)" : "Total"}</span><strong>{formatPrice(total)}</strong></div>{error && <p className={s.formError} role="alert">{error}</p>}{recovery ? <button type="button" className={s.primary} disabled={busy} onClick={() => void refreshPayment()}>{busy ? "Confirmando envio…" : "Recuperar meu pedido"}</button> : <button className={s.primary} type="submit" disabled={!canOrder || locked || quoting || (!table && orderType === "delivery" && !quote)}>{busy ? "Gerando Pix…" : "Continuar para pagamento"}</button>}<p className={s.sendHint}>Confira os itens antes de continuar.</p></div>
      </form>}</>;
  }
  const filtered = menu.filter(g => category === null || g.id === category).map(g => ({ ...g, products: g.products.filter(p => normalize(`${p.name} ${p.description ?? ""}`).includes(normalize(query))) })).filter(g => g.products.length);
  const paid = receipt?.paymentStatus === "paid";
  return <div className={`${s.shell} ${o.shell}`}>
    <header className={s.header}><div className={s.headerInner}><Link className={s.wordmark} href="/"><span>{NAMES[brand]}<small>Peça direto com a gente</small></span></Link><div className={s.location}><strong>{table ? `Mesa ${table.number}` : "Seu próximo favorito"}</strong></div></div></header>
    {receipt ? <main className={`${s.receipt} ${o.receipt}`}>
      <h1 ref={receiptTitle} tabIndex={-1} aria-live="polite">{receipt.status === "cancelled" ? "Pedido cancelado" : paid ? STAGES[receipt.status] ?? "Pagamento confirmado" : "Pague para confirmar seu pedido"}</h1>
      <p>{receipt.status === "cancelled" ? "Este pedido foi encerrado. Se você efetuou o pagamento, fale com a equipe para conferir o estorno." : paid ? `Pix recebido. ${receipt.tableNumber ? `A entrega será na mesa ${receipt.tableNumber}.` : receipt.orderType === "delivery" ? "Vamos entregar no endereço informado." : "Acompanhe o preparo e retire na loja."}` : "Seu pedido está reservado nesta tela. A cozinha recebe após a confirmação do pagamento."}</p>
      {receipt.environment !== "production" && <p className={s.formError}>Ambiente de teste. Não faça pagamento real.</p>}
      <div className={s.receiptTicket}><span>{NAMES[receipt.brand]} · Pedido</span><strong>#{receipt.orderNumber}</strong>{receipt.items.map((item, index) => <p key={index}>{item.qty}× {item.name} <b>{formatPrice(item.qty * item.priceCents)}</b>{item.notes && <small className={o.lineNote}>{item.notes}</small>}</p>)}<p>Produtos: {formatPrice(receipt.subtotalCents)}{receipt.orderType === "delivery" && ` · Frete: ${formatPrice(receipt.deliveryFeeCents)}`}</p><div><span>Total</span><b>{formatPrice(receipt.totalCents)}</b></div></div>
      {!paid && receipt.status !== "cancelled" && receipt.pix && <section className={o.pix} aria-label="Pagamento Pix"><h2>Pix de {formatPrice(receipt.totalCents)}</h2>{/* Provider-owned base64 QR code, never a remote tracking image. */}<Image unoptimized src={`data:image/png;base64,${receipt.pix.encodedImage}`} alt={`QR Code Pix do pedido ${receipt.orderNumber}`} width="240" height="240" /><label htmlFor="pix-code">Pix copia e cola</label><textarea id="pix-code" readOnly value={receipt.pix.payload} rows={3} onFocus={e => e.target.select()} /><button type="button" className={s.primary} onClick={async () => { try { await navigator.clipboard.writeText(receipt.pix!.payload); setCopied(true); } catch { setError("Selecione o código acima e copie para o aplicativo do seu banco."); } }}>{copied ? "Código copiado" : "Copiar código Pix"}</button><p>Após pagar no banco, aguarde a confirmação aqui.</p></section>}
      {error && <p role="alert" className={s.formError}>{error}</p>}
      {receipt.status !== "cancelled" && receipt.status !== "delivered" && <button className={s.secondary} disabled={busy} onClick={() => void refreshPayment()}>{busy ? "Consultando…" : paid ? "Atualizar preparo" : "Verificar pagamento"}</button>}
      {!paid && receipt.status !== "cancelled" && <button type="button" className={s.secondary} disabled={busy} onClick={() => void cancelOrder()}>Cancelar pedido sem pagamento</button>}
      {(paid || receipt.status === "cancelled") && <button type="button" className={s.primary} onClick={newOrder}>Fazer outro pedido</button>}
      <p className={o.help}>Precisa de ajuda? Informe à equipe o número #{receipt.orderNumber}.</p>
    </main> : <main className={s.main}><section className={s.catalog} aria-label="Cardápio">
      <nav className={o.brands} aria-label="Restaurantes">{(["chelas", "barbacue", "barbadog"] as Brand[]).map(b => <button type="button" key={b} aria-pressed={brand === b} disabled={locked} onClick={() => { setBrand(b); setItems([]); setCategory(null); setQuery(""); setQuote(null); setError(""); }}>{NAMES[b]}</button>)}</nav>
      <div className={s.intro}><div><h1>{brand === "barbacue" ? "Seu pedido, na brasa." : brand === "barbadog" ? "Capricha no seu dog." : "Hoje tem mexicano."}</h1><p>{table ? `Escolha para a mesa ${table.number}.` : "Escolha seus favoritos e pague por aqui."}</p></div><span className={`${s.status} ${status?.open ? s.statusOpen : ""}`}><i />{loading ? "Carregando" : status?.open ? "Recebendo pedidos" : "Pedidos pausados"}</span></div>
      {loading ? <div className={s.loading} role="status"><div /><p>Preparando o cardápio…</p></div> : loadError || tableError ? <div className={s.notice} role="alert"><h2>Vamos tentar de novo</h2><p>{loadError || tableError}</p><button className={s.secondary} onClick={() => setReload(n => n + 1)}>Carregar novamente</button></div> : <>
        {!status?.open && <div className={s.closedNotice}><strong>Pedidos pausados neste momento</strong><p>{status?.reason} {status?.nextOpen}</p><button type="button" onClick={() => setReload(n => n + 1)}>Verificar disponibilidade</button></div>}
        <div className={s.menuTools}><label className={s.search}><input type="search" aria-label="Buscar no cardápio" placeholder="O que você quer comer?" value={query} onChange={e => setQuery(e.target.value)} /></label><nav className={s.categories} aria-label="Categorias"><button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>Tudo</button>{menu.map(g => <button type="button" key={g.id} aria-pressed={category === g.id} onClick={() => setCategory(g.id)}>{g.name}</button>)}</nav></div>
        {filtered.map(g => <section className={s.category} key={g.id}><div className={s.categoryTitle}><h2>{g.name}</h2><span>{g.products.length} opções</span></div><div className={s.productGrid}>{g.products.map((product, index) => { const selected = items.find(i => i.product.id === product.id); const photo = orderingImage(brand, product); return <article key={product.id} className={`${s.product} ${selected ? s.productSelected : ""}`}><div className={s.productPhoto}><ProductImage src={photo.src} alt={product.name} sizes="(max-width: 599px) 144px, (max-width: 999px) 45vw, 320px" priority={index < 2 && g.id === menu[0]?.id} />{photo.illustrative && <span className={o.photoCaption}>Imagem ilustrativa</span>}</div><div className={s.productCopy}><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<div className={s.productBottom}><div className={s.price}><strong>{formatPrice(effectivePrice(product))}</strong></div>{selected ? quantity(product, selected.qty) : <button className={s.add} type="button" disabled={!canOrder || locked} aria-label={`Adicionar ${product.name}`} onClick={() => change(product, 1)}><span>+</span> Adicionar</button>}</div></div></article>; })}</div></section>)}
        {!filtered.length && <div className={s.noResults}><h2>Nenhum item encontrado</h2><p>Tente outro nome ou outra categoria.</p></div>}
      </>}
      {recovery && !receipt && <div className={s.closedNotice}><strong>Seu envio está salvo</strong><p>Consulte para recuperar o mesmo pedido.</p>{error && <p role="alert">{error}</p>}<button disabled={busy} onClick={() => void refreshPayment()}>{busy ? "Consultando…" : "Recuperar meu pedido"}</button></div>}
      <footer className={s.catalogFooter}>Feito na hora. Aproveite cada mordida.</footer>
    </section><aside className={s.sidebar} aria-label="Resumo do pedido"><div className={s.ticket}>{panel("sidebar")}</div></aside></main>}
    {!receipt && <button ref={cartButton} type="button" className={s.mobileCart} disabled={!qty && !recovery} aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><span className={s.mobileCartCount}>{qty}</span><span>{recovery ? "Recuperar pedido" : "Ver pedido"}</span><strong>{formatPrice(total)}</strong></button>}
    <dialog ref={drawer} className={s.cartDialog} aria-labelledby="drawer-title" onClose={() => cartButton.current?.focus()}><div className={s.drawerInner}><button type="button" className={s.closeDialog} onClick={() => drawer.current?.close()}>← Continuar escolhendo</button>{panel("drawer")}</div></dialog>
  </div>;
}
