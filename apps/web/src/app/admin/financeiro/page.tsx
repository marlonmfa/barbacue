import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin-auth";
import { loadEntries, loadSales, firstSaleDate } from "@/lib/financeiro/queries";
import { FinanceiroView } from "./FinanceiroView";

export const dynamic = "force-dynamic";
export const metadata = { title: "DRE e fluxo de caixa" };

const todaySp = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default async function FinanceiroPage() {
  const session = await requireStaff().catch(() => null);
  if (!session) redirect("/admin/login");
  if (session.role !== "admin") redirect("/admin");
  const today = todaySp();
  // O DFC estimado olha repasses do iFood até a semana seguinte, então os dados
  // vão até hoje; o filtro de período fica todo no navegador.
  const [sales, entries, first] = await Promise.all([loadSales(today), loadEntries(), firstSaleDate()]).catch((error) => {
    console.error("[financeiro] leitura falhou", error);
    return [null, null, null] as const;
  });
  if (!sales || !entries)
    return (
      <main style={{ padding: 32, color: "#f3f1eb" }}>
        <h1>DRE e fluxo de caixa</h1>
        <p>Não foi possível ler pedidos e lançamentos. Verifique a conexão com o banco e tente de novo.</p>
      </main>
    );
  return <FinanceiroView sales={sales} entries={entries} today={today} firstSale={first ?? today} />;
}
