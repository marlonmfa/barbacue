import { redirect } from "next/navigation";
export default function Page() {
  const domain = process.env.DOMAIN_BARBA ?? "barbacue.cog.ia.br";
  redirect(`https://${domain}/?loja=1`);
}
