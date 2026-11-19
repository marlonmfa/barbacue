import { ifoodReceiptReferences } from './ifood-references.cjs';

const BRANDS = { barbacue: 'BARBACUE', chelas: 'CHELAS', barbadog: 'BARBADOG' };

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

export function externalOrderReferences(ticket) {
  if (ticket?.channel !== 'ifood' || typeof ticket.notes !== 'string') return [];
  const { displayId, localizer } = ifoodReceiptReferences(ticket.notes);
  return [
    `ID DO PEDIDO: ${ticket.orderNumber}`,
    displayId ? `PEDIDO IFOOD: #${displayId}` : null,
    localizer ? `LOCALIZADOR IFOOD: ${localizer}` : null,
  ].filter(Boolean);
}

// Production versions before copy_key enqueue one consolidated job. Expand it
// at the edge so the Windows app can print the new kitchen/customer set without
// requiring a coordinated web/database release. Jobs that already identify a
// copy remain untouched.
export function expandTicketCopies(ticket) {
  if (ticket?.copyType != null) return [ticket];
  if (!ticket || !Array.isArray(ticket.items) || ticket.items.length === 0 || !Object.hasOwn(BRANDS, ticket.brand)) return [ticket];
  const items = ticket.items.map(item => ({ ...item, brand: item.brand ?? ticket.brand }));
  if (items.some(item => !Object.hasOwn(BRANDS, item.brand))) return [ticket];
  const brands = [...new Set(items.map(item => item.brand))];
  return [
    ...brands.map(brand => ({
      ...ticket,
      copyType: 'kitchen',
      brand,
      items: items.filter(item => item.brand === brand),
    })),
    {
      ...ticket,
      copyType: 'customer',
      brand: brands.length === 1 ? brands[0] : 'barbacue',
      items,
    },
  ];
}

function itemLines(item, name, columns) {
  const lines = [...wrapText(`${item.qty}x ${name}`, columns)];
  for (const component of item.components ?? []) {
    const quantity = component.qty > 1 ? `${component.qty}x ` : '';
    lines.push(...wrapText(`- ${quantity}${component.name}`, columns, '  '));
  }
  if (item.notes) lines.push(...wrapText(`OBS: ${item.notes}`, columns, '  '));
  lines.push('');
  return lines;
}

