"use client";

import { useEffect, useState } from "react";
import { IfoodTabs, Notice, sendJson, useIfoodJson } from "@/components/admin/ifood/IfoodTabs";
import { logisticsLabels, logisticsVehicles, type LogisticsState } from "@/lib/ifood-logistics";

type DeliveryOrder = { id: string; brand: string; storeId: string | null; displayId: string | null; orderType: string; status: string };
type Orders = { stores: { id: string; name: string }[]; orders: DeliveryOrder[] };
const inputClass = "min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm";

export default function IfoodLogistics() {
  const { data: list, error: listError } = useIfoodJson<Orders>("/api/admin/ifood");
  const [store, setStore] = useState("");
  const [orderId, setOrder] = useState("");
  const options = list?.orders.filter(order => order.orderType === "delivery" && (!store || order.storeId === store)) ?? [];
  const current = options.find(order => order.id === orderId)?.id ?? options[0]?.id;
  const path = current ? `/api/admin/ifood/orders/${current}/logistics` : null;
  const { data, error, loading, reload } = useIfoodJson<LogisticsState>(path);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("MOTORCYCLE");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<LogisticsState["next"]>(null);

  useEffect(() => {
    if (!sent || !path) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => void reload(controller.signal), 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [sent, path, reload]);

  function clearSelection() {
    setSent(null); setCode(""); setName(""); setPhone(""); setNotice(""); setFailure("");
  }

  async function advance() {
    if (!path || !data?.next || busy || sent === data.next) return;
    const action = data.next;
    const body = action === "assignDriver" ? { action, workerName: name, workerPhone: phone.replace(/\D/g, ""), workerVehicleType: vehicle }
      : action === "verifyDeliveryCode" ? { action, code } : { action };
    setBusy(true);
    setFailure("");
    setNotice("");
    const result = await sendJson(path, "POST", body);
    setBusy(false);
    if (result.ok) {
      setSent(action); setCode("");
      setNotice("Etapa enviada. Aguardando confirmação do iFood.");
      void reload();
    } else {
      setFailure(result.error ?? "O iFood recusou a ação.");
    }
  }

  return <div>
    <IfoodTabs />
    <h1 className="mb-4 text-2xl font-bold">Logistics iFood</h1>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Loja
        <select className={inputClass} value={store} disabled={busy} onChange={e => { setStore(e.target.value); setOrder(""); clearSelection(); }}>
          <option value="">Todas as lojas</option>
          {list?.stores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Pedido
        <select className={inputClass} value={current ?? ""} disabled={busy || !options.length} onChange={e => { setOrder(e.target.value); clearSelection(); }}>
          {!options.length && <option value="">Sem pedidos de entrega</option>}
          {options.map(order => <option key={order.id} value={order.id}>{order.displayId ? `#${order.displayId}` : order.id.slice(0, 8)} · {order.brand}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => void reload()} disabled={!current || loading || busy} className={inputClass}>Atualizar entrega</button>
    </div>
    <Notice error={listError || error || failure} notice={sent === data?.next ? notice : undefined} />
    {loading && <p role="status">Consultando a entrega no iFood…</p>}
    {data && <>
      <p className="mb-4 text-sm">Responsável pela entrega: {data.deliveredBy === "MERCHANT" ? "Loja" : data.deliveredBy === "IFOOD" ? "iFood" : "Indisponível"}</p>
      {data.next && <div className="mb-6 flex flex-wrap items-end gap-3">
        {data.next === "assignDriver" && <>
          <label className="grid gap-1 text-sm">Nome do entregador<input className={inputClass} value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Telefone com DDD<input className={inputClass} value={phone} maxLength={20} inputMode="tel" onChange={e => setPhone(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Veículo<select className={inputClass} value={vehicle} onChange={e => setVehicle(e.target.value)}>{Object.entries(logisticsVehicles).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        </>}
        {data.next === "verifyDeliveryCode" && <label className="grid gap-1 text-sm">Código de entrega<input className={inputClass} type="password" inputMode="numeric" maxLength={4} value={code} onChange={e => setCode(e.target.value)} /></label>}
        <button type="button" className={inputClass} disabled={busy || sent === data.next} onClick={() => void advance()}>{logisticsLabels[data.next]}</button>
      </div>}
      <h2 className="mb-2 font-semibold">Eventos recebidos</h2>
      {data.events.length ? <ul className="grid gap-1 text-sm">{data.events.map((event,i) => <li key={i}><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("pt-BR")}</time> · {event.fullCode ?? event.code}</li>)}</ul> : <p className="text-sm">Nenhum evento registrado para este pedido.</p>}
    </>}
  </div>;
}
