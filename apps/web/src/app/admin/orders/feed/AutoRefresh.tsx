"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Atualiza o feed sozinho, como a tela da cozinha, sem recarregar a página. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
