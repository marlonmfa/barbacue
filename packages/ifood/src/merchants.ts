export type IfoodBrand = 'barbacue' | 'barbadog' | 'chelas';
export interface MerchantConnection { id: string; name: string; brand: IfoodBrand }

// IDs informados pelo responsável das lojas. Hotdog usa a marca interna barbadog.
export const DEFAULT_MERCHANTS: MerchantConnection[] = [
  { id: '991532f5-0400-4efe-b38a-b2b37f8bd9b0', name: 'Chelas', brand: 'chelas' },
  { id: '403af0c6-176b-4021-a6cd-3e09dca09cbf', name: 'Barbacue', brand: 'barbacue' },
  { id: '6cb73c63-55cd-459b-a02b-aa936967bf20', name: 'Hotdog', brand: 'barbadog' },
];

export function loadMerchants(env: NodeJS.ProcessEnv = process.env): MerchantConnection[] {
  const legacy = env.IFOOD_MERCHANT_ID?.trim();
  const merchants: MerchantConnection[] = env.IFOOD_MERCHANTS_JSON?.trim()
    ? JSON.parse(env.IFOOD_MERCHANTS_JSON)
    : legacy ? [{ id: legacy, name: env.IFOOD_BRAND || 'barbacue', brand: (env.IFOOD_BRAND || 'barbacue') as IfoodBrand }]
    : DEFAULT_MERCHANTS.map(m => ({ ...m }));
  if (!Array.isArray(merchants) || !merchants.length || merchants.length > 100) throw new Error('Configure de 1 a 100 lojas iFood');
  const ids = new Set<string>();
  for (const m of merchants) {
    if (!m || typeof m.id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(m.id) || !['barbacue', 'barbadog', 'chelas'].includes(m.brand) || typeof m.name !== 'string' || !m.name.trim() || ids.has(m.id)) throw new Error('Mapeamento de lojas iFood inválido ou duplicado');
    ids.add(m.id);
  }
  return merchants;
}

export function resolveMerchant(merchants: MerchantConnection[], eventMerchantId?: string, orderMerchantId?: string): MerchantConnection {
  if (eventMerchantId && orderMerchantId && eventMerchantId !== orderMerchantId) throw new Error('Loja do evento diverge da loja do pedido');
  const id = eventMerchantId || orderMerchantId;
  const merchant = id ? merchants.find(m => m.id === id) : merchants.length === 1 ? merchants[0] : undefined;
  if (!merchant) throw new Error('Pedido sem identificação de loja autorizada no conector');
  return merchant;
}
