"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WHATSAPP_PAIRING, type WhatsAppConnection } from "@/lib/whatsapp-pairing";
import styles from "./whatsapp.module.css";

type Brand = "barbacue" | "chelas" | "barbadog";
type Filter = Brand | "all";
type Account = { id: WhatsAppConnection; status: "disconnected" | "connecting" | "qr_ready" | "connected"; qrDataUrl: string | null; phoneNumber: string | null; pairingCode: string | null; lastError?: string | null };
type Chat = { account: Brand; connection: WhatsAppConnection; jid: string; name: string; avatar: string | null; lastMessage: string; lastType: string; timestamp: number; unread: number; isGroup: boolean };
type Message = { id: string; account: Brand; jid: string; fromMe: boolean; type: string; text: string; timestamp: number; mediaUrl: string | null };

const brands: Record<Brand, { name: string; short: string }> = {
  barbacue: { name: "Barbacue", short: "B" }, chelas: { name: "Chelas", short: "C" }, barbadog: { name: "Barbadog", short: "D" },
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    back: <path d="m15 18-6-6 6-6"/>, plus: <><path d="M12 5v14M5 12h14"/></>,
    dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    clip: <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/>,
    smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z"/>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3h-3"/></>,
    unlink: <><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 4 8"/><path d="M8 12h4M3 3l18 18"/></>, refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const time = (value: number) => value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(value) : "";
const day = (value: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(value);

export function WhatsAppPortal({ initialFilter = "all" }: { initialFilter?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Chat | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [pairing, setPairing] = useState<WhatsAppConnection | null>(null);
  const [error, setError] = useState("");
  // The page-level error bar sits behind the modal backdrop, so pairing needs
  // its own inline slot — otherwise a failed pair looks like nothing happened.
  const [pairError, setPairError] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api/admin/whatsapp/${path}`, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error ?? "Não foi possível concluir a ação");
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [accountData, chatData] = await Promise.all([api("accounts"), api(`chats?account=${filter}`)]);
      setAccounts(accountData.accounts ?? []); setChats(chatData.chats ?? []); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Serviço indisponível"); }
  }, [api, filter]);

  const loadMessages = useCallback(async (chat: Chat) => {
    const data = await api(`messages?account=${chat.connection}&jid=${encodeURIComponent(chat.jid)}`);
    setMessages(data.messages ?? []);
    api("read", { method: "POST", body: JSON.stringify({ account: chat.connection, jid: chat.jid }) }).catch(() => undefined);
  }, [api]);

  useEffect(() => { const initial = setTimeout(refresh, 0); const interval = setInterval(refresh, 5000); return () => { clearTimeout(initial); clearInterval(interval); }; }, [refresh]);
  useEffect(() => { if (!active) return; const initial = setTimeout(() => loadMessages(active), 0); const interval = setInterval(() => loadMessages(active), 3000); return () => { clearTimeout(initial); clearInterval(interval); }; }, [active, loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const visible = useMemo(() => chats.filter((chat) => `${chat.name} ${chat.lastMessage}`.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  const connection: WhatsAppConnection = filter === "all" ? "central" : filter;
  const selectedConnection = pairing ?? connection;
  const target = WHATSAPP_PAIRING[selectedConnection];
  const currentAccount = accounts.find(account => account.id === selectedConnection) ?? null;

  // Pairing finished on the phone: close the modal and land in the inbox.
  useEffect(() => {
    if (pairing && currentAccount?.status === "connected") { const done = setTimeout(() => setPairing(null), 0); return () => clearTimeout(done); }
  }, [pairing, currentAccount?.status]);

  function openPairModal(id: WhatsAppConnection = connection) {
    setPairError(""); setPairing(id);
  }

  // Leaving the modal tells the bot to stop refreshing the QR. Without it the
  // hub keeps reopening sockets for a code nobody is looking at.
  function closePairModal() {
    setPairError("");
    const id = pairing;
    setPairing(null);
    if (id) api("pair-cancel", { method: "POST", body: JSON.stringify({ account: id }) }).catch(() => undefined);
  }

  async function startPairing() {
    if (pairBusy) return;
    setPairBusy(true); setPairError("");
    try {
      await api("pair", { method: "POST", body: JSON.stringify({ account: selectedConnection, method: "phone", phone: target.phone }) });
      await refresh();
    } catch (e) { setPairError(e instanceof Error ? e.message : "Falha ao parear"); }
    finally { setPairBusy(false); }
  }

  async function unpair() {
    if (!confirmUnpair) { setConfirmUnpair(true); setTimeout(() => setConfirmUnpair(false), 4000); return; }
    setConfirmUnpair(false);
    try { await api("disconnect", { method: "POST", body: JSON.stringify({ account: connection }) }); setActive(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível desconectar"); }
  }

  async function send(event: FormEvent) {
    event.preventDefault(); if (!active || !draft.trim()) return;
    const text = draft.trim(); setDraft("");
    try { await api("messages", { method: "POST", body: JSON.stringify({ account: active.connection, jid: active.jid, text }) }); await loadMessages(active); }
    catch (e) { setDraft(text); setError(e instanceof Error ? e.message : "Mensagem não enviada"); }
  }

  async function sendFile(file?: File) {
    if (!active || !file) return;
    if (file.size > 12 * 1024 * 1024) { setError("O anexo deve ter no máximo 12 MB."); return; }
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      await api("messages", { method: "POST", body: JSON.stringify({ account: active.connection, jid: active.jid, text: draft.trim(), media: { type: kind, data, mime: file.type || "application/octet-stream", name: file.name } }) });
      setDraft(""); await loadMessages(active);
    } catch (e) { setError(e instanceof Error ? e.message : "Anexo não enviado"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.identity}><span className={styles.mark}>B</span><div><b>Central WhatsApp</b><span>Barbacue & Co.</span></div></div>
        <nav className={styles.brandTabs} aria-label="Restaurantes">
          {(["all", "barbacue", "barbadog", "chelas"] as Filter[]).map((id) => <button key={id} onClick={() => { setFilter(id); setActive(null); }} className={filter === id ? styles.selectedTab : ""}><span className={id === "all" ? styles.allDot : styles[id]}>{id === "all" ? "3" : brands[id].short}</span>{id === "all" ? "Todos" : brands[id].name}</button>)}
        </nav>
        <div className={styles.accountActions}>
          <div className={styles.connectionSummary}>{currentAccount?.status === "connected" ? "Conectado" : "Desconectado"}<span>{WHATSAPP_PAIRING[connection].name}</span></div>
          {currentAccount?.status === "connected"
            ? <button className={`${styles.pairButton} ${styles.unpairButton}`} onClick={unpair} title="Desconectar o número"><Icon name="unlink" size={17}/> {confirmUnpair ? "Confirmar desconexão" : "Desconectar"}</button>
            : <button className={styles.pairButton} onClick={() => openPairModal()}><Icon name="phone" size={16}/> Parear {WHATSAPP_PAIRING[connection].display}</button>}

          <Link href="/admin" className={styles.adminLink} aria-label="Voltar ao painel"><Icon name="dots"/></Link>
        </div>
      </header>

      {error && <button className={styles.errorbar} onClick={refresh}>{error} <span>Tentar novamente</span></button>}

      <section className={`${styles.workspace} ${active ? styles.chatOpen : ""}`}>
        <aside className={styles.inbox}>
          <div className={styles.inboxHead}><div><h1>Conversas</h1><span>{visible.length} atendimentos</span></div><button title="Atualizar" onClick={refresh}><Icon name="refresh"/></button></div>
          <label className={styles.search}><Icon name="search" size={18}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou mensagem"/></label>
          <div className={styles.chatList}>
            {visible.map((chat) => <button key={`${chat.connection}:${chat.jid}`} className={`${styles.chatRow} ${active?.jid === chat.jid && active.connection === chat.connection ? styles.activeRow : ""}`} onClick={() => setActive(chat)}>
              <div className={styles.avatar}>{chat.avatar ? <span className={styles.profilePhoto} style={{ backgroundImage: `url(${chat.avatar})` }}/> : chat.name.slice(0, 1).toUpperCase()}<i className={styles[chat.account]}/></div>
              <div className={styles.chatCopy}><div><strong>{chat.name}</strong><time>{time(chat.timestamp)}</time></div><div><span>{chat.lastType !== "text" ? "▧ " : ""}{chat.lastMessage}</span>{chat.unread > 0 && <b>{Math.min(chat.unread, 99)}</b>}</div><small>{brands[chat.account].name}</small></div>
            </button>)}
            {!visible.length && <div className={styles.emptyList}><span>◌</span><b>Nenhuma conversa por aqui</b><p>As mensagens aparecem assim que o WhatsApp conectado recebe um contato.</p></div>}
          </div>
        </aside>

        <article className={styles.conversation}>
          {active ? <>
            <header className={styles.chatHeader}><button className={styles.mobileBack} onClick={() => setActive(null)}><Icon name="back"/></button><div className={styles.headerAvatar}>{active.avatar ? <span className={styles.profilePhoto} style={{ backgroundImage: `url(${active.avatar})` }}/> : active.name[0]}</div><div><strong>{active.name}</strong><span><i className={styles[active.account]}/>{brands[active.account].name} · {active.jid.replace(/@.*/, "")}</span></div><div className={styles.chatTools}><button aria-label="Mais opções"><Icon name="dots"/></button></div></header>
            <div className={styles.messages}>
              {messages.length > 0 && <div className={styles.day}>{day(messages[0].timestamp)}</div>}
              {messages.map((message) => <div key={message.id} className={`${styles.messageLine} ${message.fromMe ? styles.outgoing : ""}`}><div className={styles.bubble}>
                {message.type === "image" && message.mediaUrl && <Image className={styles.embeddedImage} src={message.mediaUrl} alt={message.text || "Imagem recebida"} width={360} height={280} unoptimized/>}
                {message.type === "video" && message.mediaUrl && <video className={styles.embeddedMedia} src={message.mediaUrl} controls preload="metadata"/>}
                {message.type === "audio" && message.mediaUrl && <audio className={styles.embeddedAudio} src={message.mediaUrl} controls preload="metadata"/>}
                {message.type === "document" && message.mediaUrl && <a className={styles.document} href={message.mediaUrl} target="_blank">▧ Abrir {message.text}</a>}
                {message.type === "sticker" && message.mediaUrl && <Image className={styles.sticker} src={message.mediaUrl} alt="Figurinha" width={160} height={160} unoptimized/>}
                {message.text && !["document", "sticker"].includes(message.type) && <p>{message.text}</p>}<time>{time(message.timestamp)}{message.fromMe && "  ✓✓"}</time>
              </div></div>)}
              <div ref={endRef}/>
            </div>
            <form className={styles.composer} onSubmit={send}><button type="button" aria-label="Emoji" onClick={() => setDraft((value) => `${value} 🙂`)}><Icon name="smile"/></button><button type="button" aria-label="Anexar foto, vídeo, áudio ou documento" onClick={() => fileRef.current?.click()}><Icon name="clip"/></button><input ref={fileRef} className={styles.fileInput} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => sendFile(event.target.files?.[0])}/><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Digite uma mensagem"/><button className={styles.send} disabled={!draft.trim()} aria-label="Enviar"><Icon name="send" size={19}/></button></form>
          </> : <div className={styles.welcome}><div className={styles.rings}><span>{filter === "all" ? "3" : brands[filter].short}</span></div><h2>{filter === "all" ? "Atendimento integrado" : `WhatsApp ${brands[filter].name}`}</h2><p>{filter === "all" ? "Um número para as três marcas. O cliente escolhe o restaurante e conversa com o agente especializado." : `Conecte o WhatsApp do ${brands[filter].name} por código no celular.`}</p><div><button onClick={() => currentAccount?.status === "connected" ? undefined : openPairModal()}><i className={filter === "all" ? styles.allDot : styles[filter]}/><span><b>{WHATSAPP_PAIRING[connection].name}</b><small>{WHATSAPP_PAIRING[connection].display}</small></span><em className={currentAccount?.status === "connected" ? styles.online : ""}>{currentAccount?.status === "connected" ? "Online" : "Parear"}</em></button></div>{currentAccount?.status !== "connected" && <div className={styles.welcomeActions}><button onClick={() => openPairModal()}><Icon name="phone" size={17}/> Parear {WHATSAPP_PAIRING[connection].display}</button></div>}</div>}

        </article>
      </section>

      {pairing && <div className={styles.modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && closePairModal()}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pair-title"><button className={styles.modalClose} onClick={closePairModal} aria-label="Fechar"><Icon name="close"/></button><span className={`${styles.modalBrand} ${pairing === "central" ? styles.allDot : styles[pairing]}`}>{pairing === "central" ? "3" : brands[pairing].short}</span><h2 id="pair-title">Parear WhatsApp {target.name}</h2><p>Conecte {target.display} usando um código no celular.</p>
        <div className={styles.phoneArea}><label>Número do WhatsApp<input value={target.display} readOnly inputMode="tel"/></label>{currentAccount?.pairingCode ? <div className={styles.code}><span>Código de pareamento</span><b>{currentAccount.pairingCode}</b><small>No WhatsApp de {target.display}, abra <b>Aparelhos conectados › Conectar aparelho › Conectar com número de telefone</b> e digite este código.</small><button className={styles.linkButton} disabled={pairBusy} onClick={() => startPairing()}>Gerar novo código</button></div> : <button className={styles.modalAction} disabled={pairBusy} onClick={() => startPairing()}>{pairBusy ? "Gerando código…" : "Gerar código de pareamento"}</button>}</div>
        {(pairError || currentAccount?.lastError) && <p className={styles.modalError} role="alert">{pairError || currentAccount?.lastError}</p>}
        <div className={styles.modalFoot}><span>As credenciais ficam salvas no servidor.</span><button onClick={() => { setPairing((current) => current); refresh(); }}><Icon name="refresh" size={15}/> Atualizar</button></div>
      </section></div>}
    </main>
  );
}
