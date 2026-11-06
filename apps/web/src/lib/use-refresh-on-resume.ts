'use client';
import { useEffect, useRef } from 'react';
// Read again when returning from the other client; never submit or replace an open form.
export function useRefreshOnResume(load: () => Promise<unknown>, blocked = false) {
 const current = useRef({load, blocked}); useEffect(() => { current.current = {load, blocked}; });
 useEffect(() => { let running = false; const refresh = () => { if(document.visibilityState === 'hidden' || current.current.blocked || running) return; running = true; void current.current.load().catch(() => {}).finally(() => {running = false;}); };
  window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
  return () => {window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);}; }, []);
}
