import { createSign } from 'node:crypto';

// Live GA4 reads via a service account (JWT RS256 -> access token -> Data API).

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function parseSa(json: string): ServiceAccount {
  const o = JSON.parse(json) as ServiceAccount;
  if (!o.client_email || !o.private_key) throw new Error('bad service account');
  return o;
}

async function accessToken(sa: ServiceAccount, scope = 'https://www.googleapis.com/auth/analytics.readonly'): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(sa.private_key, 'base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json() as { access_token: string }).access_token;
}

interface ReportRow { dimensionValues: { value: string }[]; metricValues: { value: string }[] }

async function runReport(token: string, propertyId: string, body: object): Promise<ReportRow[]> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`report ${res.status}`);
  return (await res.json() as { rows?: ReportRow[] }).rows ?? [];
}

// OAuth token for another Google scope (e.g. Search Console), reused by gsc.ts.
export async function googleAccessToken(json: string, scope: string): Promise<string> {
  return accessToken(parseSa(json), scope);
}

export async function validateGa4(json: string, propertyId: string): Promise<boolean> {
  try {
    const token = await accessToken(parseSa(json));
    await runReport(token, propertyId, { dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'totalUsers' }] });
    return true;
  } catch {
    return false;
  }
}

export interface Ga4Stats {
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
  prev?: { visitors: number; pageviews: number; bounceRate: number; avgDuration: number };
  series: { date: string; visitors: number }[];
  sources: { key: string; visitors: number }[];
  countries: { key: string; visitors: number }[];
  devices: { key: string; visitors: number }[];
  browsers: { key: string; visitors: number }[];
  os: { key: string; visitors: number }[];
  pages: { key: string; pageviews: number }[];
}

const statsCache = new Map<string, { ts: number; data: Ga4Stats | null }>();
const mv = (r: ReportRow | undefined, i = 0): number => Number(r?.metricValues?.[i]?.value || 0);

// We use activeUsers: it's the "Users" metric shown by default in GA4, so
// Insight's numbers match what the user sees in GA4.
const USERS = 'activeUsers';

async function runLive(json: string, propertyId: string, startDate: string, endDate: string, seriesDim: 'date' | 'hour', prevStart?: string, prevEnd?: string): Promise<Ga4Stats> {
  const token = await accessToken(parseSa(json));
  const range = [{ startDate, endDate }];
  // Two ranges on the totals report only: current period + previous (for the deltas).
  const totalRanges = prevStart && prevEnd ? [{ startDate, endDate }, { startDate: prevStart, endDate: prevEnd }] : range;
  const bd = (name: string, metric: string, limit: number) =>
    runReport(token, propertyId, { dateRanges: range, dimensions: [{ name }], metrics: [{ name: metric }], orderBys: [{ metric: { metricName: metric }, desc: true }], limit });

  const [total, series, sources, countries, devices, browsers, os, pages] = await Promise.all([
    runReport(token, propertyId, { dateRanges: totalRanges, metrics: [{ name: USERS }, { name: 'screenPageViews' }, { name: 'bounceRate' }, { name: 'userEngagementDuration' }, { name: 'sessions' }] }),
    runReport(token, propertyId, { dateRanges: range, dimensions: [{ name: seriesDim }], metrics: [{ name: USERS }], orderBys: [{ dimension: { dimensionName: seriesDim } }], limit: 400 }),
    bd('sessionSource', USERS, 50),
    bd('countryId', USERS, 50),
    bd('deviceCategory', USERS, 20),
    bd('browser', USERS, 20),
    bd('operatingSystem', USERS, 20),
    bd('pageTitle', 'screenPageViews', 50),
  ]);

  // With two ranges, GA4 adds a dateRange dimension: 'date_range_0' (current), 'date_range_1' (previous).
  const rangeVal = (r: ReportRow | undefined): string | undefined => r?.dimensionValues?.[0]?.value;
  const t = total.find((r) => rangeVal(r) === 'date_range_0') ?? total[0];
  const p = total.find((r) => rangeVal(r) === 'date_range_1');
  const sessions = mv(t, 4);
  const avgOf = (row: ReportRow | undefined): number => { const se = mv(row, 4); return se > 0 ? Math.round((mv(row, 3) / se) * 1000) : 0; };
  return {
    visitors: mv(t, 0),
    pageviews: mv(t, 1),
    bounceRate: Math.round(mv(t, 2) * 100),
    // GA4's "Average engagement time per session" = total engagement time / sessions.
    avgDuration: sessions > 0 ? Math.round((mv(t, 3) / sessions) * 1000) : 0,
    prev: p ? { visitors: mv(p, 0), pageviews: mv(p, 1), bounceRate: Math.round(mv(p, 2) * 100), avgDuration: avgOf(p) } : undefined,
    series: series.map((r) => ({ date: r.dimensionValues[0].value, visitors: mv(r) })),
    sources: sources.map((r) => ({ key: r.dimensionValues[0].value, visitors: mv(r) })),
    countries: countries.map((r) => ({ key: r.dimensionValues[0].value, visitors: mv(r) })),
    devices: devices.map((r) => ({ key: r.dimensionValues[0].value, visitors: mv(r) })),
    browsers: browsers.map((r) => ({ key: r.dimensionValues[0].value, visitors: mv(r) })),
    os: os.map((r) => ({ key: r.dimensionValues[0].value, visitors: mv(r) })),
    pages: pages.map((r) => ({ key: r.dimensionValues[0].value, pageviews: mv(r) })),
  };
}

async function cached(key: string, ttl: number, run: () => Promise<Ga4Stats>): Promise<Ga4Stats | null> {
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  let data: Ga4Stats | null = null;
  try { data = await run(); } catch { data = null; }
  statsCache.set(key, { ts: Date.now(), data });
  return data;
}

// 7/30/90d: GA4 "Last N days" ends YESTERDAY (today's partial data is excluded). We match it exactly.
export async function ga4LiveStats(json: string, propertyId: string, days: number): Promise<Ga4Stats | null> {
  // Previous period = the N days before that (from 2N to N+1 days back).
  return cached(`${propertyId}:${days}`, 300000, () => runLive(json, propertyId, `${days}daysAgo`, 'yesterday', 'date', `${2 * days}daysAgo`, `${days + 1}daysAgo`));
}

// Today: same source as GA4 (today's date), series by hour. Short cache (real time).
export async function ga4TodayStats(json: string, propertyId: string): Promise<Ga4Stats | null> {
  return cached(`${propertyId}:today`, 60000, () => runLive(json, propertyId, 'today', 'today', 'hour', 'yesterday', 'yesterday'));
}
