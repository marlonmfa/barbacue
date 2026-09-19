// Narrow presentation update for the already deployed standalone bundle.
// Usage: node patch-deployed-image-css.mjs BUNDLE_DIR CSS_FILE [--apply]
// Keeps the old stylesheet intact; changes only its client-reference manifests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [bundle, cssFile, apply] = process.argv.slice(2);
if (!bundle || !cssFile) throw new Error('Supply bundle directory and compatibility stylesheet');
const originalName = '0clmyp9t9v4_u.css';
const original = await fs.readFile(path.join(bundle, 'static/chunks', originalName), 'utf8');
const combined = original + '\n' + await fs.readFile(cssFile, 'utf8');
const newName = `menu-images-${createHash('sha256').update(combined).digest('hex').slice(0,16)}.css`;
const changes = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith('_client-reference-manifest.js')) {
      const before = await fs.readFile(file, 'utf8');
      if (before.includes(originalName)) changes.push({ file, before, after: before.replaceAll(originalName, newName) });
    }
  }
}
await walk(path.join(bundle, 'server'));
if (changes.length !== 24) throw new Error(`Expected the audited 24 manifests, found ${changes.length}; inspect this deployment first`);
console.log(JSON.stringify({ newName, manifestCount: changes.length, apply: apply === '--apply' }));
if (apply === '--apply') {
  // A second run aborts before modifying anything. Backups stay outside served paths.
  const backup = path.join(bundle, '..', 'image-css-backup-2026-09-07');
  await fs.mkdir(backup);
  for (const change of changes) {
    const target = path.join(backup, path.relative(bundle, change.file));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, change.before);
  }
  await fs.writeFile(path.join(bundle, 'static/chunks', newName), combined);
  for (const change of changes) await fs.writeFile(change.file, change.after);
  await fs.writeFile(path.join(backup, 'manifest.json'), JSON.stringify({ newName, files: changes.map(c => path.relative(bundle, c.file)) }, null, 2));
}
