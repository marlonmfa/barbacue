import Image from "next/image";
import { db } from "@/db";
import { categories, products, storeSettings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ProductCard } from "@/components/ProductCard";
import { CategoryNav } from "@/components/CategoryNav";
import { CartDrawer } from "@/components/CartDrawer";
import { ChatAgent } from "@/components/ChatAgent";

export const dynamic = "force-dynamic";

async function getMenu() {
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));

  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  const prods = await db
    .select()
    .from(products)
    .where(eq(products.available, true))
    .orderBy(asc(products.sortOrder));

  const grouped = cats
    .map((cat) => ({
      ...cat,
      products: prods.filter((p) => p.categoryId === cat.id),
    }))
    .filter((cat) => cat.products.length > 0);

  return { menu: grouped, settings: settings ?? null };
}

export default async function HomePage() {
  const { menu, settings } = await getMenu();

  const storeName = settings?.storeName ?? "Barbacue";
  const tagline = settings?.tagline ?? "Peça agora — entregamos com amor!";
  const isClosed = settings?.isOpen === false;

  const igUrl = settings?.instagramUrl ?? "https://www.instagram.com/barbacue.burguersnabrasa/";

  return (
    <>
      {/* ── Instagram-style profile header ── */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-6">

          {/* Profile row */}
          <div className="flex items-center gap-6 sm:gap-10">
            {/* Avatar with IG gradient ring */}
            <a href={igUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
              <div className="p-0.5 rounded-full ig-gradient">
                <div className="p-0.5 rounded-full bg-[var(--surface)]">
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden">
                    <Image
                      src="/instagram/logo-full.png"
                      alt={storeName}
                      fill
                      className="object-contain bg-[var(--bg)]"
                      sizes="96px"
                      priority
                    />
                  </div>
                </div>
              </div>
            </a>

            {/* Profile info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-xl font-light tracking-tight text-[var(--text)]">{storeName}</h1>

                {/* Instagram CTA */}
                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 ig-gradient text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-opacity hover:opacity-90"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  Seguir no Instagram
                </a>

                {settings?.whatsapp && (
                  <a
                    href={`https://wa.me/${settings.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                )}
              </div>

              {/* Bio / tagline */}
              <p className="text-sm text-[var(--brand-tan-soft)] font-medium">{tagline}</p>

              {/* Store info */}
              <div className="flex flex-wrap gap-3 mt-1.5 text-[var(--text-muted)] text-xs">
                {settings?.openingHours && <span>🕐 {settings.openingHours}</span>}
                {settings?.deliveryFeeText && <span>🛵 {settings.deliveryFeeText}</span>}
                {settings?.address && <span>📍 {settings.address}</span>}
              </div>
            </div>
          </div>
        </div>
      </header>

      {isClosed && (
        <div className="bg-red-500 text-white text-center py-3 px-4 text-sm font-medium">
          🔒 A loja está fechada no momento. Pedidos serão retomados em breve!
        </div>
      )}

      <CategoryNav
        categories={menu.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
      />

      <main className="max-w-5xl mx-auto px-4 pb-32 pt-6 flex-1">
        {menu.length === 0 ? (
          <div className="text-center py-24 text-[var(--text-muted)]">
            <p className="text-5xl mb-4">🍔</p>
            <p className="text-lg font-medium">Cardápio em breve!</p>
            <p className="text-sm mt-2">Volte mais tarde.</p>
          </div>
        ) : (
          menu.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.slug}`}
              className="mb-10 scroll-mt-20"
            >
              <h2 className="text-lg font-semibold mb-4 text-[var(--text)] border-b border-[var(--border)] pb-2">
                {category.name}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <CartDrawer />
      <ChatAgent />
    </>
  );
}
