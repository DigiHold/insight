import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryRows } from '@/lib/clickhouse';
import { validSession } from '@/lib/auth';
import { getSite } from '@/lib/sites';
import { stripeRevenue, stripeRevenueRange, stripeSeries, stripeSeriesRange, type Revenue, type RevenueBucket } from '@/lib/stripe';
import { getGa4Account } from '@/lib/ga4-account';
import { ga4LiveStats, ga4RangeStats, ga4TodayStats, type Ga4Stats } from '@/lib/ga4';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CountRow { key: string; source_type?: string; vendor?: string; category?: string; c: string; last_ts?: string }
interface OneRow { visitors?: string; pageviews?: string; n?: string; d?: string; bounced?: string; sessions?: string }
interface TsRow { h: string; c: string }

const n = (v: string | undefined): number => (v ? Number(v) : 0);

function ga4Type(name: string): string {
  const s = name.toLowerCase();
  if (/google|bing|duckduckgo|yahoo|ecosia|brave|qwant/.test(s)) return 'search';
  if (/twitter|linkedin|facebook|reddit|instagram|youtube|tiktok|threads|(^|\.)x\b|t\.co/.test(s)) return 'social';
  if (/chatgpt|perplexity|claude|gemini|grok|copilot|openai/.test(s)) return 'ai';
  if (s.includes('direct')) return 'direct';
  return 'referral';
}

interface Ai { name: string; vendor: string; category: string; count: number; last: string; pages: { name: string; count: number }[] }
type AiSeriesPoint = Record<string, number | string>;
interface Base { revenue: Revenue | null; online: number; campaigns: { name: string; count: number }[]; ai: Ai[]; aiSeries: AiSeriesPoint[]; aiBots: string[] }

interface AiPageRow { bot: string; path: string; c: string }
interface AiSeriesRow { d: string; bot: string; c: string }

// AI crawlers + indexing bots (Googlebot, Bingbot...) over N days: a list (with pages per bot),
// and a per-bot time series for the multi-line chart.
async function aiData(filter: string, params: Record<string, unknown> | undefined, days: number, winExpr?: string): Promise<{ ai: Ai[]; aiSeries: AiSeriesPoint[]; aiBots: string[] }> {
  const win = winExpr ?? `ts >= now() - INTERVAL ${days} DAY`;
  const [rows, pageRows, seriesRows] = await Promise.all([
    queryRows<CountRow>(`SELECT bot_name AS key, any(vendor) AS vendor, any(category) AS category, count() AS c, max(ts) AS last_ts FROM ai_hits WHERE ${win}${filter} GROUP BY bot_name ORDER BY c DESC LIMIT 30`, params),
    queryRows<AiPageRow>(`SELECT bot_name AS bot, path, count() AS c FROM ai_hits WHERE ${win}${filter} GROUP BY bot_name, path ORDER BY c DESC LIMIT 400`, params),
    queryRows<AiSeriesRow>(`SELECT toString(toDate(ts)) AS d, bot_name AS bot, count() AS c FROM ai_hits WHERE ${win}${filter} GROUP BY d, bot ORDER BY d`, params),
  ]);
  const pagesByBot = new Map<string, { name: string; count: number }[]>();
  for (const r of pageRows) {
    const arr = pagesByBot.get(r.bot) ?? [];
    if (arr.length < 25) { arr.push({ name: r.path || '/', count: n(r.c) }); pagesByBot.set(r.bot, arr); }
  }
  const ai: Ai[] = rows.map((r) => ({ name: r.key, vendor: r.vendor ?? '', category: r.category ?? '', count: n(r.c), last: r.last_ts ?? '', pages: pagesByBot.get(r.key) ?? [] }));
  const aiBots = ai.slice(0, 6).map((a) => a.name);
  const byDate = new Map<string, AiSeriesPoint>();
  for (const r of seriesRows) {
    if (!aiBots.includes(r.bot)) continue;
    const o = byDate.get(r.d) ?? { t: r.d };
    o[r.bot] = Number(o[r.bot] ?? 0) + n(r.c);
    byDate.set(r.d, o);
  }
  const aiSeries = [...byDate.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)));
  return { ai, aiSeries, aiBots };
}

// GA4 'date' (YYYYMMDD) -> ISO YYYY-MM-DD ; GA4 'hour' (00..23) -> HH:00.
// The frontend then formats it as "16 Jun" / "8 AM" and computes the "X days ago".
const slabel = (d: string): string => (d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : `${d.padStart(2, '0')}:00`);

