import { createRequire } from 'node:module';

const QRCode = createRequire(import.meta.url)('qrcode');

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
}

export function destinationSettings(settings, destination) {
  if (!destination) return settings;
  if (destination.deviceId !== settings.deviceId || typeof destination.printerName !== 'string' || !destination.printerName || ![58, 80, 210].includes(destination.paper)) {
    throw new Error('Destino de impressão inválido para este computador.');
  }
  return { ...settings, printer: destination.printerName, paper: destination.paper };
}
const FRAME_RULE = /^([#*=])\1+$/;
const QR_LINE = /^\[QR\] (https:\/\/[\x21-\x7e]{1,200})$/;
const CUT_LINE = '- - - - - CORTE AQUI - - - - -';

/** QR em SVG, gerado localmente (sem rede): a página da comanda bloqueia tudo externo. */
export function qrSvg(url, sizeMm = 30) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) path += `M${x + 2} ${y + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export function ticketHtml(text, paper = 80) {
  if (![58, 80, 210].includes(paper)) throw new Error('Papel inválido');
  // Molduras de 5 linhas de cada loja (print-agent/ticket.mjs) saem em negativo,
  // a linha [QR] vira o QR code do convite e cada parte termina no corte.
  const lines = String(text).split('\n');
  const blocks = [];
  let body = [];
  const flush = () => { if (body.length) blocks.push(`<pre>${escapeHtml(body.join('\n'))}</pre>`); body = []; };
  for (let i = 0; i < lines.length; i++) {
    const qr = lines[i].match(QR_LINE);
    if (FRAME_RULE.test(lines[i]) && lines[i + 4] === lines[i]) {
      flush(); blocks.push(`<pre class="banner">${escapeHtml(lines.slice(i, i + 5).join('\n'))}</pre>`); i += 4;
    } else if (qr) {
      flush(); blocks.push(`<div class="qr">${qrSvg(qr[1], paper === 58 ? 26 : 32)}</div>`);
    } else if (lines[i] === CUT_LINE) {
      flush(); blocks.push(`<pre class="cut">${escapeHtml(CUT_LINE)}</pre>`);
    } else body.push(lines[i]);
  }
  flush();
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>Comanda Barbacue</title><style>@page{size:${paper === 210 ? 'A4' : `${paper}mm auto`};margin:0}html,body{margin:0;padding:0;color:#000;background:#fff}body{padding:3mm}pre{font: ${paper === 210 ? '10' : paper === 58 ? '7.5' : '7.2'}pt 'Courier New',monospace;line-height:1.3;white-space:pre-wrap;overflow-wrap:anywhere;width:${paper - 6}mm;margin:0}pre.banner{font-weight:900;background:#000;color:#fff;padding:1mm 0;margin:0 0 2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}pre.cut{text-align:center;margin:4mm 0 5mm}.qr{width:${paper - 6}mm;text-align:center;margin:1mm 0}.qr svg{display:inline-block}</style>${blocks.join('')}</html>`;
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
          win.webContents.print({ silent: true, deviceName: settings.printer, printBackground: true, color: false, copies: 1, margins: { marginType: 'none' }, pageSize }, success => {
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
