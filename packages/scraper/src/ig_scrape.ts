import { chromium } from 'playwright';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

const INSTAGRAM_URL = 'https://www.instagram.com/barbacue.burguersnabrasa/';
const OUT_DIR = '/Users/marlonalcantara/Repos/barbacue/barbacue/apps/web/public/instagram';
const POST_DIR = path.join(OUT_DIR, 'posts');

async function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve(); return; }
    const f = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        f.close();
        download(res.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(f);
      f.on('finish', () => { f.close(); resolve(); });
    });
    req.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

(async () => {
  fs.mkdirSync(POST_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageState: undefined,
  });

  // Load cookies from Chrome profile via CDP workaround — inject from copied DB
  // We'll navigate directly and let the public API work without auth
  const page = await context.newPage();

  // Use the public Instagram mobile API (no auth needed for public profiles)
  const apiUrl = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=barbacue.burguersnabrasa';
  
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  const response = await page.evaluate(async (url) => {
    const r = await fetch(url, {
      headers: {
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });
    return { status: r.status, data: r.status === 200 ? await r.json() : await r.text() };
  }, apiUrl);

  console.log('API status:', response.status);

  if (response.status !== 200) {
    console.error('API failed:', typeof response.data === 'string' ? response.data.slice(0, 200) : response.status);
    await browser.close();
    process.exit(1);
  }

  const user = (response.data as any).data.user;
  const userId = user.id;
  const followerCount = user.edge_followed_by.count;
  console.log(`User: ${user.full_name} | Followers: ${followerCount} | Total posts: ${user.edge_owner_to_timeline_media.count}`);

  const posts: any[] = [];
  const edges = user.edge_owner_to_timeline_media.edges;
  for (const e of edges) {
    const n = e.node;
    posts.push({
      shortcode: n.shortcode,
      type: n.__typename,
      thumb: n.thumbnail_src || n.display_url,
      timestamp: n.taken_at_timestamp,
      likes: n.edge_media_preview_like?.count ?? 0,
    });
  }

  // Paginate using graphql
  let cursor = user.edge_owner_to_timeline_media.page_info?.end_cursor;
  let hasNext = user.edge_owner_to_timeline_media.page_info?.has_next_page;
  let pageNum = 1;

  while (hasNext && cursor && pageNum < 6) {
    await page.waitForTimeout(1200);
    const vars = JSON.stringify({ id: userId, first: 12, after: cursor });
    const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=69cba40317214236af40e7efa9efb319&variables=${encodeURIComponent(vars)}`;
    
    const gqlResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: 'include' });
      return { status: r.status, data: r.status === 200 ? await r.json() : null };
    }, gqlUrl);

    if (gqlResp.status !== 200 || !gqlResp.data) break;

    const media = gqlResp.data?.data?.user?.edge_owner_to_timeline_media;
    if (!media) break;

    for (const e of (media.edges || [])) {
      const n = e.node;
      posts.push({
        shortcode: n.shortcode,
        type: n.__typename,
        thumb: n.thumbnail_src || n.display_url,
        timestamp: n.taken_at_timestamp,
        likes: n.edge_media_preview_like?.count ?? 0,
      });
    }

    hasNext = media.page_info?.has_next_page;
    cursor = media.page_info?.end_cursor;
    pageNum++;
    console.log(`Page ${pageNum}: ${posts.length} posts collected`);
  }

  console.log(`\nTotal posts: ${posts.length}`);

  // Download thumbnails
  let downloaded = 0;
  for (let i = 0; i < Math.min(posts.length, 24); i++) {
    const p = posts[i];
    const dest = path.join(POST_DIR, `post_${String(i + 1).padStart(2, '0')}.jpg`);
    try {
      await download(p.thumb, dest);
      downloaded++;
      if (downloaded % 6 === 0) console.log(`Downloaded ${downloaded} images...`);
    } catch (e: any) {
      console.warn(`Skip post ${i + 1}: ${e.message}`);
    }
  }
  console.log(`Downloaded ${downloaded} images to ${POST_DIR}`);

  // Save manifest
  const manifest = {
    scrapedAt: new Date().toISOString(),
    instagramUrl: INSTAGRAM_URL,
    handle: 'barbacue.burguersnabrasa',
    followers: followerCount,
    posts: posts.map((p, i) => ({
      ...p,
      localFile: i < 24 ? `/instagram/posts/post_${String(i + 1).padStart(2, '0')}.jpg` : null,
      instagramUrl: `https://www.instagram.com/p/${p.shortcode}/`,
    })),
  };

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Manifest saved.');

  await browser.close();
})();
