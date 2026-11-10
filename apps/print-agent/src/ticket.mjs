const BRANDS = { barbacue: 'BARBACUE', chelas: 'CHELAS', barbadog: 'BARBADOG' };
// As tres lojas imprimem na mesma impressora: cada uma tem moldura propria
// (caractere e subtitulo) para a cozinha separar as comandas sem ler o texto.
const BRAND_FRAME = {
  barbacue: { fill: '#', subtitle: 'BURGUERS NA BRASA' },
  chelas: { fill: '*', subtitle: 'COCINA MEXICANA' },
  barbadog: { fill: '=', subtitle: 'HOT DOGS' },
};

export const BANNER_LINES = 5;

/** Moldura de 5 linhas com o nome da loja; o desktop amplia essas linhas. */
export function brandBanner(brand, columns) {
  const { fill, subtitle } = BRAND_FRAME[brand];
  const center = text => {
    const inner = ` ${text} `;
    const left = Math.max(2, Math.floor((columns - inner.length) / 2));
    return (fill.repeat(left) + inner).padEnd(columns, fill).slice(0, columns);
  };
  const rule = fill.repeat(columns);
  return [rule, center(BRANDS[brand]), center(subtitle), center(`LOJA ${BRANDS[brand]}`), rule];
}

// ASCII evita depender da pagina de caracteres do modelo. Nunca enviamos
// controles ESC/POS originados de nomes/observacoes digitados pelo cliente.
export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\s+/g, ' ').trim();
}

export function wrapText(value, columns, indent = '') {
  const width = columns - indent.length;
  if (width < 1) throw new Error('Largura de impressao invalida');
  const words = sanitizeText(value).split(' ');
  const lines = [];
  let line = '';
  for (let word of words) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(indent + line); line = '';
    }
    while (word.length > width) {
      lines.push(indent + word.slice(0, width)); word = word.slice(width);
    }
    if (word) line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(indent + line);
  return lines;
}

// Convite impresso antes do pedido nas comandas de marketplaces: o cliente
// passa a pedir pelos canais proprios. QR aponta para o site de cada loja.
export const INVITE_CHANNELS = new Set(['ifood', 'anotaai']);
export const DEFAULT_INVITE_URLS = {
  barbacue: 'https://barbacue.cog.ia.br/?origem=comanda',
  chelas: 'https://barbacue.cog.ia.br/chelas?origem=comanda',
  barbadog: 'https://barbacue.cog.ia.br/barbadog?origem=comanda',
};
export const QR_PREFIX = '[QR] ';
export const CUT_LINE = '- - - - - CORTE AQUI - - - - -';

const RESTAURANT_BY_LABEL = Object.fromEntries(Object.entries(BRANDS).map(([slug, label]) => [label, slug]));

/** Restaurante de cada item; itens sem etiqueta (bebidas comuns) ficam com a loja do pedido. */
export function itemBrand(item, fallback) {
  const label = typeof item?.restaurant === 'string' ? sanitizeText(item.restaurant).toUpperCase() : '';
  return RESTAURANT_BY_LABEL[label] ?? fallback;
}

/** Uma parte por cozinha, na ordem fixa Chelas, Barbacue, Barbadog. */
export function splitByRestaurant(ticket) {
  const groups = new Map();
  for (const item of ticket.items ?? []) {
    const brand = itemBrand(item, ticket.brand);
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand).push(item);
  }
  return ['chelas', 'barbacue', 'barbadog'].filter(b => groups.has(b)).map(brand => ({ brand, items: groups.get(brand) }));
}

function inviteLines(brand, columns, urls) {
  const url = urls?.[brand] ?? DEFAULT_INVITE_URLS[brand];
  if (!/^https:\/\/[\x21-\x7e]{1,200}$/.test(url)) throw new Error('URL do convite invalida');
  const rule = '~'.repeat(columns);
  return [rule, ...wrapText('PECA DIRETO COM A GENTE!', columns),
    ...wrapText(`Na proxima, peca pelo site do ${BRANDS[brand]}: atendimento direto com a loja, sem intermediario.`, columns),
    ...wrapText('Aponte a camera para o QR code e compartilhe com os amigos.', columns),
    `${QR_PREFIX}${url}`, ...wrapText(url, columns), rule];
}

/**
 * Comanda completa. Pedido com itens de mais de um restaurante sai em uma
 * parte por cozinha (moldura da loja + "PARTE i DE n"), todas com o mesmo codigo.
 */
export function formatTicket(ticket, options = {}) {
  const parts = Array.isArray(ticket?.items) && ticket.items.length ? splitByRestaurant(ticket) : [{ brand: ticket?.brand, items: ticket?.items }];
  if (parts.length < 2) return formatPart(ticket, { ...options, brand: ticket?.brand, items: ticket?.items });
  return parts.map((part, i) => formatPart(ticket, { ...options, ...part, index: i + 1, count: parts.length }))
    .join(`${CUT_LINE}\n\n`);
}

