import type { Metadata, Viewport } from "next";
import { WhatsAppOrderBuilder } from "@/components/WhatsAppOrderBuilder";
import { isBrand, type Brand } from "@/lib/brands";

export const metadata: Metadata = { title: "Monte seu pedido | Barba Delivery", description: "Escolha itens de Barbacue, Barbadog e Chelas e envie o pedido pelo WhatsApp." };
export const viewport: Viewport = { themeColor: "#17110e", colorScheme: "light" };
export const dynamic = "force-dynamic";

export default async function WhatsAppOrderPage({ searchParams }: { searchParams: Promise<{ restaurante?: string }> }) {
  const query = await searchParams;
  const initialBrand: Brand = isBrand(query.restaurante) ? query.restaurante : "barbacue";
  return <WhatsAppOrderBuilder initialBrand={initialBrand} />;
}
