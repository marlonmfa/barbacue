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

export function formatTicket(ticket, { columns = 48, timeZone = 'America/Sao_Paulo' } = {}) {
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
  const lines = [BRANDS[ticket.brand], 'COZINHA', `PEDIDO #${ticket.orderNumber}`];
  if (ticket.reprint) lines.push('*** REIMPRESSAO ***');
  lines.push(ticket.orderType === 'dine_in' ? (ticket.tableNumber ? `MESA ${ticket.tableNumber}` : 'NO LOCAL') : ticket.orderType === 'delivery' ? 'ENTREGA' : 'BALCAO / RETIRADA');
  if (ticket.orderType === 'dine_in' && ticket.tableLabel &&
      sanitizeText(ticket.tableLabel).toUpperCase() !== `MESA ${ticket.tableNumber}`) {
    if (typeof ticket.tableLabel !== 'string' || ticket.tableLabel.length > 500) throw new Error('Identificacao da mesa invalida');
    lines.push(...wrapText(ticket.tableLabel, columns));
  }
  const channels = { kiosk: 'totem', table_qr: 'QR da mesa', click: 'site / aplicativo', chat: 'WhatsApp / chat', ifood: 'iFood', test: 'TESTE', manual: 'balcao', other: 'outra origem' };
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
  for (const item of ticket.items) {
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
  lines.push('NAO E COMPROVANTE DE PAGAMENTO', '', '');
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
