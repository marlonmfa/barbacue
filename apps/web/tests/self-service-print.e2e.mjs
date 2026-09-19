// API real -> PostgreSQL -> PrintAgent real -> receptor TCP fake -> ACK real.
// SOMENTE servidor local + banco descartavel cujo nome contem self_service_test.
// SELF_SERVICE_TEST_URL=http://127.0.0.1:3098 DATABASE_URL=postgresql://.../barbacue_self_service_test_... \
// PRINT_AGENT_TOKEN=... node tests/self-service-print.e2e.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApi, PrintAgent } from '../../print-agent/src/agent.mjs';
import { Journal } from '../../print-agent/src/journal.mjs';
import { sendTcp } from '../../print-agent/src/transports.mjs';
import { escposBytes } from '../../print-agent/src/ticket.mjs';

const base = process.env.SELF_SERVICE_TEST_URL;
const database = process.env.DATABASE_URL;
const token = process.env.PRINT_AGENT_TOKEN;
const localHosts = ['localhost', '127.0.0.1', '[::1]'];
assert(base && localHosts.includes(new URL(base).hostname), 'Exige servidor HTTP local de teste');
const baseUrl = new URL(base);
assert(['http:', 'https:'].includes(baseUrl.protocol) && baseUrl.pathname === '/' && !baseUrl.search && !baseUrl.hash && !baseUrl.username && !baseUrl.password, 'Use somente a origem HTTP local');
assert(database && localHosts.includes(new URL(database).hostname), 'Exige PostgreSQL local descartavel');
const databaseUrl = new URL(database);
assert(['postgres:', 'postgresql:'].includes(databaseUrl.protocol) && /^\/[a-z0-9_]*self_service_test[a-z0-9_]*$/i.test(databaseUrl.pathname), 'Banco deve ter self_service_test no nome');
assert(token?.length >= 32, 'PRINT_AGENT_TOKEN privado do servidor de teste e obrigatorio');