// Overlays Stripe revenue on the visitors series, aligned by label.
// revenue = net new sales for the bucket, refunds = amount refunded.
function attachRev<S extends { t: string; count: number }>(series: S[], rev: Record<string, RevenueBucket> | null): (S & { revenue: number; refunds: number })[] {
  return series.map((p) => {
    const b = rev?.[p.t];
    return { ...p, revenue: b ? Math.round(b.n * 100) / 100 : 0, refunds: b ? Math.round(b.r * 100) / 100 : 0 };
  });
}

// Transforms a Ga4Stats into the shape expected by the dashboard (Today, cards, series).
function fromGa4(g: Ga4Stats, base: Base) {
  const chMap = new Map<string, number>();
  for (const r of g.sources) { const t = ga4Type(r.key); chMap.set(t, (chMap.get(t) ?? 0) + r.visitors); }
  const channels = [...chMap.entries()].map(([type, count]) => ({ name: type, type, count })).sort((a, b) => b.count - a.count);
  return {
    revenue: base.revenue,
    online: base.online,
    today: { visitors: g.visitors, pageviews: g.pageviews, avgDuration: g.avgDuration, bounceRate: g.bounceRate },
    prev: g.prev ?? null,
    channels,
    referrers: g.sources.map((r) => ({ name: r.key, count: r.visitors })),
    campaigns: base.campaigns,
    pages: g.pages.map((r) => ({ name: r.key || '/', count: r.pageviews })),
    countries: g.countries.map((r) => ({ name: r.key, count: r.visitors })),
    devices: g.devices.map((r) => ({ name: r.key, count: r.visitors })),
    browsers: g.browsers.map((r) => ({ name: r.key, count: r.visitors })),
    os: g.os.map((r) => ({ name: r.key, count: r.visitors })),
    series: g.series.map((r) => ({ t: slabel(r.date), count: r.visitors })),
    ai: base.ai,
    aiSeries: base.aiSeries,
    aiBots: base.aiBots,
  };
}

export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const site = url.searchParams.get('site') ?? 'all';
  const period = url.searchParams.get('period') ?? 'today';
  const all = site === 'all' || site === '';
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const custom = period === 'custom' && dateRe.test(from) && dateRe.test(to) && from <= to;

  try {
    const data = period === 'today'
      ? await liveStats(site, all)
      : await historyStats(site, all, custom ? 'custom' : period, custom ? from : undefined, custom ? to : undefined);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}

