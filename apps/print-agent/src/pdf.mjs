// PDF de conferencia: a mesma comanda que a impressora termica (Elgin) recebe,
// sem dependencias. Usa as fontes padrao Courier do PDF, molduras de loja em
// negativo, QR desenhado em quadrados e uma pagina por parte (corte).
import { BANNER_LINES, CUT_LINE, QR_PREFIX, isFrameAt } from './ticket.mjs';

const MM = 72 / 25.4;
const escapePdf = text => text.replace(/[\\()]/g, c => `\\${c}`);

/** Partes da comanda (o corte separa cozinhas em pedidos de varios restaurantes). */
export function ticketParts(text) {
  return text.split(`${CUT_LINE}\n`).map(part => part.replace(/^\n+/, '')).filter(part => part.trim());
}

/**
 * @param {string} text  saida de formatTicket (uma parte ou a comanda inteira)
 * @param {{ paper?: 58|80, qr?: (url: string) => { size: number, get(x: number, y: number): boolean } }} options
 * @returns {Buffer}
 */
export function ticketPdf(text, { paper = 80, qr } = {}) {
  if (![58, 80].includes(paper)) throw new Error('Papel invalido para PDF');
  const fontSize = paper === 58 ? 7.5 : 7.2;
  const lineHeight = fontSize * 1.3;
  const margin = 3 * MM;
  const width = paper * MM;
  const qrSize = (paper === 58 ? 26 : 32) * MM;
  const lines = text.replace(/\n+$/, '').split('\n');

  // Primeiro mede a altura; depois desenha de cima para baixo (PDF cresce para cima).
  const ops = [];
  let y = 0;
  const textAt = (value, x, font, color = '0 g') => { const at = y; ops.push(() => `${color} BT /${font} ${fontSize} Tf ${x.toFixed(2)} ${(-at - fontSize).toFixed(2)} Td (${escapePdf(value)}) Tj ET`); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFrameAt(lines, i)) {
      const top = y, h = BANNER_LINES * lineHeight + 2 * MM;
      ops.push(() => `0 g ${margin.toFixed(2)} ${(-top - h).toFixed(2)} ${(width - 2 * margin).toFixed(2)} ${h.toFixed(2)} re f`);
      y += 1 * MM;
      for (const bannerLine of lines.slice(i, i + BANNER_LINES)) { textAt(bannerLine, margin, 'F2', '1 g'); y += lineHeight; }
      y += 1 * MM + 2 * MM;
      i += BANNER_LINES - 1;
    } else if (line.startsWith(QR_PREFIX) && qr) {
      const matrix = qr(line.slice(QR_PREFIX.length));
      const cell = qrSize / (matrix.size + 4);
      const left = (width - qrSize) / 2, top = y + MM;
      ops.push(() => {
        let out = '0 g';
        for (let r = 0; r < matrix.size; r++) for (let c = 0; c < matrix.size; c++) {
          if (matrix.get(c, r)) out += ` ${(left + (c + 2) * cell).toFixed(2)} ${(-top - (r + 3) * cell).toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re`;
        }
        return `${out} f`;
      });
      y += qrSize + 2 * MM;
    } else if (line.startsWith(QR_PREFIX)) {
      continue; // sem gerador de QR: o endereco ja vem na linha seguinte
    } else {
      textAt(line, margin, 'F1');
      y += lineHeight;
    }
  }
  const height = Math.max(y + 2 * margin, 60 * MM);
  const content = `1 0 0 1 0 ${(height - margin).toFixed(2)} cm\n${ops.map(op => op()).join('\n')}`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
