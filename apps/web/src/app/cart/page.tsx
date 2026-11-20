import { redirect } from "next/navigation";
import { isBrand } from "@/lib/brands";

export default async function CartPage({ searchParams }: { searchParams: Promise<{ restaurante?: string }> }) {
  const { restaurante } = await searchParams;
  redirect(isBrand(restaurante) ? `/pedir?restaurante=${restaurante}` : "/pedir");
}
