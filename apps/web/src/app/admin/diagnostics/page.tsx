'use client';
import { useEffect, useState } from 'react';
import { diagnosticLog, saveErrorLog, flushDiagnostics } from '@/lib/client-diagnostics';
export default function DiagnosticsPage() {
 const [entries, setEntries] = useState<Awaited<ReturnType<typeof diagnosticLog>>>([]), [message, setMessage] = useState('');
 const [configured, setConfigured] = useState<boolean | null>(null);
 useEffect(() => { let active = true; const refresh = () => void diagnosticLog().then(value => { if (active) setEntries(value); }); refresh(); const timer = setInterval(refresh, 5000); window.addEventListener('barbacue:diagnostics', refresh);
  fetch('/api/admin/diagnostics', {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(value => { if(active) setConfigured(value?.emailConfigured ?? false); }).catch(() => { if(active) setConfigured(false); });
  return () => { active = false; clearInterval(timer); window.removeEventListener('barbacue:diagnostics', refresh); }; }, []);
 return <section style={{maxWidth:900,padding:24}}><h1>Diagnóstico e erros</h1><p>As falhas deste computador ficam registradas e são enviadas automaticamente por e-mail quando há conexão e uma sessão válida.</p><p>{configured === null ? 'Consultando envio…' : configured ? 'Envio por e-mail configurado.' : 'O envio está indisponível. Os registros locais permanecem disponíveis.'}</p><p>Você pode usar o navegador e o programa ao mesmo tempo. Ambos consultam os mesmos dados online e mantêm sessões independentes. Ao voltar para uma tela, confira os dados atualizados antes de alterar a mesma informação.</p>
 <div style={{display:'flex',gap:12,margin:'20px 0'}}><button onClick={() => void saveErrorLog().catch(() => setMessage('Não foi possível salvar o arquivo.'))}>Salvar log de erros</button><button onClick={() => void flushDiagnostics(true).then(() => setMessage('Nova tentativa solicitada. Registros pendentes serão mantidos.'))}>Tentar enviar pendentes</button></div>{message && <p role="status">{message}</p>}
 <p>{entries.length} registros neste computador · {entries.filter(e => e.delivery !== 'sent').length} pendentes</p>
 <ol>{[...entries].reverse().map(entry => <li key={entry.id} style={{borderBottom:'1px solid #7775',padding:'14px 0'}}><strong>{entry.category} · {entry.version}</strong><p>{entry.message}</p><small>{new Date(entry.time).toLocaleString('pt-BR')} · {entry.route} · {entry.delivery === 'sent' ? 'Enviado por e-mail' : 'Envio pendente'}</small></li>)}</ol></section>;
}
