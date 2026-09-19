"use client";

import type { CSSProperties } from "react";
import type { BrandStorefront as BrandStorefrontData, ScrapedMenuItem } from "@/lib/brand-storefront";
import { useCart } from "@/lib/cart";
import { CartDrawer } from "@/components/CartDrawer";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function MenuCard({ item }: { item: ScrapedMenuItem }) {
  const onSale = item.originalPriceCents && item.originalPriceCents > item.priceCents;
  const add = useCart((store) => store.add);
  const qty = useCart((store) => store.items.find((cartItem) => cartItem.productId === Number(item.id))?.qty ?? 0);

  return (
    <article className="brand-menu-card">
      <div className="brand-menu-photo">
        {item.imageUrl ? (
          // A plain img keeps remote iFood photos working without coupling the
          // scraped catalog to Next Image's deploy-time host allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} loading="lazy" />
        ) : (
          <div className="brand-food-mark" aria-hidden>
            <span>{item.category.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        {onSale && <span className="brand-promo">Oferta</span>}
      </div>

      <div className="brand-menu-copy">
        <h3>{item.name}</h3>
        {item.description && <p>{item.description}</p>}
        <div className="brand-menu-action">
          <div className="brand-price">
            {onSale && <del>{formatPrice(item.originalPriceCents!)}</del>}
            <strong>{formatPrice(item.priceCents)}</strong>
          </div>
          <button
            type="button"
            onClick={() => add({ productId: Number(item.id), name: item.name, priceCents: item.priceCents, imageUrl: item.imageUrl })}
            aria-label={`Adicionar ${item.name} ao pedido`}
          >
            {qty > 0 ? `${qty} no pedido · +1` : "Adicionar"} <span aria-hidden>＋</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function BrandStorefront({ brand }: { brand: BrandStorefrontData }) {
  const categories = [...new Set(brand.items.map((item) => item.category))];
  const grouped = categories.map((category) => ({
    category,
    items: brand.items.filter((item) => item.category === category),
  }));
  const themeStyle = { "--brand-item-count": brand.items.length } as CSSProperties;

  return (
    <div className={`brand-site brand-site--${brand.slug}`} style={themeStyle}>
      <header className="brand-hero">
        <div className="brand-hero-pattern" aria-hidden />
        <nav className="brand-topbar" aria-label="Navegação principal">
          <a className="brand-wordmark" href="#top" aria-label={brand.name}>
            <span>{brand.monogram}</span>
            <strong>{brand.name}</strong>
          </a>
          <a className="brand-order-link" href="#cardapio">
            Montar pedido <span aria-hidden>↓</span>
          </a>
        </nav>

        <div className="brand-hero-inner" id="top">
          <p className="brand-kicker">{brand.kicker}</p>
          <h1>{brand.tagline}</h1>
          <p className="brand-intro">{brand.description}</p>
          <div className="brand-hero-actions">
            <a className="brand-primary-cta" href="#cardapio">Explorar cardápio <span aria-hidden>↓</span></a>
            <div className="brand-facts" aria-label="Informações da loja">
              <span>{brand.rating}</span>
              <span>{brand.minimumOrder}</span>
              <span>{brand.delivery}</span>
            </div>
          </div>
        </div>

        <div className="brand-hero-stamp" aria-hidden>
          <strong>{brand.items.length}</strong>
          <span>itens no cardápio</span>
        </div>
      </header>

      <nav className="brand-category-nav" aria-label="Categorias do cardápio">
        <div>
          {categories.map((category) => (
            <a key={category} href={`#${slugify(category)}`}>{category}</a>
          ))}
        </div>
      </nav>

      <main className="brand-menu" id="cardapio">
        <div className="brand-menu-heading">
          <p>Do iFood para você</p>
          <h2>Cardápio completo</h2>
          <span>Escolha seus itens e finalize tudo no mesmo sistema.</span>
        </div>

        {grouped.map(({ category, items }) => (
          <section className="brand-category" id={slugify(category)} key={category}>
            <header>
              <h2>{category}</h2>
              <span>{items.length} {items.length === 1 ? "item" : "itens"}</span>
            </header>
            <div className="brand-menu-grid">
              {items.map((item) => <MenuCard key={item.id} item={item} />)}
            </div>
          </section>
        ))}
      </main>

      <footer className="brand-footer">
        <div>
          <span className="brand-footer-mark">{brand.monogram}</span>
          <div><strong>{brand.name}</strong><p>Jaraguá do Sul · Santa Catarina</p></div>
        </div>
        <a href="#cardapio">Voltar ao cardápio ↑</a>
      </footer>
      <CartDrawer />
    </div>
  );
}
