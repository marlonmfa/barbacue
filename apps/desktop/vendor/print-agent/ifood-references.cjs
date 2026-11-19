// The importer writes these headers before any merchant or customer notes.
/** @param {string | null | undefined} notes */
function ifoodReceiptReferences(notes) {
  const lines = typeof notes === 'string' ? notes.split(/\r?\n/) : [];
  const display = lines[0]?.match(/^iFood #(.+)$/i)?.[1]?.trim();
  if (display || lines[0]?.startsWith('Origem: ifood / ')) lines.shift();

  const external = lines[0]?.match(/^Pedido externo: (.+)$/i)?.[1]?.trim();
  if (external) lines.shift();

  const localizer = display && external ? lines[0]?.match(/^Localizador iFood: ([0-9]{8})$/)?.[1] : null;
  if (localizer) lines.shift();

  return {
    displayId: display && display !== external ? display : null,
    localizer: localizer || null,
    remainingNotes: lines.join('\n'),
  };
}

module.exports = { ifoodReceiptReferences };
