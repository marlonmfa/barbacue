import Link from "next/link";
import { can, landingPath, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, type Access } from "@/lib/permissions";
import styles from "./Access.module.css";
const steps = {
  admin: ["Confira os pedidos e o andamento da operação.", "Organize os acessos e acompanhe cada função da equipe."],
  manager: ["Confira os pedidos pendentes e o preparo.", "Distribua os pedidos entre os entregadores online e acompanhe as saídas."],
  cashier: ["Atenda os clientes e acompanhe os pedidos.", "Abra o pedido de entrega e escolha um entregador online."],
  kitchen: ["Confira os itens e observações na fila de preparo.", "Inicie o preparo e marque o pedido como pronto para retirada."],
  waiter: ["Confira as mesas e os pedidos do salão.", "Registre o atendimento quando o pedido pronto for servido."],
  driver: ["Abra Minhas entregas e selecione Ficar online.", "Retire o pedido pronto, registre a saída e abra a rota.", "Conclua a entrega após entregar ao cliente."],
  employee: ["Escolha uma das funções liberadas para sua conta."],
};
export function WorkHome({ account }: { account: Access & { name?: string; jobTitle?: string | null } }) {
  const primary = landingPath(account);
  const tasks = PERMISSIONS.filter(task => can(account, task.id)).sort((a, b) => Number(b.href === primary) - Number(a.href === primary));
  return <div className={styles.page}>
    <h1>Olá, {account.name || "equipe"}</h1><p>{account.jobTitle || ROLE_LABELS[account.role]}</p><p>{ROLE_DESCRIPTIONS[account.role]}</p>
    {tasks.length > 0 && <section className={styles.ticket}><h2>Seu turno</h2><ol>{steps[account.role].map(step => <li key={step}>{step}</li>)}</ol><Link className={styles.primary} href={tasks[0].href}>Abrir {tasks[0].label.toLocaleLowerCase("pt-BR")}</Link></section>}
    <div className={styles.work}>{tasks.map(task => <Link key={task.id} href={task.href} className={styles.task}><h2>{task.label}</h2><p>{task.description}</p></Link>)}</div>
    {!tasks.length && <p className={styles.empty}>Sua conta ainda não tem funções liberadas. Peça ao administrador para configurar seu acesso.</p>}
  </div>;
}
