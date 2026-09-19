import { resolve } from 'node:path';

function integer(env, key, fallback, min, max) {
  const value = env[key] == null || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} deve estar entre ${min} e ${max}`);
  return value;
}

export function readConfig(env = process.env) {
  const transport = env.PRINT_TRANSPORT || 'dry-run';
  if (!['dry-run', 'cups', 'tcp'].includes(transport)) throw new Error('PRINT_TRANSPORT deve ser dry-run, cups ou tcp');
  const columns = integer(env, 'PRINT_COLUMNS', 48, 32, 48);
  if (![32, 48].includes(columns)) throw new Error('PRINT_COLUMNS deve ser 32 ou 48');
  const timeZone = env.PRINT_TIMEZONE || 'America/Sao_Paulo';
  new Intl.DateTimeFormat('pt-BR', { timeZone });
  if (env.PRINT_CUT && !['true', 'false'].includes(env.PRINT_CUT)) throw new Error('PRINT_CUT deve ser true ou false');
  const config = {
    transport, columns, timeZone,
    cut: env.PRINT_CUT === 'true',
    pollMs: integer(env, 'PRINT_POLL_MS', 3000, 1000, 60000),
    timeoutMs: integer(env, 'PRINT_TIMEOUT_MS', 10000, 1000, 30000),
    lockPort: integer(env, 'PRINT_LOCK_PORT', 9178, 1024, 65535),
    stateDir: resolve(env.PRINT_STATE_DIR || '.state'),
  };
  if (transport === 'dry-run') return config;
  const url = new URL(env.PRINT_API_URL || 'http://localhost:3000');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PRINT_API_URL deve conter somente a origem do servidor');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS em PRINT_API_URL; HTTP e permitido somente em localhost');
  }
  config.apiUrl = url.origin;
  config.token = env.PRINT_AGENT_TOKEN || '';
  if (config.token.length < 32 || /\s/.test(config.token)) throw new Error('PRINT_AGENT_TOKEN precisa de pelo menos 32 caracteres sem espacos');
  if (transport === 'cups') {
    config.cupsPrinter = env.PRINT_CUPS_PRINTER || '';
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.cupsPrinter)) {
      throw new Error('Defina PRINT_CUPS_PRINTER com o nome da fila instalada (letras, numeros, ponto, hifen ou sublinhado)');
    }
    config.cupsFormat = env.PRINT_CUPS_FORMAT || 'text';
    if (!['text', 'escpos'].includes(config.cupsFormat)) throw new Error('PRINT_CUPS_FORMAT deve ser text ou escpos');
    if (process.platform === 'win32') throw new Error('CUPS exige macOS/Linux; no Windows use TCP ESC/POS em rede');
  } else {
    config.tcpHost = env.PRINT_TCP_HOST || '';
    if (!config.tcpHost || /[\s/\x00-\x1f]/.test(config.tcpHost)) throw new Error('Defina PRINT_TCP_HOST com o IP ou hostname local da impressora');
    config.tcpPort = integer(env, 'PRINT_TCP_PORT', 9100, 1, 65535);
  }
  return config;
}
