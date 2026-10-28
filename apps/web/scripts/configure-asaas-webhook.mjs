// Lists the matching hook by default. --apply creates/updates only this URL.
// No payment is created. Keys and tokens are never printed.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const production = process.env.ASAAS_ENVIRONMENT === 'production';
const base = production ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
const url = new URL('/api/webhooks/asaas', process.env.APP_URL || 'https://barbacue.cog.ia.br').href;
const key = process.env.ASAAS_API_KEY, secret = process.env.ASAAS_WEBHOOK_TOKEN;
if (!key || !secret || secret.length < 32) throw Error('Configure ASAAS_API_KEY and a dedicated ASAAS_WEBHOOK_TOKEN (32+ characters).');
async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { access_token: key, 'User-Agent': 'Barbacue-Checkout/1.0', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`Asaas webhook configuration failed (HTTP ${response.status}).`);
  return response.json();
}
const hooks = await call('/webhooks?limit=100');
const matching = hooks.data.filter(hook => hook.url === url);
if (matching.length > 1) throw Error('More than one hook found for this URL; review before updating.');
const current = matching[0];
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ environment: production ? 'production' : 'sandbox', url, configured: Boolean(current), enabled: current?.enabled ?? false, interrupted: current?.interrupted ?? null }));
} else {
  const email = process.env.ASAAS_WEBHOOK_EMAIL || current?.email || process.env.COGMAIL_MAILBOX;
  if (!email) throw Error('Configure ASAAS_WEBHOOK_EMAIL for provider delivery alerts.');
  const body = { name: 'Barbacue /pedir', url, email, apiVersion: 3, enabled: true, interrupted: false, authToken: secret, sendType: 'NON_SEQUENTIALLY', events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS'] };
  // After an ambiguous response, rerun: listing recovers this URL before POST.
  const saved = await call(current ? `/webhooks/${encodeURIComponent(current.id)}` : '/webhooks', current ? 'PUT' : 'POST', body);
  console.log(JSON.stringify({ environment: production ? 'production' : 'sandbox', id: saved.id, url, enabled: saved.enabled, interrupted: saved.interrupted }));
}
