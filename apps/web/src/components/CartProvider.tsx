"use client";

// Zustand persist requires client context to hydrate from localStorage.
// This wrapper ensures cart state is available across the whole app.
export function CartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
