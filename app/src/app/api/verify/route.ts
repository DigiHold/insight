import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryRows } from '@/lib/clickhouse';
import { validSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Row { c: string }

// Checks that a site's script is actually sending events (installation OK).
export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const site = new URL(req.url).searchParams.get('site') ?? '';
  if (!site) return NextResponse.json({ ok: false, count: 0 });

  try {
    const rows = await queryRows<Row>(
      'SELECT count() AS c FROM events WHERE site_id = {site:String} AND ts >= now() - INTERVAL 1 DAY',
      { site },
    );
    const count = Number(rows[0]?.c ?? 0);
    return NextResponse.json({ ok: count > 0, count });
  } catch {
    return NextResponse.json({ ok: false, count: 0 }, { status: 503 });
  }
}
