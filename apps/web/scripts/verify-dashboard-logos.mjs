// Check the packaged /admin route, including releases assembled outside npm.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const dist = resolve(process.argv[2] || process.env.NEXT_DIST_DIR || '.next');
const manifest = readFileSync(join(dist, 'server/app/admin/page_client-reference-manifest.js'), 'utf8');
const assignment = /__RSC_MANIFEST\s*\[\s*["']\/admin\/page["']\s*\]\s*=\s*/.exec(manifest);
assert(assignment, 'Manifesto do Centro de comando ausente.');
const route = JSON.parse(manifest.slice(assignment.index + assignment[0].length).trim().replace(/;$/, ''));
const dashboard = Object.entries(route.clientModules).find(([name]) => name.endsWith('/OperationsDashboard.tsx'));
assert(dashboard, 'O painel não está no pacote de /admin.');
const scripts = dashboard[1].chunks.filter(file => file.endsWith('.js'))
  .map(file => readFileSync(join(dist, file.replace(/^\/_next\//, '')), 'utf8'));
assert(scripts.some(source => /className:\w+(?:\.\w+)*\.brandLogo\b/.test(source)),
  'Os botões do painel perderam o elemento da logo.');

const styles = [...new Set(Object.values(route.entryCSSFiles).flat().map(item => item.path))]
  .map(file => ({ file, css: readFileSync(join(dist, file), 'utf8') }));
// Approved WebP bytes. Update these together with an intentional artwork change.
const approved = {
  barbacue: '1086eeb18372b84f4e0b10258830aa019f04544a4a084d01f4a8b2d8d6526497',
  barbadog: '680c616fed385a022fe846d90f7bd5bae644cf37ad6b9a48513ec088eb942eed',
  chelas: 'ea6f32be7ad674e792f7f5ac1dee751649b169c0a90fb58f94558b6cd9ba8c79',
};
for (const [brand, digest] of Object.entries(approved)) {
  const selector = new RegExp('brand' + brand[0].toUpperCase() + brand.slice(1)
    + '\\s+\\.[\\w-]+brandLogo\\s*\\{[^}]*background-image:\\s*url\\(["\']?([^)"\']+)');
  const sheet = styles.find(({ css }) => selector.test(css));
  assert(sheet, `A regra de imagem de ${brand} está ausente em /admin.`);
  const [, url] = selector.exec(sheet.css);
  const file = url.startsWith('/_next/') ? join(dist, url.slice(7)) : resolve(dist, dirname(sheet.file), url);
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.equal(actual, digest, `Imagem incorreta ou incompleta para ${brand}.`);
}
console.log('Centro de comando validado: Barbacue, Barbadog e Chelas.');
