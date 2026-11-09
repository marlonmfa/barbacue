export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  // Pix do C6 pago com a aba do cliente fechada e sem webhook: confere no banco
  // a cada 30 s os checkouts abertos (docs/PIX-C6.md). Inativo sem credenciais.
  const { c6Configured } = await import("./lib/c6-pix");
  if (!c6Configured()) return;
  const { reconcileOpenC6Checkouts } = await import("./lib/online-checkout");
  const timer = setInterval(() => {
    reconcileOpenC6Checkouts().catch(error => console.error(`[online-checkout] conciliação C6: ${(error as Error).message}`));
  }, 30_000);
  timer.unref?.();
}
