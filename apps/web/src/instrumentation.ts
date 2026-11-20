export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { generateDispatch } = await import("@/lib/dispatch-service");
  const timer = setInterval(() => {
    void generateDispatch(true).catch(error => {
      console.error("Dispatch worker failed", error instanceof Error ? error.name : "unknown");
    });
  }, 30_000);
  timer.unref();
}
