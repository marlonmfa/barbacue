const { ifoodReceiptReferences } = require('../../print-agent/src/ifood-references.cjs');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { Pool } = require('pg');
const sharp = require(process.env.BARBACUE_COMPARISON_SHARP_MODULE || 'sharp');

const ROOT = resolve(__dirname, '../../..');
const CUTOFF = process.env.BARBACUE_COMPARISON_CUTOFF || '2026-11-12T23:31:00.000Z';
const ZAP_BASE = String(process.env.BARBACUE_COMPARISON_ZAP_BASE_URL || 'https://zap.cog.ia.br/api/v1').replace(/\/$/, '');
const SESSION_NAME = process.env.BARBACUE_COMPARISON_ZAP_SESSION || 'Iphone';
const GROUP_NAME = process.env.BARBACUE_COMPARISON_ZAP_GROUP || 'Barbacue Sistema';
const POLL_MS = Math.max(15_000, Number(process.env.BARBACUE_COMPARISON_POLL_MS || 30_000));
const PROMO_PATH = process.env.BARBACUE_COMPARISON_PROMO_PATH || resolve(ROOT, 'apps/desktop/assets/thermal-logos/barbacue-customer-promo.png');
const BRAND_NAMES = { barbacue: 'BARBACUE', chelas: 'CHELAS', barbadog: 'BARBADOG' };
const CHANNEL_NAMES = { ifood: 'iFood', anotaai: 'Anota Ai' };

const xml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const clean = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[^\x20-\x7e]/g, '?').replace(/\s+/g, ' ').trim();
const money = cents => `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
const localTime = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

function wrap(value, width = 48, indent = '') {
  const limit = Math.max(1, width - indent.length);
  const words = clean(value).split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    if (line && line.length + word.length + 1 > limit) { lines.push(indent + line); line = ''; }
    while (word.length > limit) { lines.push(indent + word.slice(0, limit)); word = word.slice(limit); }
    if (word) line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(indent + line);
  return lines;
}

function orderReference(order) {
  const reference = order.channel === 'ifood' ? ifoodReceiptReferences(order.notes).displayId : order.notes?.match(/(?:iFood|Anota AI) #([^\n]+)/i)?.[1]?.trim();
  return reference || order.id.slice(0, 8).toUpperCase();
}

function externalOrderId(order) {
  return order.notes?.match(/^Pedido externo:\s*([^\n]+)/im)?.[1]?.trim() || null;
}

function publicItems(order) {
  return Array.isArray(order.items) ? order.items.map(item => ({
    brand: Object.hasOwn(BRAND_NAMES, item.brand) ? item.brand : order.brand,
    qty: Number(item.qty ?? item.quantity ?? 0),
    name: clean(item.name),
    notes: item.notes || item.observations ? clean(item.notes || item.observations) : null,
    components: Array.isArray(item.components) ? item.components.map(component => ({
      qty: Number(component.qty ?? component.quantity ?? 0),
      name: clean(component.name),
    })).filter(component => component.qty > 0 && component.name) : [],
  })).filter(item => item.qty > 0 && item.name) : [];
}

function commonLines(order, label) {
  const type = order.order_type === 'delivery' ? 'ENTREGA' : order.order_type === 'dine_in' ? 'NO LOCAL' : 'BALCAO / RETIRADA';
  const identifiers = [];
  if (order.channel === 'ifood') {
    const { displayId, localizer } = ifoodReceiptReferences(order.notes);
    identifiers.push(`ID DO PEDIDO: ${order.id.slice(0, 8).toUpperCase()}`);
    if (displayId) identifiers.push(...wrap(`PEDIDO IFOOD: #${displayId}`));
    if (localizer) identifiers.push(`LOCALIZADOR IFOOD: ${localizer}`);
  }
  return [label, type, ...wrap(`Origem: ${CHANNEL_NAMES[order.channel] || clean(order.channel)}`), ...identifiers, ...wrap(`Cliente: ${clean(order.customer_name || 'Nao informado')}`), ...(order.order_type === 'delivery' ? [...wrap(`Telefone: ${clean(order.customer_phone || 'Nao informado')}`), ...wrap(`Endereco: ${clean(order.delivery_address || 'Nao informado')}`)] : []), localTime(order.created_at), '-'.repeat(48)];
}

