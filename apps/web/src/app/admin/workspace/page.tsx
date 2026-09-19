import Link from "next/link";
import { requireStaff } from "@/lib/admin-auth";
import { can, landingPath, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import styles from "@/components/admin/Access.module.css";
export default async function WorkspacePage() {
  const session = await requireStaff();
  const primaryPath = landingPath(session);
  const tasks = PERMISSIONS.filter(p => can(session, p.id)).sort((a, b) => Number(b.href === primaryPath) - Number(a.href === primaryPath));
  return <div className={styles.page}><h1>Olá, {session.name ?? "equipe"}</h1><p>{session.jobTitle || ROLE_LABELS[session.role]}</p><p>{ROLE_DESCRIPTIONS[session.role]}</p><div className={styles.work}>{tasks.map(task => <Link key={task.id} href={task.href} className={styles.task}><h2>{task.label}</h2><p>{task.description}</p></Link>)}</div>{!tasks.length && <div className={styles.panel}><p className={styles.empty}>Sua conta ainda não tem funções liberadas. Peça ao administrador para configurar seu acesso.</p></div>}</div>;
}
