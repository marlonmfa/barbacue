"use client";
import { useEffect } from "react";

/** Keep already-open tabs on the active account; bind mutations to the rendered view. */
export function SessionWatch({ view }: { view: string }) {
  useEffect(() => {
    const original = window.fetch;
    let checking = false, stopped = false;
    const check = async (refresh = false) => {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const response = await original("/api/auth/cog/session", { cache: "no-store" });
        if (response.ok) {
          const state = await response.json();
          if (!stopped && state.view !== view) location.reload();
          else if (!stopped && refresh && state.refresh) location.assign("/api/auth/cog/start?"+new URLSearchParams({next:location.pathname+location.search}));
        }
      } catch { /* A network failure never clears local state. */ }
      finally { checking = false; }
    };
    const wrapped: typeof window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const authLogin = method === "POST" && ["/api/admin/auth", "/api/account"].includes(url.pathname);
      if (url.origin === location.origin && !authLogin && !["GET", "HEAD", "OPTIONS"].includes(method) && url.pathname.startsWith("/api/")) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        headers.set("X-Cog-View", view);
        return original(input, { ...init, headers });
      }
      return original(input, init);
    };
    window.fetch = wrapped;
    const focus = () => { void check(true); };
    const interval = window.setInterval(() => { void check(); }, 30000);
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => {
      stopped = true; clearInterval(interval);
      if (window.fetch === wrapped) window.fetch = original;
      window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus);
    };
  }, [view]);
  return null;
}
