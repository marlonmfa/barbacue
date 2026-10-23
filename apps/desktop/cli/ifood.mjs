#!/usr/bin/env node
// CLI do Gestor iFood. Fala com o servidor da loja pelas mesmas rotas do painel
// web (/api/admin/ifood); o segredo do iFood continua só no servidor. Sem
// dependências: roda com Node 18+ ou com o Electron do Barbacue Pedidos
// (ELECTRON_RUN_AS_NODE=1), que é como o instalador Windows o executa.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

export const VERSION = '1.0.0';
export const DEFAULT_SERVER = 'https://barbacue.cog.ia.br';
const COOKIE = 'barbacue_admin';

export const ACTIONS = {
  confirmar: 'confirm',
  preparar: 'startPreparation',
  pronto: 'readyToPickup',
  despachar: 'dispatch',
  cancelar: 'cancel',
};
export const ACTION_LABEL = { confirm: 'Confirmar', startPreparation: 'Iniciar preparo', readyToPickup: 'Pronto p/ retirada', dispatch: 'Saiu p/ entrega', cancel: 'Cancelar' };
const ACTION_COMMAND = Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [v, k]));
export const STATUS_LABEL = { pending: 'Aguardando confirmação', confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Pronto / despachado', delivered: 'Concluído', cancelled: 'Cancelado' };
const STATUS_ALIASES = { novos: ['pending'], novo: ['pending'], pendentes: ['pending'], preparo: ['confirmed', 'preparing'], prontos: ['ready'], concluidos: ['delivered', 'cancelled'], ativos: ['pending', 'confirmed', 'preparing', 'ready'] };
const STATE_LABEL = { OK: 'Aberta', WARNING: 'Aberta com alerta', CLOSED: 'Fechada', ERROR: 'Com problema', UNAVAILABLE: 'Status indisponível' };
const TYPE_LABEL = { delivery: 'Entrega', pickup: 'Retirada', dine_in: 'No local' };

export class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

// ─── Configuração local ────────────────────────────────────────────────────────

export function configDir(env = process.env, os = platform()) {
  if (env.BARBACUE_IFOOD_HOME) return env.BARBACUE_IFOOD_HOME;
  if (os === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Barbacue Pedidos');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'barbacue-pedidos');
}
const configFile = env => join(configDir(env), 'ifood-cli.json');

export async function loadConfig(env = process.env) {
  try { return JSON.parse(await readFile(configFile(env), 'utf8')); } catch { return {}; }
}
export async function saveConfig(config, env = process.env) {
  const file = configFile(env);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function normalizeServer(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new CliError('Informe o endereço completo do servidor, começando com https://.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new CliError('O servidor precisa usar HTTPS.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new CliError('Use somente o endereço do servidor, sem caminho, senha ou parâmetros.');
  return url.origin;
}

// Senha guardada (opcional, --lembrar) protegida pelo DPAPI do Windows: só o
// mesmo usuário no mesmo computador consegue ler. Fora do Windows não guardamos.
function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20_000 }, (error, stdout) => {
      if (error) reject(new CliError('Não foi possível usar a proteção de senha do Windows.')); else resolve(stdout.trim());
    });
    child.stdin.end(input);
  });
}
const DPAPI = 'Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd().Trim();';
export const protectSecret = text => powershell(`${DPAPI} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($in), $null, 'CurrentUser'))`, text);
export const unprotectSecret = blob => powershell(`${DPAPI} [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in), $null, 'CurrentUser'))`, blob);

// ─── Cliente HTTP do servidor ──────────────────────────────────────────────────