export function formatTicket(ticket, { columns = 48, timeZone = 'America/Sao_Paulo' } = {}) {
  const copyType = ticket?.copyType ?? 'kitchen';
  if (![32, 48].includes(columns)) throw new Error('PRINT_COLUMNS deve ser 32 ou 48');
  if (![1, 2].includes(ticket?.version) || !Object.hasOwn(BRANDS, ticket.brand) ||
      !['kitchen', 'customer'].includes(copyType) ||
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
  const lines = copyType === 'customer'
    ? ['VIA DO CLIENTE', `PEDIDO #${ticket.orderNumber}`]
    : [`${BRANDS[ticket.brand]} PEDIDO #${ticket.orderNumber}`, 'COZINHA'];
  if (ticket.reprint) lines.push('*** REIMPRESSAO ***');
  lines.push(ticket.orderType === 'dine_in' ? (ticket.tableNumber ? `MESA ${ticket.tableNumber}` : 'NO LOCAL') : ticket.orderType === 'delivery' ? 'ENTREGA' : 'BALCAO / RETIRADA');
  if (ticket.orderType === 'dine_in' && ticket.tableLabel &&
      sanitizeText(ticket.tableLabel).toUpperCase() !== `MESA ${ticket.tableNumber}`) {
    if (typeof ticket.tableLabel !== 'string' || ticket.tableLabel.length > 500) throw new Error('Identificacao da mesa invalida');
    lines.push(...wrapText(ticket.tableLabel, columns));
  }
  const channels = { kiosk: 'totem', table_qr: 'QR da mesa', click: 'site / aplicativo', chat: 'WhatsApp / chat', ifood: 'iFood', test: 'TESTE', manual: 'balcao', other: 'outra origem' };
  lines.push(...wrapText(`Origem: ${Object.hasOwn(channels, ticket.channel) ? channels[ticket.channel] : ticket.channel}`, columns));
  for (const reference of externalOrderReferences(ticket)) lines.push(...wrapText(reference, columns));
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
  for (const item of ticket.items) {
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 ||
        typeof item.name !== 'string' || !sanitizeText(item.name) || item.name.length > 500 ||
        (item.notes != null && (typeof item.notes !== 'string' || item.notes.length > 2000)) ||
        (item.brand != null && !Object.hasOwn(BRANDS, item.brand)) ||
        (item.components != null && (!Array.isArray(item.components) || item.components.length > 100 || item.components.some(component =>
          !Number.isInteger(component?.qty) || component.qty < 1 || component.qty > 99 ||
          typeof component.name !== 'string' || !sanitizeText(component.name) || component.name.length > 500)))) {
      throw new Error('Item do ticket invalido');
    }
  }
  if (copyType === 'customer') {
    for (const brand of ['barbacue', 'chelas', 'barbadog']) {
      const brandItems = ticket.items.filter(item => (item.brand ?? ticket.brand) === brand);
      if (!brandItems.length) continue;
      lines.push(BRANDS[brand], separator);
      for (const item of brandItems) {
        const name = item.name.startsWith(`${BRANDS[brand]} · `) ? item.name.slice(`${BRANDS[brand]} · `.length) : item.name;
        lines.push(...itemLines(item, name, columns));
      }
    }
  } else {
    for (const item of ticket.items) {
      const prefix = `${BRANDS[ticket.brand]} · `;
      const name = item.name.startsWith(prefix) ? item.name.slice(prefix.length) : item.name;
      lines.push(...itemLines(item, name, columns));
    }
  }
  // iFood/Anota Aí put integration IDs, store, charging and manager-only
  // instructions in order.notes. That is audit data, not receipt content.
  const printableOrderNotes = ['ifood', 'anotaai'].includes(ticket.channel) ? null : ticket.notes;
  if (printableOrderNotes) {
    if (typeof ticket.notes !== 'string' || ticket.notes.length > 2000) throw new Error('Observacao invalida');
    lines.push(separator, ...wrapText(`OBS DO PEDIDO: ${printableOrderNotes}`, columns));
  }
  const money = value => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Valor do pedido invalido');
    return `R$ ${(value / 100).toFixed(2).replace('.', ',')}`;
  };
  for (const value of [ticket.subtotalCents, ticket.discountCents, ticket.deliveryFeeCents, ticket.totalCents, ticket.changeForCents]) {
    if (value != null) money(value);
  }
  const payments = { paid: 'PAGO', pending: 'PAGAMENTO PENDENTE', refunded: 'PAGAMENTO ESTORNADO', failed: 'FALHA NO PAGAMENTO' };
  const methods = { pix: 'PIX', cash: 'Dinheiro', counter: 'Pagar no caixa', card_on_delivery: 'Cartao no recebimento' };
  const externalMethod = ticket.channel === 'ifood' ? 'iFood' : ticket.channel === 'anotaai' ? 'Anota Ai' : null;
  const methodLabel = externalMethod ?? methods[ticket.payment.method] ?? sanitizeText(ticket.payment.method || ticket.payment.label || 'Nao informada');
  lines.push(separator);
  if (copyType === 'customer') {
    for (const [label, value] of [['Subtotal', ticket.subtotalCents], ['Desconto', ticket.discountCents], ['Frete', ticket.deliveryFeeCents], ['TOTAL', ticket.totalCents], ['Troco para', ticket.changeForCents]]) {
      if (value != null) lines.push(...wrapText(`${label}: ${money(value)}`, columns));
    }
    lines.push(payments[ticket.payment.status], ...wrapText(`Forma: ${methodLabel}`, columns));
  } else {
    if (ticket.totalCents != null) lines.push(...wrapText(`TOTAL: ${money(ticket.totalCents)}`, columns));
    lines.push(payments[ticket.payment.status], ...wrapText(`Forma: ${methodLabel}`, columns));
  }
  lines.push('NAO E COMPROVANTE DE PAGAMENTO');
  lines.push('', '');
  return lines.join('\n') + '\n';
}

export function escposBytes(text, { cut = false } = {}) {
  // Somente o formatador acima deve produzir text. Nao aceitar bytes do cliente.
  if (/[^\x20-\x7e\n]/.test(text)) throw new Error('Texto nao seguro para ESC/POS');
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]), // ESC @: initialize
    Buffer.from(text, 'ascii'),
    Buffer.from('\n\n\n', 'ascii'),
    ...(cut ? [Buffer.from([0x1d, 0x56, 0x00])] : []), // GS V 0: full cut (opt-in)
  ]);
}
