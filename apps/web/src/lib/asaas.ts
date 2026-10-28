import { OnlinePaymentError, type AsaasPayment } from "./online-payment";

export interface PixCode { encodedImage: string; payload: string; expirationDate: string }
export function asaasConfig() {
  const environment = process.env.ASAAS_ENVIRONMENT === "production" ? "production" : "sandbox";
  const key = process.env.ASAAS_API_KEY?.trim();
  if (!key) throw new OnlinePaymentError("O pagamento online está temporariamente indisponível. Tente mais tarde ou fale com a loja.");
  return { environment, key, base: environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3" };
}
export async function asaasRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { key, base } = asaasConfig();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method, headers: { access_token: key, "User-Agent": "Barbacue-Checkout/1.0", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch { throw new OnlinePaymentError("O Asaas ainda não confirmou a operação. Consulte novamente sem criar outro pedido.", 503, true); }
  if (!response.ok) throw new OnlinePaymentError(response.status === 400 ? "O Asaas recusou a cobrança. Fale com a loja para conferir os dados de pagamento." : "O pagamento está temporariamente indisponível. Consulte novamente em instantes.", 503, response.status >= 500 || [408, 409].includes(response.status));
  try { return await response.json() as T; }
  catch { throw new OnlinePaymentError("O Asaas não confirmou a resposta. Consulte novamente em instantes.", 503, true); }
}
export const getAsaasPayment = (id: string) => asaasRequest<AsaasPayment>(`/payments/${encodeURIComponent(id)}`);
export async function findAsaasPayment(reference: string) {
  const result = await asaasRequest<{ data: AsaasPayment[]; hasMore?: boolean }>(`/payments?externalReference=${encodeURIComponent(reference)}&limit=100`);
  const matches = result.data.filter(p => p.externalReference === reference);
  if (matches.length > 1 || result.hasMore) throw new OnlinePaymentError("Foi encontrada mais de uma cobrança. A equipe precisa conferir este pedido.", 409, true);
  return matches[0] ?? null;
}
