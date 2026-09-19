const $ = id => document.getElementById(id);
let busy = false;
async function api(method, ...args) {
  if (!window.desktop) throw new Error('Abra esta tela pelo programa Barbacue Pedidos.');
  const result = await window.desktop[method](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').classList.toggle('error', error); }
function updateState(data, fill = false) {
  $('status').textContent = data.status;
  $('last-seen').textContent = data.connectedAt ? `Último contato: ${new Date(data.connectedAt).toLocaleTimeString('pt-BR')}` : '';
  $('toggle').textContent = data.settings.autoPrint ? 'Pausar impressão automática' : 'Ativar impressão automática';
  $('version').textContent = `Versão ${data.version}`;
  if (fill) {
    for (const key of ['serverUrl', 'paper']) $(key).value = data.settings[key];
    for (const key of ['autoPrint', 'startAtLogin']) $(key).checked = data.settings[key];
    $('token').value = '';
    $('token').placeholder = data.settings.hasToken ? 'Chave salva — deixe vazio para manter' : 'Chave configurada no servidor';
  }
  $('events').replaceChildren(...(data.events.length ? data.events : [{ message: 'Nenhuma impressão nesta sessão.' }]).map(event => {
    const item = document.createElement('li');
    item.textContent = `${event.time ? new Date(event.time).toLocaleTimeString('pt-BR') + ' — ' : ''}${event.message}`;
    return item;
  }));
}
async function printers(selected = $('printer').value) {
  const list = await api('printers');
  $('printer').replaceChildren(new Option(list.length ? 'Selecione uma impressora' : 'Nenhuma impressora instalada', ''));
  list.forEach(p => $('printer').add(new Option(`${p.displayName || p.name}${p.isDefault ? ' (padrão)' : ''}`, p.name)));
  if (selected && !list.some(p => p.name === selected)) $('printer').add(new Option(`${selected} (indisponível)`, selected));
  $('printer').value = selected;
}
async function action(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await fn(); } catch (error) { feedback(error.message, true); }
  finally { busy = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
$('settings').addEventListener('submit', event => {
  event.preventDefault();
  void action(async () => {
    const input = {};
    for (const key of ['serverUrl', 'token', 'printer', 'paper']) input[key] = $(key).value;
    for (const key of ['autoPrint', 'startAtLogin']) input[key] = $(key).checked;
    updateState(await api('save', input), true);
    feedback('Configuração salva. Use Abrir pedidos para entrar no sistema.');
  });
});
$('refresh').onclick = () => action(() => printers());
$('open').onclick = () => action(() => api('open'));
$('test').onclick = () => action(async () => feedback(await api('test')));
$('toggle').onclick = () => action(async () => { updateState(await api('toggle'), true); feedback('Configuração de impressão atualizada.'); });
void action(async () => { const data = await api('state'); updateState(data, true); await printers(data.settings.printer); });
setInterval(() => { if (!busy) void api('state').then(data => updateState(data)).catch(error => { $('status').textContent = error.message; }); }, 3000);
