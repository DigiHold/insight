import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession, demoAllowed } from '@/lib/auth';
import { getJson, setJson } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Funnel definition: an ordered list of page paths (2 to 4 steps).
export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  const site = new URL(req.url).searchParams.get('site') ?? '';
  if (!validSession(session) && !demoAllowed(site)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const steps = (await getJson<string[]>(`funnel-${site}`)) ?? [];
  return NextResponse.json({ steps });
}

export async function POST(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const site = new URL(req.url).searchParams.get('site') ?? '';
  const body = (await req.json().catch(() => ({}))) as { steps?: string[] };
  // Normalize a trailing slash away ("/pricing/" -> "/pricing") so steps match
  // pageviews the same way the funnel query does; root "/" stays "/".
  const steps = (body.steps ?? []).map((p) => String(p).trim()).filter(Boolean)
    .map((p) => { const t = p.replace(/\/+$/, ''); return t === '' ? '/' : t; }).slice(0, 4);
  if (!site || steps.length < 2) {
    if (site && steps.length === 0) { await setJson(`funnel-${site}`, []); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  await setJson(`funnel-${site}`, steps);
  return NextResponse.json({ ok: true });
}
