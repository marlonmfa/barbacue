"use client";

import { BrandLogo } from "@/components/BrandLogo";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WHATSAPP_PAIRING, type WhatsAppConnection } from "@/lib/whatsapp-pairing";
import styles from "./whatsapp.module.css";

type Brand = "barbacue" | "chelas" | "barbadog";
type Filter = Brand | "all";
type PairingMethod = "qr" | "phone";
type Account = { id: WhatsAppConnection; status: "disconnected" | "connecting" | "qr_ready" | "connected"; qrDataUrl: string | null; phoneNumber: string | null; pairingCode: string | null; lastError?: string | null };
type Chat = { account: Brand; connection: WhatsAppConnection; jid: string; name: string; avatar: string | null; lastMessage: string; lastType: string; timestamp: number; unread: number; isGroup: boolean };
type Message = { id: string; account: Brand; jid: string; fromMe: boolean; type: string; text: string; timestamp: number; mediaUrl: string | null };
const CHAT_PAGE_SIZE = 20;
const CHAT_ROW_HEIGHT = 88;
const MAX_CHAT_WINDOW = 60;

const brands: Record<Brand, { name: string; short: string }> = {
  barbacue: { name: "Barbacue", short: "B" }, chelas: { name: "Chelas", short: "C" }, barbadog: { name: "Barbadog", short: "D" },
};

function BrandMark({ brand, size = 22 }: { brand: Brand; size?: number }) {
  return <BrandLogo className={styles.brandMark} brand={brand} alt={`Logotipo ${brands[brand].name}`} width={size} height={size} />;
}

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
    messages: <><path d="M21 11.5a8 8 0 0 1-8 8H7l-4 3v-11a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M8 11h8M8 15h5"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const time = (value: number) => value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(value) : "";
