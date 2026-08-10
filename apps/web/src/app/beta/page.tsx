import type { Metadata } from "next";
import { BetaSignupClient } from "@/components/BetaSignupClient";

export const metadata: Metadata = {
  title: "Beta do App — Barbacue",
  description:
    "Cadastre-se para testar o aplicativo do Barbacue antes de todo mundo.",
};

export default function BetaPage() {
  return <BetaSignupClient />;
}
