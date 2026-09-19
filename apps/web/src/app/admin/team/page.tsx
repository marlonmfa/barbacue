"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcons";
import styles from "./team.module.css";

type Brand = "barbacue" | "barbadog" | "chelas";
type Tab = "people" | "calendar";

interface Schedule { days: number[]; start: string; end: string }
interface Employee {
  id: number;
  name: string;
  jobTitle: string;
  brand: Brand;
  phone: string | null;
  email: string | null;
  employmentType: "clt" | "pj" | "freelancer" | "estagio";
  salaryCents: number;
  weeklyHours: number;
  workSchedule: Schedule | null;
  hireDate: string | null;
  active: boolean;
}

const BRANDS: Record<Brand, { name: string; color: string }> = {
  barbacue: { name: "Barbacue", color: "#e4413f" },
  barbadog: { name: "Barbadog", color: "#e4ad37" },
  chelas: { name: "Chelas", color: "#3b9e75" },
};
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TYPE_LABEL = { clt: "CLT", pj: "PJ", freelancer: "Freelancer", estagio: "Estágio" };

const EMPTY = {
  name: "", jobTitle: "", brand: "barbacue" as Brand, phone: "", email: "",
  employmentType: "clt" as Employee["employmentType"], salaryReais: "", weeklyHours: 44,
  workSchedule: { days: [2, 3, 4, 5, 6], start: "16:00", end: "23:30" } as Schedule,
  hireDate: "", active: true,
};

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function salaryToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  return Math.round((Number(normalized) || 0) * 100);
}

