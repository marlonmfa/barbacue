import Link from "next/link";

const APP_STORE_URL =
  "https://apps.apple.com/br/app/barbacue-burguers-na-brasa/id6782376058";
const PLAY_TEST_URL =
  "https://play.google.com/apps/testing/com.lanchesdobarba.barbacue";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.lanchesdobarba.barbacue";

export function AppDownloadSection() {
  return (
    <section
      id="aplicativo"
      aria-labelledby="app-download-title"
      className="scroll-mt-6 border-t border-[var(--border)] bg-[var(--bg)]"
    >
      <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-red)]">
            Barbacue no celular
          </p>
          <h2
            id="app-download-title"
            className="font-display text-3xl uppercase leading-tight sm:text-4xl"
          >
            Baixe o aplicativo oficial
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Acesse o cardápio e faça seu pedido pelo app do Barbacue.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <article className="flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 fire-glow sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-ink)] text-xs font-bold tracking-tight text-white"
              >
                iOS
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  iPhone e iPad
                </p>
                <h3 className="text-xl font-bold">App Store</h3>
              </div>
            </div>

            <p className="mb-6 text-sm leading-relaxed text-[var(--text-muted)]">
              Disponível para baixar agora. A instalação é feita diretamente
              pela loja oficial da Apple.
            </p>

            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex min-h-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 transition-transform hover:scale-[1.01] active:scale-95"
              aria-label="Baixar Barbacue na App Store, abre em uma nova aba"
            >
              <img
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/pt-br?size=250x83"
                alt="Baixar na App Store"
                className="h-12 w-auto"
                loading="lazy"
              />
            </a>
          </article>

          <article className="flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 fire-glow sm:p-7">
            <div className="mb-4 flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f7d32] text-[10px] font-bold uppercase tracking-tight text-white"
              >
                Android
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Android
                </p>
                <h3 className="text-xl font-bold">Teste fechado</h3>
              </div>
            </div>

            <p className="mb-5 text-sm leading-relaxed text-[var(--text-muted)]">
              O app ainda exige autorização de testador no Google Play. Siga
              estes passos usando sempre a mesma conta Google:
            </p>

            <ol className="mb-6 flex flex-col gap-3 text-sm text-[var(--text)]">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-red-soft)] text-xs font-bold text-[var(--brand-red)]">
                  1
                </span>
                <span>
                  Se ainda não recebeu o convite,{" "}
                  <Link
                    href="/beta"
                    className="font-semibold text-[var(--brand-red)] underline decoration-[var(--brand-red)]/30 underline-offset-2 hover:decoration-[var(--brand-red)]"
                  >
                    cadastre seu e-mail Google
                  </Link>{" "}
                  e aguarde a confirmação.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-red-soft)] text-xs font-bold text-[var(--brand-red)]">
                  2
                </span>
                <span>
                  Abra o{" "}
                  <a
                    href={PLAY_TEST_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--brand-red)] underline decoration-[var(--brand-red)]/30 underline-offset-2 hover:decoration-[var(--brand-red)]"
                  >
                    convite oficial do Google Play
                  </a>{" "}
                  e toque em <strong>“Tornar-se um testador”</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-red-soft)] text-xs font-bold text-[var(--brand-red)]">
                  3
                </span>
                <span>
                  Depois do aceite, abra a página do app e instale normalmente
                  pela Play Store.
                </span>
              </li>
            </ol>

            <div className="mt-auto grid gap-2 sm:grid-cols-2">
              <a
                href={PLAY_TEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--brand-red)] px-4 py-3 text-center text-sm font-bold text-[var(--brand-red)] transition-colors hover:bg-[var(--brand-red-soft)] active:scale-95"
                aria-label="Aceitar convite para testar o Barbacue no Google Play, abre em uma nova aba"
              >
                1. Aceitar o teste ↗
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 transition-transform hover:scale-[1.01] active:scale-95"
                aria-label="Instalar Barbacue pela Play Store, abre em uma nova aba"
              >
                <img
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/pt-br_badge_web_generic.png"
                  alt="Disponível no Google Play"
                  className="h-16 w-auto"
                  loading="lazy"
                />
              </a>
            </div>
          </article>
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-[var(--text-muted)]">
          Android: para ajudar a concluir o período de testes, mantenha o app
          instalado e use-o por pelo menos 14 dias.
        </p>
      </div>
    </section>
  );
}
