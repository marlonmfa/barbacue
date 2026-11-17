"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductImage } from "@/components/ProductImage";
import { BRANDS, type Brand } from "@/lib/brands";
import { orderingImage } from "@/lib/ordering-images";
import { effectivePrice, type PromoPricable } from "@/lib/pricing";
import { buildWhatsAppOrderMessage, buildWhatsAppOrderUrl, type WhatsAppFulfillment, type WhatsAppPayment } from "@/lib/whatsapp-order";
import s from "./WhatsAppOrderBuilder.module.css";

interface Product extends PromoPricable { brand: Brand; id: number; name: string; description: string | null; imageUrl: string | null; available: boolean }
interface Category { id: number; name: string; products: Product[] }
interface CartItem { product: Product; qty: number; notes: string }

const BRAND_ORDER: Brand[] = ["barbacue", "barbadog", "chelas"];
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_ORDER_NUMBER || "5547997776933";
const formatPrice = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function WhatsAppOrderBuilder({ initialBrand }: { initialBrand: Brand }) {
  const [brand, setBrand] = useState(initialBrand);
  const [menu, setMenu] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [fulfillment, setFulfillment] = useState<WhatsAppFulfillment>("pickup");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<WhatsAppPayment>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(""); setQuery("");
    fetch(`/api/products?brand=${brand}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) throw new Error();
        setMenu(data.map((group: Category) => ({ ...group, products: group.products.filter(product => product.available !== false).map(product => ({ ...product, brand })) })).filter((group: Category) => group.products.length));
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError("Não foi possível carregar este cardápio agora."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [brand]);

  const visibleMenu = useMemo(() => {
    const needle = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!needle) return menu;
    return menu.map(group => ({ ...group, products: group.products.filter(product => `${product.name} ${product.description ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(needle)) })).filter(group => group.products.length);
  }, [menu, query]);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + effectivePrice(item.product) * item.qty, 0);

  function change(product: Product, delta: number) {
    setCart(current => {
      const selected = current.find(item => item.product.brand === product.brand && item.product.id === product.id);
      if (!selected) return delta > 0 ? [...current, { product, qty: 1, notes: "" }] : current;
      return current.map(item => item === selected ? { ...item, qty: Math.min(20, item.qty + delta) } : item).filter(item => item.qty > 0);
    });
  }

  function summaryInput() {
    return {
      customerName,
      fulfillment,
      address,
      paymentMethod,
      changeFor,
      notes,
      items: cart.map(item => ({ brand: item.product.brand, name: item.product.name, priceCents: effectivePrice(item.product), qty: item.qty, notes: item.notes })),
    };
  }

  function openWhatsApp() {
    if (!cart.length) return setError("Adicione pelo menos um item ao pedido.");
    if (!customerName.trim()) return setError("Informe o nome de quem vai receber o pedido.");
    if (fulfillment === "delivery" && !address.trim()) return setError("Informe o endereço completo para entrega.");
    setError("");
    window.location.href = buildWhatsAppOrderUrl(summaryInput(), WHATSAPP_NUMBER);
  }

  return <main className={s.page}>
    <header className={s.hero}>
      <div className={s.heroInner}>
        <p className={s.eyebrow}>BARBA DELIVERY • PEDIDO PELO WHATSAPP</p>
        <h1>Monte seu pedido das três casas</h1>
        <p>Escolha os produtos, defina entrega e pagamento e envie tudo pronto para confirmação no WhatsApp.</p>
        <div className={s.notice}>Este carrinho não cria nem cobra um pedido sozinho. O resumo só será enviado quando você abrir o WhatsApp e confirmar o envio.</div>
      </div>
    </header>

    <div className={s.layout}>
      <section className={s.catalog} aria-label="Cardápio">
        <nav className={s.brandTabs} aria-label="Restaurantes">
          {BRAND_ORDER.map(slug => <button key={slug} type="button" className={brand === slug ? s.brandActive : ""} onClick={() => setBrand(slug)}>
            <BrandLogo brand={slug} width={44} alt="" /><span>{BRANDS[slug]}</span>
          </button>)}
        </nav>
        <div className={s.searchRow}><div><span>Cardápio</span><strong>{BRANDS[brand]}</strong></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" /></div>
        {loading && <p className={s.state}>Carregando cardápio…</p>}
        {loadError && <p className={s.error}>{loadError}</p>}
        {!loading && !loadError && !visibleMenu.length && <p className={s.state}>Nenhum produto encontrado.</p>}
        {visibleMenu.map(group => <section className={s.category} key={group.id}>
          <h2>{group.name}</h2>
          <div className={s.grid}>{group.products.map(product => {
            const selected = cart.find(item => item.product.brand === product.brand && item.product.id === product.id);
            const photo = orderingImage(brand, product);
            return <article className={s.product} key={product.id}>
              <div className={s.photo}><ProductImage src={photo.src} alt={product.name} sizes="(max-width: 700px) 112px, 180px" /></div>
              <div className={s.productBody}><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<strong>{formatPrice(effectivePrice(product))}</strong>
                {selected ? <div className={s.stepper}><button type="button" onClick={() => change(product, -1)} aria-label={`Remover ${product.name}`}>−</button><span>{selected.qty}</span><button type="button" onClick={() => change(product, 1)} aria-label={`Adicionar ${product.name}`}>+</button></div>
                  : <button className={s.add} type="button" onClick={() => change(product, 1)}>Adicionar</button>}
              </div>
            </article>;
          })}</div>
        </section>)}
      </section>

      <aside className={s.checkout} aria-label="Resumo e conclusão">
        <div className={s.checkoutTitle}><div><span>Seu pedido</span><strong>{count} {count === 1 ? "item" : "itens"}</strong></div><b>{formatPrice(subtotal)}</b></div>
        {!cart.length && <p className={s.empty}>Adicione produtos de uma ou mais marcas. O carrinho permanece ao trocar de cardápio.</p>}
        <div className={s.cartItems}>{cart.map((item, index) => <div className={s.cartItem} key={`${item.product.brand}:${item.product.id}`}>
          <div><small>{BRANDS[item.product.brand]}</small><strong>{item.qty}x {item.product.name}</strong><span>{formatPrice(effectivePrice(item.product) * item.qty)}</span></div>
          <button type="button" onClick={() => setCart(current => current.filter((_, i) => i !== index))}>Remover</button>
          <input value={item.notes} onChange={event => setCart(current => current.map((entry, i) => i === index ? { ...entry, notes: event.target.value } : entry))} placeholder="Observação deste item" aria-label={`Observação de ${item.product.name}`} />
        </div>)}</div>

        <label className={s.field}>Nome de quem vai receber<input value={customerName} onChange={event => setCustomerName(event.target.value)} autoComplete="name" /></label>
        <fieldset className={s.options}><legend>Como vai receber?</legend><label><input type="radio" checked={fulfillment === "pickup"} onChange={() => setFulfillment("pickup")} /> Retirar no balcão</label><label><input type="radio" checked={fulfillment === "delivery"} onChange={() => setFulfillment("delivery")} /> Entrega</label></fieldset>
        {fulfillment === "delivery" && <label className={s.field}>Endereço completo<textarea value={address} onChange={event => setAddress(event.target.value)} rows={3} placeholder="Rua, número, bairro, cidade e referência" /></label>}
        <fieldset className={s.options}><legend>Forma de pagamento</legend><label><input type="radio" checked={paymentMethod === "pix"} onChange={() => setPaymentMethod("pix")} /> Pix</label><label><input type="radio" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} /> Dinheiro</label><label><input type="radio" checked={paymentMethod === "card_on_delivery"} onChange={() => setPaymentMethod("card_on_delivery")} /> Cartão na entrega</label></fieldset>
        {paymentMethod === "cash" && <label className={s.field}>Precisa de troco para?<input value={changeFor} onChange={event => setChangeFor(event.target.value)} placeholder="Ex.: R$ 100,00" /></label>}
        <label className={s.field}>Observações gerais<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} /></label>
        {error && <p className={s.error} role="alert">{error}</p>}
        {cart.length > 0 && customerName.trim() && <details className={s.preview}><summary>Conferir mensagem</summary><pre>{buildWhatsAppOrderMessage(summaryInput())}</pre></details>}
        <button className={s.finish} type="button" onClick={openWhatsApp}>Enviar pedido no WhatsApp</button>
        <p className={s.disclaimer}>Disponibilidade, frete e total final serão confirmados pela equipe antes do preparo.</p>
      </aside>
    </div>
  </main>;
}
