import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { getSite, setFavicon } from '@/lib/sites';
import { readFavicon, fetchAndSaveFavicon, looksLikeHtml } from '@/lib/favicon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Serves the self-hosted favicon. If it does not exist yet but the site has a URL, we
// download it (the site's SVG first) and store it on the VPS on the fly, then serve it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = (await cookies()).get('insight_session')?.value;
  const { id } = await params;
  if (!validSession(session) && id !== (process.env.DEMO_SITE_ID ?? '__none__')) return new NextResponse(null, { status: 401 });

  const site = await getSite(id);
  if (!site) return new NextResponse(null, { status: 404 });

  let buf = await readFavicon(id);
  let type = site.faviconType;

  // Self-healing: an old invalid file (HTML) is ignored and re-downloaded.
  if (buf && looksLikeHtml(buf)) { buf = null; type = undefined; }

  if ((!buf || !type) && site.url) {
    const fetched = await fetchAndSaveFavicon(id, site.url);
    if (fetched) {
      type = fetched;
      await setFavicon(id, fetched);
      buf = await readFavicon(id);
    }
  }

  if (!buf || !type) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' },
  });
}