const marker = `ss-print-e2e-${randomUUID().slice(0, 8)}`;
const requestId = randomUUID();
const tableToken = randomUUID();
const pool = new pg.Pool({ connectionString: database, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
const postponed = new Map();
const sockets = new Set();
let assertions = 0;
let productId, tableId, directory, receiver;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions++; }
function check(condition, message) { assert(condition, message); assertions++; }

async function postponeOtherJobs(ownOrderId = null) {
  const rows = (await pool.query("SELECT id,next_attempt_at::text original_schedule FROM kitchen_print_jobs WHERE status='queued' AND ($1::uuid IS NULL OR order_id<>$1)", [ownOrderId])).rows;
  for (const row of rows) if (!postponed.has(row.id)) postponed.set(row.id, row.original_schedule);
  if (rows.length) await pool.query("UPDATE kitchen_print_jobs SET next_attempt_at=now()+interval '1 day' WHERE id=ANY($1::uuid[]) AND status='queued'", [rows.map(row => row.id)]);
}

try {
  equal((await pool.query('SELECT current_database() name')).rows[0].name, databaseUrl.pathname.slice(1), 'Conexao deve usar o banco descartavel solicitado');
  equal((await pool.query("SELECT count(*)::int count FROM kitchen_print_jobs WHERE status='printing'")).rows[0].count, 0, 'Nao executar enquanto outro agente/teste tem reserva ativa');
  await postponeOtherJobs();
  // Fixtures exclusivas; nenhuma configuracao/horario da loja e alterada.
  // Controle no nome canonico comprova que ate um catalogo malformado nao
  // injeta comandos na impressora. Observacoes aceitam somente texto seguro.
  productId = (await pool.query('INSERT INTO products(name,price_cents,available) VALUES($1,3500,true) RETURNING id', [`Porção de pão ${marker}\x1b@\x1dV\x07`])).rows[0].id;
  const table = (await pool.query("INSERT INTO restaurant_tables(number,label,token,active) SELECT candidate,$1,$2,true FROM generate_series(91000,99999) candidate WHERE NOT EXISTS(SELECT 1 FROM restaurant_tables WHERE number=candidate) ORDER BY candidate LIMIT 1 RETURNING id,number", [marker, tableToken])).rows[0];
  check(Boolean(table), 'Precisa de um numero livre para a mesa de teste');
  tableId = table.id;

  const response = await fetch(`${baseUrl.origin}/api/self-service/orders`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId, channel: 'table_qr', tableToken, brand: 'barbacue', paymentMethod: 'cash',
      items: [{ productId, qty: 2, notes: 'Sem cebola\nMolho à parte\tbem passado' }],
      notes: `${marker}: levar à mesa com guardanapos`,
    }),
  });
  const receipt = await response.json();
  equal(response.status, 201, `Pedido deve ser aceito; a loja de teste precisa estar aberta: ${JSON.stringify(receipt)}`);
  equal(receipt.orderType, 'dine_in', 'Pedido deve ser da mesa');
  equal(receipt.tableNumber, table.number, 'API deve resolver a mesa pelo token');
  equal(receipt.totalCents, 7000, 'Preco canonico do banco deve compor o pedido');
  const before = (await pool.query('SELECT j.*,o.payment_status,o.status order_status FROM kitchen_print_jobs j JOIN orders o ON o.id=j.order_id WHERE o.self_service_request_id=$1', [requestId])).rows;
  equal(before.length, 1, 'Pedido e comanda devem existir juntos no mesmo banco de teste');
  const expectedJob = before[0];
  equal(expectedJob.order_id, receipt.orderId, 'API e banco devem corresponder ao mesmo pedido');
  equal(expectedJob.status, 'queued', 'Comanda deve entrar na fila antes do agente');
  equal(expectedJob.payment_status, 'pending', 'Pagamento permanece pendente');
  equal(expectedJob.order_status, 'confirmed', 'Pedido aceito entra na cozinha');
  await postponeOtherJobs(receipt.orderId);

  let resolveBytes;
  const received = new Promise(resolve => { resolveBytes = resolve; });
  let connections = 0;
  receiver = net.createServer(socket => {
    connections++;
    sockets.add(socket);
    const chunks = [];
    socket.on('data', chunk => chunks.push(chunk));
    socket.once('end', () => resolveBytes(Buffer.concat(chunks)));
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => {
    receiver.once('error', reject);
    receiver.listen(0, '127.0.0.1', resolve);
  });
  const address = receiver.address();
  check(address && address.address === '127.0.0.1', 'Receptor deve estar somente em loopback');
  directory = await mkdtemp(join(tmpdir(), 'barbacue-print-e2e-'));
  const journal = new Journal(directory);
  await journal.init();
  const api = createApi({ apiUrl: baseUrl.origin, token, timeoutMs: 30000 });
  const claim = api.claim;
  api.claim = async () => {
    const result = await claim();
    // Se outro teste criou trabalho concorrente, interromper antes de enviar
    // bytes ou confirmar uma tarefa que nao pertence a este teste.
    equal(result?.job?.id, expectedJob.id, 'Agente deve reservar somente sua fixture');
    return result;
  };
  const agent = new PrintAgent({
    api, journal, columns: 48, timeZone: 'America/Sao_Paulo', log: () => {},
    // Destino fixado no listener recem-criado: ignora PRINT_TCP_HOST e nao usa
    // CUPS, impressora instalada ou qualquer IP externo, mesmo se houver .env.
    print: async text => sendTcp(escposBytes(text, { cut: false }), { host: '127.0.0.1', port: address.port, timeoutMs: 5000 }),
  });
  equal(await agent.runOnce(), true, 'PrintAgent real deve processar a comanda');
  let timeout;
  const bytes = await Promise.race([
    received,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Receptor fake nao recebeu a comanda')), 5000); }),
  ]).finally(() => clearTimeout(timeout));
  equal(connections, 1, 'Uma unica conexao deve enviar a comanda');
  equal(bytes.subarray(0, 2).toString('hex'), '1b40', 'ESC/POS deve iniciar com ESC @');
  equal(bytes.filter(byte => byte === 0x1b).length, 1, 'Cliente/catalogo nao podem injetar ESC');
  equal(bytes.filter(byte => byte === 0x1d).length, 0, 'Nenhum GS/corte injetado pelo catalogo');
  const printed = bytes.subarray(2).toString('ascii');
  check(!/[^\x20-\x7e\n]/.test(printed), 'Conteudo enviado deve ter somente ASCII seguro e quebras de linha');
  const words = printed.replace(/\s+/g, ' ');
  check(words.includes(`MESA ${table.number}`), 'Comanda precisa identificar a mesa');
  check(words.includes('Porcao de pao'), 'Produto/acento deve chegar ao receptor normalizado');
  check(words.includes('Sem cebola Molho a parte bem passado'), 'Observacoes do item devem chegar normalizadas');
  check(words.includes('levar a mesa com guardanapos'), 'Observacao do pedido deve chegar ao receptor');
  check(words.includes('PAGAMENTO PENDENTE'), 'Comanda deve destacar pagamento pendente');
  check(words.includes(`PEDIDO #${receipt.orderId.slice(0, 8).toUpperCase()}`), 'Comanda deve identificar o pedido');
  check(printed.split('\n').every(line => line.length <= 48), 'Comanda deve respeitar 48 colunas');
  const after = (await pool.query('SELECT status,printed_at,attempts FROM kitchen_print_jobs WHERE id=$1', [expectedJob.id])).rows[0];
  equal(after.status, 'printed', 'ACK real deve registrar submissao no servidor');
  check(Boolean(after.printed_at), 'Servidor deve registrar horario de submissao');
  equal(after.attempts, 1, 'Uma unica tentativa deve ser necessaria');
  equal((await journal.read(expectedJob.id)).state, 'complete', 'Journal deve concluir somente apos ACK real');
  equal((await journal.pending()).length, 0, 'Nenhuma confirmacao deve ficar pendente');
  console.log(`Passed ${assertions} end-to-end printing assertions: real order API -> PostgreSQL -> PrintAgent -> loopback TCP fake -> real complete API. No physical printer used.`);
} finally {
  // Restaurar agendamento e remover apenas fixtures proprias, mesmo se um dos
  // passos de limpeza falhar. Nunca tocar em configuracoes de loja/horarios.
  const errors = [];
  const cleanup = async (label, operation) => {
    try { await operation(); } catch (error) { errors.push(new Error(`${label}: ${error.message}`)); }
  };
  for (const socket of sockets) socket.destroy();
  if (receiver?.listening) await cleanup('Encerrar receptor', () => new Promise((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())));
  await cleanup('Remover comanda fixture', () => pool.query('DELETE FROM kitchen_print_jobs WHERE order_id IN (SELECT id FROM orders WHERE self_service_request_id=$1)', [requestId]));
  await cleanup('Remover pedido fixture', () => pool.query('DELETE FROM orders WHERE self_service_request_id=$1', [requestId]));
  if (productId) await cleanup('Remover produto fixture', () => pool.query('DELETE FROM products WHERE id=$1', [productId]));
  if (tableId) await cleanup('Remover mesa fixture', () => pool.query('DELETE FROM restaurant_tables WHERE id=$1', [tableId]));
  for (const [id, originalSchedule] of postponed) {
    await cleanup('Restaurar fila preexistente', () => pool.query("UPDATE kitchen_print_jobs SET next_attempt_at=$1::timestamptz WHERE id=$2 AND status='queued'", [originalSchedule, id]));
  }
  if (directory) await cleanup('Remover journal temporario', () => rm(directory, { recursive: true, force: true }));
  await cleanup('Fechar PostgreSQL', () => pool.end());
  if (errors.length) throw new AggregateError(errors, 'Falha na limpeza do teste de impressao');
}
