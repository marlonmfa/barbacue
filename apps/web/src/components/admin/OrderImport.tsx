"use client";
import { useRef, useState } from 'react';

const example = { orders: [{ source: 'telefone', externalId: 'TEL-001', brand: 'barbacue', customerName: 'Cliente exemplo', orderType: 'pickup', items: [{ name: 'Produto exemplo', qty: 1, priceCents: 2500, notes: 'Sem cebola' }], paymentMethod: 'cash', paymentStatus: 'pending' }] };
export function OrderImport({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 256000) { setMessage('O arquivo deve ter até 256 KB.'); return; }
    setBusy(true); setMessage('');
    try {
      const body = await file.text();
      const parsed = JSON.parse(body);
      if (!Array.isArray(parsed.orders) || !parsed.orders.length || parsed.orders.length > 50) throw new Error('Use o modelo com até 50 pedidos por arquivo.');
      if (!window.confirm(`Importar ${parsed.orders.length} pedido(s)? Novos pedidos entrarão no caixa e na fila de impressão. Reenvios com a mesma origem, marca e identificador serão ignorados.`)) return;
      const response = await fetch('/api/admin/orders/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível importar.');
      setMessage(`${result.imported} pedido(s) importado(s); ${result.skipped} já existia(m).`);
      onImported();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Confira o arquivo e tente novamente.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  function downloadExample() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(example, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-pedidos.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="mb-5 rounded-xl border border-[#352b24] bg-[#1a1512] p-4 text-sm text-[#c8b89a]">
    <summary className="min-h-8 cursor-pointer font-semibold">Pedidos de outras fontes</summary>
    <p className="my-3 max-w-2xl leading-relaxed">Importe pedidos de telefone, balcão ou outro sistema usando o modelo. Informe os valores em centavos e um identificador único por pedido na origem. Até 50 pedidos por arquivo.</p>
    <div className="flex gap-3 flex-wrap"><button disabled={busy} className="min-h-12 rounded-lg bg-[#ed1b24] px-4 text-white" onClick={() => input.current?.click()}>{busy ? 'Importando…' : 'Importar pedidos'}</button><button className="min-h-12 rounded-lg border border-[#594333] px-4" onClick={downloadExample}>Baixar modelo</button></div>
    <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="Arquivo de pedidos" onChange={event => void importFile(event.target.files?.[0])} />
    {message && <p className="mt-3" role="status">{message}</p>}
  </details>;
}
