import { redirect } from "next/navigation";
export default function Page() {
  const domain = process.env.DOMAIN_CHELAS ?? "chelas.hirableaiagents.com";
  redirect(`https://${domain}/?loja=1`);
}
