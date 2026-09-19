// Copies approved imagegen originals and produces compact web assets without
// cropping, retouching or changing their contents. Run from apps/web.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const entries = JSON.parse(await fs.readFile(path.join(root, 'docs/image-audit/generated.json'), 'utf8'));
const destination = path.join(root, 'public/menu/review-2026-09');
await fs.mkdir(destination, { recursive: true });
for (const entry of entries) {
  const file = entry.hint.match(/ as (\/[^\n]+\.png) by default/)?.[1];
  if (!file) throw new Error(`Missing generated file: ${entry.key}`);
  const output = path.join(destination, `${entry.key}.webp`);
  await sharp(file).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 85 }).toFile(output);
  console.log(`${entry.key}: ${(await fs.stat(output)).size} bytes`);
}
