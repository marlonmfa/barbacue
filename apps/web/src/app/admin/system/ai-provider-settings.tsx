"use client";
import { useState } from 'react';
export type AIStatus = { provider: 'anthropic' | 'openai'; anthropicModel: string; openaiModel: string; anthropicConfigured: boolean; openaiConfigured: boolean };
export default function AIProviderSettings({ initial, onSaved }: { initial: AIStatus; onSaved?: (settings: AIStatus) => void }) {
  const [status, setStatus] = useState(initial);
  const [keys, setKeys] = useState({ anthropicApiKey: '', openaiApiKey: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/system', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: status.provider, anthropicModel: status.anthropicModel, openaiModel: status.openaiModel, ...keys }) });
      if (!response.ok) throw new Error('Não foi possível salvar as configurações.');
      const saved: AIStatus = await response.json(); setStatus(saved); onSaved?.(saved); setKeys({ anthropicApiKey: '', openaiApiKey: '' }); setFailed(false); setMessage('Configurações de IA salvas.');
    } catch { setFailed(true); setMessage('Não foi possível salvar as configurações. Confira os dados e tente novamente.'); }
    finally { setBusy(false); }
  }
  const field = 'w-full rounded-lg border border-[#352b24] bg-[#15110e] p-2.5 text-[#f6efe8] mt-1';
  return <form onSubmit={save} className="text-[#f6efe8] rounded-xl border border-[#352b24] bg-[#1a1512] p-5 mb-6 space-y-4" aria-label="Integrações de IA">
    <h2 className="font-semibold text-lg">Integrações de IA</h2>
    <label className="block text-sm">Provedor de IA<select className={field} value={status.provider} onChange={e => setStatus({ ...status, provider: e.target.value as AIStatus['provider'] })}><option value="anthropic">Anthropic (padrão)</option><option value="openai">OpenAI</option></select></label>
    {(['anthropic', 'openai'] as const).map(provider => <div key={provider} className="grid sm:grid-cols-2 gap-3">
      <label className="block text-sm">Chave {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}<input className={field} type="password" autoComplete="new-password" value={keys[`${provider}ApiKey`]} placeholder={status[`${provider}Configured`] ? 'Configurada — deixe em branco para manter' : 'Chave exclusiva deste projeto'} onChange={e => setKeys({ ...keys, [`${provider}ApiKey`]: e.target.value })} /></label>
      <label className="block text-sm">Modelo {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}<input className={field} required value={status[`${provider}Model`]} onChange={e => setStatus({ ...status, [`${provider}Model`]: e.target.value })} /></label>
    </div>)}
    <p className="text-xs text-[#a89a8c]">A transcrição de áudio continua usando a chave OpenAI cadastrada aqui.</p>
    {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'text-red-400' : 'text-green-400'}>{message}</p>}
    <button disabled={busy} type="submit" className="bg-[#bc643c] rounded-lg px-4 py-2 text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar configurações de IA'}</button>
  </form>;
}
