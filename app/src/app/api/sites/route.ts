import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { listSites, addSite, removeSite, setFavicon, setSiteUrl, toPublic } from '@/lib/sites';
import { fetchAndSaveFavicon, deleteFavicon } from '@/lib/favicon';
import { command } from '@/lib/clickhouse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authed(): Promise<boolean> {
  const s = (await cookies()).get('insight_session')?.value;
  return validSession(s);
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ sites: (await listSites()).map(toPublic) });
}

export async function POST(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let name = '';
  let url = '';
  try {
    const b = await req.json();
    name = String(b?.name ?? '').trim();
    url = String(b?.url ?? '').trim();
  } catch {
    name = '';
  }
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });

  const site = await addSite(name, url);
  if (url) {
    const type = await fetchAndSaveFavicon(site.id, url);
    if (type) await setFavicon(site.id, type);
  }
  const updated = (await listSites()).find((s) => s.id === site.id) ?? site;
  return NextResponse.json({ site: toPublic(updated) });
}

// Updates a site's URL (required for favicons AND Search Console).
export async function PATCH(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let id = '';
  let url = '';
  try {
    const b = await req.json();
    id = String(b?.id ?? '').trim();
    url = String(b?.url ?? '').trim();
  } catch {
    id = '';
  }
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  await setSiteUrl(id, url);
  const updated = (await listSites()).find((s) => s.id === id);
  return NextResponse.json({ site: updated ? toPublic(updated) : null });
}

export async function DELETE(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ ok: true });

  const safe = id.replace(/'/g, '');
  await removeSite(id);
  await deleteFavicon(id);
  try {
    await command(`DELETE FROM insight.events WHERE site_id = '${safe}'`);
    await command(`DELETE FROM insight.ai_hits WHERE site_id = '${safe}'`);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
