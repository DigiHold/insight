import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { getMapboxToken, setMapboxToken } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authed(): Promise<boolean> {
  const s = (await cookies()).get('insight_session')?.value;
  return validSession(s);
}

// Client side config. The Mapbox token (public, URL restricted) is stored globally on
// the VPS and pasted from the UI, never in the code or the image.
export async function GET() {
  // The demo dashboard needs the map too. The token is a public pk_ token,
  // URL-restricted to this domain, so exposing it to demo visitors is safe.
  const demoEnabled = !!(process.env.DEMO_SITE_ID ?? '');
  if (!(await authed()) && !demoEnabled) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ mapbox: await getMapboxToken() });
}

export async function POST(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let token = '';
  try { token = String((await req.json())?.token ?? '').trim(); } catch { token = ''; }
  if (!/^pk\.[A-Za-z0-9._-]+$/.test(token)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  await setMapboxToken(token);
  return NextResponse.json({ ok: true });
}
