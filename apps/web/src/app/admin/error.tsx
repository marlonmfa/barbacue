'use client';
import { useEffect } from 'react';
import { captureDiagnostic, saveErrorLog } from '@/lib/client-diagnostics';
export default function AdminError({error, unstable_retry}: {error: Error & {digest?:string}; unstable_retry: () => void}) {
 useEffect(() => { void captureDiagnostic({category:'render',error}); }, [error]);
 return <section style={{padding:32}}><h1>Não foi possível apresentar esta tela.</h1><p>O erro foi registrado. Confira o resultado de operações anteriores antes de tentar novamente.</p><button onClick={unstable_retry}>Tentar novamente</button> <button onClick={() => void saveErrorLog()}>Salvar log de erros</button></section>;
}
