import { db } from "@/db";
import { categories, products, storeSettings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { ProductCard } from "@/components/ProductCard";
import { CategoryNav } from "@/components/CategoryNav";
import { CartDrawer } from "@/components/CartDrawer";
import { ChatAgent } from "@/components/ChatAgent";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { TableBanner } from "@/components/TableBanner";
import { getTableSession } from "@/lib/table-session";

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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mesa?: string }>;
}) {
  const [{ menu, settings }, table, { mesa }] = await Promise.all([
    getMenu(),
    getTableSession(),
    searchParams,
  ]);

  const storeName = settings?.storeName ?? "Barbacue";
  const tagline = settings?.tagline ?? "Burguers na brasa 🔥";
  const isClosed = settings?.isOpen === false;
  const igUrl = settings?.instagramUrl ?? "https://www.instagram.com/barbacue.burguersnabrasa/";

  return (
    <>
      {/* ── Flame-grill hero (replaces the thin profile header) ── */}
      <Hero
        storeName={storeName}
        tagline={tagline}
        igUrl={igUrl}
        whatsapp={settings?.whatsapp}
        address={settings?.address}
        openingHours={settings?.openingHours}
        deliveryFeeText={settings?.deliveryFeeText}
        isClosed={isClosed}
      />

      {/* Table / QR feedback (seated badge or invalid-QR notice) */}
      <TableBanner table={table} mesaParam={mesa} />

      {isClosed && (
        <div className="sticky top-0 z-30 bg-[var(--brand-red)] text-white text-center py-3 px-4 text-sm font-semibold shadow-md">
          🔒 A loja está fechada no momento. Pedidos serão retomados em breve!
        </div>
      )}

      <CategoryNav categories={menu.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />

      <main id="menu" className="max-w-5xl mx-auto px-4 pb-32 pt-8 flex-1 w-full scroll-mt-16">
        {menu.length === 0 ? (
          <div className="text-center py-24 text-[var(--text-muted)]">
            <p className="text-5xl mb-4">🍔</p>
            <p className="text-lg font-medium">Cardápio em breve!</p>
            <p className="text-sm mt-2">Volte mais tarde.</p>
          </div>
        ) : (
          menu.map((category) => (
            <section key={category.id} id={`cat-${category.slug}`} className="mb-12 scroll-mt-24">
              <div className="flex items-center gap-3 mb-5">
                <span aria-hidden className="h-7 w-1.5 rounded-full bg-[var(--brand-red)]" />
                <h2 className="section-title text-2xl sm:text-3xl text-[var(--text)]">{category.name}</h2>
                <span className="text-xs text-[var(--text-muted)] font-medium">
                  {category.products.length}
                </span>
                <span aria-hidden className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categorySlug={category.slug}
                    categoryName={category.name}
                    isClosed={isClosed}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <Footer
        storeName={storeName}
        tagline={settings?.tagline}
        instagramUrl={settings?.instagramUrl}
        whatsapp={settings?.whatsapp}
        phone={settings?.phone}
        address={settings?.address}
        openingHours={settings?.openingHours}
        deliveryFeeText={settings?.deliveryFeeText}
      />

      <CartDrawer />
      <ChatAgent />
    </>
  );
}
