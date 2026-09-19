import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Anton } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";
import { brandFromHost, getBrandStorefront } from "@/lib/brand-storefront";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Display face for the wordmark + section headings — heavy condensed grill-poster
// energy. Single weight (400) by design; pair with Geist for body/UI.
const anton = Anton({ weight: "400", variable: "--font-anton", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const slug = brandFromHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));

  if (slug) {
    const brand = getBrandStorefront(slug);
    const domain = slug === "chelas"
      ? (process.env.DOMAIN_CHELAS ?? "chelas.hirableaiagents.com")
      : (process.env.DOMAIN_HOTDOG ?? "barbadog.hirableaiagents.com");
    return {
      metadataBase: new URL(`https://${domain}`),
      title: `${brand.name} — Cardápio`,
      description: brand.description,
      openGraph: { title: `${brand.name} — Cardápio`, description: brand.description },
    };
  }

  return {
    metadataBase: new URL(`https://${process.env.DOMAIN_BARBA ?? process.env.DOMAIN ?? "barbacue.cog.ia.br"}`),
    title: "BARBACUE — Burguers na Brasa",
    description: "Burguers na brasa 🍔🔥 Jaraguá do Sul-SC. Faça seu pedido agora!",
    openGraph: {
      title: "BARBACUE — Burguers na Brasa",
      description: "Burguers na brasa 🍔🔥 Jaraguá do Sul-SC",
      images: [{ url: "/brand/og.png", width: 1200, height: 630 }],
    },
  };
}

// Warm-white browser chrome to match the light "butcher-paper" identity.
export const viewport = {
  themeColor: "#fbf7f2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${anton.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