function itemLines(items) {
  const lines = [];
  for (const item of items) {
    lines.push(...wrap(`${item.qty}x ${item.name}`));
    for (const component of item.components ?? []) {
      lines.push(...wrap(`- ${component.qty > 1 ? `${component.qty}x ` : ''}${component.name}`, 48, '  '));
    }
    if (item.notes) lines.push(...wrap(`OBS: ${item.notes}`, 48, '  '));
    lines.push('');
  }
  return lines;
}

function externalLines(order, items) {
  return [CHANNEL_NAMES[order.channel] || clean(order.channel), BRAND_NAMES[order.brand] || clean(order.brand), 'COMANDA RECEBIDA', '-'.repeat(48), `PEDIDO #${orderReference(order)}`, ...commonLines(order, '').slice(1), `ITENS DO PEDIDO (${items.length})`, ...itemLines(items), '-'.repeat(48), `Subtotal: ${money(order.subtotal_cents)}`, `Desconto: ${money(order.discount_cents)}`, `Frete: ${money(order.delivery_fee_cents)}`, `TOTAL: ${money(order.total_cents)}`];
}

function kitchenLines(order, brand, items) {
  return [`${BRAND_NAMES[brand]} PEDIDO #${order.id.slice(0, 8).toUpperCase()}`, 'COZINHA', ...commonLines(order, '').slice(1), ...itemLines(items), '-'.repeat(48), `TOTAL: ${money(order.total_cents)}`, order.payment_status === 'paid' ? 'PAGO' : 'PAGAMENTO PENDENTE', `Forma: ${CHANNEL_NAMES[order.channel] || clean(order.payment_method || 'Nao informada')}`, 'NAO E COMPROVANTE DE PAGAMENTO'];
}

function customerLines(order, items) {
  const lines = ['VIA DO CLIENTE', `PEDIDO #${order.id.slice(0, 8).toUpperCase()}`, ...commonLines(order, '').slice(1)];
  for (const brand of [...new Set(items.map(item => item.brand))]) lines.push(BRAND_NAMES[brand], '-'.repeat(48), ...itemLines(items.filter(item => item.brand === brand)));
  lines.push('-'.repeat(48), `Subtotal: ${money(order.subtotal_cents)}`, `Desconto: ${money(order.discount_cents)}`, `Frete: ${money(order.delivery_fee_cents)}`, `TOTAL: ${money(order.total_cents)}`, order.payment_status === 'paid' ? 'PAGO' : 'PAGAMENTO PENDENTE', `Forma: ${CHANNEL_NAMES[order.channel] || clean(order.payment_method || 'Nao informada')}`, 'NAO E COMPROVANTE DE PAGAMENTO');
  return lines;
}

function textBlock(lines, x, y, { headline = false } = {}) {
  const body = headline ? lines.slice(1) : lines;
  const first = headline ? `<text x="${x}" y="${y}" class="mono headline" transform="translate(0 ${y}) scale(1 2) translate(0 ${-y})">${xml(lines[0])}</text>` : '';
  const start = y + (headline ? 27 : 0);
  return first + body.map((line, index) => `<text x="${x}" y="${start + index * 14}" class="mono">${xml(line || ' ')}</text>`).join('');
}

