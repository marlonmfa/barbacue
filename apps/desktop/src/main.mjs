import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, safeStorage, session, dialog, shell } from 'electron';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { normalizeOrigin, validateSettings, allowedNavigation, publicSettings } from './settings.mjs';
import { printTicket } from './printing.mjs';

app.setName('Barbacue Pedidos');
app.setPath('userData', join(app.getPath('appData'), 'Barbacue Pedidos'));
if (!app.isPackaged && process.env.BARBACUE_DESKTOP_TEST_DATA) app.setPath('userData', process.env.BARBACUE_DESKTOP_TEST_DATA);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const agentRoot = app.isPackaged ? join(root, 'vendor/print-agent') : join(root, '../print-agent/src');
const { PrintAgent, createApi, ApiError } = await import(pathToFileURL(join(agentRoot, 'agent.mjs')));
const { Journal, acquireSingleton } = await import(pathToFileURL(join(agentRoot, 'journal.mjs')));
const { TransportError } = await import(pathToFileURL(join(agentRoot, 'transports.mjs')));
const setupUrl = pathToFileURL(join(root, 'ui/index.html')).href;
let settings = { serverUrl: '', token: '', printer: '', paper: 80, autoPrint: false, startAtLogin: false };
let setupWindow, dashboard, tray, loopTimer, activeRun, releaseLock, agent, quitting = false, changing = false;
let status = 'Configure a loja para começar.';
let connectedAt = null;
const events = [];
function record(message) {
  events.unshift({ time: new Date().toISOString(), message });
  events.splice(40);
}
const prefs = { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true };
function restrict(contents, allow) {
  contents.setWindowOpenHandler(({ url }) => {
    // Only explicit HTTPS links leave the application. File/protocol URLs never do.
    try { if (new URL(url).protocol === 'https:') void shell.openExternal(url).catch(() => {}); } catch {}
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => { if (!allow(url)) event.preventDefault(); });
  contents.on('will-redirect', (event, url) => { if (!allow(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
}
function showSetup() {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.show(); setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({ width: 1050, height: 820, minWidth: 740, minHeight: 650, title: 'Barbacue Pedidos · Configurações', backgroundColor: '#17120f', icon: join(root, 'assets/icon.png'), webPreferences: { ...prefs, preload: join(root, 'src/preload.cjs') } });
  restrict(setupWindow.webContents, url => url === setupUrl);
  void setupWindow.loadURL(setupUrl);
}
async function openDashboard() {
  if (!settings.serverUrl) return showSetup();
  if (dashboard && !dashboard.isDestroyed()) { dashboard.show(); dashboard.focus(); return; }
  dashboard = new BrowserWindow({ width: 1440, height: 950, minWidth: 900, minHeight: 650, title: 'Barbacue Pedidos', icon: join(root, 'assets/icon.png'), backgroundColor: '#17120f', webPreferences: { ...prefs, partition: 'persist:barbacue-store' } });
  restrict(dashboard.webContents, url => allowedNavigation(url, settings.serverUrl));
  dashboard.on('close', event => { if (!quitting) { event.preventDefault(); dashboard.hide(); } });
  dashboard.webContents.on('did-fail-load', (_event, code, _description, _url, main) => {
    if (main && code !== -3) { status = 'Painel sem conexão. Confira a internet e use Reabrir pedidos.'; showSetup(); }
  });
  await dashboard.loadURL(`${settings.serverUrl}/admin/orders`).catch(() => {});
}
async function persist(next) {
  if (next.token && !safeStorage.isEncryptionAvailable()) throw new Error('A proteção de credenciais do sistema está indisponível. Entre novamente no Windows.');
  const { token, ...rest } = next;
  const value = { ...rest, encryptedToken: token ? safeStorage.encryptString(token).toString('base64') : '' };
  const path = join(app.getPath('userData'), 'settings.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
async function stopAgent() {
  clearTimeout(loopTimer);
  const previous = agent;
  agent = null;
  if (activeRun) await activeRun;
  if (releaseLock) { await releaseLock(); releaseLock = null; }
  return previous;
}
async function startAgent() {
  if (!settings.autoPrint) { status = 'Impressão automática pausada. Você pode gerenciar e imprimir pelo painel.'; return; }
  const config = { ...settings };
  try {
    releaseLock = await acquireSingleton();
    const journal = new Journal(join(app.getPath('userData'), 'journal', createHash('sha256').update(config.serverUrl).digest('hex').slice(0, 24)));
    await journal.init();
    const current = new PrintAgent({ journal, api: createApi({ apiUrl: config.serverUrl, token: config.token }), columns: config.paper === 58 ? 32 : 48,
      print: text => printTicket({ BrowserWindow, TransportError, text, settings: config }), log: record });
    agent = current;
    status = 'Conectando à fila de impressão…';
    let serverVerified = false;
    const tick = async () => {
      if (agent !== current) return;
      let hadJob = false;
      activeRun = (async () => {
        if (!serverVerified) {
          const capability = await current.api.status();
          if (!capability?.allChannels || !capability.ticketVersions?.includes(2)) throw new ApiError(426);
          serverVerified = true;
        }
        return current.runOnce();
      })().then(result => {
        hadJob = result; connectedAt = new Date().toISOString();
        status = 'Impressão automática ativa. Aguardando pedidos de todas as origens integradas.';
      }).catch(error => {
        status = error instanceof ApiError && [401, 403].includes(error.status)
          ? 'Chave de impressão recusada. Confira a chave nas configurações.'
          : error instanceof ApiError && [404, 426].includes(error.status)
          ? 'Atualize o servidor e aplique a migration de impressão de todas as origens. Os pedidos continuam guardados.'
          : 'Não foi possível consultar ou concluir a impressão. Confira a conexão, a impressora e a fila na cozinha.';
        if (events[0]?.message !== status) record(status);
      });
      await activeRun;
      activeRun = null;
      if (agent === current) loopTimer = setTimeout(tick, hadJob ? 250 : 3000);
    };
    void tick();
  } catch {
    await stopAgent();
    status = 'Não foi possível iniciar a impressão. Encerre outro agente de impressão neste computador e confira as permissões da pasta do aplicativo.';
    record(status);
  }
}
async function changeSettings(input) {
  if (changing) throw new Error('Aguarde a operação atual terminar.');
  changing = true;
  try {
    const next = validateSettings(input, settings);
    await stopAgent();
    try { await persist(next); } catch (error) { await startAgent(); throw error; }
    const changedServer = settings.serverUrl !== next.serverUrl;
    settings = next;
    if (process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: settings.startAtLogin, args: ['--background'] });
    if (changedServer && dashboard && !dashboard.isDestroyed()) { dashboard.destroy(); dashboard = null; }
    await startAgent();
    return state();
  } finally { changing = false; }
}
function state() { return { settings: publicSettings(settings), status, connectedAt, events, version: app.getVersion() }; }
function registerIPC(name, handler) {
  ipcMain.handle(`desktop:${name}`, async (event, ...args) => {
    if (!setupWindow || event.sender !== setupWindow.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== setupUrl) throw new Error('Acesso não permitido.');
    try { return { ok: true, value: await handler(...args) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível concluir.' }; }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { void openDashboard(); });
  app.on('window-all-closed', () => {}); // Tray keeps the queue alive.
  app.on('activate', () => { void openDashboard(); });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    void stopAgent().finally(() => { tray?.destroy(); app.quit(); });
  });
  void app.whenReady().then(async () => {
  app.setAppUserModelId('br.com.barbacue.pedidos');
  for (const current of [session.defaultSession, session.fromPartition('persist:barbacue-store')]) {
    current.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    current.setPermissionCheckHandler(() => false);
  }
  try {
    const saved = JSON.parse(await readFile(join(app.getPath('userData'), 'settings.json'), 'utf8'));
    const token = saved.encryptedToken ? safeStorage.decryptString(Buffer.from(saved.encryptedToken, 'base64')) : '';
    settings = validateSettings({ ...saved, token });
    normalizeOrigin(settings.serverUrl);
  } catch (error) {
    if (error.code !== 'ENOENT') { status = 'Não foi possível abrir a configuração salva. Informe novamente os dados da loja.'; record(status); }
  }
  const menu = [
    { label: 'Pedidos', click: () => void openDashboard() },
    { label: 'Reabrir pedidos', click: () => { if (dashboard && !dashboard.isDestroyed()) dashboard.destroy(); dashboard = null; void openDashboard(); } },
    { label: 'Configurações e impressão', click: showSetup },
    { type: 'separator' },
    { label: 'Sair e parar impressão', click: () => app.quit() },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Barbacue', submenu: menu },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Exibir', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
  tray = new Tray(nativeImage.createFromPath(join(root, 'assets/icon.png')).resize({ width: 24, height: 24 }));
  tray.setToolTip('Barbacue Pedidos'); tray.setContextMenu(Menu.buildFromTemplate(menu));
  tray.on('double-click', () => void openDashboard());
  registerIPC('state', state);
  registerIPC('printers', async () => (await setupWindow.webContents.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault })));
  registerIPC('save', changeSettings);
  registerIPC('open', openDashboard);
  registerIPC('toggle', () => changeSettings({ ...settings, autoPrint: !settings.autoPrint }));
  registerIPC('test', async () => {
    if (changing) throw new Error('Aguarde a operação atual terminar.');
    if (!settings.printer) throw new Error('Salve a configuração com uma impressora selecionada.');
    changing = true;
    try {
      await stopAgent();
      await printTicket({ BrowserWindow, TransportError, settings: { ...settings }, text: `BARBACUE PEDIDOS\nTESTE DE IMPRESSAO\n\nPapel: ${settings.paper === 210 ? 'A4' : `${settings.paper} mm`}\n${new Date().toLocaleString('pt-BR')}\n\nConfira a leitura e as margens.\nSEM PEDIDO REAL\n\n` });
      record('Teste enviado à impressora. Confira o papel.');
      return 'Teste enviado à impressora. Confira o papel.';
    } finally { await startAgent(); changing = false; }
  });
  await startAgent();
  if (!process.argv.includes('--background') || !settings.serverUrl) {
    if (settings.serverUrl) await openDashboard(); else showSetup();
  }
  }).catch(() => {
    dialog.showErrorBox('Barbacue Pedidos', 'Não foi possível iniciar. Feche o programa e abra novamente.');
    app.quit();
  });
}
process.on('uncaughtException', () => {
  status = 'O aplicativo encontrou uma falha. Reinicie e confira a fila de impressão.';
  record(status);
  if (app.isReady()) dialog.showErrorBox('Barbacue Pedidos', status);
});
