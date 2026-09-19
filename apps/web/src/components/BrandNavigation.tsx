import Link from "next/link";
import { BRANDS, type Brand } from "@/lib/brands";

export function BrandNavigation({ active, chat = false }: { active: Brand; chat?: boolean }) {
  return <nav aria-label="Escolha o restaurante" className="flex flex-wrap items-center justify-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] p-3">
    {Object.entries(BRANDS).map(([slug, name]) => <Link key={slug}
      href={chat ? `/atendimento/${slug}` : `/${slug}`}
      aria-current={slug === active ? "page" : undefined}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${slug === active ? "bg-[var(--brand-red)] text-white" : "border border-[var(--border)]"}`}>{name}</Link>)}
    <Link className="px-3 py-2 text-sm underline" href={chat ? `/${active}` : `/atendimento/${active}`}>
      {chat ? "Ver cardápio" : "Pedir pelo chat"}
    </Link>
  </nav>;
}
