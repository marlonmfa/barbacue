"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminLogout } from "@/components/AdminLogout";
import { AdminIcon, type AdminIconName } from "./AdminIcons";
import styles from "./AdminShell.module.css";

import { canAccessPath, effectivePermissions, landingPath, ROLE_LABELS, type AccessRole, type Permission } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  adminOnly?: boolean;
};

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operação",
    items: [
      { href: "/admin", label: "Visão geral", icon: "home" },
      { href: "/admin/workspace", label: "Meu trabalho", icon: "user" },
      { href: "/admin/kitchen", label: "Cozinha", icon: "kitchen" },
      { href: "/admin/orders", label: "Caixa e pedidos", icon: "orders" },
      { href: "/admin/waiter", label: "Salão", icon: "tables" },
      { href: "/admin/delivery", label: "Minhas entregas", icon: "delivery" },
      { href: "/whatsapp", label: "Atendimento", icon: "whatsapp" },
      { href: "/teste_pedido", label: "Testar pedido", icon: "beaker" },
    ],
  },
  {
    label: "Cardápios",
    items: [
      { href: "/admin/catalogs", label: "Produtos", icon: "products" },
      { href: "/admin/categories", label: "Categorias", icon: "categories" },
      { href: "/admin/coupons", label: "Cupons", icon: "coupons" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/admin/tables", label: "Mesas", icon: "tables" },
      { href: "/admin/customers", label: "Clientes", icon: "customers" },
      { href: "/admin/team", label: "Funcionários", icon: "team", adminOnly: true },
      { href: "/admin/staff", label: "Usuários e acessos", icon: "user", adminOnly: true },
      { href: "/admin/settings", label: "Loja e horários", icon: "calendar" },
      { href: "/admin/delivery-settings", label: "Entrega e frete", icon: "route" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/beta", label: "Beta do app", icon: "beaker" },
      { href: "/admin/system", label: "Integrações", icon: "system", adminOnly: true },
      { href: "/admin/downloads", label: "Programa Windows", icon: "printer", adminOnly: true },
      { href: "/admin/impersonate", label: "Acessos", icon: "user", adminOnly: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  children,
  role,
  permissions,
  name,
  jobTitle,
}: {
  children: React.ReactNode;
  role: AccessRole;
  permissions?: Permission[] | null;
  name?: string;
  jobTitle?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const access = { role, permissions };
  const primaryPath = landingPath(access);
  const singleFunction = effectivePermissions(access).length === 1;
  const operational = role !== "admin" && role !== "manager";

  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <div className={`${styles.shell} ${operational ? styles.operationalShell : ""}`}>
      {open && <button className={styles.backdrop} aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
        <div className={styles.identity}>
          <span className={styles.brandMark} aria-hidden><i /><i /><i /></span>
          <span className={styles.identityCopy}>
            <strong>Grupo Barbacue</strong>
            <span>{operational ? ROLE_LABELS[role] : "Central de operações"}</span>
          </span>
          <button className={styles.mobileClose} onClick={() => setOpen(false)} aria-label="Fechar menu">
            <AdminIcon name="close" size={19} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Navegação da equipe">
          {groups.map((group) => {
            const visible = group.items.filter((item) => canAccessPath(access, item.href) && !(singleFunction && item.href === "/admin/workspace"))
              .sort((a, b) => Number(b.href === primaryPath) - Number(a.href === primaryPath));
            if (visible.length === 0) return null;
            return (
              <div className={styles.navGroup} key={group.label}>
                <span className={styles.navLabel}>{operational && group.label === "Operação" ? "Seu trabalho" : group.label}</span>
                <div className={styles.navItems}>
                  {visible.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={`${styles.navItem} ${isActive(pathname, item.href) ? styles.navItemActive : ""}`}
                    >
                      <AdminIcon name={item.icon} size={18} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarFoot}>
          <div className={styles.logoutSlot}><AdminLogout /></div>
          <Link href="/?loja=1" onClick={() => setOpen(false)} className={`${styles.navItem} ${styles.storeLink}`}>
            <AdminIcon name="external" size={17} />
            <span>Ver loja</span>
          </Link>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.mobileMenu} onClick={() => setOpen(true)} aria-label="Abrir menu">
              <AdminIcon name="menu" size={20} />
            </button>
            <div className={styles.currentPerson}><strong>{name || ROLE_LABELS[role]}</strong><span>{jobTitle || ROLE_LABELS[role]}</span></div>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.date}>{today}</span>
            <span className={styles.profile} aria-label={`Perfil: ${ROLE_LABELS[role]}`}>{(name || ROLE_LABELS[role]).slice(0, 2).toUpperCase()}</span>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
