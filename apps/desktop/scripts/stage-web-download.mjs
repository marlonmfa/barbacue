import { createReadStream } from 'node:fs';
import { mkdir, copyFile, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const filename = `Barbacue-Pedidos-${version}-Windows-x64-Setup.exe`;
const source = fileURLToPath(new URL(`../release/${filename}`, import.meta.url));
const directory = fileURLToPath(new URL('../../web/private-downloads/', import.meta.url));
const hash = createHash('sha256');
for await (const chunk of createReadStream(source)) hash.update(chunk);
const { size } = await stat(source);
await mkdir(directory, { recursive: true });
await copyFile(source, join(directory, `${filename}.tmp`));
await rename(join(directory, `${filename}.tmp`), join(directory, filename));
await writeFile(join(directory, 'windows.json.tmp'), JSON.stringify({ version, filename, size, sha256: hash.digest('hex') }, null, 2) + '\n');
await rename(join(directory, 'windows.json.tmp'), join(directory, 'windows.json'));
console.log(`Instalador ${version} preparado no armazenamento privado do site (${(size / 1024 / 1024).toFixed(1)} MB).`);
