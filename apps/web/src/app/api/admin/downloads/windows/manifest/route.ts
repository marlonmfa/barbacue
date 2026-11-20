import { withRole } from '@/lib/admin-auth';
import { desktopDownloadInfo } from '@/lib/desktop-download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

export const GET = withRole('admin', async () => {
  const manifest = await desktopDownloadInfo();
  if (!manifest) return Response.json({ error: 'O instalador ainda não está disponível neste servidor.' }, { status: 404, headers });
  return Response.json(manifest, { headers });
});
