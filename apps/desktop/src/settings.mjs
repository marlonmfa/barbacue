export function normalizeOrigin(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Informe o endereço completo da loja, começando com https://.'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use somente o endereço da loja, sem caminho, senha ou parâmetros.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('O endereço da loja precisa usar HTTPS.');
  return url.origin;
}

export function validateSettings(input, previous = {}) {
  const serverUrl = normalizeOrigin(input.serverUrl);
  const token = typeof input.token === 'string' && input.token ? input.token : (previous.serverUrl === serverUrl ? previous.token : '');
  if (token && (token.length < 32 || token.length > 512 || /\s/.test(token))) throw new Error('A chave de impressão precisa ter de 32 a 512 caracteres, sem espaços.');
  if (typeof input.printer !== 'string' || input.printer.length > 256 || /[\x00-\x1f]/.test(input.printer)) throw new Error('Selecione uma impressora válida.');
  const paper = Number(input.paper);
  if (![58, 80, 210].includes(paper)) throw new Error('Selecione papel de 58 mm, 80 mm ou A4.');
  const autoPrint = input.autoPrint === true;
  if (autoPrint && (!token || !input.printer)) throw new Error('Selecione a impressora e informe a chave antes de ativar a impressão automática.');
  return { serverUrl, token, printer: input.printer, paper, autoPrint, startAtLogin: input.startAtLogin === true };
}

export function allowedNavigation(value, origin) {
  try { const url = new URL(value); return url.origin === origin && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
export function publicSettings(settings) {
  const { token, encryptedToken, ...visible } = settings;
  return { ...visible, hasToken: Boolean(token) };
}
