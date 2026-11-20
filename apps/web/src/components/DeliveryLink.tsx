"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./delivery-link.module.css";

type Delivery = {
  id: string; brand: string; channel: string | null; customerName: string; customerPhone: string; address: string | null; notes: string | null;
  items: { name: string; qty: number; notes: string | null }[]; totalCents: number;
  paymentMethod: string | null; paymentStatus: string | null; changeForCents: number | null;
  status: string; deliveryStatus: string | null; requiresConfirmationCode?: boolean; deliveredAt: string | null;
  navigation: { google: string; apple: string; waze: string } | null; qr?: string; url?: string;
  messages: { id: string; sender: "store" | "driver"; body: string; createdAt: string }[];
};
const dateTime = (date: string) => new Date(date).toLocaleString("pt-BR");
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const BRANDS: Record<string, string> = { barbacue: "Barbacue", barbadog: "Barbadog", chelas: "Chelas" };
const METHODS: Record<string, string> = { cash: "dinheiro", pix: "Pix", card_on_delivery: "cartão na entrega" };
function paymentLine(data: Delivery) {
  if (data.paymentStatus === "paid") return "Pedido já pago. Não cobrar.";
  const method = data.paymentMethod ? METHODS[data.paymentMethod] ?? data.paymentMethod : "confirmar com a loja";
  const change = data.paymentMethod === "cash" && data.changeForCents ? ` · troco para ${money(data.changeForCents)}` : "";
  return `Cobrar ${money(data.totalCents)} (${method})${change}`;
}
function shareText(data: Delivery) {
  return [`Entrega ${BRANDS[data.brand] ?? data.brand} · pedido #${data.id.slice(0, 8).toUpperCase()}`, `Para: ${data.customerName}`, data.address, data.url].filter(Boolean).join("\n");
}

