"use client";

import { BrandLogo } from "@/components/BrandLogo";
import Link from "next/link";
import { BRANDS, BRAND_THEME, brandSwitcherOrder, type Brand } from "@/lib/brands";

/**
 * Seletor do grupo no topo, sempre na ordem Chelas · Barbacue · Barbadog:
 * a marca do domínio atual aparece grande, com sua cor, e as outras duas
 * pequenas. A troca de cardápio fica no mesmo domínio para preservar o carrinho.
 */
export function BrandNavigation({ active, chat = false, onSelect, disabled = false }: {
  active: Brand; chat?: boolean; onSelect?: (brand: Brand) => void; disabled?: boolean;
}) {
  const theme = BRAND_THEME[active];
  const href = (slug: Brand) => (chat ? `/atendimento/${slug}` : `/?loja=1&restaurante=${slug}`);
  const selection = (slug: Brand) => onSelect ? {
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!disabled) onSelect(slug);
    },
    "aria-disabled": disabled,
  } : {};
  return <nav aria-label="Escolha o restaurante" data-testid="brand-switcher"
    className="relative flex flex-col items-center gap-1 px-3 py-2"
    style={{ background: theme.background, borderBottom: `4px solid ${theme.accent}`, color: "#fffdf4" }}>
    <div className="flex items-center justify-center gap-3 sm:gap-6">
      {brandSwitcherOrder(active).map(({ slug, featured }) => featured
        ? <Link key={slug} href={href(slug)} {...selection(slug)} aria-label={BRANDS[slug]} aria-current="page" className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <BrandLogo brand={active} alt="" width={64} height={64}
              className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain shadow-lg sm:h-16 sm:w-16" />
            <span className="min-w-0 leading-tight">
              <strong className="block truncate text-xl font-black tracking-tight sm:text-2xl">{BRANDS[slug]}</strong>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-widest sm:text-xs" style={{ color: theme.accent }}>{theme.tagline}</span>
            </span>
          </Link>
        : <Link key={slug} href={href(slug)} {...selection(slug)} title={BRANDS[slug]} aria-label={BRANDS[slug]}
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 text-[11px] font-semibold opacity-75 transition hover:bg-white/15 hover:opacity-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <BrandLogo brand={slug} alt="" width={28} height={28} className="h-7 w-7 rounded-full bg-white object-contain" />
            <span className="hidden sm:inline">{BRANDS[slug]}</span>
          </Link>)}
    </div>
    <Link className="text-xs font-bold underline-offset-2 hover:underline sm:absolute sm:right-6 sm:top-1/2 sm:-translate-y-1/2"
      href={chat ? `/?loja=1&restaurante=${active}` : `/atendimento/${active}`}>
      {chat ? "Ver cardápio" : "Pedir pelo chat"}
    </Link>
  </nav>;
}