function formatPart(ticket, { columns = 48, timeZone = 'America/Sao_Paulo', inviteUrls, brand, items, index, count } = {}) {
  if (![32, 48].includes(columns)) throw new Error('PRINT_COLUMNS deve ser 32 ou 48');
  if (![1, 2].includes(ticket?.version) || !Object.hasOwn(BRANDS, ticket.brand) ||
      !/^[A-Z0-9]{8}$/.test(ticket.orderNumber ?? '') ||
      (ticket.version === 1 ? !['kiosk', 'table_qr'].includes(ticket.channel) : typeof ticket.channel !== 'string' || !ticket.channel || ticket.channel.length > 100) ||
      !['pickup', 'dine_in', ...(ticket.version === 2 ? ['delivery'] : [])].includes(ticket.orderType) ||
      !Array.isArray(ticket.items) || !ticket.items.length || ticket.items.length > 100 ||
      (ticket.version === 1 ? ticket.payment?.status !== 'pending' : !['pending', 'paid', 'failed', 'refunded'].includes(ticket.payment?.status))) {
    throw new Error('Ticket de cozinha invalido ou versao nao suportada');
  }
  if (ticket.orderType === 'dine_in' && (ticket.version === 1 || ticket.tableNumber != null) && (!Number.isSafeInteger(ticket.tableNumber) || ticket.tableNumber < 1 || ticket.tableNumber > 99999)) {
    throw new Error('Pedido de mesa sem numero de mesa valido');
  }
  const separator = '-'.repeat(columns);
  const lines = [...brandBanner(brand, columns)];
  if (INVITE_CHANNELS.has(ticket.channel)) lines.push(...inviteLines(brand, columns, inviteUrls));
  lines.push('COZINHA', `PEDIDO #${ticket.orderNumber}`);
  if (count > 1) lines.push(`PARTE ${index} DE ${count} - ${BRANDS[brand]}`, ...wrapText(`Outras partes: ${splitByRestaurant(ticket).filter(p => p.brand !== brand).map(p => BRANDS[p.brand]).join(', ')}`, columns));
  if (ticket.reprint) lines.push('*** REIMPRESSAO ***');
  lines.push(ticket.orderType === 'dine_in' ? (ticket.tableNumber ? `MESA ${ticket.tableNumber}` : 'NO LOCAL') : ticket.orderType === 'delivery' ? 'ENTREGA' : 'BALCAO / RETIRADA');
  if (ticket.orderType === 'dine_in' && ticket.tableLabel &&
      sanitizeText(ticket.tableLabel).toUpperCase() !== `MESA ${ticket.tableNumber}`) {
    if (typeof ticket.tableLabel !== 'string' || ticket.tableLabel.length > 500) throw new Error('Identificacao da mesa invalida');
    lines.push(...wrapText(ticket.tableLabel, columns));
  }
  const channels = { kiosk: 'totem', table_qr: 'QR da mesa', click: 'site / aplicativo', chat: 'WhatsApp / chat', ifood: 'iFood', anotaai: 'Anota AI', test: 'TESTE', manual: 'balcao', other: 'outra origem' };
  lines.push(...wrapText(`Origem: ${Object.hasOwn(channels, ticket.channel) ? channels[ticket.channel] : ticket.channel}`, columns));
  if (ticket.version === 2) {
    if (ticket.status === 'pending') lines.push('PEDIDO PENDENTE - CONFIRMAR');
    for (const [label, value] of [['Cliente', ticket.customerName], ['Telefone', ticket.customerPhone], ['Endereco', ticket.orderType === 'delivery' ? ticket.deliveryAddress : null]]) {
      if (value != null && (typeof value !== 'string' || value.length > 2000)) throw new Error('Dados do pedido invalidos');
      if (value) lines.push(...wrapText(`${label}: ${value}`, columns));
    }
  }
  const createdAt = new Date(ticket.createdAt);
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Horario do pedido invalido');
  lines.push(new Intl.DateTimeFormat('pt-BR', {
    timeZone, dateStyle: 'short', timeStyle: 'short',
  }).format(createdAt), separator);
  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 ||
        typeof item.name !== 'string' || !sanitizeText(item.name) || item.name.length > 500 ||
        (item.notes != null && (typeof item.notes !== 'string' || item.notes.length > 2000))) {
      throw new Error('Item do ticket invalido');
    }
    lines.push(...wrapText(`${item.qty}x ${item.name}`, columns));
    if (item.notes) lines.push(...wrapText(`OBS: ${item.notes}`, columns, '  '));
    lines.push('');
  }
  if (ticket.notes) {
    if (typeof ticket.notes !== 'string' || ticket.notes.length > 2000) throw new Error('Observacao invalida');
    lines.push(separator, ...wrapText(`OBS DO PEDIDO: ${ticket.notes}`, columns));
  }
  // Comanda de preparo: sem endereco, telefone ou outros dados de entrega.
  if (ticket.version === 1) {
    lines.push(separator, 'PAGAMENTO PENDENTE', 'Pagar no local');
  } else {
    const money = value => {
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Valor do pedido invalido');
      return `R$ ${(value / 100).toFixed(2).replace('.', ',')}`;
    };
    lines.push(separator);
    for (const [label, value] of [['Subtotal', ticket.subtotalCents], ['Desconto', ticket.discountCents], ['Frete', ticket.deliveryFeeCents], ['TOTAL', ticket.totalCents], ['Troco para', ticket.changeForCents]]) {
      if (value != null) lines.push(...wrapText(`${label}: ${money(value)}`, columns));
    }
    const payments = { paid: 'PAGO', pending: 'PAGAMENTO PENDENTE', refunded: 'PAGAMENTO ESTORNADO', failed: 'FALHA NO PAGAMENTO' };
    const methods = { pix: 'PIX', cash: 'Dinheiro', card_on_delivery: 'Cartao no recebimento' };
    lines.push(payments[ticket.payment.status], ...wrapText(`Forma: ${methods[ticket.payment.method] ?? sanitizeText(ticket.payment.method || 'Nao informada')}`, columns), ...wrapText('Situacao no recebimento do pedido', columns));
  }
  lines.push('NAO E COMPROVANTE DE PAGAMENTO', BRAND_FRAME[brand].fill.repeat(columns),
    ...wrapText(`FIM - ${BRANDS[brand]} #${ticket.orderNumber}${count > 1 ? ` (PARTE ${index}/${count})` : ''}`, columns), BRAND_FRAME[brand].fill.repeat(columns), '', '');
  return lines.join('\n') + '\n';
}

