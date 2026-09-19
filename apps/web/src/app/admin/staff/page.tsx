"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PERMISSIONS, effectivePermissions, landingPath, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, type AccessRole, type Permission } from "@/lib/permissions";
import styles from "@/components/admin/Access.module.css";

type Staff = { id: number; name: string; username: string; role: AccessRole; jobTitle: string | null; permissions: Permission[] | null; active: boolean };
const empty = { name: "", username: "", password: "", role: "employee" as AccessRole, jobTitle: "", permissions: [] as Permission[], active: true };
export default function StaffPage() {
  const [users, setUsers] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [permission, setPermission] = useState("");
  async function load() {
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "Somente administradores podem editar acessos." : "Não foi possível carregar os usuários.");
      setUsers(await res.json());
    } catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/staff", { cache: "no-store", signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error(res.status === 403 ? "Somente administradores podem editar acessos." : "Não foi possível carregar os usuários.");
      return res.json();
    }).then(data => { setUsers(data); setLoading(false); }).catch(e => {
      if (!controller.signal.aborted) { setError(e.message); setLoading(false); }
    });
    return () => controller.abort();
  }, []);
  function edit(user?: Staff) {
    setEditing(user?.id ?? "new"); setError(""); setNotice("");
    setForm(user ? { ...user, jobTitle: user.jobTitle ?? "", password: "", permissions: effectivePermissions(user) } : { ...empty });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const { password, ...rest } = form;
      const res = await fetch(editing === "new" ? "/api/admin/staff" : `/api/admin/staff/${editing}`, {
        method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, ...(password ? { password } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Confira os campos e tente novamente.");
      setEditing(null); setNotice("Acessos salvos. As permissões já valem para a próxima solicitação do usuário."); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Falha de conexão. Tente novamente."); } finally { setSaving(false); }
  }
  const visible = users.filter(u => `${u.name} ${u.username} ${u.jobTitle ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (!permission || effectivePermissions(u).includes(permission as Permission)));
  return <div className={styles.page}>
    <header className={styles.head}><div><h1>Usuários e acessos</h1><p>Cada pessoa com as funções de que precisa. Defina o perfil e ajuste o acesso de cada usuário.</p></div><button className={styles.primary} onClick={() => edit()}>Nova conta da equipe</button></header>
    <section className={styles.profiles} aria-label="Perfis de entrada">
      <article><strong>Cliente visitante</strong><p>Entra sem login, consulta o cardápio e faz pedidos. Recebe ofertas para visitantes.</p></article>
      <article><strong>Cliente da casa</strong><p>Entra com sua conta de cliente e encontra as ofertas destinadas a clientes cadastrados.</p></article>
      <article><strong>Equipe da casa</strong><p>Gerente, caixa, cozinha, garçom e entregador têm áreas próprias. Ajuste as funções de cada pessoa.</p></article>
    </section>
    {notice && <p role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {editing !== null && <form onSubmit={save} className={styles.form} aria-label="Editar acesso">
      <h2>{editing === "new" ? "Nova conta da equipe" : `Acesso de ${form.name}`}</h2>
      <div className={styles.fields}>
        <label className={styles.field}>Nome<input className={styles.input} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className={styles.field}>Usuário de entrada<input className={styles.input} required minLength={3} disabled={editing !== "new"} autoComplete="off" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
        <label className={styles.field}>{editing === "new" ? "Senha" : "Nova senha (opcional)"}<input className={styles.input} type="password" autoComplete="new-password" required={editing === "new"} minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
        <label className={styles.field}>Perfil<select className={styles.input} value={form.role} onChange={e => { const role = e.target.value as AccessRole; setForm({ ...form, role, permissions: [...DEFAULT_PERMISSIONS[role]] }); }}>{STAFF_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
        <label className={styles.field}>Cargo específico (opcional)<input className={styles.input} maxLength={100} placeholder="Ex.: Chapeiro, auxiliar de cozinha, líder de turno" value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /><span>Conta ativa<small>Desativar impede novos acessos, inclusive com uma sessão aberta.</small></span></label>
      </div>
      <h2>Funções permitidas</h2><p>{form.role === "admin" ? "Administradores têm acesso completo e podem editar as permissões de todos." : "O perfil sugere o acesso inicial. Marque ou desmarque as funções para esta pessoa."}</p>
      <div className={styles.permissions}>{PERMISSIONS.map(p => <label key={p.id} className={styles.check}><input type="checkbox" disabled={form.role === "admin"} checked={effectivePermissions(form).includes(p.id)} onChange={e => setForm({ ...form, permissions: e.target.checked ? [...form.permissions, p.id] : form.permissions.filter(id => id !== p.id) })} /><span>{p.label}<small>{p.description}</small></span></label>)}</div>
      <div className={styles.preview}><strong>O que esta pessoa verá ao entrar</strong><p>{ROLE_DESCRIPTIONS[form.role]}</p><p>Tela inicial: <strong>{PERMISSIONS.find(p => p.href === landingPath(form))?.label ?? "Meu trabalho"}</strong></p><div className={styles.tags}>{effectivePermissions(form).map(id => <span className={styles.tag} key={id}>{PERMISSIONS.find(p => p.id === id)?.label}</span>)}</div>{!form.permissions.length && form.role !== "admin" && <p>Nenhuma função liberada. O usuário verá uma área de trabalho vazia.</p>}{form.role === "admin" && <p>Também poderá gerenciar equipe, acessos e configurações administrativas.</p>}</div>
      <div className={styles.actions}><button disabled={saving} className={styles.primary}>{saving ? "Salvando…" : "Salvar acessos"}</button><button type="button" disabled={saving} className={styles.secondary} onClick={() => setEditing(null)}>Cancelar</button></div>
    </form>}
    <div className={styles.toolbar}><input aria-label="Buscar pessoa ou cargo" className={styles.input} placeholder="Buscar pessoa ou cargo" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filtrar por função permitida" className={styles.input} value={permission} onChange={e => setPermission(e.target.value)}><option value="">Todas as funções</option>{PERMISSIONS.map(p => <option key={p.id} value={p.id}>Quem pode: {p.label.toLowerCase()}</option>)}</select></div>
    <div className={styles.panel}>{loading ? <p className={styles.empty}>Carregando acessos…</p> : <><table className={styles.table}><thead><tr><th>Pessoa</th><th>Perfil e cargo</th><th>Funções</th><th>Status</th><th>Acesso</th></tr></thead><tbody>{visible.map(u => <tr key={u.id}><td><strong>{u.name}</strong><small>{u.username}</small></td><td>{ROLE_LABELS[u.role]}<small>{u.jobTitle || "Sem cargo específico"}</small></td><td>{u.role === "admin" ? "Acesso completo" : `${effectivePermissions(u).length} ${effectivePermissions(u).length === 1 ? "função" : "funções"}`}<small>{effectivePermissions(u).map(id => PERMISSIONS.find(p => p.id === id)?.label).join(", ") || "Nenhuma função"}</small></td><td>{u.active ? "Ativo" : "Inativo"}</td><td><button className={styles.secondary} onClick={() => edit(u)} aria-label={`Editar acesso de ${u.name}`}>Editar</button></td></tr>)}</tbody></table>{!visible.length && <p className={styles.empty}>{users.length ? "Nenhuma pessoa encontrada para este filtro." : "Crie a primeira conta da equipe para distribuir as funções."}</p>}</>}</div>
  </div>;
}
