import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BARBACUE — Burguers na Brasa",
  description: "Burguers na brasa 🍔🔥 Jaraguá do Sul-SC. Faça seu pedido agora!",
  openGraph: {
    title: "BARBACUE — Burguers na Brasa",
    description: "Burguers na brasa 🍔🔥 Jaraguá do Sul-SC",
    images: [{ url: "/instagram/app-icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
