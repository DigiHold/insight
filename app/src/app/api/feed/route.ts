import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryRows } from '@/lib/clickhouse';
import { validSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FeedRow { ts: string; pathname: string; country: string; source: string; source_type: string; device: string }

// Real-time feed: the last pageviews as they happen.
export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const site = new URL(req.url).searchParams.get('site') ?? '';
  const all = !site || site === 'all';
  const filter = all ? '' : ' AND site_id = {site:String}';
  const params = all ? undefined : { site };
  try {
    const rows = await queryRows<FeedRow>(
      `SELECT toUnixTimestamp(ts) AS ts, pathname, country, source, source_type, device
       FROM events WHERE event_type = 'pageview' AND ts >= now() - INTERVAL 24 HOUR${filter}
       ORDER BY ts DESC LIMIT 20`,
      params,
    );
    return NextResponse.json({ feed: rows.map((r) => ({ ts: Number(r.ts), path: r.pathname || '/', country: r.country, source: r.source, type: r.source_type, device: r.device })) });
  } catch {
    return NextResponse.json({ feed: [] }, { status: 503 });
  }
}