export default function TeamManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<Tab>("people");
  const [filter, setFilter] = useState<Brand | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/employees", { cache: "no-store" });
    if (response.status === 403) { setDenied(true); setLoading(false); return; }
    if (!response.ok) { setError("Não foi possível carregar os funcionários."); setLoading(false); return; }
    setEmployees(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/employees", { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 403) { setDenied(true); setLoading(false); return; }
      if (!response.ok) { setError("Não foi possível carregar os funcionários."); setLoading(false); return; }
      setEmployees(await response.json());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => filter === "all" ? employees : employees.filter((employee) => employee.brand === filter), [employees, filter]);
  const active = employees.filter((employee) => employee.active);
  const monthlyPayroll = active.filter((employee) => employee.employmentType === "clt").reduce((sum, employee) => sum + employee.salaryCents, 0);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setShowForm(true);
  }

  function openEdit(employee: Employee) {
    setEditing(employee.id);
    setForm({
      name: employee.name,
      jobTitle: employee.jobTitle,
      brand: employee.brand,
      phone: employee.phone ?? "",
      email: employee.email ?? "",
      employmentType: employee.employmentType,
      salaryReais: (employee.salaryCents / 100).toFixed(2).replace(".", ","),
      weeklyHours: employee.weeklyHours,
      workSchedule: employee.workSchedule ?? { days: [], start: "16:00", end: "23:30" },
      hireDate: employee.hireDate ?? "",
      active: employee.active,
    });
    setError("");
    setShowForm(true);
  }

  function toggleDay(day: number) {
    const current = form.workSchedule.days;
    const days = current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort();
    setForm({ ...form, workSchedule: { ...form.workSchedule, days } });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch(editing ? `/api/admin/employees/${editing}` : "/api/admin/employees", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        jobTitle: form.jobTitle,
        brand: form.brand,
        phone: form.phone || null,
        email: form.email || null,
        employmentType: form.employmentType,
        salaryCents: salaryToCents(form.salaryReais),
        weeklyHours: Number(form.weeklyHours),
        workSchedule: form.workSchedule,
        hireDate: form.hireDate || null,
        active: form.active,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) { setError("Confira os dados e tente novamente."); return; }
    setShowForm(false);
    await load();
  }

  async function remove(employee: Employee) {
    if (!confirm(`Remover ${employee.name} do quadro de funcionários?`)) return;
    const response = await fetch(`/api/admin/employees/${employee.id}`, { method: "DELETE" });
    if (response.ok) setEmployees((current) => current.filter((item) => item.id !== employee.id));
  }

  if (denied) return <div className={styles.page}><h1 className="font-display text-4xl uppercase">Equipe</h1><p className="mt-3 text-sm text-[#889294]">Salários e jornadas são restritos a administradores.</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div><span className={styles.eyebrow}>Pessoas e operação</span><h1>Equipe & jornadas</h1><p>Funcionários são registros de RH. Usuários com acesso ao painel continuam separados em “Equipe e acessos”.</p></div>
        <button className={styles.primaryButton} onClick={openCreate}><AdminIcon name="plus" size={17} />Novo funcionário</button>
      </header>

      <section className={styles.stats}>
        <div className={styles.stat}><span>Funcionários ativos</span><strong>{active.length}</strong></div>
        <div className={styles.stat}><span>Folha CLT mensal</span><strong>{brl(monthlyPayroll)}</strong></div>
        <div className={styles.stat}><span>Restaurantes</span><strong>3</strong></div>
        <div className={styles.stat}><span>Carga média</span><strong>{active.length ? Math.round(active.reduce((sum, employee) => sum + employee.weeklyHours, 0) / active.length) : 0}h</strong></div>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "people" ? styles.tabActive : ""}`} onClick={() => setTab("people")}>Funcionários</button>
          <button className={`${styles.tab} ${tab === "calendar" ? styles.tabActive : ""}`} onClick={() => setTab("calendar")}>Calendário semanal</button>
        </div>
        <div className={styles.filters} aria-label="Filtrar restaurante">
          {(["all", "barbacue", "barbadog", "chelas"] as const).map((brand) => <button key={brand} className={`${styles.filter} ${filter === brand ? styles.filterActive : ""}`} onClick={() => setFilter(brand)}>{brand === "all" ? "Todos" : BRANDS[brand].name}</button>)}
        </div>
      </div>

      {loading ? <div className={styles.panel}><div className={styles.empty}>Carregando equipe…</div></div> : tab === "people" ? (
        <section className={styles.panel}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Funcionário</th><th>Restaurante</th><th>Vínculo</th><th>Salário</th><th>Jornada</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>{visible.map((employee) => {
                const brand = BRANDS[employee.brand];
                const schedule = employee.workSchedule;
                return <tr key={employee.id}>
                  <td><div className={styles.person}><span className={styles.avatar}>{initials(employee.name)}</span><span><strong>{employee.name}</strong><span>{employee.jobTitle}</span></span></div></td>
                  <td><span className={styles.brand} style={{ "--brand-color": brand.color } as React.CSSProperties}><i />{brand.name}</span></td>
                  <td>{TYPE_LABEL[employee.employmentType]}</td>
                  <td><span className={styles.salary}>{brl(employee.salaryCents)}</span></td>
                  <td><span className={styles.shift}>{employee.weeklyHours}h · {schedule ? `${schedule.start}–${schedule.end}` : "a definir"}</span></td>
                  <td><span className={`${styles.status} ${employee.active ? "" : styles.inactive}`}><i />{employee.active ? "Ativo" : "Inativo"}</span></td>
                  <td><div className={styles.actions}><button className={styles.action} onClick={() => openEdit(employee)}>Editar</button><button className={`${styles.action} ${styles.delete}`} onClick={() => remove(employee)}>Remover</button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {visible.length === 0 && <div className={styles.empty}>{filter === "all" ? "Nenhum funcionário cadastrado." : `Nenhum funcionário no ${BRANDS[filter].name}.`}</div>}
        </section>
      ) : (
        <section className={styles.panel}>
          <div className={styles.calendarWrap}><div className={styles.calendar}>
            {DAYS.map((dayName, day) => {
              const shifts = visible.filter((employee) => employee.active && employee.workSchedule?.days.includes(day)).sort((a, b) => (a.workSchedule?.start ?? "").localeCompare(b.workSchedule?.start ?? ""));
              return <div className={styles.day} key={dayName}><div className={styles.dayHead}><strong>{dayName}</strong><span>{shifts.length} no turno</span></div><div className={styles.shifts}>
                {shifts.map((employee) => <button key={employee.id} className={styles.shiftCard} style={{ "--brand-color": BRANDS[employee.brand].color } as React.CSSProperties} onClick={() => openEdit(employee)}><strong>{employee.name}</strong><span>{employee.workSchedule?.start}–{employee.workSchedule?.end} · {BRANDS[employee.brand].name}</span></button>)}
                {shifts.length === 0 && <div className={styles.dayEmpty}>Sem escala</div>}
              </div></div>;
            })}
          </div></div>
        </section>
      )}

      {error && !showForm && <p className={styles.error}>{error}</p>}

      {showForm && <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="employee-title">
          <header className={styles.modalHead}><h2 id="employee-title">{editing ? "Editar funcionário" : "Novo funcionário"}</h2><button className={styles.close} onClick={() => setShowForm(false)} aria-label="Fechar"><AdminIcon name="close" size={17} /></button></header>
          <form className={styles.form} onSubmit={save}>
            <div className={styles.formGrid}>
              <Field label="Nome completo *"><input required className={styles.input} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Função *"><input required className={styles.input} placeholder="Ex.: Chapeiro" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></Field>
              <Field label="Restaurante"><select className={styles.input} value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value as Brand })}>{Object.entries(BRANDS).map(([id, brand]) => <option key={id} value={id}>{brand.name}</option>)}</select></Field>
              <Field label="Vínculo"><select className={styles.input} value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value as Employee["employmentType"] })}>{Object.entries(TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
              <Field label="Salário mensal / valor-base"><input required inputMode="decimal" className={styles.input} placeholder="2.500,00" value={form.salaryReais} onChange={(event) => setForm({ ...form, salaryReais: event.target.value })} /></Field>
              <Field label="Admissão"><input type="date" className={styles.input} value={form.hireDate} onChange={(event) => setForm({ ...form, hireDate: event.target.value })} /></Field>
              <Field label="Telefone"><input className={styles.input} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
              <Field label="E-mail"><input type="email" className={styles.input} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>

              <div className={styles.scheduleBox}>
                <span className={styles.scheduleLabel}>Dias de trabalho</span>
                <div className={styles.dayPicker}>{DAYS.map((day, index) => <button type="button" key={day} className={`${styles.dayToggle} ${form.workSchedule.days.includes(index) ? styles.daySelected : ""}`} onClick={() => toggleDay(index)}>{day}</button>)}</div>
                <div className={styles.timeGrid}>
                  <Field label="Entrada"><input type="time" className={styles.input} value={form.workSchedule.start} onChange={(event) => setForm({ ...form, workSchedule: { ...form.workSchedule, start: event.target.value } })} /></Field>
                  <Field label="Saída"><input type="time" className={styles.input} value={form.workSchedule.end} onChange={(event) => setForm({ ...form, workSchedule: { ...form.workSchedule, end: event.target.value } })} /></Field>
                  <Field label="Horas semanais"><input type="number" min="0" max="80" className={styles.input} value={form.weeklyHours} onChange={(event) => setForm({ ...form, weeklyHours: Number(event.target.value) })} /></Field>
                </div>
              </div>

              <label className={styles.check}><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Funcionário ativo na operação</label>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.modalActions}><button type="button" className={styles.cancel} onClick={() => setShowForm(false)}>Cancelar</button><button className={styles.save} disabled={saving}>{saving ? "Salvando…" : "Salvar funcionário"}</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.field}><label>{label}</label>{children}</div>;
}
