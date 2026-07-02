import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryRows } from '@/lib/clickhouse';
import { validSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CountryRow { country: string; c: string }
interface VisitorRow {
  visitor_id: string; country: string; device: string; browser: string; os: string;
  source: string; current_path: string; now_ts: string; visits: string; pages: string[]; ts_list: (string | number)[];
}

// Duration of the current ENGAGED session: we start from the last signal and walk back as long as
// the gap between two consecutive signals stays <= GRACE. A larger gap (visitor left then returned,
// or tab inactive) starts a new session. This avoids an absurd 2-hour "session time".
const GRACE = 60;
function streakStart(list: number[]): number {
  if (list.length === 0) return 0;
  let start = list[list.length - 1];
  for (let i = list.length - 1; i > 0; i--) {
    if (start - list[i - 1] <= GRACE) start = list[i - 1];
    else break;
  }
  return start;
}

// Active visitors (last 5 minutes): aggregated countries plus the list of visitors with detail.
export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const site = new URL(req.url).searchParams.get('site') ?? '';
  const all = !site || site === 'all';
  const filter = all ? '' : ' AND site_id = {site:String}';
  const params = all ? undefined : { site };

  try {
    const [countries, visitors] = await Promise.all([
      queryRows<CountryRow>(`SELECT country, count() AS c FROM (SELECT visitor_id, any(country) AS country FROM events WHERE event_type IN ('pageview', 'ping') AND ts >= now() - INTERVAL 2 HOUR${filter} GROUP BY visitor_id HAVING max(ts) >= now() - INTERVAL 45 SECOND AND countIf(event_type = 'pageview') > 0) WHERE country != '' GROUP BY country ORDER BY c DESC`, params),
      queryRows<VisitorRow>(
        // Truly live via an engagement-based heartbeat: the script pings every 15s as long
        // as the tab is visible AND the visitor is interacting. Present = last signal (pageview
        // OR ping) less than 45s ago. As soon as they leave, hide the tab or stay inactive, the pings
        // stop and they disappear in about 1 minute. The "session time" is the duration of the current
        // activity streak (see streakStart), not the time elapsed since the very first pageview.
        `SELECT visitor_id,
                any(country) AS country,
                argMax(device, ts) AS device,
                argMax(browser, ts) AS browser,
                argMax(source, ts) AS source,
                argMax(os, ts) AS os,
                argMaxIf(pathname, ts, event_type = 'pageview') AS current_path,
                toUnixTimestamp(now()) AS now_ts,
                countIf(event_type = 'pageview') AS visits,
                arraySlice(arrayReverse(groupArrayIf(pathname, event_type = 'pageview')), 1, 8) AS pages,
                arraySort(groupArray(toUnixTimestamp(ts))) AS ts_list
         FROM events
         WHERE event_type IN ('pageview', 'ping') AND ts >= now() - INTERVAL 2 HOUR${filter}
         GROUP BY visitor_id
         HAVING max(ts) >= now() - INTERVAL 45 SECOND AND countIf(event_type = 'pageview') > 0
         ORDER BY max(ts) DESC
         LIMIT 100`,
        params,
      ),
    ]);

    return NextResponse.json({
      countries: countries.map((r) => ({ country: r.country, count: Number(r.c) })),
      visitors: visitors.map((v) => {
        const list = (v.ts_list ?? []).map(Number).filter((n) => Number.isFinite(n));
        const start = streakStart(list);
        const now = Number(v.now_ts);
        return {
          id: v.visitor_id,
          country: v.country,
          device: v.device,
          browser: v.browser,
          os: v.os,
          source: v.source,
          path: v.current_path,
          sessionSec: start > 0 ? Math.max(0, now - start) : 0,
          visits: Number(v.visits),
          pages: v.pages ?? [],
        };
      }),
    });
  } catch {
    return NextResponse.json({ countries: [], visitors: [] }, { status: 503 });
  }
}
