import React, { Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminShell } from '@/components/admin/AdminShell';
import { OperationsDashboard } from '@/components/admin/OperationsDashboard';
import { can, canAccessPath, landingPath, PERMISSIONS, ROLE_LABELS, type AccessRole, type Permission } from '@/lib/permissions';
import Login from '@/app/admin/login/page';
import ChangePassword from '@/app/admin/change-password/page';
import Catalogs from '@/app/admin/catalogs/page';
import Products from '@/app/admin/products/page';
import Categories from '@/app/admin/categories/page';
import Coupons from '@/app/admin/coupons/page';
import AdminOrders from '@/app/admin/orders/page';

import Kitchen from '@/app/admin/kitchen/page';
import Waiter from '@/app/admin/waiter/page';
import Delivery from '@/app/admin/delivery/page';
import Ifood from '@/app/admin/ifood/page';
import Customers from '@/app/admin/customers/page';
import Tables from '@/app/admin/tables/page';
import Team from '@/app/admin/team/page';
import Staff from '@/app/admin/staff/page';
import Settings from '@/app/admin/settings/page';
import Freight from '@/app/admin/delivery-settings/page';
import System from '@/app/admin/system/page';
import Beta from '@/app/admin/beta/page';
import Erp from '@/app/admin/erp/page';
import Impersonate from '@/app/admin/impersonate/page';
import { WhatsAppPortal } from '@/app/whatsapp/WhatsAppPortal';
import { TestOrderChat } from '@/components/TestOrderChat';
import { SelfServiceMenu } from '@/components/SelfServiceMenu';
import './desktop.css';

const Orders = () => <AdminOrders />;