export class Api {
  constructor({ server, cookie = '', relogin = null, fetchImpl = globalThis.fetch }) {
    this.server = server; this.cookie = cookie; this.relogin = relogin; this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET', body } = {}, retry = true) {
    let res;
    try {
      res = await this.fetch(`${this.server}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(this.cookie ? { Cookie: `${COOKIE}=${this.cookie}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      throw new CliError(`Sem conexão com ${this.server} (${cause?.cause?.code ?? cause?.name ?? 'erro de rede'}). Confira a internet.`, 3);
    }
    if (res.status === 401 && retry && this.relogin) {
      this.cookie = await this.relogin();
      return this.request(path, { method, body }, false);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new CliError('Sessão expirada ou ausente. Rode: ifood login', 4);
    if (!res.ok) throw new CliError(typeof data.error === 'string' ? data.error : `O servidor respondeu ${res.status}.`, res.status === 403 ? 5 : 1);
    return data;
  }

  async login(username, password) {
    let res;
    try {
      res = await this.fetch(`${this.server}/api/admin/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username ?? '', password }), signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      throw new CliError(`Sem conexão com ${this.server} (${cause?.cause?.code ?? cause?.name ?? 'erro de rede'}).`, 3);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new CliError(typeof data.error === 'string' ? data.error : `Login recusado (${res.status}).`, 4);
    const cookie = readSessionCookie(res.headers);
    if (!cookie) throw new CliError('O servidor não devolveu a sessão.', 4);
    this.cookie = cookie;
    return { cookie, role: data.role };
  }

  overview() { return this.request('/api/admin/ifood'); }
  orderDetails(id) { return this.request(`/api/admin/ifood/orders/${id}`).then(d => d.order); }
  cancellationReasons(id) { return this.request(`/api/admin/ifood/orders/${id}?reasons=1`).then(d => d.reasons ?? []); }
  action(id, action, extra = {}) { return this.request(`/api/admin/ifood/orders/${id}`, { method: 'POST', body: { action, ...extra } }); }
  pause(storeId, minutes, description) { return this.request(`/api/admin/ifood/stores/${storeId}`, { method: 'POST', body: { minutes, description } }); }
  resume(storeId, interruptionId) { return this.request(`/api/admin/ifood/stores/${storeId}?interruption=${encodeURIComponent(interruptionId)}`, { method: 'DELETE' }); }
}

export function readSessionCookie(headers) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') ?? ''];
  for (const line of list) {
    const match = line.match(new RegExp(`(?:^|,\\s*)${COOKIE}=([^;]+)`));
    if (match && match[1]) return match[1];
  }
  return null;
}

// ─── Regras de seleção (puras, testadas) ───────────────────────────────────────

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Aceita id, nome, marca ou início do nome; recusa ambiguidade. */
export function findStore(stores, query) {
  const q = norm(query);
  if (!q) throw new CliError('Informe a loja (nome, marca ou id). Veja: ifood lojas');
  const aliases = { hotdog: 'barbadog', dog: 'barbadog', barbadog: 'barbadog' };
  const exact = stores.filter(s => norm(s.id) === q || norm(s.name) === q || norm(s.brand) === q || aliases[q] === s.brand);
  if (exact.length === 1) return exact[0];
  const partial = stores.filter(s => norm(s.name).startsWith(q) || norm(s.id).startsWith(q));
  if (partial.length === 1) return partial[0];
  if (exact.length + partial.length > 1) throw new CliError(`"${query}" corresponde a mais de uma loja: ${[...new Set([...exact, ...partial])].map(s => s.name).join(', ')}.`);
  throw new CliError(`Loja "${query}" não encontrada. Lojas: ${stores.map(s => s.name).join(', ')}.`);
}

/** Aceita o código curto do iFood (#1234), o id do iFood, o id local ou o início dele. */
export function findOrder(orders, query) {
  const q = norm(query).replace(/^#/, '');
  if (!q) throw new CliError('Informe o pedido (código do iFood ou id). Veja: ifood pedidos');
  const exact = orders.filter(o => norm(o.displayId) === q || norm(o.externalId) === q || norm(o.id) === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new CliError(`"${query}" corresponde a mais de um pedido; use o id completo.`);
  const partial = q.length >= 4 ? orders.filter(o => norm(o.id).startsWith(q) || norm(o.externalId).startsWith(q)) : [];
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new CliError(`"${query}" corresponde a mais de um pedido; use mais caracteres.`);
  throw new CliError(`Pedido "${query}" não encontrado nas últimas 24 h nem entre os ativos.`, 2);
}

export function filterOrders(orders, { store, status } = {}) {
  let list = orders;
  if (store) list = list.filter(o => o.storeId === store.id);
  if (status) {
    const wanted = STATUS_ALIASES[norm(status)] ?? [status];
    list = list.filter(o => wanted.includes(o.status));
  }
  return list;
}

export function mainState(store) {
  if (store.forbidden) return 'UNAVAILABLE';
  const main = store.status?.find(s => s.operation === 'DELIVERY') ?? store.status?.[0];
  return main?.state ?? (store.error ? 'UNAVAILABLE' : '—');
}

// ─── Formatação ────────────────────────────────────────────────────────────────

export const money = cents => `R$ ${((cents ?? 0) / 100).toFixed(2).replace('.', ',')}`;
const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '—';
const ago = (iso, now = Date.now()) => iso ? `${Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))} min` : '';
const pad = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };
const storeName = (stores, id) => stores.find(s => s.id === id)?.name ?? 'Loja?';
export const orderCode = o => o.displayId ? `#${o.displayId}` : o.id.slice(0, 8);

export function formatStores(data) {
  const lines = [];
  if (!data.configured) lines.push('! Credenciais do iFood não configuradas no servidor.');
  if (data.dryRun) lines.push('! Modo simulação (IFOOD_DRY_RUN): ações não chegam ao iFood.');
  for (const s of data.stores) {
    const active = data.orders.filter(o => o.storeId === s.id && ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length;
    const state = mainState(s);
    lines.push(`${pad(s.name, 10)} ${pad(STATE_LABEL[state] ?? state, 20)} ${active} pedido(s) ativo(s)   ${s.id}`);
    if (s.error) lines.push(`           ${s.error}`);
    for (const i of s.interruptions ?? []) lines.push(`           Pausa ${i.id}: ${i.description ?? ''} (${i.start ?? '?'} até ${i.end ?? '?'})`);
  }
  return lines.join('\n');
}

export function formatOrders(orders, stores, now = Date.now()) {
  if (!orders.length) return 'Nenhum pedido.';
  return orders.map(o => [
    pad(orderCode(o), 10), pad(storeName(stores, o.storeId), 9), pad(hhmm(o.createdAt), 6), pad(ago(o.createdAt, now), 8),
    pad(STATUS_LABEL[o.status] ?? o.status, 23), pad(TYPE_LABEL[o.orderType] ?? o.orderType, 9), pad(money(o.totalCents), 11), pad(o.customerName, 22),
    o.actions?.length ? `→ ${o.actions.map(a => ACTION_COMMAND[a]).join(', ')}` : '',
  ].join(' ').trimEnd()).join('\n');
}

export function formatOrder(o, stores) {
  const lines = [
    `Pedido ${orderCode(o)} — ${storeName(stores, o.storeId)}`,
    `Etapa:      ${STATUS_LABEL[o.status] ?? o.status}`,
    `Tipo:       ${TYPE_LABEL[o.orderType] ?? o.orderType}${o.deliveryAddress ? ` — ${o.deliveryAddress}` : ''}`,
    `Cliente:    ${o.customerName}${o.customerPhone ? ` (${o.customerPhone})` : ''}`,
    `Recebido:   ${o.createdAt ? new Date(o.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}`,
    `Pagamento:  ${o.paymentMethod ?? '—'}${o.paymentStatus ? ` (${o.paymentStatus})` : ''}`,
    'Itens:',
    ...(o.items ?? []).map(i => `  ${i.qty}x ${i.name}  ${money(i.priceCents * i.qty)}${i.notes ? `\n     obs: ${i.notes}` : ''}`),
    `Subtotal:   ${money(o.subtotalCents ?? 0)}   Desconto: ${money(o.discountCents ?? 0)}   Entrega: ${money(o.deliveryFeeCents)}`,
    `Total:      ${money(o.totalCents)}`,
    `Id local:   ${o.id}`,
    `Id iFood:   ${o.externalId ?? '—'}`,
    `Ações:      ${o.actions?.length ? o.actions.map(a => `${ACTION_COMMAND[a]} (${ACTION_LABEL[a]})`).join(', ') : 'nenhuma nesta etapa'}`,
  ];
  return lines.join('\n');
}

// ─── Argumentos ────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const positional = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      const boolean = ['json', 'lembrar', 'som', 'sem-som', 'ifood', 'todos', 'sim', 'senha-stdin', 'help', 'versao', 'uma-vez'].includes(key);
      if (inline !== undefined) flags[key] = inline;
      else if (boolean) flags[key] = true;
      else if (i + 1 < argv.length) flags[key] = argv[++i];
      else throw new CliError(`Falta o valor de --${key}.`);
    } else if (arg === '-h') flags.help = true;
    else if (arg === '-v') flags.versao = true;
    else positional.push(arg);
  }
  return { command: positional[0], args: positional.slice(1), flags };
}

export const HELP = `ifood ${VERSION} — Gestor iFood das lojas Barbacue (Barbacue, Hotdog, Chelas)

Uso: ifood <comando> [opções]

Conta
  login [--usuario U] [--servidor URL] [--lembrar] [--senha-stdin]
                              Entra com o usuário da equipe (o mesmo do painel).
                              --lembrar guarda a senha protegida pelo Windows
                              para renovar a sessão sozinho (útil no monitorar).
  logout                      Sai e apaga a sessão e a senha guardada.
  status                      Servidor, usuário, credenciais iFood e modo simulação.

Lojas
  lojas                       Situação das 3 lojas no iFood, pausas e pedidos ativos.
  pausar <loja> [--minutos 30] [--motivo "texto"]
                              Fecha a loja no iFood por um tempo (5 min a 24 h).
  reabrir <loja> [--pausa ID] Remove a pausa (a única ativa, ou a indicada).

Pedidos
  pedidos [--loja L] [--status novos|preparo|prontos|concluidos|ativos|<etapa>]
                              Pedidos ativos e das últimas 24 h.
  pedido <código>  [--ifood]  Detalhes; --ifood traz os dados atuais do iFood.
  confirmar <código>          Confirma o pedido no iFood.
  preparar <código>           Inicia o preparo.
  pronto <código>             Pronto para retirada (pedidos de retirada).
  despachar <código>          Saiu para entrega (pedidos de entrega).
  motivos <código>            Motivos de cancelamento aceitos pelo iFood.
  cancelar <código> --motivo CÓDIGO [--texto "explicação"] [--sim]
                              Solicita o cancelamento ao iFood.
  monitorar [--loja L] [--intervalo 10] [--sem-som] [--uma-vez]
                              Acompanha ao vivo e avisa (bipe) quando chega pedido novo.

Outros
  diagnostico                 Testa conexão, login e acesso ao gestor.
  ajuda | --help              Esta ajuda.   versao | -v   Versão.

Opções gerais: --json (saída para scripts), --servidor URL.
<loja>: Barbacue, Hotdog (Barbadog), Chelas, ou o id. <código>: #código do iFood,
id do iFood ou id local (pode abreviar com os primeiros caracteres).
Variáveis: BARBACUE_SERVER, BARBACUE_USER, BARBACUE_PASSWORD (login automático).
Saída: 0 ok, 1 erro, 2 não encontrado, 3 sem conexão, 4 sem login, 5 sem permissão.`;

// ─── Execução ──────────────────────────────────────────────────────────────────

async function prompt(question, { hidden = false, input = process.stdin, output = process.stderr } = {}) {
  if (hidden && input.isTTY) {
    output.write(question);
    return new Promise((resolve, reject) => {
      let value = '';
      input.setRawMode(true); input.resume(); input.setEncoding('utf8');
      const onData = chunk => {
        for (const ch of chunk) {
          if (ch === '\r' || ch === '\n') { done(); return resolve(value); }
          if (ch === '\u0003') { done(); return reject(new CliError('Cancelado.', 130)); }
          if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); else value += ch;
        }
      };
      const done = () => { input.setRawMode(false); input.pause(); input.off('data', onData); output.write('\n'); };
      input.on('data', onData);
    });
  }
  const rl = createInterface({ input, output });
  try { return await new Promise(resolve => rl.question(question, resolve)); } finally { rl.close(); }
}

async function readStdin(input = process.stdin) {
  let text = '';
  for await (const chunk of input) text += chunk;
  return text.replace(/\r?\n$/, '');
}

export function createContext({ env = process.env, fetchImpl = globalThis.fetch, out = s => process.stdout.write(`${s}\n`), err = s => process.stderr.write(`${s}\n`), sleep = ms => new Promise(r => setTimeout(r, ms)), beep = () => process.stderr.write('\u0007'), io = {} } = {}) {
  return { env, fetchImpl, out, err, sleep, beep, io };
}

async function openApi(ctx, flags, config) {
  const server = normalizeServer(flags.servidor ?? ctx.env.BARBACUE_SERVER ?? config.server ?? DEFAULT_SERVER);
  const sameServer = config.server === server;
  const api = new Api({ server, cookie: sameServer ? config.cookie ?? '' : '', fetchImpl: ctx.fetchImpl });
  const username = ctx.env.BARBACUE_USER ?? (sameServer ? config.username : undefined);
  const envPassword = ctx.env.BARBACUE_PASSWORD;
  if (envPassword || (sameServer && config.protectedPassword)) {
    api.relogin = async () => {
      const password = envPassword ?? await (ctx.io.unprotect ?? unprotectSecret)(config.protectedPassword);
      const { cookie } = await api.login(username, password);
      await saveConfig({ ...config, server, cookie, savedAt: new Date().toISOString() }, ctx.env);
      return cookie;
    };
    if (!api.cookie) api.cookie = await api.relogin();
  }
  if (!api.cookie) throw new CliError('Você ainda não entrou. Rode: ifood login', 4);
  return api;
}

function print(ctx, flags, data, text) {
  ctx.out(flags.json ? JSON.stringify(data, null, 2) : text);
}

async function orderFromArgs(api, args) {
  if (!args[0]) throw new CliError('Informe o pedido. Exemplo: ifood confirmar #1234');
  const data = await api.overview();
  return { data, order: findOrder(data.orders, args[0]) };
}

export async function run(argv, ctx = createContext()) {
  const { command = 'ajuda', args, flags } = parseArgs(argv);
  if (flags.versao || command === 'versao') { ctx.out(VERSION); return 0; }
  if (flags.help || ['ajuda', 'help'].includes(command)) { ctx.out(HELP); return 0; }
  const config = await loadConfig(ctx.env);

  switch (command) {
    case 'login': {
      const server = normalizeServer(flags.servidor ?? ctx.env.BARBACUE_SERVER ?? config.server ?? DEFAULT_SERVER);
      const username = flags.usuario ?? ctx.env.BARBACUE_USER ?? await (ctx.io.prompt ?? prompt)(`Usuário em ${server} (vazio = senha mestre): `);
      const password = flags['senha-stdin'] ? await (ctx.io.readStdin ?? readStdin)() : ctx.env.BARBACUE_PASSWORD ?? await (ctx.io.prompt ?? prompt)('Senha: ', { hidden: true });
      if (!password) throw new CliError('Informe a senha.');
      const api = new Api({ server, fetchImpl: ctx.fetchImpl });
      const { cookie, role } = await api.login(username?.trim() || undefined, password);
      const next = { server, username: username?.trim() || undefined, cookie, savedAt: new Date().toISOString() };
      if (flags.lembrar) next.protectedPassword = await (ctx.io.protect ?? protectSecret)(password);
      await saveConfig(next, ctx.env);
      print(ctx, flags, { ok: true, server, role, remembered: Boolean(flags.lembrar) }, `Conectado em ${server} como ${next.username ?? 'administrador'} (${role}).${flags.lembrar ? ' Senha guardada com proteção do Windows.' : ' A sessão vale 8 horas.'}`);
      return 0;
    }
    case 'logout': {
      if (config.server && config.cookie) {
        await ctx.fetchImpl(`${config.server}/api/admin/auth`, { method: 'DELETE', headers: { Cookie: `${COOKIE}=${config.cookie}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
      }
      await rm(configFile(ctx.env), { force: true });
      print(ctx, flags, { ok: true }, 'Sessão encerrada neste computador.');
      return 0;
    }
    case 'status': case 'diagnostico': {
      const server = normalizeServer(flags.servidor ?? ctx.env.BARBACUE_SERVER ?? config.server ?? DEFAULT_SERVER);
      const report = { version: VERSION, server, user: config.username ?? (config.cookie ? 'administrador' : null), rememberedPassword: Boolean(config.protectedPassword), configFile: configFile(ctx.env) };
      try {
        const api = await openApi(ctx, flags, config);
        const data = await api.overview();
        Object.assign(report, { ok: true, ifoodConfigured: data.configured, dryRun: data.dryRun, stores: data.stores.map(s => ({ name: s.name, state: mainState(s), error: s.error })), orders: data.orders.length });
      } catch (error) {
        Object.assign(report, { ok: false, error: error.message });
        if (command === 'status' || !flags.json) {
          print(ctx, flags, report, `Servidor: ${server}\nUsuário:  ${report.user ?? '—'}\nFalha:    ${error.message}`);
          return error.code ?? 1;
        }
      }
      print(ctx, flags, report, [
        `CLI:        ${VERSION}`, `Servidor:   ${server}`, `Usuário:    ${report.user ?? '—'}${report.rememberedPassword ? ' (renova sozinho)' : ''}`,
        `iFood:      ${report.ifoodConfigured ? 'credenciais configuradas' : 'SEM credenciais no servidor'}`,
        `Modo:       ${report.dryRun ? 'SIMULAÇÃO (ações não chegam ao iFood)' : 'real'}`,
        `Lojas:      ${report.stores.map(s => `${s.name} ${STATE_LABEL[s.state] ?? s.state}`).join(' · ')}`,
        `Pedidos:    ${report.orders} nas últimas 24 h/ativos`,
        `Config:     ${report.configFile}`,
      ].join('\n'));
      return report.ok ? 0 : 1;
    }
    case 'lojas': {
      const data = await (await openApi(ctx, flags, config)).overview();
      print(ctx, flags, { configured: data.configured, dryRun: data.dryRun, stores: data.stores }, formatStores(data));
      return 0;
    }
    case 'pedidos': {
      const data = await (await openApi(ctx, flags, config)).overview();
      const store = flags.loja ? findStore(data.stores, flags.loja) : null;
      const list = filterOrders(data.orders, { store, status: flags.status });
      print(ctx, flags, list, formatOrders(list, data.stores));
      return 0;
    }
    case 'pedido': {
      const api = await openApi(ctx, flags, config);
      const { data, order } = await orderFromArgs(api, args);
      const remote = flags.ifood ? await api.orderDetails(order.id) : undefined;
      print(ctx, flags, remote !== undefined ? { ...order, ifood: remote } : order,
        formatOrder(order, data.stores) + (remote !== undefined ? `\n\nNo iFood agora:\n${JSON.stringify(remote, null, 2)}` : ''));
      return 0;
    }
    case 'confirmar': case 'preparar': case 'pronto': case 'despachar': {
      const api = await openApi(ctx, flags, config);
      const { order } = await orderFromArgs(api, args);
      const action = ACTIONS[command];
      if (!order.actions?.includes(action)) {
        const options = order.actions?.length ? `Ações possíveis: ${order.actions.map(a => ACTION_COMMAND[a]).join(', ')}.` : 'Não há ações para esta etapa.';
        throw new CliError(`${ACTION_LABEL[action]} não vale para o pedido ${orderCode(order)} (${STATUS_LABEL[order.status] ?? order.status}). ${options}`);
      }
      await api.action(order.id, action);
      print(ctx, flags, { ok: true, order: order.id, action }, `${ACTION_LABEL[action]} enviado ao iFood para ${orderCode(order)}. A etapa muda quando o iFood confirmar.`);
      return 0;
    }
    case 'motivos': {
      const api = await openApi(ctx, flags, config);
      const { order } = await orderFromArgs(api, args);
      const reasons = await api.cancellationReasons(order.id);
      print(ctx, flags, reasons, reasons.length ? reasons.map(r => `${pad(r.cancelCodeId, 6)} ${r.description}`).join('\n') : 'O iFood não informou motivos para este pedido.');
      return 0;
    }
    case 'cancelar': {
      const api = await openApi(ctx, flags, config);
      const { order } = await orderFromArgs(api, args);
      if (!order.actions?.includes('cancel')) throw new CliError(`O pedido ${orderCode(order)} não pode ser cancelado nesta etapa (${STATUS_LABEL[order.status] ?? order.status}).`);
      const reasons = await api.cancellationReasons(order.id);
      if (!flags.motivo) {
        throw new CliError(`Escolha o motivo com --motivo CÓDIGO:\n${reasons.map(r => `  ${pad(r.cancelCodeId, 6)} ${r.description}`).join('\n') || '  (o iFood não informou motivos)'}`);
      }
      const reason = reasons.find(r => String(r.cancelCodeId) === String(flags.motivo));
      if (!reason) throw new CliError(`Motivo ${flags.motivo} não aceito pelo iFood para este pedido. Veja: ifood motivos ${args[0]}`);
      if (!flags.sim) {
        const answer = await (ctx.io.prompt ?? prompt)(`Cancelar ${orderCode(order)} de ${order.customerName} (${money(order.totalCents)}) por "${reason.description}"? Digite SIM: `);
        if (answer.trim().toUpperCase() !== 'SIM') throw new CliError('Cancelamento não enviado.');
      }
      const text = String(flags.texto ?? reason.description).trim().slice(0, 250);
      await api.action(order.id, 'cancel', { cancellationCode: String(reason.cancelCodeId), reason: text });
      print(ctx, flags, { ok: true, order: order.id, action: 'cancel', cancellationCode: reason.cancelCodeId }, `Cancelamento de ${orderCode(order)} solicitado ao iFood.`);
      return 0;
    }
    case 'pausar': {
      const api = await openApi(ctx, flags, config);
      const data = await api.overview();
      const store = findStore(data.stores, args[0] ?? flags.loja);
      const minutes = Number(flags.minutos ?? 30);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) throw new CliError('Use de 5 a 1440 minutos.');
      const description = String(flags.motivo ?? 'Pausa pelo CLI Barbacue').trim().slice(0, 100);
      const result = await api.pause(store.id, minutes, description);
      print(ctx, flags, { ok: true, store: store.id, ...result }, `${store.name} pausada no iFood por ${minutes} min${result.interruption?.id ? ` (pausa ${result.interruption.id})` : ''}.`);
      return 0;
    }
    case 'reabrir': {
      const api = await openApi(ctx, flags, config);
      const data = await api.overview();
      const store = findStore(data.stores, args[0] ?? flags.loja);
      const interruptions = store.interruptions ?? [];
      let id = flags.pausa;
      if (!id) {
        if (store.interruptions === null) throw new CliError(`Não foi possível ler as pausas de ${store.name}${store.error ? `: ${store.error}` : '.'} Informe --pausa ID.`);
        if (interruptions.length === 0) throw new CliError(`${store.name} não tem pausa ativa no iFood.`, 2);
        if (interruptions.length > 1) throw new CliError(`${store.name} tem ${interruptions.length} pausas; informe --pausa com um destes ids: ${interruptions.map(i => i.id).join(', ')}.`);
        id = interruptions[0].id;
      }
      await api.resume(store.id, id);
      print(ctx, flags, { ok: true, store: store.id, interruption: id }, `${store.name} reaberta no iFood.`);
      return 0;
    }
    case 'monitorar': {
      const api = await openApi(ctx, flags, config);
      const interval = Math.max(5, Number(flags.intervalo ?? 10)) * 1000;
      const sound = !flags['sem-som'];
      let known = null; let failures = 0; let filterStore = null;
      for (;;) {
        try {
          const data = await api.overview();
          if (flags.loja && !filterStore) filterStore = findStore(data.stores, flags.loja);
          const orders = filterOrders(data.orders, { store: filterStore });
          const pending = orders.filter(o => o.status === 'pending');
          const stamp = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          if (known === null) {
            ctx.out(flags.json ? JSON.stringify({ type: 'snapshot', at: new Date().toISOString(), pending: pending.length, orders: orders.length }) : `[${stamp}] Monitorando ${filterStore ? filterStore.name : 'as lojas'} a cada ${interval / 1000}s. ${pending.length} pedido(s) aguardando confirmação.`);
            if (!flags.json && pending.length) ctx.out(formatOrders(pending, data.stores));
          } else {
            const fresh = pending.filter(o => !known.has(o.id));
            for (const o of fresh) ctx.out(flags.json ? JSON.stringify({ type: 'new_order', order: o }) : `[${stamp}] NOVO PEDIDO ${orderCode(o)} — ${storeName(data.stores, o.storeId)} — ${o.customerName} — ${money(o.totalCents)} — confirme: ifood confirmar ${orderCode(o)}`);
            if (fresh.length && sound) ctx.beep();
            for (const o of orders) {
              const before = known.get(o.id);
              if (before && before !== o.status) ctx.out(flags.json ? JSON.stringify({ type: 'status', order: o.id, from: before, to: o.status }) : `[${stamp}] ${orderCode(o)} ${STATUS_LABEL[before] ?? before} → ${STATUS_LABEL[o.status] ?? o.status}`);
            }
          }
          known = new Map(orders.map(o => [o.id, o.status]));
          if (failures) { ctx.err(`[${stamp}] Conexão restabelecida.`); failures = 0; }
        } catch (error) {
          if (error.code === 4 || error.code === 5 || flags['uma-vez']) throw error;
          failures++;
          ctx.err(`Falha ao consultar (${failures}): ${error.message}`);
        }
        if (flags['uma-vez']) return 0;
        await ctx.sleep(interval);
      }
    }
    default:
      throw new CliError(`Comando desconhecido: ${command}. Veja: ifood ajuda`);
  }
}

export async function main(argv = process.argv.slice(2), ctx = createContext()) {
  try { return await run(argv, ctx); }
  catch (error) {
    if (error instanceof CliError) { ctx.err(`Erro: ${error.message}`); return error.code; }
    ctx.err(`Erro inesperado: ${error?.stack ?? error}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; });
}