export function DeliveryLink({ orderId, token }: { orderId?: string; token?: string }) {
  const staff = !!orderId;
  const endpoint = staff ? `/api/admin/orders/${orderId}/delivery-link` : `/api/entregas/${token}`;
  const [data, setData] = useState<Delivery | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastMessageId = data?.messages[data.messages.length - 1]?.id;
  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [lastMessageId]);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Não foi possível abrir a entrega.");
      if (!signal?.aborted) { setData(value); setError(""); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente.");
    }
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      await load(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);

  async function send(action: "message" | "start" | "complete") {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "message" ? { body: text } : {}) }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Não foi possível salvar. Tente novamente.");
      if (action === "message") setText("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira a conexão e tente novamente."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!data?.url) return;
    try { await navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 3000); }
    catch { setError("Não foi possível copiar. Selecione o link abaixo e copie manualmente."); }
  }

  const complete = data?.deliveryStatus === "delivered";
  const platform = data?.channel === "ifood";
  return <section className={styles.panel} aria-label={staff ? "QR code e mensagens da entrega" : "Sua entrega"}>
    <header><h2>{staff ? "Link do motoboy" : "Entrega"}</h2>{data && <p>Pedido #{data.id.slice(0, 8).toUpperCase()} · {BRANDS[data.brand] ?? data.brand}</p>}</header>
    {error && <div className="no-print"><p role="alert" className={styles.error}>{error}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
    {!data && !error && <p role="status">Carregando entrega…</p>}
    {data && <>
      {staff && data.qr && <div className={styles.qr}>
        {/* A data URL keeps the private QR out of third-party image services. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.qr} alt="QR code para acessar endereço, mensagens e conclusão da entrega" width={256} height={256} />
        <p>Escaneie para abrir a entrega no celular.</p>
        <p className="no-print">Este código dá acesso a esta entrega. Compartilhe com o motoboy responsável.</p>
        {data.url && <div className={`no-print ${styles.share}`}>
          <a className={styles.whatsapp} href={`https://wa.me/?text=${encodeURIComponent(shareText(data))}`} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>
          <button type="button" onClick={() => void copyLink()}>{copied ? "Link copiado" : "Copiar link"}</button>
          <a href={data.url} target="_blank" rel="noreferrer">Abrir página da entrega</a>
          <input readOnly aria-label="Link da entrega" value={data.url} onFocus={event => event.target.select()} />
          <span role="status" aria-live="polite" className={styles.srOnly}>{copied ? "Link copiado." : ""}</span>
        </div>}
      </div>}
      {!staff && <div className={styles.destination}>
        <span className={styles.label}>Quem recebe</span>
        <strong>{data.customerName}</strong>
        {data.customerPhone.replace(/\D/g, "").length >= 8 && <a className={styles.phone} href={`tel:${data.customerPhone.replace(/[^\d+]/g, "")}`}>Ligar: {data.customerPhone}</a>}
        <span className={styles.label}>Endereço</span>
        <p>{data.address || "Endereço não informado. Confirme com a loja."}</p>
        {data.navigation && <nav aria-label="Abrir rota"><a className={styles.route} href={data.navigation.google} target="_blank" rel="noreferrer">Google Maps</a><a className={styles.route} href={data.navigation.waze} target="_blank" rel="noreferrer">Waze</a><a href={data.navigation.apple} target="_blank" rel="noreferrer">Apple Maps</a></nav>}
        <h3>Itens do pedido</h3>
        {data.items.length === 0 ? <p>Itens não informados. Confirme com a loja.</p> : <ul className={styles.items}>{data.items.map((item, index) => <li key={index}><b>{item.qty}×</b> <span>{item.name}{item.notes && <small>{item.notes}</small>}</span></li>)}</ul>}
        <p className={styles.payment}>{paymentLine(data)}</p>
        {data.notes && <p className={styles.notes}>Observações: {data.notes}</p>}
      </div>}
      <div className="no-print">
        {platform && <p>Pedido iFood: a saída e a conclusão são registradas no iFood.</p>}
        {!platform && !staff && !complete && data.deliveryStatus !== "out_for_delivery" && <><button className={styles.primary} type="button" disabled={busy || !!error || data.status !== "ready"} onClick={() => void send("start")}>Retirei o pedido · iniciar entrega</button>{data.status !== "ready" && <p>Aguardando a loja marcar o pedido como pronto.</p>}</>}
        {!platform && !complete && data.requiresConfirmationCode
          ? <p>Confirme pelo WhatsApp com ENTREGUE #{data.id.slice(0, 8).toUpperCase()} seguido do código recebido no destino.</p>
          : !platform && <label className={styles.completed}><input type="checkbox" checked={complete} disabled={staff || complete || busy || !!error || data.deliveryStatus !== "out_for_delivery"} onChange={event => { if (event.target.checked) void send("complete"); }} /> Entrega concluída</label>}
        {data.deliveredAt && <p role="status">Concluída em {dateTime(data.deliveredAt)}</p>}
        <h3>{staff ? "Mensagens com o motoboy" : "Mensagens com a loja"}</h3>
        <div ref={messagesRef} className={styles.messages} role="log" aria-live="polite" aria-label="Mensagens da entrega">
          {data.messages.length === 0 && <p>Nenhuma mensagem ainda.</p>}
          {data.messages.map(message => <article className={message.sender === "store" ? styles.store : styles.driver} key={message.id}>
            <strong>{message.sender === "store" ? "Loja" : "Motoboy"}</strong><p>{message.body}</p><time dateTime={message.createdAt}>{dateTime(message.createdAt)}</time>
          </article>)}
        </div>
        {!complete && <form onSubmit={event => { event.preventDefault(); void send("message"); }}>
          <label htmlFor={`delivery-message-${orderId || "driver"}`}>Escrever mensagem</label>
          <textarea id={`delivery-message-${orderId || "driver"}`} value={text} onChange={event => setText(event.target.value)} maxLength={1000} required rows={3} />
          <button className={styles.primary} disabled={busy || !!error || !text.trim()} type="submit">{busy ? "Salvando…" : "Enviar mensagem"}</button>
        </form>}
      </div>
    </>}
  </section>;
}
