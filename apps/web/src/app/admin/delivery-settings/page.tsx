"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formToSettings, settingsToForm } from "@/lib/delivery-settings-form";
import type { DeliverySettings, DeliverySettingsForm } from "@/lib/delivery-settings-form";
import styles from "./page.module.css";

interface SettingsResponse {
  settings: DeliverySettings;
  providers: { osm: { configured: boolean } };
}

export default function DeliverySettingsPage() {
  const [form, setForm] = useState<DeliverySettingsForm | null>(null);
  const [providers, setProviders] = useState<SettingsResponse["providers"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [located, setLocated] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return fetch("/api/admin/delivery-settings", { cache: "no-store", signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível carregar as configurações de entrega.");
        return data as SettingsResponse;
      })
      .then(data => {
        if (signal?.aborted) return;
        setForm(settingsToForm(data.settings));
        setProviders(data.providers);
      })
      .catch(cause => {
        if (!signal?.aborted) setError(cause instanceof TypeError ? "Sem conexão. Tente novamente." : cause instanceof Error ? cause.message : "Não foi possível carregar as configurações.");
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  function patch(values: Partial<DeliverySettingsForm>) {
    setForm(current => current ? { ...current, ...values } : null);
    setSaved(false); setError(null);
  }
  async function geocode() {
    if (!form?.originAddress.trim()) return;
    setLocating(true); setError(null); setLocated(false); setSaved(false);
    try {
      const response = await fetch("/api/admin/delivery-settings/geocode", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ address: form.originAddress.trim(), provider: form.provider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível localizar a loja. Confira o endereço.");
      if (typeof data.address !== "string" || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) throw new Error("A localização recebida é inválida. Tente novamente.");
      patch({ originAddress: data.address, latitude: String(data.latitude), longitude: String(data.longitude) });
      setLocated(true);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "A consulta demorou demais. Tente localizar a loja novamente."); }
    finally { setLocating(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setError(null); setSaved(false);
    try {
      const payload = formToSettings(form);
      if (payload.enabled && !providers?.[payload.provider].configured) throw new Error("O serviço de mapas selecionado precisa estar configurado antes de ativar o frete.");
      setSaving(true);
      const response = await fetch("/api/admin/delivery-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000), body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar o frete.");
      // Use only settings acknowledged by the server, including its bounds.
      const settings: DeliverySettings = data.settings ?? data;
      setForm(settingsToForm(settings));
      if (data.providers) setProviders(data.providers);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Não foi possível confirmar o salvamento. Recarregue e confira os valores."); }
    finally { setSaving(false); }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/settings" className={styles.back}>Configurações da loja</Link>
        <h1>Entrega e frete</h1>
        <p>Defina de onde os pedidos saem e quanto cobrar pelo trajeto até o cliente.</p>
      </header>
      {loading ? <p className={styles.feedback} role="status">Carregando as condições de entrega…</p> : !form ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" className={styles.secondary} onClick={() => { setLoading(true); setError(null); void load(); }}>Tentar novamente</button></div> : (
        <form onSubmit={save} className={styles.form}>
          <fieldset disabled={saving || locating}>
            <div className={styles.activation}>
              <label className={styles.check}><input type="checkbox" checked={form.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>Calcular frete por distância</strong><small>{form.enabled ? "Cada entrega exige um valor de frete confirmado antes do pagamento." : "Desativado. O checkout mantém as condições atuais da loja."}</small></span></label>
            </div>
            <section className={styles.section} aria-labelledby="delivery-origin-title">
              <div className={styles.sectionIntro}><h2 id="delivery-origin-title">Saída da loja</h2><p>O trajeto começa neste endereço. Ele deve corresponder ao local de retirada dos entregadores.</p></div>
              <div className={styles.fields}>
                <label className={styles.field} htmlFor="origin-address">Endereço de saída<input id="origin-address" value={form.originAddress} maxLength={500} placeholder="Rua, número, bairro, cidade e CEP" onChange={event => { patch({ originAddress: event.target.value, latitude: "", longitude: "" }); setLocated(false); }} /></label>
                <div className={styles.inline}><button type="button" className={styles.secondary} onClick={geocode} disabled={!form.originAddress.trim() || !providers?.[form.provider].configured}>{locating ? "Localizando loja…" : "Localizar loja pelo endereço"}</button>{located && <p role="status" className={styles.success}>Localização encontrada. Confira e salve.</p>}</div>
                <div className={styles.twoColumns}>
                  <label className={styles.field} htmlFor="origin-latitude">Latitude<input id="origin-latitude" inputMode="decimal" value={form.latitude} placeholder="Ex.: -26,48" onChange={event => patch({ latitude: event.target.value })} /></label>
                  <label className={styles.field} htmlFor="origin-longitude">Longitude<input id="origin-longitude" inputMode="decimal" value={form.longitude} placeholder="Ex.: -49,08" onChange={event => patch({ longitude: event.target.value })} /></label>
                </div>
                <p className={styles.help}>Você também pode preencher coordenadas já conferidas. Alterar o endereço apaga as coordenadas anteriores.</p>
              </div>
            </section>
            <section className={styles.section} aria-labelledby="delivery-rate-title">
              <div className={styles.sectionIntro}><h2 id="delivery-rate-title">Valores e alcance</h2><p>O desconto dos cupons se aplica aos itens. O frete é somado depois.</p></div>
              <div className={styles.fields}>
                <div className={styles.twoColumns}>
                  <label className={styles.field} htmlFor="base-fee">Taxa de saída (R$)<input id="base-fee" inputMode="decimal" required value={form.baseFee} onChange={event => patch({ baseFee: event.target.value })} /></label>
                  <label className={styles.field} htmlFor="fee-per-km">Valor por quilômetro (R$)<input id="fee-per-km" inputMode="decimal" required value={form.feePerKm} onChange={event => patch({ feePerKm: event.target.value })} /></label>
                  <label className={styles.field} htmlFor="minimum-fee">Frete mínimo (R$)<input id="minimum-fee" inputMode="decimal" required value={form.minFee} onChange={event => patch({ minFee: event.target.value })} /></label>
                  <label className={styles.field} htmlFor="max-distance">Distância máxima (km)<input id="max-distance" inputMode="decimal" required value={form.maxDistance} onChange={event => patch({ maxDistance: event.target.value })} /></label>
                </div>
                <p className={styles.formula}>Frete = taxa de saída + quilômetros do trajeto × valor por km. Se o resultado for menor que o frete mínimo, vale o mínimo.</p>
                <p className={styles.help}>Endereços além da distância máxima não podem finalizar uma entrega. Defina os valores da operação antes de ativar.</p>
              </div>
            </section>
            <section className={styles.section} aria-labelledby="delivery-provider-title">
              <div className={styles.sectionIntro}><h2 id="delivery-provider-title">Serviço de mapas</h2><p>Usado para localizar o endereço e calcular a distância pelas ruas.</p></div>
              <div className={styles.fields}>
                <div className={styles.provider}><span><strong>OpenStreetMap</strong><small>{providers?.osm.configured ? "Configurado" : "Configuração pendente"}</small></span></div>
                {!providers?.[form.provider].configured && <p className={styles.warning}>Este serviço ainda não está configurado no servidor. Conclua a integração antes de ativar o frete.</p>}
                <p className={styles.help}>As credenciais são configuradas no ambiente privado do servidor. Esta tela mostra apenas se o serviço está pronto.</p>
              </div>
            </section>
          </fieldset>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {saved && <p className={styles.success} role="status">Configurações de entrega salvas.</p>}
          <div className={styles.actions}><p>As alterações valem para novas cotações. Desativar o cálculo invalida as cotações em aberto.</p><button type="submit" className={styles.save} disabled={saving || locating}>{saving ? "Salvando…" : "Salvar condições de entrega"}</button></div>
        </form>
      )}
    </div>
  );
}