const FRAME_RULE = /^([#*=])\1+$/;

/** Texto puro (fila CUPS em texto): sem QR grafico, o endereco ja vem na linha seguinte. */
export function plainText(text) {
  return text.split('\n').filter(line => !line.startsWith(QR_PREFIX)).join('\n');
}

/** Moldura de loja (5 linhas) comecando na linha i, em qualquer parte da comanda. */
export function isFrameAt(lines, i) {
  return FRAME_RULE.test(lines[i] ?? '') && lines[i + BANNER_LINES - 1] === lines[i];
}

function escposQr(url) {
  // GS ( k: modelo 2, modulo 6, correcao M, armazenar e imprimir (ESC a 1 centraliza).
  const data = Buffer.from(url, 'ascii');
  const store = data.length + 3;
  return Buffer.concat([
    Buffer.from([0x1b, 0x61, 0x01]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([0x1d, 0x28, 0x6b, store & 0xff, store >> 8, 0x31, 0x50, 0x30]), data,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
    Buffer.from('\n', 'ascii'),
    Buffer.from([0x1b, 0x61, 0x00]),
  ]);
}

export function escposBytes(text, { cut = false } = {}) {
  // Somente o formatador acima deve produzir text. Nao aceitar bytes do cliente.
  if (/[^\x20-\x7e\n]/.test(text)) throw new Error('Texto nao seguro para ESC/POS');
  const lines = text.split('\n');
  const chunks = [Buffer.from([0x1b, 0x40])]; // ESC @: initialize
  for (let i = 0; i < lines.length; i++) {
    if (isFrameAt(lines, i)) {
      // Moldura da loja em negrito (ESC E 1 ... ESC E 0).
      chunks.push(Buffer.from([0x1b, 0x45, 0x01]), Buffer.from(lines.slice(i, i + BANNER_LINES).join('\n') + '\n', 'ascii'), Buffer.from([0x1b, 0x45, 0x00]));
      i += BANNER_LINES - 1;
    } else if (lines[i].startsWith(QR_PREFIX) && /^https:\/\/[\x21-\x7e]{1,200}$/.test(lines[i].slice(QR_PREFIX.length))) {
      chunks.push(escposQr(lines[i].slice(QR_PREFIX.length)));
    } else if (lines[i] === CUT_LINE && cut) {
      chunks.push(Buffer.from('\n\n\n', 'ascii'), Buffer.from([0x1d, 0x56, 0x00]));
    } else {
      chunks.push(Buffer.from(lines[i] + (i < lines.length - 1 ? '\n' : ''), 'ascii'));
    }
  }
  chunks.push(Buffer.from('\n\n\n', 'ascii'));
  if (cut) chunks.push(Buffer.from([0x1d, 0x56, 0x00])); // GS V 0: full cut (opt-in)
  return Buffer.concat(chunks);
}