type Account = { userId: number; role: AccessRole; name?: string; jobTitle?: string; permissions?: Permission[]; mustChangePassword?: boolean };
declare global {
  interface Window { workspace: any; __BARBACUE_API_ORIGIN__: string }
}
const pages: Record<string, React.ComponentType> = {
  '/admin/catalogs': Catalogs, '/admin/products': Products, '/admin/categories': Categories, '/admin/coupons': Coupons,
  '/admin/orders': Orders, '/admin/kitchen': Kitchen, '/admin/waiter': Waiter, '/admin/delivery': Delivery, '/admin/ifood': Ifood,
  '/admin/customers': Customers, '/admin/tables': Tables, '/admin/team': Team, '/admin/staff': Staff,
  '/admin/settings': Settings, '/admin/delivery-settings': Freight, '/admin/system': System, '/admin/beta': Beta,
  '/admin/erp': Erp, '/admin/impersonate': Impersonate, '/whatsapp': WhatsAppPortal, '/teste_pedido': TestOrderChat,
};
async function command(name: string) {
  const result = await window.workspace.command(name);
  if (!result.ok) window.alert(result.error);
}
function Retry({ error, retry }: { error: string; retry: () => void }) {
  return <section className="desktop-recovery"><h1>Não foi possível acessar o sistema.</h1><p>{error}</p><button onClick={retry}>Tentar novamente</button><button onClick={() => command('setup')}>Revisar conexão</button><p>Confira se uma alteração foi registrada antes de reenviá-la.</p></section>;
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Retry error="Não foi possível apresentar os dados recebidos. Confira a conexão e recarregue a função." retry={() => location.reload()} /> : this.props.children; }
}
function Dashboard({ account }: { account: Account }) {
  const [data, setData] = useState<any>(), [error, setError] = useState('');
  useEffect(() => { const c = new AbortController(); fetch('/api/admin/dashboard', { signal: c.signal }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Atualize a API online para disponibilizar a visão geral.'); setData(d); }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, []);
  if (error) return <Retry error={error} retry={() => location.reload()} />;
  return data ? <OperationsDashboard {...data} canUseWhatsApp={account.role === 'admin'} /> : <p>Consultando indicadores…</p>;
}
function Workspace({ account }: { account: Account }) {
  return <section className="desktop-work"><h1>Olá, {account.name || 'equipe'}</h1><p>{account.jobTitle || ROLE_LABELS[account.role]}</p><div>{PERMISSIONS.filter(p => can(account, p.id)).map(p => <a key={p.id} href={p.href}><h2>{p.label}</h2><p>{p.description}</p></a>)}</div></section>;
}
function Downloads({ version }: { version: string }) {
  return <section className="desktop-work"><h1>Programa Windows</h1><p>Versão instalada: {version}. Use o instalador disponibilizado pela administração para atualizar os computadores da loja.</p><a className="desktop-download" href="/api/admin/downloads/windows" download>Baixar instalador disponibilizado no servidor</a></section>;
}
function CustomerPreview() {
  const [customer, setCustomer] = useState<any>();
  useEffect(() => { fetch('/api/account').then(r => r.json()).then(setCustomer); }, []);
  return <section className="desktop-work"><h1>Prévia do cliente</h1><p>{customer?.name || customer?.customer?.name || 'Conta do cliente selecionada no servidor.'}</p><p>O acesso da equipe continua disponível.</p><a href="/admin/impersonate">Voltar aos acessos</a></section>;
}
function OrderShell({ children, groups }: { children: ReactNode; groups: any[] }) {
  const primary = ['/admin/orders', '/admin/ifood', '/admin/catalogs', '/admin/settings'];
  return <div className="desktop-manager"><aside aria-label="Navegação do gestor"><strong>Barbacue</strong><small>Gestor de pedidos</small>
    <nav>{groups.flatMap(g => g.items).filter(m => primary.includes(m.path)).sort((a, b) => primary.indexOf(a.path) - primary.indexOf(b.path)).map(m => <a key={m.id} href={m.path} aria-current={m.path === location.pathname ? 'page' : undefined}>{m.id === 'orders' ? 'Pedidos' : m.label}</a>)}
    <details><summary>Mais funções</summary>{groups.map(g => <section key={g.label}><h2>{g.label}</h2>{g.items.filter((m: any) => !primary.includes(m.path)).map((m: any) => <a key={m.id} href={m.path}>{m.label}</a>)}</section>)}</details></nav>
    <button onClick={() => command('setup')}>Impressoras e conexão</button></aside><div className="desktop-manager-workspace">{children}</div></div>;
}
function App() {
  const [info, setInfo] = useState<any>(), [account, setAccount] = useState<Account | null>(null);
  const [booting, setBooting] = useState(true), [error, setError] = useState('');
  const path = location.pathname;
  async function bootstrap() {
    setBooting(true); setError('');
    try {
      const state = await window.workspace.state();
      if (!state.ok) throw new Error(state.error);
      setInfo(state.value); window.__BARBACUE_API_ORIGIN__ = state.value.server;
      const response = await fetch('/api/admin/auth', { cache: 'no-store' });
      if (response.status === 401) { setAccount(null); if (path !== '/admin/login') location.replace('/admin/login'); return; }
      if (!response.ok) throw new Error([404, 405].includes(response.status) ? 'Publique a atualização da API online para habilitar a consulta de sessão do aplicativo.' : 'Não foi possível consultar a API online. Confira a conexão.');
      const { session } = await response.json();
      if (!session?.role) throw new Error('Resposta de sessão incompatível. Atualize a API online.');
      setAccount(session);
      if (session.mustChangePassword && path !== '/admin/change-password') location.replace('/admin/change-password');
      else if (!session.mustChangePassword && (['/admin/login', '/admin/change-password'].includes(path) || (!['/', '/totem'].includes(path) && !canAccessPath(session, path)))) location.replace(landingPath(session));
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão.'); }
    finally { setBooting(false); }
  }
  useEffect(() => {
    void bootstrap();
    const stop = window.workspace.onState((state: any) => setInfo((old: any) => ({ ...old, ...state })));
    const expire = window.workspace.onSessionExpired(() => { if (location.pathname !== '/admin/login') location.replace('/admin/login'); });
    return () => { stop(); expire(); };
  }, []);
  const groups = info?.groups?.map((g: any) => ({ ...g, items: g.items.filter((m: any) => account && canAccessPath(account, m.path)) })).filter((g: any) => g.items.length) ?? [];
  const Page = pages[path];
  const body = booting ? <p className="desktop-pending">Conectando à API online…</p> : error ? <Retry error={error} retry={bootstrap} />
    : !account ? <Login /> : account.mustChangePassword ? <ChangePassword />
    : path === '/' ? <CustomerPreview />
    : path === '/totem' ? <SelfServiceMenu mode="kiosk" brand="barbacue" tableToken={new URLSearchParams(location.search).get('mesa') || undefined} />
    : path === '/admin' ? <Dashboard account={account} />
    : path === '/admin/workspace' ? <Workspace account={account} />
    : path === '/admin/downloads' ? <Downloads version={info.version} />
    : Page && canAccessPath(account, path) ? <Page /> : <p>Redirecionando para sua área de trabalho…</p>;
  const standalone = !account || account.mustChangePassword || ['/whatsapp', '/teste_pedido', '/totem'].includes(path) || error || booting;
  return <><header id="desktop-toolbar"><div className="desktop-brand"><strong>Barbacue</strong><span>Administração Windows</span></div><div className="desktop-history"><button aria-label="Voltar" disabled={!info?.canGoBack} onClick={() => command('back')}>←</button><button aria-label="Avançar" disabled={!info?.canGoForward} onClick={() => command('forward')}>→</button><button aria-label="Atualizar" onClick={() => command('reload')}>↻</button></div>
    <label>Ir para<select aria-label="Ir para" disabled={!account || account.mustChangePassword} value={info?.moduleId || ''} onChange={async e => { const result = await window.workspace.navigate(e.target.value); if (!result.ok) window.alert(result.error); }}><option value="">Escolher função…</option>{groups.map((g: any) => <optgroup key={g.label} label={g.label}>{g.items.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>)}</select></label>
    <div className="desktop-connection" data-status={info?.status}><span role="status">{info?.status === 'error' ? 'API sem conexão' : info?.status === 'ready' ? 'API conectada' : 'Conectando…'}</span><small>{info?.server}</small></div><button onClick={() => command('setup')}>Impressoras e conexão</button></header>
    {info?.status === 'error' && !error && !booting && <div className="desktop-network" role="alert">A API online está indisponível. Confira o resultado da última operação antes de tentar novamente.</div>}
    <main id="desktop-content"><Boundary>{standalone ? body : path === '/admin/orders' ? <OrderShell groups={groups}>{body}</OrderShell> : <AdminShell role={account!.role} permissions={account!.permissions} name={account!.name} jobTitle={account!.jobTitle}>{body}</AdminShell>}</Boundary></main></>;
}
createRoot(document.getElementById('app')!).render(<App />);
