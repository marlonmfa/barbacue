import { Readable } from 'node:stream';
import { withRole } from '@/lib/admin-auth';
import { openDesktopDownload } from '@/lib/desktop-download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cacheHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

const download = withRole('admin', async request => {
  let installer;
  try { installer = await openDesktopDownload(); }
  catch { return Response.json({ error: 'O instalador ainda não está disponível neste servidor. Tente novamente após a publicação.' }, { status: 503, headers: cacheHeaders }); }
  const { file, manifest } = installer;
  const headers = {
    ...cacheHeaders,
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${manifest.filename}"`,
    'Content-Length': String(manifest.size),
    'Accept-Ranges': 'none',
  };
  if (request.method === 'HEAD') { await file.close(); return new Response(null, { headers }); }
  const stream = file.createReadStream(); // Auto-closes the descriptor on completion or cancellation.
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers });
});
export const GET = download;
export const HEAD = download;
