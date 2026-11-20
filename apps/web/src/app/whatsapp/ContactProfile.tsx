"use client";

import { useEffect, useState } from "react";
import { CONTACT_ROLE_LABELS, CONTACT_ROLES, type BarbaContactProfile } from "@/lib/barba-contact";
import styles from "./whatsapp.module.css";

const brandNames: Record<string, string> = { barbacue: "Barbacue", barbadog: "Barbadog", chelas: "Chelas" };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export function ContactProfile({ jid }: { jid: string }) {
  const [profile, setProfile] = useState<BarbaContactProfile | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const endpoint = "/api/admin/whatsapp/contact-profile";

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${endpoint}?account=cogia&jid=${encodeURIComponent(jid)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível consultar o perfil do contato.");
        const data = await response.json();
        if (!controller.signal.aborted) { setProfile(data); setError(""); }
      } catch (failure) {
        if (!controller.signal.aborted) setError((failure as Error).message);
      }
    };
    void load();
    const refresh = setInterval(load, 30_000);
    return () => { controller.abort(); clearInterval(refresh); };
  }, [jid, revision]);

  async function changeRole(role: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: "cogia", jid, role: role || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o perfil.");
      setProfile(data);
      setRevision(current => current + 1);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const customer = profile?.customer;
  return <section className={styles.contactProfile} aria-label="Perfil do contato">
    <div><strong>{profile?.role ? CONTACT_ROLE_LABELS[profile.role] : profile ? "Contato sem perfil" : "Perfil do contato"}</strong>
      {profile?.name && <span>{profile.name}</span>}
      {customer && <span>{customer.orderCount === 1 ? "Primeiro pedido" : `Cliente recorrente · ${customer.orderCount} pedidos`} · Último em {dateFormat.format(new Date(customer.lastOrderAt))} · {customer.brands.map(brand => brandNames[brand] ?? brand).join(", ")}</span>}
    </div>
    {profile?.canEdit && <label>Classificação
      <select value={profile.source === "manual" ? profile.role ?? "" : ""} disabled={saving} onChange={event => void changeRole(event.target.value)}>
        <option value="">Automática</option>
        {CONTACT_ROLES.map(role => <option key={role} value={role} disabled={role === "customer" && !customer}>{CONTACT_ROLE_LABELS[role]}</option>)}
      </select>
    </label>}
    {error && <span role="alert">{error}</span>}
  </section>;
}
