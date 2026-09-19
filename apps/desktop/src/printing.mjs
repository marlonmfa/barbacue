export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
}
export function ticketHtml(text, paper = 80) {
  if (![58, 80, 210].includes(paper)) throw new Error('Papel inválido');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Comanda Barbacue</title><style>@page{size:${paper === 210 ? 'A4' : `${paper}mm auto`};margin:0}html,body{margin:0;padding:0;color:#000;background:#fff}body{padding:3mm}pre{font: ${paper === 210 ? '10' : paper === 58 ? '7.5' : '7.2'}pt 'Courier New',monospace;line-height:1.3;white-space:pre-wrap;overflow-wrap:anywhere;width:${paper - 6}mm;margin:0}</style><pre>${escapeHtml(text)}</pre></html>`;
}

// Dependencies are injected so timeout and uncertain-spool paths can be tested
// without any printer or Electron process.
export async function printTicket({ BrowserWindow, TransportError, text, settings, timeoutMs = 30000 }) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  let submitted = false;
  let timer;
  try {
    await Promise.race([
      (async () => {
        const printers = await win.webContents.getPrintersAsync();
        if (!settings.printer || !printers.some(p => p.name === settings.printer)) throw new TransportError('Impressora não encontrada. Confira o driver e a seleção nas configurações.', false);
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ticketHtml(text, settings.paper))}`);
        const lineCount = text.split('\n').length;
        const pageSize = settings.paper === 210 ? 'A4' : { width: settings.paper * 1000, height: Math.max(100000, Math.ceil(lineCount * (settings.paper === 58 ? 4200 : 4600) + 16000)) };
        await new Promise((resolve, reject) => {
          submitted = true;
          win.webContents.print({ silent: true, deviceName: settings.printer, printBackground: false, color: false, copies: 1, margins: { marginType: 'none' }, pageSize }, success => {
            if (success) resolve();
            else reject(new TransportError('O Windows não confirmou o envio. Confira a fila da impressora antes de reenviar.', true));
          });
        });
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new TransportError('Tempo limite de impressão. Confira o papel e a fila da impressora.', submitted)), timeoutMs); }),
    ]);
    return { transport: 'windows-spool', reference: 'spool-accepted' };
  } catch (error) {
    if (error instanceof TransportError) throw error;
    throw new TransportError('Falha ao preparar a impressão. Confira a impressora nas configurações.', submitted);
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}
