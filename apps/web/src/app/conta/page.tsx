import AccountForm from "./AccountForm";
import { configuredProviders, safeReturnTo } from "@/lib/social-auth";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  cancelado: "Login cancelado. Tente novamente quando quiser.",
  sessao: "A sessão de login expirou. Tente novamente.",
  indisponivel: "Este tipo de login ainda não está disponível.",
  tentativas: "Muitas tentativas. Aguarde alguns minutos.",
  instagram: "Não foi possível entrar com o Instagram. Esse login aceita apenas contas profissionais (comercial ou criador). Use Google, Apple ou e-mail.",
  falha: "Não foi possível concluir o login. Tente novamente.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const erro = typeof query.erro === "string" ? query.erro : "";
  const returnTo = safeReturnTo(typeof query.returnTo === "string" ? query.returnTo : "/");
  return <AccountForm providers={configuredProviders()} initialError={ERRORS[erro] ?? ""} returnTo={returnTo} />;
}