const day = (value: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(value);

export function WhatsAppPortal({ initialFilter = "all", manageConnection = true }: { initialFilter?: Filter; manageConnection?: boolean }) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Chat | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [pairing, setPairing] = useState<WhatsAppConnection | null>(null);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  // The page-level error bar sits behind the modal backdrop, so pairing needs
  // its own inline slot — otherwise a failed pair looks like nothing happened.
  const [pairError, setPairError] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [pairingMethod, setPairingMethod] = useState<PairingMethod>("qr");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [unpairBusy, setUnpairBusy] = useState(false);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef({ offset: 0, limit: CHAT_PAGE_SIZE, count: 0, hasMore: true });
  const [chatOffset, setChatOffset] = useState(0);
  const chatRequestRef = useRef<AbortController | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const followMessagesRef = useRef(true);
  const lastMessageRef = useRef("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api/admin/whatsapp/${path}`, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error ?? "Não foi possível concluir a ação");
    return data;
  }, []);

  const loadChats = useCallback(async (offset: number, limit: number, selected: Filter, force = false) => {
    const previous = chatWindowRef.current;
    if (!force && previous.offset === offset && previous.limit === limit) return;
    chatRequestRef.current?.abort();
    const controller = new AbortController();
    chatRequestRef.current = controller;
    chatWindowRef.current = { ...previous, offset, limit };
    setLoadingMoreChats(true);
    try {
      const data = await api(`chats?account=${selected}&limit=${limit}&offset=${offset}`, { signal: controller.signal });
      if (controller.signal.aborted || selected !== filterRef.current) return;
      const next = (data.chats ?? []).slice(0, limit);
      setChats(next); setChatOffset(offset); setHasMoreChats(Boolean(data.hasMore));
      chatWindowRef.current = { offset, limit, count: next.length, hasMore: Boolean(data.hasMore) };
    } catch (e) {
      if (!controller.signal.aborted && selected === filterRef.current) {
        chatWindowRef.current = previous;
        setError(e instanceof Error ? e.message : "Não foi possível carregar as conversas");
      }
    } finally { if (chatRequestRef.current === controller) setLoadingMoreChats(false); }
  }, [api]);

  const refresh = useCallback(async () => {
    const selected = filter;
    try {
      const data = await api("accounts");
      if (selected !== filterRef.current) return;
      setAccounts(data.accounts ?? []);
      // Poll the recent page only while the reader is at the top. Never reorder
      // an older window underneath someone reading or scrolling.
      if (!chatListRef.current || chatListRef.current.scrollTop <= 4) {
        await loadChats(0, CHAT_PAGE_SIZE, selected, true);
      }
      setError("");
    } catch (e) { if (selected === filterRef.current) setError(e instanceof Error ? e.message : "Serviço indisponível"); }
  }, [api, filter, loadChats]);

  function scrollChats(element: HTMLDivElement) {
    if (search) return;
    const offset = element.scrollTop <= 4 ? 0 : Math.max(0, Math.floor(element.scrollTop / CHAT_ROW_HEIGHT / CHAT_PAGE_SIZE) - 1) * CHAT_PAGE_SIZE;
    const current = chatWindowRef.current;
    const nearBottom = element.scrollTop + element.clientHeight > (current.offset + current.count) * CHAT_ROW_HEIGHT - CHAT_ROW_HEIGHT;
    const limit = element.scrollTop <= 4 ? CHAT_PAGE_SIZE : MAX_CHAT_WINDOW;
    if (offset !== current.offset || (nearBottom && current.hasMore && current.limit < limit)) void loadChats(offset, limit, filter);
  }

  const loadMessages = useCallback(async (chat: Chat, isCurrent: () => boolean = () => true) => {
    const data = await api(`messages?account=${chat.connection}&jid=${encodeURIComponent(chat.jid)}`);
    if (!isCurrent()) return;
    setMessages(data.messages ?? []);
    api("read", { method: "POST", body: JSON.stringify({ account: chat.connection, jid: chat.jid }) }).catch(() => undefined);
  }, [api]);

  const recoverHistory = useCallback(async () => {
    setRecovering(true);
    try {
      const data = await api("history/recover", { method: "POST", body: JSON.stringify({ account: filter }) });
      if (chatListRef.current) chatListRef.current.scrollTop = 0;
      await loadChats(0, CHAT_PAGE_SIZE, filter, true);
      if (active) await loadMessages(active);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível recuperar o histórico"); }
    finally { setRecovering(false); }
  }, [api, filter, active, loadMessages, loadChats]);

  useEffect(() => { const initial = setTimeout(refresh, 0); const interval = setInterval(refresh, 5000); return () => { clearTimeout(initial); clearInterval(interval); }; }, [refresh]);
  useEffect(() => {
    setMessages([]);
    lastMessageRef.current = ""; followMessagesRef.current = true;
    if (!active) return;
    let cancelled = false;
    const load = () => loadMessages(active, () => !cancelled).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Não foi possível recuperar as mensagens"); });
    const initial = setTimeout(load, 0); const interval = setInterval(load, 3000);
    return () => { cancelled = true; clearTimeout(initial); clearInterval(interval); };
  }, [active, loadMessages]);
  useLayoutEffect(() => {
    const container = messagesRef.current;
    const last = messages.at(-1);
    const key = last ? `${last.id}:${last.timestamp}` : "";
    if (container && key !== lastMessageRef.current && followMessagesRef.current) {
      container.scrollTop = container.scrollHeight;
    }
    lastMessageRef.current = key;
  }, [messages]);
  useEffect(() => () => chatRequestRef.current?.abort(), []);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const menu = accountMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

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
    setPairError(""); setPairingMethod("qr"); setConfirmClear(false); setPairing(id);
  }

  // Leaving the modal tells the bot to stop refreshing the QR. Without it the
  // hub keeps reopening sockets for a code nobody is looking at.
  function closePairModal() {
    setPairError(""); setConfirmClear(false);
    const id = pairing;
    setPairing(null);
    if (id) api("pair-cancel", { method: "POST", body: JSON.stringify({ account: id }) }).catch(() => undefined);
  }

  async function startPairing(method: PairingMethod) {
    if (pairBusy) return;
    setPairBusy(true); setPairError("");
    try {
      await api("pair", { method: "POST", body: JSON.stringify({ account: selectedConnection, method, ...(method === "phone" ? { phone: target.phone } : {}) }) });
      await refresh();
    } catch (e) { setPairError(e instanceof Error ? e.message : "Falha ao parear"); }
    finally { setPairBusy(false); }
  }

  async function clearPairingSession() {
    if (pairBusy) return;
    if (!confirmClear) { setConfirmClear(true); return; }
    setPairBusy(true); setPairError(""); setConfirmClear(false);
    try {
      await api("session-clear", { method: "POST", body: JSON.stringify({ account: selectedConnection }) });
      setPairingMethod("qr");
      await refresh();
    } catch (e) { setPairError(e instanceof Error ? e.message : "Não foi possível limpar a sessão"); }
    finally { setPairBusy(false); }
  }

  async function unpair() {
    if (unpairBusy) return;
    if (!confirmUnpair) { setConfirmUnpair(true); setTimeout(() => setConfirmUnpair(false), 4000); return; }
    setConfirmUnpair(false); setUnpairBusy(true);
    try { await api("disconnect", { method: "POST", body: JSON.stringify({ account: connection }) }); setActive(null); if (accountMenuRef.current) accountMenuRef.current.open = false; await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível desconectar"); }
    finally { setUnpairBusy(false); }
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
        <div className={styles.identity}><BrandMark brand="barbacue" size={38}/><div><b>Central WhatsApp</b><span>Barbacue & Co.</span></div></div>
        <nav className={styles.brandTabs} aria-label="Restaurantes">
          {(["all", "barbacue", "barbadog", "chelas"] as Filter[]).map((id) => <button key={id} onClick={() => { chatRequestRef.current?.abort(); chatWindowRef.current = { offset: 0, limit: CHAT_PAGE_SIZE, count: 0, hasMore: true }; if (chatListRef.current) chatListRef.current.scrollTop = 0; setChatOffset(0); setSearch(""); setFilter(id); setChats([]); setHasMoreChats(true); setActive(null); setConfirmUnpair(false); if (accountMenuRef.current) accountMenuRef.current.open = false; }} className={filter === id ? styles.selectedTab : ""}>{id === "all" ? <span className={styles.allMark}><Icon name="messages" size={14}/></span> : <BrandMark brand={id}/>} {id === "all" ? "Todos" : brands[id].name}</button>)}
        </nav>
        <div className={styles.accountActions}>
          <div className={styles.connectionSummary}>{currentAccount?.status === "connected" ? "Conectado" : "Desconectado"}<span>{WHATSAPP_PAIRING[connection].name}</span></div>
          {manageConnection && currentAccount?.status !== "connected" && <button className={styles.pairButton} onClick={() => openPairModal()}><Icon name="phone" size={16}/> Parear {WHATSAPP_PAIRING[connection].display}</button>}
          <details className={styles.accountMenu} ref={accountMenuRef} onToggle={event => { if (!event.currentTarget.open) setConfirmUnpair(false); }} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary className={styles.accountMenuTrigger} aria-label="Opções da conexão" title="Opções da conexão"><Icon name="dots"/></summary>
            <div className={styles.accountMenuItems}>
              <Link href="/admin">Voltar ao painel</Link>
              {manageConnection && currentAccount?.status === "connected" && <button className={styles.disconnectOption} disabled={unpairBusy} onClick={unpair}><Icon name="unlink" size={17}/> {unpairBusy ? "Desconectando…" : confirmUnpair ? "Confirmar desconexão" : "Desconectar"}</button>}
            </div>
          </details>
        </div>
      </header>

      {error && <button className={styles.errorbar} onClick={refresh}>{error} <span>Tentar novamente</span></button>}

      <section className={`${styles.workspace} ${active ? styles.chatOpen : ""}`}>
        <aside className={styles.inbox}>
          <div className={styles.inboxHead}><div><h1>Conversas</h1><span>{recovering ? "Recuperando histórico…" : `${visible.length} atendimentos`}</span></div><button title="Recuperar histórico" aria-label="Recuperar histórico" disabled={recovering} onClick={recoverHistory}><Icon name="refresh"/></button></div>
          <label className={styles.search}><Icon name="search" size={18}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou mensagem"/></label>
          <div className={styles.chatList} ref={chatListRef} onScroll={event => scrollChats(event.currentTarget)} aria-label="Lista de conversas">
            {!search && chatOffset > 0 && <div aria-hidden="true" style={{ height: chatOffset * CHAT_ROW_HEIGHT }} />}
            {visible.map((chat) => <button key={`${chat.connection}:${chat.jid}`} data-brand={chat.account} className={`${styles.chatRow} ${active?.jid === chat.jid && active.connection === chat.connection ? styles.activeRow : ""}`} onClick={() => setActive(chat)}>
              <div className={styles.avatar}>{chat.avatar ? <span className={styles.profilePhoto} style={{ backgroundImage: `url(${chat.avatar})` }}/> : chat.name.slice(0, 1).toUpperCase()}<span className={styles.chatBrandMark}><BrandMark brand={chat.account} size={14}/></span></div>
              <div className={styles.chatCopy}><div><strong>{chat.name}</strong><time>{time(chat.timestamp)}</time></div><div><span>{chat.lastType !== "text" ? "▧ " : ""}{chat.lastMessage}</span>{chat.unread > 0 && <b>{Math.min(chat.unread, 99)}</b>}</div><small>{brands[chat.account].name}</small></div>
            </button>)}
            {!visible.length && <div className={styles.emptyList}><span>◌</span><b>Nenhuma conversa por aqui</b><p>As mensagens aparecem assim que o WhatsApp conectado recebe um contato.</p></div>}
            {!search && hasMoreChats && <div aria-hidden="true" style={{ height: CHAT_ROW_HEIGHT }} />}
            {loadingMoreChats && <div className={styles.loadingMore}>Carregando mais conversas…</div>}
          </div>
        </aside>

        <article className={styles.conversation} data-brand={active?.account}>
          {active ? <>
            <div className={styles.conversationWatermark} aria-hidden="true"><BrandMark brand={active.account} size={300}/></div>
            <header className={styles.chatHeader}><button className={styles.mobileBack} onClick={() => setActive(null)}><Icon name="back"/></button><div className={styles.headerAvatar}>{active.avatar ? <span className={styles.profilePhoto} style={{ backgroundImage: `url(${active.avatar})` }}/> : active.name[0]}</div><div><strong>{active.name}</strong><span><BrandMark brand={active.account} size={14}/>{brands[active.account].name} · {active.jid.replace(/@.*/, "")}</span></div><div className={styles.chatTools}><button aria-label="Mais opções"><Icon name="dots"/></button></div></header>
            <div className={styles.messages} ref={messagesRef} onScroll={event => {
              const el = event.currentTarget;
              followMessagesRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}>
              {messages.length > 0 && <div className={styles.day}>{day(messages[0].timestamp)}</div>}
              {messages.map((message) => <div key={message.id} className={`${styles.messageLine} ${message.fromMe ? styles.outgoing : ""}`}><div className={styles.bubble}>
                {message.type === "image" && message.mediaUrl && <Image className={styles.embeddedImage} src={message.mediaUrl} alt={message.text || "Imagem recebida"} width={360} height={280} unoptimized/>}
                {message.type === "video" && message.mediaUrl && <video className={styles.embeddedMedia} src={message.mediaUrl} controls preload="metadata"/>}
                {message.type === "audio" && message.mediaUrl && <audio className={styles.embeddedAudio} src={message.mediaUrl} controls preload="metadata"/>}
                {message.type === "document" && message.mediaUrl && <a className={styles.document} href={message.mediaUrl} target="_blank">▧ Abrir {message.text}</a>}
                {message.type === "sticker" && message.mediaUrl && <Image className={styles.sticker} src={message.mediaUrl} alt="Figurinha" width={160} height={160} unoptimized/>}
                {message.text && !["document", "sticker"].includes(message.type) && <p>{message.text}</p>}<time>{time(message.timestamp)}{message.fromMe && "  ✓✓"}</time>
              </div></div>)}
            </div>
            <form className={styles.composer} onSubmit={send}><button type="button" aria-label="Emoji" onClick={() => setDraft((value) => `${value} 🙂`)}><Icon name="smile"/></button><button type="button" aria-label="Anexar foto, vídeo, áudio ou documento" onClick={() => fileRef.current?.click()}><Icon name="clip"/></button><input ref={fileRef} className={styles.fileInput} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => sendFile(event.target.files?.[0])}/><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Digite uma mensagem"/><button className={styles.send} disabled={!draft.trim()} aria-label="Enviar"><Icon name="send" size={19}/></button></form>
          </> : <div className={styles.welcome}><div className={styles.rings}><span>{filter === "all" ? <Icon name="messages" size={32}/> : <BrandMark brand={filter} size={72}/>}</span></div><h2>{filter === "all" ? "Atendimento integrado" : `WhatsApp ${brands[filter].name}`}</h2><p>{filter === "all" ? "Um número para as três marcas. Cada conversa mostra a logo da marca que a recebeu." : `Conecte o WhatsApp do ${brands[filter].name} por código no celular.`}</p><div><button onClick={() => manageConnection && currentAccount?.status !== "connected" ? openPairModal() : undefined}>{filter === "all" ? <i className={styles.allDot}/> : <BrandMark brand={filter} size={32}/>}<span><b>{WHATSAPP_PAIRING[connection].name}</b><small>{WHATSAPP_PAIRING[connection].display}</small></span><em className={currentAccount?.status === "connected" ? styles.online : ""}>{currentAccount?.status === "connected" ? "Online" : "Parear"}</em></button></div>{manageConnection && currentAccount?.status !== "connected" && <div className={styles.welcomeActions}><button onClick={() => openPairModal()}><Icon name="phone" size={17}/> Parear {WHATSAPP_PAIRING[connection].display}</button></div>}</div>}

        </article>
      </section>

      {pairing && <div className={styles.modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && closePairModal()}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pair-title"><button className={styles.modalClose} onClick={closePairModal} aria-label="Fechar"><Icon name="close"/></button><span className={styles.modalBrand}>{pairing === "central" ? <Icon name="messages" size={21}/> : <BrandMark brand={pairing} size={42}/>}</span><h2 id="pair-title">Parear WhatsApp {target.name}</h2><p>Conecte {target.display} escaneando um QR Code ou usando um código no celular.</p>
        <div className={styles.methodTabs} role="tablist" aria-label="Método de pareamento"><button type="button" role="tab" aria-selected={pairingMethod === "qr"} className={pairingMethod === "qr" ? styles.methodActive : ""} onClick={() => { setPairError(""); setPairingMethod("qr"); }}><Icon name="qr" size={15}/> QR Code</button><button type="button" role="tab" aria-selected={pairingMethod === "phone"} className={pairingMethod === "phone" ? styles.methodActive : ""} onClick={() => { setPairError(""); setPairingMethod("phone"); }}><Icon name="phone" size={15}/> Código no celular</button></div>
        {pairingMethod === "qr" ? <div className={styles.qrArea}>{currentAccount?.qrDataUrl ? <><div className={styles.qr}><Image src={currentAccount.qrDataUrl} alt={`QR Code para conectar ${target.display} ao WhatsApp`} width={220} height={220} unoptimized/></div><ol><li>No celular, abra o WhatsApp.</li><li>Vá em <b>Aparelhos conectados</b> e toque em <b>Conectar aparelho</b>.</li><li>Escaneie este QR Code antes que ele seja atualizado.</li></ol><button className={styles.linkButton} disabled={pairBusy} onClick={() => startPairing("qr")}>Gerar novo QR Code</button></> : <><div className={styles.qrPlaceholder}><Icon name="qr" size={70}/></div><button className={styles.modalAction} disabled={pairBusy} onClick={() => startPairing("qr")}>{pairBusy ? "Gerando QR Code…" : "Gerar QR Code"}</button></>}</div> : <div className={styles.phoneArea}><label>Número do WhatsApp<input value={target.display} readOnly inputMode="tel"/></label>{currentAccount?.pairingCode ? <div className={styles.code}><span>Código de pareamento</span><b>{currentAccount.pairingCode}</b><small>No WhatsApp de {target.display}, abra <b>Aparelhos conectados › Conectar aparelho › Conectar com número de telefone</b> e digite este código.</small><button className={styles.linkButton} disabled={pairBusy} onClick={() => startPairing("phone")}>Gerar novo código</button></div> : <button className={styles.modalAction} disabled={pairBusy} onClick={() => startPairing("phone")}>{pairBusy ? "Gerando código…" : "Gerar código de pareamento"}</button>}</div>}
        {(pairError || currentAccount?.lastError) && <p className={styles.modalError} role="alert">{pairError || currentAccount?.lastError}</p>}
        <div className={styles.modalFoot}><span>As credenciais ficam salvas no servidor.</span><div className={styles.modalFootActions}><button className={styles.clearSession} disabled={pairBusy} onClick={clearPairingSession}>{confirmClear ? "Confirmar limpeza" : "Limpar sessão"}</button><button onClick={() => { setPairing((current) => current); refresh(); }}><Icon name="refresh" size={15}/> Atualizar</button></div></div>
      </section></div>}
    </main>
  );
}
