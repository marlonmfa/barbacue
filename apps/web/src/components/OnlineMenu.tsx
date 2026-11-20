"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPhone, formatCpf } from "@/lib/input-format";
import { orderingImage } from "@/lib/ordering-images";
import { BrandNavigation } from "@/components/BrandNavigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductImage } from "@/components/ProductImage";
import { useCart, formatPrice, type CartItem } from "@/lib/cart";
import { effectivePrice, type PromoPricable } from "@/lib/pricing";
import { onlineMinimumCents, onlinePaymentLabel, PAY_ON_RECEIPT, type OnlinePaymentMethod } from "@/lib/online-order-policy";
import type { OnlineOrderInput } from "@/lib/online-payment";
import { checkoutAmounts, deliveryEstimate, parseCheckoutQuote, quoteMatchesAddress, type CheckoutDeliveryQuote } from "@/lib/delivery-checkout";
import { cartLineKey, menuOptionsTotal, optionGroupsFor, type MenuChoice, type MenuOptionGroup } from "@/lib/menu-options";
import { CustomizeOrderItem } from "@/components/CustomizeOrderItem";
import s from "./OnlineMenuBase.module.css";
import o from "./OnlineMenu.module.css";

type Brand = "barbacue" | "barbadog" | "chelas";
interface Product extends PromoPricable { brand: Brand; category?: string; id: number; name: string; description: string | null; imageUrl: string | null; available: boolean }
interface Category { id: number; name: string; slug: string; products: Product[] }
type Customization = { item: CartItem; product: Product; groups: MenuOptionGroup[]; editing: boolean };
function groupsFor(product: Product, catalog: Category[]): MenuOptionGroup[] {
  const slugs = optionGroupsFor(product.brand, product.category);
  return slugs.flatMap(slug => {
    const group = catalog.find(category => category.slug === slug);
    return group?.products.length ? [{ slug, name: group.name, options: group.products.map(p => ({
      id: p.id, name: p.name, priceCents: effectivePrice(p),
    })) }] : [];
  });
}
function availableCatalog(catalog: Category[], brand: Brand): Category[] {
  return catalog.map(group => ({ ...group, products: group.products
    .filter(p => p.available !== false && Number.isSafeInteger(p.id))
    .map(p => ({ ...p, brand, category: group.slug })) })).filter(g => g.products.length);
}
interface Receipt {
  checkoutId: string; orderId: string; orderNumber: string; brand: Brand; orderType: string; tableNumber: number | null;
  status: string; paymentStatus: string; paymentMethod?: OnlinePaymentMethod; subtotalCents: number; discountCents?: number | null; deliveryFeeCents: number; totalCents: number;
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
  const catalogs = useRef<Partial<Record<Brand, Category[]>>>({});
  const [customization, setCustomization] = useState<Customization | null>(null);
  const [editingItem, setEditingItem] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<{ open: boolean; reason: string; nextOpen: string | null; closesAt?: string | null; openingHours?: string | null; address?: string | null } | null>(null);
  const [table, setTable] = useState<{ number: number; token: string } | null>(null);
  const [tableError, setTableError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const cart = useCart();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const items = hydrated ? cart.items.filter(item => (item.brand ?? "barbacue") === brand) : [];
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [method, setMethod] = useState<OnlinePaymentMethod>("pix");
  const [changeFor, setChangeFor] = useState("");
  const paymentMethod = tableToken ? "pix" : method;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { cache: "no-store", signal: controller.signal }).then(json).then(data => {
      if (data?.member) {
        setCustomerName(current => current || data.member.name);
        if (data.member.phone) setCustomerPhone(current => current || formatPhone(data.member.phone));
      }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const [notes, setNotes] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; amount: number; subtotal: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAvailability, setDeliveryAvailability] = useState<"unavailable" | "enabled" | "error">("unavailable");
  const deliveryEnabled = deliveryAvailability === "enabled";
  const [address, setAddress] = useState("");
  const [quote, setQuote] = useState<CheckoutDeliveryQuote | null>(null);
  const quoteRequest = useRef<AbortController | null>(null);
  const quoteValid = deliveryEnabled && quoteMatchesAddress(quote, address, brand);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copied, setCopied] = useState(false);
  const checkoutBrand = brand;
  const suggestions = ["bebidas-delivery", "porcoes"].flatMap(slug => {
    const product = menu.find(group => group.slug === slug)?.products.find(product =>
      !items.some(item => (item.brand ?? "barbacue") === product.brand && item.productId === product.id));
    return product ? [product] : [];
  });
  const sending = useRef(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const cartButton = useRef<HTMLButtonElement>(null);
  const receiptTitle = useRef<HTMLHeadingElement>(null);
  const locked = busy || Boolean(recovery);
  const subtotal = items.reduce((total, item) => total + item.priceCents * item.qty, 0);
  const appliedCoupon = coupon?.subtotal === subtotal ? coupon : null;
  const { total, discount } = checkoutAmounts(subtotal, appliedCoupon?.amount ?? 0,
    orderType === "delivery" && !table && quoteValid ? quote.feeCents : 0);
  const qty = items.reduce((total, item) => total + item.qty, 0);
  const minimum = onlineMinimumCents(checkoutBrand, table ? "dine_in" : orderType);
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
        const available = availableCatalog(catalog, brand);
        catalogs.current[brand] = available;
        setMenu(available);
        setStatus(availability);
        setDeliveryAvailability(!delivery.ok || typeof deliveryData?.enabled !== "boolean" ? "error" : deliveryData.enabled ? "enabled" : "unavailable");
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
      if (data.environment === PAY_ON_RECEIPT || data.pix || data.paymentStatus === "paid" || data.status === "cancelled") {
        // CPF is needed only to create the provider customer. Remove it from
        // tab storage as soon as the payment can be recovered by its id.
        const minimal: Recovery = { id: recovery.id, accessToken: recovery.accessToken, savedAt: recovery.savedAt };
        sessionStorage.setItem(KEY, JSON.stringify(minimal));
        if (recovery.input) {
          setRecovery(minimal);
          const currentCart = useCart.getState();
          currentCart.replace(currentCart.items.filter(item => (item.brand ?? "barbacue") !== data.brand));
          setCpf(""); setCustomerName(""); setCustomerPhone(""); setNotes("");
        }
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

  function resetReview() {
    setError("");
  }
  function openProduct(product: Product) {
    const priceCents = effectivePrice(product);
    setCustomization({
      product, groups: groupsFor(product, menu), editing: false,
      item: { productId: product.id, brand: product.brand, name: product.name, imageUrl: product.imageUrl, priceCents, qty: 1 },
    });
  }
  async function editProduct(item: CartItem) {
    const itemBrand = item.brand ?? "barbacue";
    setEditingItem(true);
    setError("");
    try {
      let catalog = catalogs.current[itemBrand];
      if (!catalog) {
        const response = await fetch(`/api/products?brand=${itemBrand}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        const data = await json(response);
        if (!response.ok || !Array.isArray(data)) throw new Error("Não foi possível abrir este item. Tente novamente.");
        catalog = availableCatalog(data, itemBrand);
        catalogs.current[itemBrand] = catalog;
      }
      const product = catalog.flatMap(group => group.products).find(product => product.id === item.productId);
      if (!product) throw new Error("Este item está indisponível. Retire-o da sacola para continuar.");
      setCustomization({ product, item, groups: groupsFor(product, catalog), editing: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir este item.");
    } finally { setEditingItem(false); }
  }
  function saveCustomization(choices: MenuChoice[], notes: string) {
    if (!customization || locked || !canOrder) return;
    const { item, product, groups, editing } = customization;
    const basePriceCents = effectivePrice(product);
    const line = { ...item, priceCents: basePriceCents + menuOptionsTotal(choices, groups), choices, notes };
    const lineKey = cartLineKey(line);
    const currentKey = cartLineKey(item);
    const existingQty = items.find(current => cartLineKey(current) === lineKey)?.qty ?? 0;
    if ((!editing || lineKey !== currentKey) && existingQty + line.qty > 20) {
      setError("O limite é de 20 unidades para cada combinação de adicionais e observações.");
      return;
    }
    if (editing) cart.editLine(currentKey, line);
    else cart.add(line);
    resetReview();
  }
  function resetQuote() {
    quoteRequest.current?.abort();
    quoteRequest.current = null;
    setQuote(null);
    setQuoting(false);
  }
  useEffect(() => {
    if (!quote) return;
    const timer = window.setTimeout(() => setQuote(null), Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [quote]);
  useEffect(() => () => quoteRequest.current?.abort(), []);

  async function calculateFreight() {
    if (locked || quoteRequest.current || !deliveryEnabled) return;
    const controller = new AbortController();
    quoteRequest.current = controller;
    setQuoting(true); setError(""); setQuote(null);
    try {
      const response = await fetch("/api/delivery/quote", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: checkoutBrand, address: address.trim() }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) });
      const data = await json(response);
      if (!response.ok) throw new Error(data?.message ?? "Não foi possível calcular o frete.");
      if (quoteRequest.current === controller) setQuote(parseCheckoutQuote(data, address, checkoutBrand));
    } catch (cause) {
      if (quoteRequest.current === controller) setError(cause instanceof Error ? cause.message : "Não foi possível calcular o frete.");
    } finally {
      if (quoteRequest.current === controller) { quoteRequest.current = null; setQuoting(false); }
    }
  }
  async function applyCoupon() {
    if (!couponCode.trim() || checkingCoupon || locked) return;
    setCheckingCoupon(true); setCouponError(""); setCoupon(null);
    try {
      const response = await fetch("/api/coupons", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, subtotalCents: subtotal }), signal: AbortSignal.timeout(10_000) });
      const data = await json(response);
      if (!response.ok || typeof data?.discountCents !== "number" || typeof data?.code !== "string") {
        throw new Error(data?.error ?? "Não foi possível conferir o cupom.");
      }
      setCoupon({ code: data.code, amount: data.discountCents, subtotal });
    } catch (cause) {
      setCouponError(cause instanceof Error ? cause.message : "Não foi possível conferir o cupom.");
    } finally { setCheckingCoupon(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || recovery || sending.current || !canOrder || !items.length) return;
    if (!table && orderType === "delivery" && (!deliveryEnabled || !quoteMatchesAddress(quote, address, checkoutBrand))) { setQuote(null); setError("Calcule o frete atualizado antes de pagar."); return; }
    if (checkingCoupon || (coupon && !appliedCoupon)) { setCouponError("Confira o cupom para o novo subtotal antes de continuar."); return; }
    if (subtotal < minimum) { setError(`O mínimo para entrega é ${formatPrice(minimum)} em produtos.`); return; }
    const changeForCents = paymentMethod === "cash" && changeFor ? Math.round(Number(changeFor) * 100) : undefined;
    if (changeForCents != null && changeForCents < total) { setError("O valor para troco precisa cobrir o total do pedido."); return; }
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join("");
    const input: OnlineOrderInput = { requestId: crypto.randomUUID(), accessToken: token, brand: checkoutBrand, customerName, customerPhone, expectedTotalCents: total,
      ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      ...(paymentMethod === "pix" ? { cpf } : { paymentMethod, changeForCents }), orderType: table ? "dine_in" : orderType,
      ...(table ? { tableToken: table.token } : {}), ...(!table && orderType === "delivery" ? { deliveryAddress: address, deliveryQuoteId: quote!.quoteId } : {}),
      notes, items: items.map(i => ({ productId: i.productId, brand: i.brand ?? "barbacue", qty: i.qty, notes: i.notes, choices: i.choices })) };
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
    sessionStorage.removeItem(KEY); setRecovery(null); setReceipt(null); setError(""); resetQuote(); setAddress(""); setCoupon(null); setCouponCode(""); setCouponError(""); setMethod("pix"); setChangeFor("");
  }
  function switchBrand(next: Brand) {
    if (locked) return;
    resetQuote(); setBrand(next); setCategory(null); setQuery(""); setError("");
    drawer.current?.close();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function quantity(item: CartItem) {
    const change = (qty: number) => { cart.setLineQty(cartLineKey(item), qty); resetReview(); };
    return <div className={s.quantity}><button type="button" aria-label={`Diminuir ${item.name}`} disabled={locked} onClick={() => change(item.qty - 1)}>−</button><output aria-label={`Quantidade de ${item.name}`}>{item.qty}</output><button type="button" aria-label={`Aumentar ${item.name}`} disabled={locked || !canOrder || item.qty >= 20} onClick={() => change(item.qty + 1)}>+</button></div>;
  }
  function panel(prefix: string) {
    return <><div className={s.ticketHeading}><div><div className={o.cartBrands} aria-label="Restaurantes do pedido">{([...new Set(items.map(item => item.brand ?? "barbacue"))].length ? [...new Set(items.map(item => item.brand ?? "barbacue"))] : [brand]).map(b => <BrandLogo checkout key={b} brand={b} width={32} alt={NAMES[b]} />)}</div><h2 id={`${prefix}-title`}>Seu pedido</h2><p>{table ? `Mesa ${table.number}` : NAMES[brand]}</p></div><span className={s.ticketCount}>{qty}</span></div>
      {!items.length && !recovery ? <div className={s.emptyCart}><h3>O que vai ser hoje?</h3><p>Escolha seus favoritos no cardápio.</p></div> : <form id={`${prefix}-checkout`} className={s.ticketForm} onSubmit={submit}>
        <div className={s.ticketBody}><div className={s.orderItems}>{items.map(item => <article className={s.orderItem} key={cartLineKey(item)}>
          <div className={s.orderItemTitle}><h3><small className={o.lineNote}>{NAMES[item.brand ?? "barbacue"]}</small>{item.name}</h3>{quantity(item)}<strong>{formatPrice(item.priceCents * item.qty)}</strong></div>
          {item.choices?.map(choice => {
            const option = catalogs.current[item.brand ?? "barbacue"]?.flatMap(group => group.products).find(product => product.id === choice.productId);
            return <small key={choice.productId} className={o.lineNote}>{choice.qty}× {option?.name ?? "Adicional"} por unidade</small>;
          })}
          {item.notes && <small className={o.lineNote}>{item.notes}</small>}
          <button type="button" className={s.secondary} disabled={locked || editingItem || !canOrder} onClick={() => void editProduct(item)}>Editar {item.name}</button>
        </article>)}</div>
        {suggestions.length > 0 && <div className={o.recommendations} aria-label="Sugestões para acompanhar">
          <strong>Peça também</strong>
          {suggestions.map(product => <button type="button" key={product.id} className={s.secondary} disabled={locked || !canOrder}
            onClick={() => openProduct(product)}>Adicionar {product.name} · {formatPrice(effectivePrice(product))}</button>)}
        </div>}
        <div className={s.checkout}>
          <div className={o.coupon}>
            <label className={s.field} htmlFor={`${prefix}-coupon`}>Cupom de desconto
              <input id={`${prefix}-coupon`} value={couponCode} maxLength={60} disabled={locked || checkingCoupon}
                onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void applyCoupon(); } }}
                onChange={event => { setCouponCode(event.target.value.toUpperCase()); setCoupon(null); setCouponError(""); }} />
            </label>
            <button type="button" className={s.secondary} disabled={locked || checkingCoupon || !couponCode.trim() || Boolean(appliedCoupon)} onClick={() => void applyCoupon()}>
              {checkingCoupon ? "Conferindo…" : appliedCoupon ? "Aplicado" : "Aplicar"}
            </button>
          </div>
          {coupon && !appliedCoupon && <p className={s.paymentHint}>Aplique o cupom novamente após alterar os itens.</p>}
          {couponError && <p role="alert" className={s.formError}>{couponError}</p>}
          {!table && <fieldset className={s.payment} disabled={locked}><legend>Como você quer receber?</legend><div>{(["pickup", "delivery"] as const).map(type => <label key={type} className={orderType === type ? s.paymentSelected : ""}><input type="radio" name={`${prefix}-type`} checked={orderType === type} disabled={type === "delivery" && !deliveryEnabled} onChange={() => { setOrderType(type); resetQuote(); resetReview(); }} />{type === "pickup" ? "Retirada grátis" : "Entrega"}</label>)}</div>{!deliveryEnabled && <p className={s.paymentHint}>{deliveryAvailability === "error" ? "Não foi possível consultar a disponibilidade de entrega." : "Entrega indisponível no momento."}</p>}</fieldset>}
          {!table && orderType === "pickup" && status?.address && <p className={s.paymentHint}>{status.address}</p>}
          {!table && orderType === "delivery" && <><label className={s.field} htmlFor={`${prefix}-address`}>Endereço completo<textarea id={`${prefix}-address`} required minLength={12} maxLength={400} disabled={locked} value={address} onChange={e => { setAddress(e.target.value); resetQuote(); setError(""); }} placeholder="Rua, número, bairro, cidade, CEP e complemento" /></label><button type="button" className={s.secondary} disabled={locked || quoting || address.trim().length < 12} onClick={() => void calculateFreight()}>{quoting ? "Calculando…" : "Calcular frete"}</button>{quoteValid && <div className={o.freight}>Frete: <strong>{formatPrice(quote.feeCents)}</strong><p>{deliveryEstimate(quote.distanceMeters, quote.durationSeconds)}. O preparo é contado à parte.</p></div>}</>}
          <label className={s.field} htmlFor={`${prefix}-name`}>Seu nome<input id={`${prefix}-name`} autoComplete="name" required minLength={2} maxLength={80} value={customerName} disabled={locked} onChange={e => setCustomerName(e.target.value)} /></label>
          <label className={s.field} htmlFor={`${prefix}-phone`}>Telefone com DDD<input id={`${prefix}-phone`} type="tel" inputMode="numeric" autoComplete="tel-national" required minLength={10} maxLength={15} value={customerPhone} disabled={locked} placeholder="(47) 99999-9999" onChange={e => setCustomerPhone(formatPhone(e.target.value))} /></label>
          {!table && <fieldset className={s.payment} disabled={locked}>
            <legend>Forma de pagamento</legend>
            <div>{(["pix", "cash", "card_on_delivery"] as const).map(option => <label key={option} className={option === paymentMethod ? s.paymentSelected : ""}>
              <input type="radio" name={`${prefix}-payment`} checked={option === paymentMethod} onChange={() => { setMethod(option); setError(""); }} />
              {onlinePaymentLabel(option, orderType)}
            </label>)}</div>
          </fieldset>}
          {paymentMethod === "cash" && <label className={s.field} htmlFor={`${prefix}-change`}>Troco para quanto? <span>Opcional</span>
            <input id={`${prefix}-change`} type="number" min="0.01" max="10000" step="0.01" inputMode="decimal" disabled={locked}
              value={changeFor} onChange={event => { setChangeFor(event.target.value); setError(""); }} />
          </label>}
          {paymentMethod === "pix" && <label className={s.field} htmlFor={`${prefix}-cpf`}>CPF para pagamento<input id={`${prefix}-cpf`} inputMode="numeric" required minLength={11} maxLength={14} autoComplete="off" value={cpf} disabled={locked} placeholder="000.000.000-00" onChange={e => setCpf(formatCpf(e.target.value))} /><span>Usado para gerar sua cobrança.</span></label>}
          <label className={s.field} htmlFor={`${prefix}-notes`}>Observações <span>Opcional</span><textarea id={`${prefix}-notes`} maxLength={500} value={notes} disabled={locked} onChange={e => setNotes(e.target.value)} /></label>
          {paymentMethod === "pix" && <div className={o.pixMethod}><strong>Pagamento com Pix</strong><p>Escaneie o QR Code ou use o copia e cola. O preparo começa após a confirmação.</p></div>}
        </div></div>
        <div className={s.ticketFooter}>{discount > 0 && <p className={s.paymentHint}>Desconto {appliedCoupon?.code} · −{formatPrice(discount)}</p>}<div className={s.total}><span>{orderType === "delivery" && !table && !quoteValid ? "Produtos (frete a calcular)" : "Total"}</span><strong>{formatPrice(total)}</strong></div>{minimum > 0 && <p className={s.paymentHint}>Mínimo de {formatPrice(minimum)} em produtos para entrega.</p>}{error && <p className={s.formError} role="alert">{error}</p>}{recovery ? <button type="button" className={s.primary} disabled={busy} onClick={() => void refreshPayment()}>{busy ? "Confirmando envio…" : "Recuperar meu pedido"}</button> : <button className={s.primary} type="submit" disabled={!canOrder || locked || quoting || checkingCoupon || Boolean(coupon && !appliedCoupon) || subtotal < minimum || (!table && orderType === "delivery" && !quoteValid)}>{paymentMethod === "pix" ? busy ? "Gerando Pix…" : "Continuar para pagamento" : "Enviar pedido"}</button>}<p className={s.sendHint}>Confira os itens antes de continuar.</p></div>
      </form>}</>;
  }
  const publicMenu = brand === "barbacue" ? menu.filter(group => !["turbine-seu-lanche", "para-acompanhar", "molhos", "turbinar-porcao"].includes(group.slug)) : menu;
  const filtered = publicMenu.filter(g => category === null || g.id === category).map(g => ({ ...g, products: g.products.filter(p => normalize(`${p.name} ${p.description ?? ""}`).includes(normalize(query))) })).filter(g => g.products.length);
  const paid = receipt?.paymentStatus === "paid";
  const payOnReceipt = receipt?.environment === PAY_ON_RECEIPT;
  return <div className={`${s.shell} ${o.shell} ${brand === "barbacue" ? "" : `brand-site brand-site--${brand}`}`} data-brand={brand}>
    <header className={s.header}><Link href="/conta" className={o.accountLink}>Minha conta</Link><BrandNavigation active={brand} onSelect={switchBrand} disabled={locked} /></header>
    {receipt ? <main className={`${s.receipt} ${o.receipt}`}>
      <h1 ref={receiptTitle} tabIndex={-1} aria-live="polite">{receipt.status === "cancelled" ? "Pedido cancelado" : payOnReceipt ? receipt.status === "pending" ? "Pedido enviado à loja" : STAGES[receipt.status] ?? "Pedido recebido" : paid ? STAGES[receipt.status] ?? "Pagamento confirmado" : "Pague para confirmar seu pedido"}</h1>
      <p>{receipt.status === "cancelled" ? payOnReceipt ? "Este pedido foi encerrado." : "Este pedido foi encerrado. Se você efetuou o pagamento, fale com a equipe para conferir o estorno." : payOnReceipt ?
        `${onlinePaymentLabel(receipt.paymentMethod ?? "cash", receipt.orderType)}. ${receipt.status === "pending" ? "Aguarde a confirmação da loja." : "Acompanhe o preparo por aqui."}` : paid ? `Pix recebido. ${receipt.tableNumber ? `A entrega será na mesa ${receipt.tableNumber}.` : receipt.orderType === "delivery" ? "Vamos entregar no endereço informado." : "Acompanhe o preparo e retire na loja."}` : "Seu pedido está reservado nesta tela. A cozinha recebe após a confirmação do pagamento."}</p>
      {!payOnReceipt && !["production", "c6:production"].includes(receipt.environment) && <p className={s.formError}>Ambiente de teste. Não faça pagamento real.</p>}
      <div className={s.receiptTicket}><span>{NAMES[receipt.brand]} · Pedido</span><strong>#{receipt.orderNumber}</strong>{receipt.items.map((item, index) => <p key={index}>{item.qty}× {item.name} <b>{formatPrice(item.qty * item.priceCents)}</b>{item.notes && <small className={o.lineNote}>{item.notes}</small>}</p>)}<p>Produtos: {formatPrice(receipt.subtotalCents)}{Boolean(receipt.discountCents) && ` · Desconto: −${formatPrice(receipt.discountCents ?? 0)}`}{receipt.orderType === "delivery" && ` · Frete: ${formatPrice(receipt.deliveryFeeCents)}`}</p><div><span>Total</span><b>{formatPrice(receipt.totalCents)}</b></div></div>
      {!paid && receipt.status !== "cancelled" && receipt.pix && <section className={o.pix} aria-label="Pagamento Pix"><h2>Pix de {formatPrice(receipt.totalCents)}</h2>{/* Provider-owned base64 QR code, never a remote tracking image. */}<Image unoptimized src={`data:image/png;base64,${receipt.pix.encodedImage}`} alt={`QR Code Pix do pedido ${receipt.orderNumber}`} width="240" height="240" /><label htmlFor="pix-code">Pix copia e cola</label><textarea id="pix-code" readOnly value={receipt.pix.payload} rows={3} onFocus={e => e.target.select()} /><button type="button" className={s.primary} onClick={async () => { try { await navigator.clipboard.writeText(receipt.pix!.payload); setCopied(true); } catch { setError("Selecione o código acima e copie para o aplicativo do seu banco."); } }}>{copied ? "Código copiado" : "Copiar código Pix"}</button><p>Após pagar no banco, aguarde a confirmação aqui.</p></section>}
      {error && <p role="alert" className={s.formError}>{error}</p>}
      {receipt.status !== "cancelled" && receipt.status !== "delivered" && <button className={s.secondary} disabled={busy} onClick={() => void refreshPayment()}>{busy ? "Consultando…" : paid || payOnReceipt ? "Atualizar pedido" : "Verificar pagamento"}</button>}
      {!paid && (payOnReceipt ? receipt.status === "pending" : receipt.status !== "cancelled") && <button type="button" className={s.secondary} disabled={busy} onClick={() => void cancelOrder()}>{payOnReceipt ? "Cancelar pedido" : "Cancelar pedido sem pagamento"}</button>}
      {(paid || payOnReceipt || receipt.status === "cancelled") && <button type="button" className={s.primary} onClick={newOrder}>Fazer outro pedido</button>}
      <p className={o.help}>Precisa de ajuda? Informe à equipe o número #{receipt.orderNumber}.</p>
    </main> : <main className={s.main}><section className={s.catalog} aria-label="Cardápio">

      <div className={s.intro}><div><h1>{brand === "barbacue" ? "Seu pedido, na brasa." : brand === "barbadog" ? "Capricha no seu dog." : "Hoje tem mexicano."}</h1><p>{table ? `Escolha para a mesa ${table.number}.` : "Escolha seus favoritos e pague por aqui."}</p></div><span className={`${s.status} ${status?.open ? s.statusOpen : ""}`}><i />{loading ? "Carregando" : status?.open ? status.closesAt ? `Aberto até ${status.closesAt}` : "Recebendo pedidos" : "Pedidos pausados"}</span></div>
      {status?.openingHours && !status.closesAt && <p className={s.sendHint}>{status.openingHours}</p>}
      {loading ? <div className={s.loading} role="status"><div /><p>Preparando o cardápio…</p></div> : loadError || tableError ? <div className={s.notice} role="alert"><h2>Vamos tentar de novo</h2><p>{loadError || tableError}</p><button className={s.secondary} onClick={() => setReload(n => n + 1)}>Carregar novamente</button></div> : <>
        {!status?.open && <div className={s.closedNotice}><strong>Pedidos pausados neste momento</strong><p>{status?.reason} {status?.nextOpen}</p><button type="button" onClick={() => setReload(n => n + 1)}>Verificar disponibilidade</button></div>}
        <div className={s.menuTools}><label className={s.search}><input type="search" aria-label="Buscar no cardápio" placeholder="O que você quer comer?" value={query} onChange={e => setQuery(e.target.value)} /></label><nav className={s.categories} aria-label="Categorias"><button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>Tudo</button>{publicMenu.map(g => <button type="button" key={g.id} aria-pressed={category === g.id} onClick={() => setCategory(g.id)}>{g.name}</button>)}</nav></div>
        {filtered.map(g => <section className={s.category} key={g.id}><div className={s.categoryTitle}><h2>{g.name}</h2><span>{g.products.length} opções</span></div><div className={s.productGrid}>{g.products.map((product, index) => { const selected = items.some(i => i.productId === product.id && (i.brand ?? "barbacue") === product.brand); const photo = orderingImage(brand, product); return <article key={product.id} className={`${s.product} ${selected ? s.productSelected : ""}`}><div className={s.productPhoto}><ProductImage src={photo.src} alt={product.name} sizes="(max-width: 599px) 144px, (max-width: 999px) 45vw, 320px" priority={index < 2 && g.id === menu[0]?.id} />{photo.illustrative && <span className={o.photoCaption}>Imagem ilustrativa</span>}</div><div className={s.productCopy}><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<div className={s.productBottom}><div className={s.price}><strong>{formatPrice(effectivePrice(product))}</strong></div><button className={s.add} type="button" disabled={!canOrder || locked} aria-label={`Adicionar ${product.name}`} onClick={() => openProduct(product)}><span>+</span> Adicionar</button></div></div></article>; })}</div></section>)}
        {!filtered.length && <div className={s.noResults}><h2>Nenhum item encontrado</h2><p>Tente outro nome ou outra categoria.</p></div>}
      </>}
      {recovery && !receipt && <div className={s.closedNotice}><strong>Seu envio está salvo</strong><p>Consulte para recuperar o mesmo pedido.</p>{error && <p role="alert">{error}</p>}<button disabled={busy} onClick={() => void refreshPayment()}>{busy ? "Consultando…" : "Recuperar meu pedido"}</button></div>}
      <footer className={s.catalogFooter}>Feito na hora. Aproveite cada mordida.</footer>
    </section><aside className={s.sidebar} aria-label="Resumo do pedido"><div className={s.ticket}>{panel("sidebar")}</div></aside></main>}
    {!receipt && <button ref={cartButton} type="button" className={s.mobileCart} disabled={!qty && !recovery} aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><span className={s.mobileCartCount}>{qty}</span><span>{recovery ? "Recuperar pedido" : "Ver pedido"}</span><strong>{formatPrice(total)}</strong></button>}
    <dialog ref={drawer} className={s.cartDialog} aria-labelledby="drawer-title" onClose={() => cartButton.current?.focus()}><div className={s.drawerInner}><button type="button" className={s.closeDialog} onClick={() => drawer.current?.close()}>← Continuar escolhendo</button>{panel("drawer")}</div></dialog>
    {customization && <CustomizeOrderItem name={customization.product.name} description={customization.product.description}
      priceCents={effectivePrice(customization.product)} groups={customization.groups}
      initialNotes={customization.editing ? customization.item.notes ?? "" : undefined}
      initialChoices={customization.item.choices} onSave={saveCustomization} onClose={() => setCustomization(null)} />}
  </div>;
}