async function liveStats(site: string, all: boolean) {
  const filter = all ? '' : ' AND site_id = {site:String}';
  const params = all ? undefined : { site };

  const [online, today, channels, referrers, pages, countries, series, aiRes, avg, bounce, devices, browsers, os, campaigns, prevToday, prevAvg, prevBounce] = await Promise.all([
    queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS n FROM events WHERE event_type IN ('pageview', 'ping') AND ts >= now() - INTERVAL 45 SECOND${filter}`, params),
    queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ts >= toStartOfDay(now())${filter}`, params),
    queryRows<CountRow>(`SELECT source_type AS key, count() AS c FROM events WHERE event_type = 'pageview' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY source_type ORDER BY c DESC`, params),
    queryRows<CountRow>(`SELECT domain(referrer) AS key, count() AS c FROM events WHERE event_type = 'pageview' AND referrer != '' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY key ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT pathname AS key, count() AS c FROM events WHERE event_type = 'pageview' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY pathname ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT country AS key, count() AS c FROM events WHERE event_type = 'pageview' AND country != '' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY country ORDER BY c DESC LIMIT 50`, params),
    queryRows<TsRow>(`SELECT toStartOfHour(ts) AS h, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND ts >= now() - INTERVAL 24 HOUR${filter} GROUP BY h ORDER BY h`, params),
    aiData(filter, params, 7),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ts >= toStartOfDay(now())${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ts >= toStartOfDay(now())${filter} GROUP BY visitor_id)`, params),
    queryRows<CountRow>(`SELECT device AS key, count() AS c FROM events WHERE event_type = 'pageview' AND device != '' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY device ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT browser AS key, count() AS c FROM events WHERE event_type = 'pageview' AND browser != '' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY browser ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT os AS key, count() AS c FROM events WHERE event_type = 'pageview' AND os != '' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY os ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT utm_campaign AS key, count() AS c FROM events WHERE event_type = 'pageview' AND utm_campaign != '' AND ts >= now() - INTERVAL 1 DAY${filter} GROUP BY utm_campaign ORDER BY c DESC LIMIT 30`, params),
    // Previous period = yesterday, same hourly window (for the card deltas).
    queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ts >= toStartOfDay(now()) - INTERVAL 1 DAY AND ts < now() - INTERVAL 1 DAY${filter}`, params),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ts >= toStartOfDay(now()) - INTERVAL 1 DAY AND ts < now() - INTERVAL 1 DAY${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ts >= toStartOfDay(now()) - INTERVAL 1 DAY AND ts < now() - INTERVAL 1 DAY${filter} GROUP BY visitor_id)`, params),
  ]);

  const sessions = n(bounce[0]?.sessions);
  const bounceRate = sessions > 0 ? Math.round((n(bounce[0]?.bounced) / sessions) * 100) : 0;
  const prevSessions = n(prevBounce[0]?.sessions);
  const prev = {
    visitors: n(prevToday[0]?.visitors),
    pageviews: n(prevToday[0]?.pageviews),
    avgDuration: Math.round(Number(prevAvg[0]?.d ?? 0)),
    bounceRate: prevSessions > 0 ? Math.round((n(prevBounce[0]?.bounced) / prevSessions) * 100) : 0,
  };
  const { ai: aiOut, aiSeries, aiBots } = aiRes;
  const campaignsOut = campaigns.map((r) => ({ name: r.key, count: n(r.c) }));

  let revenue: Revenue | null = null;
  const s = all ? undefined : await getSite(site);
  if (s?.stripeKey) revenue = await stripeRevenue(s.stripeKey, 1);
  const revMap = s?.stripeKey ? await stripeSeries(s.stripeKey, 1) : null;

  // If GA4 is connected, "Today" comes from GA4 (same number as in GA4). The tracker
  // is then only used for real time: Online and the live card.
  const acc = s?.ga4 ? await getGa4Account() : null;
  if (s?.ga4 && acc) {
    const g = await ga4TodayStats(acc.json, s.ga4.propertyId);
    if (g) {
      const out = fromGa4(g, { revenue, online: n(online[0]?.n), campaigns: campaignsOut, ai: aiOut, aiSeries, aiBots });
      return { ...out, series: attachRev(out.series, revMap) };
    }
  }

  return {
    revenue,
    online: n(online[0]?.n),
    today: { visitors: n(today[0]?.visitors), pageviews: n(today[0]?.pageviews), avgDuration: Math.round(Number(avg[0]?.d ?? 0)), bounceRate },
    prev,
    channels: channels.map((r) => ({ name: r.key, type: r.key, count: n(r.c) })),
    referrers: referrers.map((r) => ({ name: r.key, count: n(r.c) })),
    campaigns: campaignsOut,
    pages: pages.map((r) => ({ name: r.key || '/', count: n(r.c) })),
    countries: countries.map((r) => ({ name: r.key, count: n(r.c) })),
    devices: devices.map((r) => ({ name: r.key, count: n(r.c) })),
    browsers: browsers.map((r) => ({ name: r.key, count: n(r.c) })),
    os: os.map((r) => ({ name: r.key, count: n(r.c) })),
    series: attachRev(series.map((r) => ({ t: r.h.length >= 13 ? `${r.h.slice(11, 13)}:00` : r.h, count: n(r.c) })), revMap),
    ai: aiOut,
    aiSeries,
    aiBots,
  };
}

// History. If GA4 is connected, we read GA4 live over the exact period (numbers = GA4).
// Otherwise (GA4 removed, or "all sites"), we aggregate the Insight tracker from ClickHouse.
async function historyStats(site: string, all: boolean, period: string, from?: string, to?: string) {
  const custom = period === 'custom' && !!from && !!to;
  const days = custom
    ? Math.min(366, Math.max(1, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1))
    : period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const filter = all ? '' : ' AND site_id = {site:String}';
  const params: Record<string, unknown> | undefined = all
    ? (custom ? { from, to } : undefined)
    : (custom ? { site, from, to } : { site });
  // Time window expressions: rolling N days, or the exact custom range.
  const win = custom ? `ts >= toDateTime({from:String}) AND ts < toDateTime({to:String}) + INTERVAL 1 DAY` : `ts >= now() - INTERVAL ${days} DAY`;
  const pwin = custom
    ? `ts >= toDateTime({from:String}) - INTERVAL ${days} DAY AND ts < toDateTime({from:String})`
    : `ts >= now() - INTERVAL ${2 * days} DAY AND ts < now() - INTERVAL ${days} DAY`;

  const [onlineRows, aiRes] = await Promise.all([
    queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS n FROM events WHERE event_type IN ('pageview', 'ping') AND ts >= now() - INTERVAL 45 SECOND${filter}`, all ? undefined : { site }),
    aiData(filter, params, days, custom ? win : undefined),
  ]);
  const { ai, aiSeries, aiBots } = aiRes;
  const online = n(onlineRows[0]?.n);

  const fromSec = custom ? Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000) : 0;
  const toSec = custom ? Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000) + 86400 : 0;
  const s = all ? undefined : await getSite(site);
  const revenue = s?.stripeKey ? (custom ? await stripeRevenueRange(s.stripeKey, fromSec, toSec) : await stripeRevenue(s.stripeKey, days)) : null;
  const revMap = s?.stripeKey ? (custom ? await stripeSeriesRange(s.stripeKey, fromSec, toSec) : await stripeSeries(s.stripeKey, days)) : null;
  const base: Base = { revenue, online, campaigns: [], ai, aiSeries, aiBots };

  const acc = s?.ga4 ? await getGa4Account() : null;
  if (s?.ga4 && acc) {
    const g = custom
      ? await ga4RangeStats(acc.json, s.ga4.propertyId, from as string, to as string)
      : await ga4LiveStats(acc.json, s.ga4.propertyId, days);
    if (g) {
      const out = fromGa4(g, base);
      return { ...out, series: attachRev(out.series, revMap) };
    }
  }
  return eventsHistory(filter, params, days, base, revMap, win, pwin);
}

