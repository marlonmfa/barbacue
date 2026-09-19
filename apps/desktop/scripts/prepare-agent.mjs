import { cp, mkdir } from 'node:fs/promises';
const destination = new URL('../vendor/print-agent/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../../print-agent/src/', import.meta.url), destination, { recursive: true });
