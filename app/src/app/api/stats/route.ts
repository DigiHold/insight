import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryRows } from '@/lib/clickhouse';
import { validSession, validApiToken, bearerFrom, demoAllowed } from '@/lib/auth';
import { getSite } from '@/lib/sites';
import { getJson } from '@/lib/settings';
import { stripeRevenue, stripeRevenueRange, stripeSeries, stripeSeriesRange, type Revenue, type RevenueBucket } from '@/lib/stripe';
import { getGa4Account } from '@/lib/ga4-account';
import { ga4LiveStats, ga4RangeStats, type Ga4Stats } from '@/lib/ga4';

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

interface HeatCell { d: string; h: string; c: string }
interface CohortRow { cohort: string; offset: string; n: string }
interface RevRow { key: string; amount: string }

// Extra breakdowns computed from the tracker (ClickHouse), shared by the
// live and history paths. win = current window condition; beforeExpr =
// "before the window" condition used for new vs returning.
async function extraData(site: string, all: boolean, filter: string, params: Record<string, unknown> | undefined, win: string, beforeExpr: string) {
  const pv = `event_type = 'pageview' AND ${win}${filter}`;
  // Each extra query is independently fail-safe: a single broken query returns
  // an empty list instead of taking down the whole dashboard.
  const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[]);
  const brk = (col: string, extra = '') => safe(queryRows<CountRow>(`SELECT ${col} AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv}${extra} GROUP BY key ORDER BY c DESC LIMIT 50`, params));
  const funnelSteps = all ? [] : ((await getJson<string[]>(`funnel-${site}`).catch(() => [])) ?? []);

  const [landing, exits, outbound, utmMedium, utmTerm, utmContent, languages, cities, regions, returning, totalV, heatmap, retention, revChannel, revCampaign, funnelRows] = await Promise.all([
    safe(queryRows<CountRow>(`SELECT lp AS key, uniqExact(visitor_id) AS c FROM (SELECT visitor_id, argMin(pathname, ts) AS lp FROM events WHERE ${pv} GROUP BY visitor_id) GROUP BY key ORDER BY c DESC LIMIT 50`, params)),
    safe(queryRows<CountRow>(`SELECT lp AS key, uniqExact(visitor_id) AS c FROM (SELECT visitor_id, argMax(pathname, ts) AS lp FROM events WHERE ${pv} GROUP BY visitor_id) GROUP BY key ORDER BY c DESC LIMIT 50`, params)),
    safe(queryRows<CountRow>(`SELECT click_target AS key, count() AS c FROM events WHERE event_type = 'click' AND click_target != '' AND ${win}${filter} GROUP BY key ORDER BY c DESC LIMIT 50`, params)),
    brk('utm_medium', " AND utm_medium != ''"),
    brk('utm_term', " AND utm_term != ''"),
    brk('utm_content', " AND utm_content != ''"),
    brk("lower(substring(language, 1, 2))", " AND language != ''"),
    brk('city', " AND city != ''"),
    brk('region', " AND region != ''"),
    safe(queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS n FROM events WHERE ${pv} AND visitor_id IN (SELECT visitor_id FROM events WHERE event_type = 'pageview' AND ${beforeExpr}${filter})`, params)),
    safe(queryRows<OneRow>(`SELECT uniqExact(visitor_id) AS n FROM events WHERE ${pv}`, params)),
    safe(queryRows<HeatCell>(`SELECT toDayOfWeek(ts) AS d, toHour(ts) AS h, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND ts >= now() - INTERVAL 28 DAY${filter} GROUP BY d, h`, params)),
    safe(queryRows<CohortRow>(`SELECT toString(coh) AS cohort, dateDiff('week', coh, wk) AS offset, uniqExact(vid) AS n FROM (SELECT e.visitor_id AS vid, e.wk AS wk, f.cohort AS coh FROM (SELECT visitor_id, toStartOfWeek(ts) AS wk FROM events WHERE event_type = 'pageview' AND ts >= now() - INTERVAL 63 DAY${filter} GROUP BY visitor_id, wk) AS e INNER JOIN (SELECT visitor_id, min(toStartOfWeek(ts)) AS cohort FROM events WHERE event_type = 'pageview'${filter} GROUP BY visitor_id HAVING min(toStartOfWeek(ts)) >= toStartOfWeek(now() - INTERVAL 63 DAY)) AS f ON e.visitor_id = f.visitor_id WHERE e.wk >= f.cohort) GROUP BY coh, offset ORDER BY coh, offset`, params)),
    safe(queryRows<RevRow>(`SELECT source AS key, sum(amount) AS amount FROM revenue WHERE ${win}${filter} GROUP BY key ORDER BY amount DESC LIMIT 30`, params)),
    safe(queryRows<RevRow>(`SELECT campaign AS key, sum(amount) AS amount FROM revenue WHERE ${win}${filter} AND campaign != '' GROUP BY key ORDER BY amount DESC LIMIT 30`, params)),
    funnelSteps.length >= 2
      ? safe(queryRows<{ level: string; c: string }>(
          `SELECT level, count() AS c FROM (SELECT visitor_id, windowFunnel(604800)(ts, ${funnelSteps.map((_, i) => `pathname = {f${i}:String}`).join(', ')}) AS level FROM events WHERE ${pv} GROUP BY visitor_id) WHERE level > 0 GROUP BY level`,
          { ...(params ?? {}), ...Object.fromEntries(funnelSteps.map((p, i) => [`f${i}`, p])) },
        ))
      : Promise.resolve([] as { level: string; c: string }[]),
  ]);

  const tot = n(totalV[0]?.n);
  const ret = Math.min(tot, n(returning[0]?.n));
  // Funnel: visitors reaching step i = sum of levels >= i+1.
  const funnelCounts = funnelSteps.map((_, i) => funnelRows.reduce((a, r) => a + (Number(r.level) >= i + 1 ? n(r.c) : 0), 0));

  return {
    landing: landing.map((r) => ({ name: r.key || '/', count: n(r.c) })),
    exits: exits.map((r) => ({ name: r.key || '/', count: n(r.c) })),
    outbound: outbound.map((r) => ({ name: r.key, count: n(r.c) })),
    utmMedium: utmMedium.map((r) => ({ name: r.key, count: n(r.c) })),
    utmTerm: utmTerm.map((r) => ({ name: r.key, count: n(r.c) })),
    utmContent: utmContent.map((r) => ({ name: r.key, count: n(r.c) })),
    languages: languages.map((r) => ({ name: r.key, count: n(r.c) })),
    cities: cities.map((r) => ({ name: r.key, count: n(r.c) })),
    regions: regions.map((r) => ({ name: r.key, count: n(r.c) })),
    visitorSplit: { newV: Math.max(0, tot - ret), returning: ret },
    heatmap: heatmap.map((r) => ({ d: Number(r.d), h: Number(r.h), c: n(r.c) })),
    retention: retention.map((r) => ({ cohort: r.cohort, offset: Number(r.offset), n: n(r.n) })),
    revAttrib: {
      source: revChannel.map((r) => ({ name: r.key, amount: Math.round(Number(r.amount) * 100) / 100 })),
      campaign: revCampaign.map((r) => ({ name: r.key, amount: Math.round(Number(r.amount) * 100) / 100 })),
    },
    funnel: funnelSteps.length >= 2 ? { steps: funnelSteps, counts: funnelCounts } : null,
  };
}
type Extras = Awaited<ReturnType<typeof extraData>>;

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

// When GA4 is connected, its landing/cities/regions/languages replace the
// tracker versions (same numbers as GA4, instantly available).
function ga4Extras(g: Ga4Stats) {
  const map = (a: { key: string; visitors: number }[]) => a.filter((r) => r.key && r.key !== '(not set)').map((r) => ({ name: r.key, count: r.visitors }));
  const base = { landing: map(g.landing ?? []), cities: map(g.cities ?? []), regions: map(g.regions ?? []), languages: map(g.languages ?? []) };
  // GA4 knows new vs returning over its full history, so use it when present.
  return g.split ? { ...base, visitorSplit: g.split } : base;
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
  const url = new URL(req.url);
  const site = url.searchParams.get('site') ?? 'all';
  const session = (await cookies()).get('insight_session')?.value;
  const authed = validSession(session) || validApiToken(bearerFrom(req));
  if (!authed && !demoAllowed(site)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
    queryRows<OneRow>(`SELECT uniqExactIf(visitor_id, event_type = 'pageview') AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ts >= toStartOfDay(now())${filter}`, params),
    queryRows<CountRow>(`SELECT source_type AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND ts >= toStartOfDay(now())${filter} GROUP BY source_type ORDER BY c DESC`, params),
    queryRows<CountRow>(`SELECT domain(referrer) AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND referrer != '' AND ts >= toStartOfDay(now())${filter} GROUP BY key ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT pathname AS key, count() AS c FROM events WHERE event_type = 'pageview' AND ts >= toStartOfDay(now())${filter} GROUP BY pathname ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT country AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND country != '' AND ts >= toStartOfDay(now())${filter} GROUP BY country ORDER BY c DESC LIMIT 50`, params),
    queryRows<TsRow>(`SELECT toStartOfHour(ts) AS h, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND ts >= toStartOfDay(now())${filter} GROUP BY h ORDER BY h`, params),
    aiData(filter, params, 7),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ts >= toStartOfDay(now())${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ts >= toStartOfDay(now())${filter} GROUP BY visitor_id)`, params),
    queryRows<CountRow>(`SELECT device AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND device != '' AND ts >= toStartOfDay(now())${filter} GROUP BY device ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT browser AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND browser != '' AND ts >= toStartOfDay(now())${filter} GROUP BY browser ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT os AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND os != '' AND ts >= toStartOfDay(now())${filter} GROUP BY os ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT utm_campaign AS key, uniqExact(visitor_id) AS c FROM events WHERE event_type = 'pageview' AND utm_campaign != '' AND ts >= toStartOfDay(now())${filter} GROUP BY utm_campaign ORDER BY c DESC LIMIT 30`, params),
    // Previous period = yesterday, same hourly window (for the card deltas).
    queryRows<OneRow>(`SELECT uniqExactIf(visitor_id, event_type = 'pageview') AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ts >= toStartOfDay(now()) - INTERVAL 1 DAY AND ts < now() - INTERVAL 1 DAY${filter}`, params),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ts >= toStartOfDay(now()) - INTERVAL 1 DAY AND ts < now() - INTERVAL 1 DAY${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ts >= toStartOfDay(now()) - INTERVAL 1 DAY AND ts < now() - INTERVAL 1 DAY${filter} GROUP BY visitor_id)`, params),
  ]);

  const extras = await extraData(site, all, filter, params, 'ts >= toStartOfDay(now())', 'ts < toStartOfDay(now())');
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

  // Insight's own tracker breakdowns for today, reused for the normal path and as
  // the fallback when GA4 is connected but its intraday breakdowns are not ready.
  const nativeSeries = series.map((r) => ({ t: r.h.length >= 13 ? `${r.h.slice(11, 13)}:00` : r.h, count: n(r.c) }));
  const native = {
    channels: channels.map((r) => ({ name: r.key, type: r.key, count: n(r.c) })),
    referrers: referrers.map((r) => ({ name: r.key, count: n(r.c) })),
    pages: pages.map((r) => ({ name: r.key || '/', count: n(r.c) })),
    countries: countries.map((r) => ({ name: r.key, count: n(r.c) })),
    devices: devices.map((r) => ({ name: r.key, count: n(r.c) })),
    browsers: browsers.map((r) => ({ name: r.key, count: n(r.c) })),
    os: os.map((r) => ({ name: r.key, count: n(r.c) })),
  };

  let revenue: Revenue | null = null;
  const s = all ? undefined : await getSite(site);
  if (s?.stripeKey) revenue = await stripeRevenue(s.stripeKey, 1);
  const revMap = s?.stripeKey ? await stripeSeries(s.stripeKey, 1) : null;

  // "Today" always comes from Insight's own tracker, even when GA4 is connected.
  // GA4's intraday data is partial and delayed (often a handful of hits while the
  // tracker already sees the full day), so mixing GA4 totals with tracker breakdowns
  // never reconciled. The tracker is real-time and complete, so the header and every
  // card share one source and add up. GA4 still powers the history periods below.
  return {
    revenue,
    online: n(online[0]?.n),
    today: { visitors: n(today[0]?.visitors), pageviews: n(today[0]?.pageviews), avgDuration: Math.round(Number(avg[0]?.d ?? 0)), bounceRate },
    prev,
    ...extras,
    ...native,
    campaigns: campaignsOut,
    series: attachRev(nativeSeries, revMap),
    ai: aiOut,
    aiSeries,
    aiBots,
  };
}

type NamedCount = { name: string; count: number };
type Channel = { name: string; type: string; count: number };

// Sum two breakdown lists by key. Used to stitch the native tracker (recent days)
// with GA4 (days before Insight was installed) into one card.
function mergeCounts(a: NamedCount[], b: NamedCount[], limit = 50): NamedCount[] {
  const m = new Map<string, number>();
  for (const r of [...a, ...b]) m.set(r.name, (m.get(r.name) ?? 0) + r.count);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count).slice(0, limit);
}
function mergeChannels(a: Channel[], b: Channel[]): Channel[] {
  const m = new Map<string, { type: string; count: number }>();
  for (const r of [...a, ...b]) { const e = m.get(r.name); m.set(r.name, { type: r.type || e?.type || r.name, count: (e?.count ?? 0) + r.count }); }
  return [...m.entries()].map(([name, v]) => ({ name, type: v.type, count: v.count })).sort((x, y) => y.count - x.count);
}
const wavg = (v1: number, w1: number, v2: number, w2: number): number => { const w = w1 + w2; return w > 0 ? Math.round((v1 * w1 + v2 * w2) / w) : 0; };
const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const isoDayBefore = (d: string): string => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

// First day the Insight tracker saw a pageview for this site (its install date), or null.
async function firstEventDate(site: string): Promise<string | null> {
  const rows = await queryRows<{ d: string }>(`SELECT toString(toDate(min(ts))) AS d FROM events WHERE event_type = 'pageview' AND site_id = {site:String}`, { site }).catch(() => [] as { d: string }[]);
  const d = rows[0]?.d;
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

type NativeResult = Awaited<ReturnType<typeof eventsHistory>> & Extras;

// Stitch the native result (Insight, recent days) with GA4 (older days, before
// install). GA4 is the older segment, native the newer; their date ranges are
// disjoint, so counts add and the daily series concatenates.
function stitchGa4(native: NativeResult, g: Ga4Stats, base: Base, revMap: Record<string, RevenueBucket> | null): NativeResult {
  const gOut = fromGa4(g, base);
  const gEx = ga4Extras(g);
  const nv = native.today.visitors, gv = g.visitors;
  const series = attachRev(
    [...gOut.series, ...native.series.map((p) => ({ t: p.t, count: p.count }))].sort((a, b) => a.t.localeCompare(b.t)),
    revMap,
  );
  return {
    ...native,
    today: {
      visitors: nv + gv,
      pageviews: native.today.pageviews + g.pageviews,
      avgDuration: wavg(native.today.avgDuration, nv, g.avgDuration, gv),
      bounceRate: wavg(native.today.bounceRate, nv, g.bounceRate, gv),
    },
    prev: {
      visitors: native.prev.visitors + (g.prev?.visitors ?? 0),
      pageviews: native.prev.pageviews + (g.prev?.pageviews ?? 0),
      avgDuration: native.prev.avgDuration || g.prev?.avgDuration || 0,
      bounceRate: native.prev.bounceRate || g.prev?.bounceRate || 0,
    },
    channels: mergeChannels(native.channels, gOut.channels),
    referrers: mergeCounts(native.referrers, gOut.referrers),
    pages: mergeCounts(native.pages, gOut.pages),
    countries: mergeCounts(native.countries, gOut.countries),
    devices: mergeCounts(native.devices, gOut.devices),
    browsers: mergeCounts(native.browsers, gOut.browsers),
    os: mergeCounts(native.os, gOut.os),
    landing: mergeCounts(native.landing, gEx.landing ?? []),
    cities: mergeCounts(native.cities, gEx.cities ?? []),
    regions: mergeCounts(native.regions, gEx.regions ?? []),
    languages: mergeCounts(native.languages, gEx.languages ?? []),
    visitorSplit: g.split
      ? { newV: native.visitorSplit.newV + g.split.newV, returning: native.visitorSplit.returning + g.split.returning }
      : native.visitorSplit,
    series,
  };
}

// History. Insight's own tracker is the base for every day it has data. GA4 only
// backfills the days before Insight was installed on the site, so a 90-day view can
// be Insight for the recent weeks plus GA4 for the older ones, while 7/30-day views
// that sit entirely after install are pure Insight.
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

  const beforeExpr = custom ? 'ts < toDateTime({from:String})' : `ts < now() - INTERVAL ${days} DAY`;
  const extras = await extraData(site, all, filter, params, win, beforeExpr);

  const native: NativeResult = { ...(await eventsHistory(filter, params, days, base, revMap, win, pwin)), ...extras };

  const acc = !all && s?.ga4 ? await getGa4Account() : null;
  if (!all && s?.ga4 && acc) {
    const insightStart = await firstEventDate(site);
    const periodStart = custom ? (from as string) : isoDaysAgo(days);
    if (insightStart && periodStart < insightStart) {
      // The period reaches before Insight existed: fill only those older days from GA4.
      const g = await ga4RangeStats(acc.json, s.ga4.propertyId, periodStart, isoDayBefore(insightStart));
      if (g) return stitchGa4(native, g, base, revMap);
    } else if (!insightStart) {
      // The tracker has never seen this site: fall back to GA4 for the whole period.
      const g = custom
        ? await ga4RangeStats(acc.json, s.ga4.propertyId, from as string, to as string)
        : await ga4LiveStats(acc.json, s.ga4.propertyId, days);
      if (g) { const out = fromGa4(g, base); return { ...out, ...extras, ...ga4Extras(g), series: attachRev(out.series, revMap) }; }
    }
  }
  return native;
}

// Aggregates history from the Insight tracker (ClickHouse), series by day.
// win/pwin are the current and previous time window SQL expressions.
async function eventsHistory(filter: string, params: Record<string, unknown> | undefined, days: number, base: Base, revMap: Record<string, RevenueBucket> | null, win: string, pwin: string) {
  const pv = `event_type = 'pageview' AND ${win}${filter}`;
  const [tot, series, channels, referrers, pages, countries, devices, browsers, os, campaigns, avg, bounce, prevTot, prevAvg, prevBounce] = await Promise.all([
    queryRows<OneRow>(`SELECT uniqExactIf(visitor_id, event_type = 'pageview') AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ${win}${filter}`, params),
    queryRows<CountRow>(`SELECT toString(toDate(ts)) AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} GROUP BY key ORDER BY key`, params),
    queryRows<CountRow>(`SELECT source_type AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} GROUP BY source_type ORDER BY c DESC`, params),
    queryRows<CountRow>(`SELECT domain(referrer) AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} AND referrer != '' GROUP BY key ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT pathname AS key, count() AS c FROM events WHERE ${pv} GROUP BY pathname ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT country AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} AND country != '' GROUP BY country ORDER BY c DESC LIMIT 50`, params),
    queryRows<CountRow>(`SELECT device AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} AND device != '' GROUP BY device ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT browser AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} AND browser != '' GROUP BY browser ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT os AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} AND os != '' GROUP BY os ORDER BY c DESC LIMIT 20`, params),
    queryRows<CountRow>(`SELECT utm_campaign AS key, uniqExact(visitor_id) AS c FROM events WHERE ${pv} AND utm_campaign != '' GROUP BY utm_campaign ORDER BY c DESC LIMIT 30`, params),
    queryRows<OneRow>(`SELECT avg(duration_ms) AS d FROM events WHERE event_type = 'custom' AND duration_ms > 0 AND ${win}${filter}`, params),
    queryRows<OneRow>(`SELECT countIf(pv = 1) AS bounced, count() AS sessions FROM (SELECT visitor_id, countIf(event_type = 'pageview') AS pv FROM events WHERE ${win}${filter} GROUP BY visitor_id)`, params),
    queryRows<OneRow>(`SELECT uniqExactIf(visitor_id, event_type = 'pageview') AS visitors, countIf(event_type = 'pageview') AS pageviews FROM events WHERE ${pwin}${filter}`, params),
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
