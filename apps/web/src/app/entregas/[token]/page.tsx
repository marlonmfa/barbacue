import type { Metadata } from "next";
import { DeliveryLink } from "@/components/DeliveryLink";

export const metadata: Metadata = { title: "Entrega · Endereço e mensagens", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "24px 12px" }}><DeliveryLink token={token} /></main>;
}
