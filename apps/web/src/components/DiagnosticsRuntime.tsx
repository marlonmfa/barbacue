'use client';
import { useEffect } from 'react';
import { startClientDiagnostics } from '@/lib/client-diagnostics';
export function DiagnosticsRuntime() { useEffect(() => startClientDiagnostics(), []); return null; }