async function renderComparison(order) {
  const items = publicItems(order);
  if (!items.length) throw new Error('Pedido sem itens validos para a comparacao');
  const brands = [...new Set(items.map(item => item.brand))];
  if (brands.some(brand => !Object.hasOwn(BRAND_NAMES, brand))) throw new Error('Pedido com restaurante desconhecido');
  const promo = (await readFile(PROMO_PATH)).toString('base64');
  const columns = [
    { title: 'Via externa unica', subtitle: `${CHANNEL_NAMES[order.channel]} reconstruida`, lines: externalLines(order, items) },
    ...brands.map(brand => ({ title: `Cozinha ${BRAND_NAMES[brand]}`, subtitle: 'Largura normal, altura dupla', lines: kitchenLines(order, brand, items), headline: true })),
    { title: 'Via combinada do cliente', subtitle: 'Logo e QR na faixa segura', lines: customerLines(order, items), promo: true },
  ];
  const margin = 22, gap = 18, paperWidth = 360, safe = 300, paperTop = 205;
  const width = margin * 2 + columns.length * paperWidth + (columns.length - 1) * gap;
  const contentHeights = columns.map(col => (col.promo ? 132 : 0) + col.lines.length * 14 + (col.headline ? 15 : 0) + 52);
  const paperHeight = Math.max(640, ...contentHeights);
  const height = paperTop + paperHeight + 44;
  const cards = columns.map((col, index) => {
    const x = margin + index * (paperWidth + gap), safeX = x + 30;
    const promoBlock = col.promo ? `<image href="data:image/png;base64,${promo}" x="${safeX}" y="${paperTop + 22}" width="${safe}" height="112" preserveAspectRatio="xMidYMid meet"/><line x1="${safeX}" x2="${safeX + safe}" y1="${paperTop + 140}" y2="${paperTop + 140}" class="dash"/>` : '';
    const textY = paperTop + (col.promo ? 162 : 30);
    return `<text x="${x + paperWidth / 2}" y="160" class="coltitle" text-anchor="middle">${xml(`${index + 1}. ${col.title}`)}</text><text x="${x + paperWidth / 2}" y="185" class="subtitle" text-anchor="middle">${xml(col.subtitle)}</text><rect x="${x}" y="${paperTop}" width="${paperWidth}" height="${paperHeight}" rx="1" class="paper"/>${promoBlock}${textBlock(col.lines, safeX, textY, { headline: col.headline })}`;
  }).join('');
  const title = `Pedido ${CHANNEL_NAMES[order.channel]} #${orderReference(order)} - comparacao digital`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>.bg{fill:#d9d4cb}.head{fill:#172e28}.title{fill:#fff;font:700 24px Arial}.meta{fill:#dce9e3;font:16px Arial}.coltitle{fill:#171717;font:700 18px Arial}.subtitle{fill:#4d514f;font:12px Arial}.paper{fill:#fff;filter:url(#shadow)}.mono{fill:#111;font:10px 'Courier New',monospace}.headline{font-weight:700}.dash{stroke:#aaa;stroke-dasharray:4 3}</style><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-opacity=".2"/></filter></defs><rect width="100%" height="100%" class="bg"/><rect x="22" y="22" width="${width - 44}" height="112" rx="14" class="head"/><text x="44" y="62" class="title">${xml(title)}</text><text x="44" y="88" class="meta">Pedido interno ${order.id.slice(0, 8).toUpperCase()} - ${xml(BRAND_NAMES[order.brand])} - ${xml(localTime(order.created_at))}</text><text x="44" y="111" class="meta">Previa digital para operacao e entrega. Nada foi enviado a impressora.</text>${cards}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function token() {
  if (process.env.BARBACUE_COMPARISON_ZAP_TOKEN) return process.env.BARBACUE_COMPARISON_ZAP_TOKEN.trim();
  const path = process.env.BARBACUE_COMPARISON_ZAP_TOKEN_FILE;
  if (!path) throw new Error('Token de integracao do Zap nao configurado');
  return (await readFile(path, 'utf8')).trim();
}

async function apiJson(path, auth) {
  const response = await fetch(`${ZAP_BASE}${path}`, { headers: { authorization: `Bearer ${auth}` }, signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Zap API ${path}: HTTP ${response.status}`);
  return body;
}

async function exactDestination(auth) {
  const raw = await apiJson('/whatsapp/sessions', auth);
  const sessions = (Array.isArray(raw) ? raw : raw.sessions || []).filter(row => row.status === 'connected' && row.name === SESSION_NAME);
  if (sessions.length !== 1) throw new Error('Sessao pessoal ausente ou ambigua');
  const sessionId = String(sessions[0].sessionId || sessions[0].id || '');
  const matches = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await apiJson(`/workspace/conversations?${new URLSearchParams({ sessionId, limit: '100', offset: String(offset), archived: 'all' })}`, auth);
    const rows = Array.isArray(page) ? page : page.conversations || [];
    matches.push(...rows.filter(row => row.is_group === true && row.display_name === GROUP_NAME));
    if (rows.length < 100) break;
  }
  if (matches.length !== 1) throw new Error('Grupo de destino ausente ou ambiguo');
  return { sessionId, jid: matches[0].whatsapp_jid, contactId: matches[0].contact_id };
}

async function notify(order, image) {
  const auth = await token();
  const destination = await exactDestination(auth);
  const form = new FormData();
  form.set('recipient', GROUP_NAME);
  form.set('sessionId', destination.sessionId);
  form.set('message', `Previa digital - ${CHANNEL_NAMES[order.channel]} #${orderReference(order)} - ${BRAND_NAMES[order.brand]}. Comparacao da via externa, cozinha e cliente. Nada foi impresso.`);
  form.append('screenshots', new Blob([image], { type: 'image/png' }), `comparacao-${order.channel}-${orderReference(order)}.png`);
  const response = await fetch(`${ZAP_BASE}/notify`, { method: 'POST', headers: { authorization: `Bearer ${auth}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || body?.sessionId !== destination.sessionId) throw new Error(`Envio Zap nao confirmado: HTTP ${response.status}`);
  const textMessageId = body.sent?.find(row => row.kind === 'text')?.messageId;
  const imageMessageId = body.sent?.find(row => row.kind === 'image')?.messageId;
  if (!textMessageId || !imageMessageId) throw new Error('Envio Zap sem os dois IDs esperados');
  let verified = false;
  for (let attempt = 0; attempt < 6 && !verified; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 2_000));
    const history = await apiJson(`/workspace/conversations/${encodeURIComponent(destination.contactId)}/messages?limit=100`, auth);
    const available = new Set((history.messages || []).map(row => String(row.whatsapp_message_id || row.id)));
    verified = available.has(textMessageId) && available.has(imageMessageId);
  }
  if (!verified) {
    const error = new Error('IDs do envio ausentes no historico do grupo apos 10 segundos');
    error.textMessageId = textMessageId;
    error.imageMessageId = imageMessageId;
    error.sessionId = destination.sessionId;
    error.groupJid = destination.jid;
    throw error;
  }
  return { textMessageId, imageMessageId, sessionId: destination.sessionId, groupJid: destination.jid };
}

async function enqueue(pool) {
  await pool.query(`INSERT INTO order_comparison_notifications(order_id, status)
    SELECT id, 'pending' FROM orders
    WHERE created_at > $1::timestamptz AND channel IN ('ifood','anotaai')
    ON CONFLICT (order_id) DO NOTHING`, [CUTOFF]);
}

async function claim(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(`SELECT o.* FROM order_comparison_notifications n JOIN orders o ON o.id=n.order_id
      WHERE n.status='pending' ORDER BY o.created_at,o.id FOR UPDATE OF n SKIP LOCKED LIMIT 1`)).rows[0];
    if (!row) { await client.query('COMMIT'); return null; }
    await client.query(`UPDATE order_comparison_notifications SET status='sending',attempts=attempts+1,updated_at=now() WHERE order_id=$1`, [row.id]);
    await client.query('COMMIT');
    return row;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function runOnce(pool) {
  await enqueue(pool);
  for (;;) {
    const order = await claim(pool);
    if (!order) return;
    try {
      const image = await renderComparison(order);
      const sent = await notify(order, image);
      await pool.query(`UPDATE order_comparison_notifications SET status='sent',text_message_id=$2,image_message_id=$3,zap_session_id=$4,zap_group_jid=$5,sent_at=now(),updated_at=now() WHERE order_id=$1`, [order.id, sent.textMessageId, sent.imageMessageId, sent.sessionId, sent.groupJid]);
      console.log(JSON.stringify({ event: 'comparison_sent', orderId: order.id, channel: order.channel, reference: orderReference(order), textMessageId: sent.textMessageId, imageMessageId: sent.imageMessageId }));
    } catch (error) {
      await pool.query(`UPDATE order_comparison_notifications SET status='uncertain',last_error=$2,text_message_id=coalesce($3,text_message_id),image_message_id=coalesce($4,image_message_id),zap_session_id=coalesce($5,zap_session_id),zap_group_jid=coalesce($6,zap_group_jid),updated_at=now() WHERE order_id=$1`, [order.id, String(error?.message || error).slice(0, 2000), error?.textMessageId || null, error?.imageMessageId || null, error?.sessionId || null, error?.groupJid || null]);
      console.error(JSON.stringify({ event: 'comparison_uncertain', orderId: order.id, error: String(error?.message || error) }));
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL nao configurada');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, statement_timeout: 15_000 });
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await runOnce(pool); } catch (error) { console.error(JSON.stringify({ event: 'comparison_worker_error', error: String(error?.message || error) })); }
    finally { busy = false; }
  };
  await tick();
  const timer = setInterval(() => void tick(), POLL_MS);
  const stop = async () => { clearInterval(timer); await pool.end(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

async function checkConfiguration() {
  const destination = await exactDestination(await token());
  console.log(JSON.stringify({ ok: true, session: SESSION_NAME, group: GROUP_NAME, sessionId: destination.sessionId, groupJid: destination.jid }));
}

module.exports = { clean, wrap, orderReference, externalOrderId, publicItems, commonLines, renderComparison, runOnce };
if (require.main === module) (process.argv.includes('--check') ? checkConfiguration() : main()).catch(error => { console.error(error); process.exit(1); });