// Aggregates history from the Insight tracker (ClickHouse), series by day.
// win/pwin are the current and previous time window SQL expressions.
async function eventsHistory(filter: string, params: Record<string, unknown> | undefined, days: number, base: Base, revMap: Record<string, RevenueBucket> | null, win: string, pwin: string) {
  const pv = `event_type = 'pageview' AND ${win}${filter}`;
  const [tot, series, channels, referrers, pages, countries, devices, browsers, os, campaigns, avg, bounce, prevTot, prevAvg, prevBounce] = await Promise.all([
    queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ${win}${filter}`, params),
    queryRows<CountRow>(`SELECT toString(toDate(ts)) AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} GROUP BY key ORDER BY key`, params),
    queryRows<CountRow>(`SELECT source_type AS key, count() AS c FROM events WHERE ${pv} GROUP BY source_type ORDER BY c DESC`, params),
    queryRows<CountRow>(`SELECT domain(referrer) AS key, count() AS c FROM events WHERE ${pv} AND referrer != '' GROUP BY key ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT pathname AS key, count() AS c FROM events WHERE ${pv} GROUP BY pathname ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT country AS key, count() AS c FROM events WHERE ${pv} AND country != '' GROUP BY country ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT device AS key, count() AS c FROM events WHERE ${pv} AND device != '' GROUP BY device ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT browser AS key, count() AS c FROM events WHERE ${pv} AND browser != '' GROUP BY browser ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT os AS key, count() AS c FROM events WHERE ${pv} AND os != '' GROUP BY os ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT utm_campaign AS key, count() AS c FROM events WHERE ${pv} AND utm_campaign != '' GROUP BY utm_campaign ORDER BY c DESC LIMIT 30`, params),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ${win}${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ${win}${filter} GROUP BY visitor_id)`, params),
    queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ${pwin}${filter}`, params),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ${pwin}${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ${pwin}${filter} GROUP BY visitor_id)`, params),
  ]);
  const sessions = n(bounce[0]?.sessions);
  const bounceRate = sessions > 0 ? Math.round((n(bounce[0]?.bounced) / sessions) * 100) : 0;
  const prevSessions = n(prevBounce[0]?.sessions);
  const prev = {
    visitors: n(prevTot[0]?.visitors),
    pageviews: n(prevTot[0]?.pageviews),
    avgDuration: Math.round(Number(prevAvg[0]?.d ?? 0)),
    bounceRate: prevSessions > 0 ? Math.round((n(prevBounce[0]?.bounced) / prevSessions) * 100) : 0,
  };
  return {
    revenue: base.revenue,
    online: base.online,
    today: { visitors: n(tot[0]?.visitors), pageviews: n(tot[0]?.pageviews), avgDuration: Math.round(Number(avg[0]?.d ?? 0)), bounceRate },
    prev,
    channels: channels.map((r) => ({ name: r.key, type: r.key, count: n(r.c) })),
    referrers: referrers.map((r) => ({ name: r.key, count: n(r.c) })),
    campaigns: campaigns.map((r) => ({ name: r.key, count: n(r.c) })),
    pages: pages.map((r) => ({ name: r.key || '/', count: n(r.c) })),
    countries: countries.map((r) => ({ name: r.key, count: n(r.c) })),
    devices: devices.map((r) => ({ name: r.key, count: n(r.c) })),
    browsers: browsers.map((r) => ({ name: r.key, count: n(r.c) })),
    os: os.map((r) => ({ name: r.key, count: n(r.c) })),
    series: attachRev(series.map((r) => ({ t: r.key, count: n(r.c) })), revMap),
    ai: base.ai,
    aiSeries: base.aiSeries,
    aiBots: base.aiBots,
  };
}
