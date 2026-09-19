import { redirect } from "next/navigation";
export default function Page() {
  const domain = process.env.DOMAIN_HOTDOG ?? "barbadog.hirableaiagents.com";
  redirect(`https://${domain}/?loja=1`);
}
