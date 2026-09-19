import { notFound } from "next/navigation";
import { isBrand, BRANDS } from "@/lib/brands";
import { OrderChat } from "@/components/OrderChat";

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  return { title: isBrand(brand) ? `Atendimento ${BRANDS[brand]} — Pedido pelo chat` : "Atendimento" };
}
export default async function Page({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  if (!isBrand(brand)) notFound();
  return <OrderChat key={brand} brand={brand} />;
}
