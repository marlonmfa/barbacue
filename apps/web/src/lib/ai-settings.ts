import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

export type AISettings = { provider: 'anthropic' | 'openai'; anthropicModel: string; openaiModel: string; anthropicApiKey?: string; openaiApiKey?: string };
const defaults: AISettings = { provider: 'anthropic', anthropicModel: 'claude-haiku-5-5', openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
function encryptionKey() {
  const secret = process.env.AI_ENCRYPTION_KEY || process.env.ADMIN_COOKIE_SECRET;
  if (!secret || secret.length < 32) throw new Error('Configure AI_ENCRYPTION_KEY ou ADMIN_COOKIE_SECRET com pelo menos 32 caracteres');
  return createHash('sha256').update(`barbacue:ai:${secret}`).digest();
}
export function encryptAI(settings: AISettings) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
}
export function decryptAI(value: string): AISettings {
  const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
export async function readAISettings(): Promise<AISettings> {
  const rows = await db.execute(sql`SELECT encrypted_value FROM ai_provider_settings WHERE id = 1`);
  const value = rows.rows[0]?.encrypted_value;
  return { ...defaults, ...(process.env.AI_PROVIDER === 'openai' ? { provider: 'openai' as const } : {}), ...(process.env.ANTHROPIC_MODEL ? { anthropicModel: process.env.ANTHROPIC_MODEL } : {}), ...(typeof value === 'string' ? decryptAI(value) : {}) };
}
export function publicAISettings(settings: AISettings) {
  return { provider: settings.provider, anthropicModel: settings.anthropicModel, openaiModel: settings.openaiModel, anthropicConfigured: Boolean(settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY), openaiConfigured: Boolean(settings.openaiApiKey || process.env.OPENAI_API_KEY || process.env.OPENAI_KEY) };
}
export function mergeAISettings(current: AISettings, patch: Record<string, unknown>): AISettings {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Configuração inválida');
  if (patch.provider !== undefined && !['anthropic', 'openai'].includes(String(patch.provider))) throw new Error('Provedor inválido');
  const result = { ...current };
  for (const name of ['provider', 'anthropicModel', 'openaiModel', 'anthropicApiKey', 'openaiApiKey'] as const) {
    const value = patch[name];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 500) throw new Error('Configuração inválida');
    if (value.trim()) Object.assign(result, { [name]: value.trim() });
  }
  return result;
}
export async function saveAISettings(patch: Record<string, unknown>) {
  const settings = mergeAISettings(await readAISettings(), patch);
  const value = encryptAI(settings);
  await db.execute(sql`INSERT INTO ai_provider_settings(id,encrypted_value) VALUES(1,${value}) ON CONFLICT(id) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,updated_at=now()`);
  return publicAISettings(settings);
}
export async function resolveAI(providerOverride?: 'anthropic' | 'openai') {
  const settings = await readAISettings(), provider = providerOverride || settings.provider;
  const key = settings[`${provider}ApiKey`] || (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY || process.env.OPENAI_KEY);
  return { provider, model: settings[`${provider}Model`], apiKey: key || '' };
}
