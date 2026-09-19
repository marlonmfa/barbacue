import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const docs = path.join(root, 'docs/image-audit');
const catalog = JSON.parse(await fs.readFile(path.join(docs, 'catalog-before.json'), 'utf8')).flatMap(c => c.products);
const inactive = JSON.parse(await fs.readFile(path.join(docs, 'inactive-before.json'), 'utf8'));
catalog.push(...inactive.map(p => ({ ...p, imageUrl: p.image_url })));
const generated = JSON.parse(await fs.readFile(path.join(docs, 'generated.json'), 'utf8'));
const replacements = [];
const seen = new Set();
function add(id, imageUrl, kind, sourceId = null) {
  const product = catalog.find(p => p.id === id);
  if (!product || seen.has(id)) throw new Error(`Unknown or duplicate product ${id}`);
  seen.add(id);
  replacements.push({ id, name: product.name, before: product.imageUrl, after: imageUrl, kind, sourceId });
}
for (const entry of generated) {
  const url = `/menu/review-2026-09/${entry.key}.webp`;
  await fs.access(path.join(root, 'public', url));
  for (const id of entry.ids) add(id, url, 'illustrative');
}
// Reuse reviewed restaurant photos only for the same food, not keyword matches.
for (const [sourceId, ids] of [[39,[92,116,151]], [41,[94,120,152]], [42,[95,153]], [5,[189]], [9,[190]], [7,[191]]]) {
  const source = catalog.find(p => p.id === sourceId);
  for (const id of ids) add(id, source.imageUrl, 'restaurant-photo', sourceId);
}
replacements.sort((a,b) => a.id-b.id);
await fs.writeFile(path.join(docs, 'replacements.json'), JSON.stringify(replacements, null, 2) + '\n');
const sqlString = value => value == null ? 'NULL' : "'" + value.replaceAll("'", "''") + "'";
function sql(reverse) {
  const values = replacements.map(p => `(${p.id}, ${sqlString(p.name)}, ${sqlString(reverse ? p.after : p.before)}, ${sqlString(reverse ? p.before : p.after)})`).join(',\n');
  return `-- Update images only. Abort atomically if a product was renamed or its image changed since review.\nBEGIN;\nCREATE TEMP TABLE reviewed_images (id integer, name text, expected_url text, new_url text) ON COMMIT DROP;\nINSERT INTO reviewed_images VALUES\n${values};\nDO $$\nDECLARE changed_count integer;\nBEGIN\n  UPDATE products p SET image_url = r.new_url FROM reviewed_images r\n  WHERE p.id = r.id AND p.name = r.name AND p.image_url IS NOT DISTINCT FROM r.expected_url;\n  GET DIAGNOSTICS changed_count = ROW_COUNT;\n  IF changed_count <> ${replacements.length} THEN\n    RAISE EXCEPTION 'Image review expected ${replacements.length} matching rows; found %. No changes committed.', changed_count;\n  END IF;\nEND $$;\nCOMMIT;\n`;
}
await fs.writeFile(path.join(docs, 'apply.sql'), sql(false));
await fs.writeFile(path.join(docs, 'rollback.sql'), sql(true));
console.log(JSON.stringify({ images: generated.length, replacedProducts: replacements.length }));
