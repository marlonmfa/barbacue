"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./whatsapp.module.css";

type Brand = "barbacue" | "chelas" | "barbadogs";
type Filter = Brand | "all";
type Account = { id: Brand; status: "disconnected" | "connecting" | "qr_ready" | "connected"; qrDataUrl: string | null; phoneNumber: string | null; pairingCode: string | null; lastError?: string | null };
type Chat = { account: Brand; jid: string; name: string; avatar: string | null; lastMessage: string; lastType: string; timestamp: number; unread: number; isGroup: boolean };
type Message = { id: string; account: Brand; jid: string; fromMe: boolean; type: string; text: string; timestamp: number; mediaUrl: string | null };

const brands: Record<Brand, { name: string; short: string }> = {
  barbacue: { name: "Barbacue", short: "B" }, chelas: { name: "Chelas", short: "C" }, barbadogs: { name: "Barbadogs", short: "D" },
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
    close: <path d="m18 6-12 12M6 6l12 12"/>, refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const time = (value: number) => value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(value) : "";
const day = (value: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(value);

export function WhatsAppPortal() {
  const [filter, setFilter] = useState<Filter>("all");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Chat | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [pairing, setPairing] = useState<Brand | null>(null);
  const [method, setMethod] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  // The page-level error bar sits behind the modal backdrop, so pairing needs
  // its own inline slot — otherwise a failed pair looks like nothing happened.
  const [pairError, setPairError] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
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
    const data = await api(`messages?account=${chat.account}&jid=${encodeURIComponent(chat.jid)}`);
    setMessages(data.messages ?? []);
    api("read", { method: "POST", body: JSON.stringify({ account: chat.account, jid: chat.jid }) }).catch(() => undefined);
  }, [api]);

  useEffect(() => { const initial = setTimeout(refresh, 0); const interval = setInterval(refresh, 5000); return () => { clearTimeout(initial); clearInterval(interval); }; }, [refresh]);
  useEffect(() => { if (!active) return; const initial = setTimeout(() => loadMessages(active), 0); const interval = setInterval(() => loadMessages(active), 3000); return () => { clearTimeout(initial); clearInterval(interval); }; }, [active, loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const visible = useMemo(() => chats.filter((chat) => `${chat.name} ${chat.lastMessage}`.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  const currentAccount = pairing ? accounts.find((item) => item.id === pairing) : null;

  function openPairModal(id: Brand) { setPairError(""); setPairing(id); }
  function switchMethod(next: "qr" | "phone") { setPairError(""); setMethod(next); }

  // Leaving the modal tells the bot to stop refreshing the QR. Without it the
  // hub keeps reopening sockets for a code nobody is looking at.
  function closePairModal() {
    setPairError("");
    const id = pairing;
    setPairing(null);
    if (id) api("pair-cancel", { method: "POST", body: JSON.stringify({ account: id }) }).catch(() => undefined);
  }

  async function startPairing() {
    if (!pairing || pairBusy) return;
    setPairBusy(true); setPairError("");
    try {
      await api("pair", { method: "POST", body: JSON.stringify({ account: pairing, method, phone }) });
      await refresh();
    } catch (e) { setPairError(e instanceof Error ? e.message : "Falha ao parear"); }
    finally { setPairBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault(); if (!active || !draft.trim()) return;
    const text = draft.trim(); setDraft("");
    try { await api("messages", { method: "POST", body: JSON.stringify({ account: active.account, jid: active.jid, text }) }); await loadMessages(active); }
    catch (e) { setDraft(text); setError(e instanceof Error ? e.message : "Mensagem não enviada"); }
  }

  async function sendFile(file?: File) {
    if (!active || !file) return;
    if (file.size > 12 * 1024 * 1024) { setError("O anexo deve ter no máximo 12 MB."); return; }
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      await api("messages", { method: "POST", body: JSON.stringify({ account: active.account, jid: active.jid, text: draft.trim(), media: { type: kind, data, mime: file.type || "application/octet-stream", name: file.name } }) });
      setDraft(""); await loadMessages(active);
    } catch (e) { setError(e instanceof Error ? e.message : "Anexo não enviado"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.identity}><span className={styles.mark}>B</span><div><b>Central WhatsApp</b><span>Barbacue & Co.</span></div></div>
        <nav className={styles.brandTabs} aria-label="Restaurantes">
          {(["all", "barbacue", "chelas", "barbadogs"] as Filter[]).map((id) => <button key={id} onClick={() => { setFilter(id); setActive(null); }} className={filter === id ? styles.selectedTab : ""}><span className={id === "all" ? styles.allDot : styles[id]}>{id === "all" ? "3" : brands[id].short}</span>{id === "all" ? "Todos" : brands[id].name}</button>)}
        </nav>
        <div className={styles.accountActions}>
          <div className={styles.connectionSummary}>{accounts.filter((a) => a.status === "connected").length}<span>/ 3 online</span></div>
          <button className={styles.pairButton} onClick={() => openPairModal(filter === "all" ? "barbacue" : filter)}><Icon name="plus" size={17}/> Parear número</button>
          <Link href="/admin" className={styles.adminLink} aria-label="Voltar ao painel"><Icon name="dots"/></Link>
        </div>
      </header>

      {error && <button className={styles.errorbar} onClick={refresh}>{error} <span>Tentar novamente</span></button>}

      <section className={`${styles.workspace} ${active ? styles.chatOpen : ""}`}>
        <aside className={styles.inbox}>
          <div className={styles.inboxHead}><div><h1>Conversas</h1><span>{visible.length} atendimentos</span></div><button title="Atualizar" onClick={refresh}><Icon name="refresh"/></button></div>
          <label className={styles.search}><Icon name="search" size={18}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou mensagem"/></label>
          <div className={styles.chatList}>
            {visible.map((chat) => <button key={`${chat.account}:${chat.jid}`} className={`${styles.chatRow} ${active?.jid === chat.jid && active.account === chat.account ? styles.activeRow : ""}`} onClick={() => setActive(chat)}>
              <div className={styles.avatar}>{chat.avatar ? <span className={styles.profilePhoto} style={{ backgroundImage: `url(${chat.avatar})` }}/> : chat.name.slice(0, 1).toUpperCase()}<i className={styles[chat.account]}/></div>
              <div className={styles.chatCopy}><div><strong>{chat.name}</strong><time>{time(chat.timestamp)}</time></div><div><span>{chat.lastType !== "text" ? "▧ " : ""}{chat.lastMessage}</span>{chat.unread > 0 && <b>{Math.min(chat.unread, 99)}</b>}</div><small>{brands[chat.account].name}</small></div>
            </button>)}
            {!visible.length && <div className={styles.emptyList}><span>◌</span><b>Nenhuma conversa por aqui</b><p>As mensagens aparecem assim que os números conectados recebem um contato.</p></div>}
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
          </> : <div className={styles.welcome}><div className={styles.rings}><span>B</span></div><h2>Atendimento, sem trocar de janela.</h2><p>Escolha uma conversa para responder clientes de qualquer restaurante. Fotos, vídeos, áudios e documentos ficam dentro do atendimento.</p><div>{accounts.map((account) => <button key={account.id} onClick={() => account.status === "connected" ? setFilter(account.id) : openPairModal(account.id)}><i className={styles[account.id]}/><span><b>{brands[account.id].name}</b><small>{account.status === "connected" ? `+${account.phoneNumber}` : "Parear número"}</small></span><em className={account.status === "connected" ? styles.online : ""}>{account.status === "connected" ? "Online" : "Offline"}</em></button>)}</div></div>}
        </article>
      </section>

      {pairing && <div className={styles.modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && closePairModal()}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pair-title"><button className={styles.modalClose} onClick={closePairModal}><Icon name="close"/></button><span className={`${styles.modalBrand} ${styles[pairing]}`}>{brands[pairing].short}</span><h2 id="pair-title">Conectar {brands[pairing].name}</h2><p>Use um número exclusivo para identificar as conversas deste restaurante.</p><div className={styles.methodTabs}><button className={method === "qr" ? styles.methodActive : ""} onClick={() => switchMethod("qr")}>Escanear QR code</button><button className={method === "phone" ? styles.methodActive : ""} onClick={() => switchMethod("phone")}>Usar número</button></div>
        {method === "qr" ? <div className={styles.qrArea}>{currentAccount?.qrDataUrl ? <><div className={styles.qr}><Image src={currentAccount.qrDataUrl} alt="QR code de pareamento" width={230} height={230} unoptimized/></div><ol><li>Abra o WhatsApp no celular</li><li>Toque em <b>Aparelhos conectados</b></li><li>Escaneie este código</li></ol></> : <><div className={styles.qrPlaceholder}><span>▦</span></div><button className={styles.modalAction} disabled={pairBusy} onClick={startPairing}>{pairBusy ? "Gerando QR code…" : "Gerar QR code"}</button></>}</div> : <div className={styles.phoneArea}><label>Número com DDD<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55 11 99999 9999" inputMode="tel"/></label>{currentAccount?.pairingCode ? <div className={styles.code}><span>Código de pareamento</span><b>{currentAccount.pairingCode}</b><small>No celular, escolha “Conectar com número de telefone”.</small></div> : <button className={styles.modalAction} disabled={pairBusy || phone.replace(/\D/g, "").length < 10} onClick={startPairing}>{pairBusy ? "Enviando código…" : "Enviar código"}</button>}</div>}
        {(pairError || currentAccount?.lastError) && <p className={styles.modalError} role="alert">{pairError || currentAccount?.lastError}</p>}
        <div className={styles.modalFoot}><span>As credenciais ficam salvas no servidor.</span><button onClick={() => { setPairing((current) => current); refresh(); }}><Icon name="refresh" size={15}/> Atualizar</button></div>
      </section></div>}
    </main>
  );
}
