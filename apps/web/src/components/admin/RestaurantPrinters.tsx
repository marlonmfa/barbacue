"use client";

import { useEffect, useState } from "react";
import { BRANDS, type Brand } from "@/lib/brands";
import styles from "./Access.module.css";

type Device = { id: string; name: string; online: boolean; printers: { name: string; displayName: string }[] };
type Route = { brand: Brand; deviceId: string | null; printerName: string | null; paper: number };
type Overview = { devices: Device[]; routes: Route[] };
type Draft = { selection: string; paper: number };
const selectionKey = (deviceId: string, printerName: string) => JSON.stringify([deviceId, printerName]);
const routeDraft = (route?: Route): Draft => ({
  selection: !route ? "default" : route.deviceId && route.printerName ? selectionKey(route.deviceId, route.printerName) : "paused",
  paper: route?.paper ?? 80,
});

export function RestaurantPrinters() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Brand, Draft>>>({});
  const [busy, setBusy] = useState<Brand | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(signal?: AbortSignal) {
    const res = await fetch("/api/admin/kitchen/printers", { cache: "no-store", signal });
    if (!res.ok) throw new Error("Não foi possível consultar as impressoras. Atualize a página para tentar novamente.");
    const data: Overview = await res.json();
    if (!signal?.aborted) setOverview(data);
  }
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => load(controller.signal).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Falha ao consultar impressoras.");
    });
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  async function save(brand: Brand, draft: Draft) {
    setBusy(brand); setError(""); setNotice("");
    try {
      const mode = draft.selection === "default" || draft.selection === "paused" ? draft.selection : "printer";
      const [deviceId, printerName] = mode === "printer" ? JSON.parse(draft.selection) as string[] : [];
      const res = await fetch("/api/admin/kitchen/printers", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, mode, deviceId, printerName, paper: draft.paper }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Não foi possível salvar o vínculo."); }
      // Keep the acknowledged selection even if a subsequent refresh fails.
      setOverview(current => current && ({ ...current, routes: [
        ...current.routes.filter(route => route.brand !== brand),
        ...(mode === "default" ? [] : [{ brand, deviceId: deviceId ?? null, printerName: printerName ?? null, paper: draft.paper }]),
      ] }));
      setDrafts(current => { const next = { ...current }; delete next[brand]; return next; });
      setNotice(`${BRANDS[brand]}: destino salvo. Pedidos que ainda aguardam na fila usarão esta seleção. Envios já iniciados mantêm o destino anterior.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o vínculo."); }
    finally { setBusy(null); }
  }

  return <section className={styles.form} aria-labelledby="restaurant-printers-title">
    <div className={styles.head}>
      <div><h2 id="restaurant-printers-title">Impressoras por restaurante</h2><p>Pareie as impressoras pelo Barbacue Pedidos no computador da cozinha e escolha onde cada restaurante imprime.</p></div>
      <button type="button" className={styles.secondary} onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Atualizar impressoras</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.preview}>{notice}</p>}
    {!overview ? <p>Consultando impressoras…</p> : <>
      {!overview.devices.some(device => device.printers.length) && <div className={styles.preview}><p>Nenhuma impressora conectada ao painel.</p><p>No aplicativo Barbacue Pedidos, salve a conexão com a loja e use “Conectar impressoras ao painel”. A impressora precisa estar instalada no computador.</p></div>}
      <div className={styles.work}>{(Object.keys(BRANDS) as Brand[]).map(brand => {
        const saved = overview.routes.find(route => route.brand === brand);
        const draft = drafts[brand] ?? routeDraft(saved);
        const options = overview.devices.flatMap(device => device.printers.map(printer => ({
          value: selectionKey(device.id, printer.name),
          label: `${printer.displayName} · ${device.name}${device.online ? "" : " (sem conexão)"}`,
        })));
        const unavailable = !["default", "paused"].includes(draft.selection) && !options.some(option => option.value === draft.selection);
        const selectedDevice = overview.devices.find(device => device.printers.some(printer => selectionKey(device.id, printer.name) === draft.selection));
        return <form key={brand} className={styles.ticket} onSubmit={event => { event.preventDefault(); void save(brand, draft); }}>
          <h3 className="mb-4 text-lg font-semibold">{BRANDS[brand]}</h3>
          <label className={styles.field} htmlFor={`printer-${brand}`}>Impressora
            <select id={`printer-${brand}`} className={styles.input} disabled={busy !== null} value={draft.selection} onChange={event => { setNotice(""); setDrafts(current => ({ ...current, [brand]: { ...draft, selection: event.target.value } })); }}>
              <option value="default">Usar impressão padrão atual</option>
              <option value="paused">Sem impressora · manter na fila</option>
              {unavailable && <option value={draft.selection}>{saved?.printerName ?? "Impressora selecionada"} (indisponível)</option>}
              {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={`${styles.field} mt-4`} htmlFor={`paper-${brand}`}>Papel
            <select id={`paper-${brand}`} className={styles.input} disabled={busy !== null || ["default", "paused"].includes(draft.selection)} value={draft.paper} onChange={event => setDrafts(current => ({ ...current, [brand]: { ...draft, paper: Number(event.target.value) } }))}>
              <option value={80}>Bobina de 80 mm</option><option value={58}>Bobina de 58 mm</option><option value={210}>Folha A4</option>
            </select>
          </label>
          <p className="mt-3 text-sm">{draft.selection === "paused" ? "Os pedidos deste restaurante ficam guardados até escolher uma impressora." : draft.selection === "default" ? "Mantém a impressora e o papel configurados no agente atual." : unavailable ? "Impressora não encontrada no computador. Os pedidos vinculados aguardam na fila." : selectedDevice?.online ? `Computador ${selectedDevice.name} conectado. Mantenha a impressão automática ativa no aplicativo.` : "Computador sem conexão recente. Os pedidos vinculados aguardam na fila."}</p>
          <button type="submit" className={`${styles.primary} mt-4`} disabled={busy !== null || unavailable}>{busy === brand ? "Salvando…" : `Salvar ${BRANDS[brand]}`}</button>
        </form>;
      })}</div>
      <p className="mt-5 text-sm">A mesma impressora pode atender vários restaurantes. Um vínculo usa somente o computador escolhido; se ele estiver offline, os pedidos aguardam na fila.</p>
    </>}
  </section>;
}
