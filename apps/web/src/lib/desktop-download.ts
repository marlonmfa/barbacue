import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const manifestSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  filename: z.string().regex(/^Barbacue-Pedidos-\d+\.\d+\.\d+-Windows-x64-Setup\.exe$/),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).refine(value => value.filename === `Barbacue-Pedidos-${value.version}-Windows-x64-Setup.exe`);

export async function openDesktopDownload() {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(process.cwd(), 'private-downloads', 'windows.json'), 'utf8')));
  const file = await open(join(process.cwd(), 'private-downloads', manifest.filename), 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size !== manifest.size) throw new Error('Instalador indisponível');
    return { file, manifest };
  } catch (error) { await file.close(); throw error; }
}
export async function desktopDownloadInfo() {
  try {
    const { file, manifest } = await openDesktopDownload();
    await file.close();
    return manifest;
  } catch { return null; }
}
