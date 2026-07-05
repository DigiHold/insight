import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryRows } from '@/lib/clickhouse';
import { validSession, demoAllowed } from '@/lib/auth';

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
  const site = new URL(req.url).searchParams.get('site') ?? '';
  if (!validSession(session) && !demoAllowed(site)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const all = !site || site === 'all';
  const filter = all ? '' : ' AND site_id = {site:String}';
  const params = all ? undefined : { site };

  try {
    const [onlineRows, countries, visitors] = await Promise.all([
      // Same count as the dashboard "Online" chip, so the globe total matches it
      // even for present visitors whose location is unknown (no marker).
      queryRows<{ n: string }>(`SELECT uniqExact(visitor_id) AS n FROM events WHERE event_type IN ('pageview', 'ping') AND ts >= now() - INTERVAL 45 SECOND${filter}`, params),
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
                argMax(pathname, ts) AS current_path,
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
      online: Number(onlineRows[0]?.n ?? 0),
      countries: countries.map((r) => ({ country: r.country, count: Number(r.c) })),
      visitors: visitors.map((v) => {
        const list = (v.ts_list ?? []).map(Number).filter((n) => Number.isFinite(n));
        const start = streakStart(list);
        const now = Number(v.now_ts);
        const lastTs = list.length ? list[list.length - 1] : 0;
        return {
          id: v.visitor_id,
          country: v.country,
          device: v.device,
          browser: v.browser,
          os: v.os,
          source: v.source,
          path: v.current_path,
          // Time up to the visitor's last signal, not "now": once they leave, the
          // marker lingers ~45s but the session time must not keep counting the void.
          sessionSec: start > 0 && lastTs > 0 ? Math.max(0, lastTs - start) : 0,
          // Still pinging (interacted within the last ping cycle). Only then does the
          // client counter tick live; otherwise it stays frozen at the real duration.
          active: lastTs > 0 && now - lastTs <= 25,
          visits: Number(v.visits),
          pages: v.pages ?? [],
        };
      }),
    });
  } catch {
    return NextResponse.json({ online: 0, countries: [], visitors: [] }, { status: 503 });
  }
}
