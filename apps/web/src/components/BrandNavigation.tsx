import Link from "next/link";
import { BRANDS, BRAND_THEME, brandSwitcherOrder, type Brand } from "@/lib/brands";

/**
 * Seletor do grupo no topo: a marca atual aparece grande, com sua cor, e as
 * outras duas ficam pequenas à direita. `/<marca>` redireciona para o domínio
 * próprio de cada loja (ex.: chelas.cog.ia.br).
 */
export function BrandNavigation({ active, chat = false }: { active: Brand; chat?: boolean }) {
  const { current, others } = brandSwitcherOrder(active);
  const theme = BRAND_THEME[current];
  const href = (slug: Brand) => (chat ? `/atendimento/${slug}` : `/${slug}`);
  return <nav aria-label="Escolha o restaurante" data-testid="brand-switcher"
    className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6"
    style={{ background: theme.background, borderBottom: `4px solid ${theme.accent}`, color: "#fffdf4" }}>
    <Link href={href(current)} aria-current="page" className="flex min-w-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.logo} alt="" width={64} height={64}
        className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain shadow-lg sm:h-16 sm:w-16" />
      <span className="min-w-0 leading-tight">
        <strong className="block truncate text-xl font-black tracking-tight sm:text-2xl">{BRANDS[current]}</strong>
        <span className="block truncate text-xs font-semibold uppercase tracking-widest" style={{ color: theme.accent }}>{theme.tagline}</span>
      </span>
    </Link>
    <div className="flex shrink-0 items-center gap-2">
      <Link className="hidden rounded-full px-3 py-1.5 text-xs font-bold underline-offset-2 hover:underline sm:inline"
        href={chat ? `/${active}` : `/atendimento/${active}`}>
        {chat ? "Ver cardápio" : "Pedir pelo chat"}
      </Link>
      {others.map((slug) => <Link key={slug} href={href(slug)} title={BRANDS[slug]} aria-label={BRANDS[slug]}
        className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2.5 text-xs font-semibold opacity-80 transition hover:bg-white/20 hover:opacity-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_THEME[slug].icon} alt="" width={28} height={28} className="h-7 w-7 rounded-full bg-white object-contain" />
        <span className="hidden md:inline">{BRANDS[slug]}</span>
      </Link>)}
    </div>
  </nav>;
}
