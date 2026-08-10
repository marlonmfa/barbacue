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

// Clean "butcher-paper" hero: the Barbacue & Co engraving logo on warm white, a
// clear open/closed status, key info, and social CTAs. Replaces the old dark
// flame-photo hero as part of the red-on-white brand identity.
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
    <header className="relative isolate overflow-hidden border-b border-[var(--border)]">
      <div aria-hidden className="absolute inset-0 -z-10 hero-scrim" />

      <div className="max-w-5xl mx-auto px-4 pt-10 pb-9 sm:pt-16 sm:pb-12 flex flex-col items-center text-center gap-4">
        {/* Brand mark — the engraving logo framed like a printed sign. */}
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[0_12px_40px_-18px_rgba(27,22,19,0.28)] px-6 py-5 sm:px-10 sm:py-6">
          <div className="relative w-52 h-52 sm:w-64 sm:h-64">
            <Image
              src="/brand/barbacue-logo-t.png"
              alt={storeName}
              fill
              priority
              sizes="256px"
              className="object-contain"
            />
          </div>
        </div>
        {/* Accessible/SEO wordmark (the logo carries it visually). */}
        <h1 className="sr-only">{storeName}</h1>

        {/* Status pill */}
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
            isClosed
              ? "bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]"
              : "bg-emerald-500/12 text-emerald-700 border border-emerald-600/30"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isClosed ? "bg-[var(--text-muted)]" : "bg-emerald-500 animate-pulse"}`} />
          {isClosed ? "Fechado agora" : "Aberto agora"}
        </span>

        <p className="text-[var(--brand-tan)] text-base sm:text-lg font-medium">{tagline}</p>

        {/* Info chips */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs sm:text-sm text-[var(--text-muted)]">
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
          <a
            href="#aplicativo"
            className="border border-[var(--border-hover)] bg-[var(--surface)] text-[var(--text)] text-sm font-semibold px-5 py-3 rounded-xl transition-colors hover:bg-[var(--surface-2)] active:scale-95 inline-flex items-center gap-2"
          >
            <span aria-hidden>📱</span>
            Baixar app
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
