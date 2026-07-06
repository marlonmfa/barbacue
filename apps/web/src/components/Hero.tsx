import Image from "next/image";

interface Props {
  storeName: string;
  tagline: string;
  igUrl: string;
  whatsapp?: string | null;
  address?: string | null;
  openingHours?: string | null;
  deliveryFeeText?: string | null;
  isClosed: boolean;
}

// Full-bleed flame-grill hero. Replaces the thin profile header — the brand promise
// ("burguers na brasa") is now the first thing the customer sees, with a clear
// open/closed status, key info, and social CTAs. Background art is OpenAI-generated
// (public/generated/hero.png) — see REDESIGN_V3.md.
export function Hero({
  storeName,
  tagline,
  igUrl,
  whatsapp,
  address,
  openingHours,
  deliveryFeeText,
  isClosed,
}: Props) {
  const waHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;

  return (
    <header className="relative isolate overflow-hidden">
      {/* Flame-grill background */}
      <Image
        src="/generated/hero.png"
        alt="Hambúrguer na brasa"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center -z-10"
      />
      <div aria-hidden className="absolute inset-0 -z-10 hero-scrim" />

      <div className="max-w-5xl mx-auto px-4 pt-12 pb-10 sm:pt-20 sm:pb-14 flex flex-col items-center text-center gap-4">
        {/* Logo badge with ember ring */}
        <a
          href={igUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Instagram do ${storeName}`}
          className="p-0.5 rounded-full ig-gradient shadow-lg shadow-black/50"
        >
          <span className="block p-1 rounded-full bg-[var(--bg)]">
            <span className="relative block w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden">
              <Image src="/instagram/logo-full.png" alt={storeName} fill className="object-contain" sizes="80px" />
            </span>
          </span>
        </a>

        {/* Status pill */}
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm ${
            isClosed
              ? "bg-black/50 text-[var(--text-muted)] border border-[var(--border)]"
              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isClosed ? "bg-[var(--text-muted)]" : "bg-emerald-400 animate-pulse"}`} />
          {isClosed ? "Fechado agora" : "Aberto agora"}
        </span>

        {/* Wordmark */}
        <h1 className="font-display text-5xl sm:text-7xl text-white leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
          {storeName}
        </h1>
        <p className="text-[var(--brand-tan-soft)] text-base sm:text-lg font-medium drop-shadow">{tagline}</p>

        {/* Info chips */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs sm:text-sm text-[var(--text)]/90 drop-shadow">
          {openingHours && <span>🕐 {openingHours}</span>}
          {deliveryFeeText && <span>🛵 {deliveryFeeText}</span>}
          {address && <span>📍 {address}</span>}
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
          <a
            href="#menu"
            className="btn-brand text-sm font-bold px-6 py-3 rounded-xl inline-flex items-center gap-2"
          >
            Ver cardápio
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </a>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-transform active:scale-95 inline-flex items-center gap-2"
              aria-label="Falar no WhatsApp"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
              </svg>
              WhatsApp
            </a>
          )}
          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ig-gradient text-white text-sm font-semibold px-5 py-3 rounded-xl transition-transform active:scale-95 inline-flex items-center gap-2"
            aria-label="Seguir no Instagram"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
            Seguir
          </a>
        </div>
      </div>
    </header>
  );
}
