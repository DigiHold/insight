import { googleAccessToken } from './ga4';

// Google Search Console (Search Analytics API): organic keywords per site.
// Same service account as GA4; it must be added as a user in Search Console.

export interface Keyword {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

export type GscError = 'api_disabled' | 'no_access' | 'not_found' | null;

const iso = (d: Date): string => d.toISOString().slice(0, 10);

async function query(token: string, property: string, days: number): Promise<{ rows: Keyword[]; status: number; body: string }> {
  // GSC has ~3 days of latency: we end the range 3 days ago, otherwise we get nothing back.
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions: ['query'], rowLimit: 100 }),
  });
  if (!res.ok) return { rows: [], status: res.status, body: await res.text().catch(() => '') };
  const raw = ((await res.json()) as { rows?: GscRow[] }).rows ?? [];
  // We drop "operator"/noise queries (scrapers, API paths) and sort by relevance.
  const junk = /-site:|(^|\s)site:|googleapis\.com|openai\.com/i;
  const kws = raw
    .map((r) => ({ query: r.keys[0] ?? '', clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), ctr: r.ctr, position: r.position }))
    .filter((k) => k.query && !junk.test(k.query))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  return { rows: kws, status: 200, body: '' };
}

const host = (u: string): string => {
  try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

export interface KeywordResult { keywords: Keyword[]; error: GscError; tried: string[] }

const cache = new Map<string, { ts: number; data: KeywordResult }>();

// We try the "domain" property (sc-domain:) then the exact URL. We surface an
// actionable error if the API is disabled or the service account has no access.
export async function fetchKeywords(json: string, siteUrl: string, days: number): Promise<KeywordResult> {
  const h = host(siteUrl);
  if (!h) return { keywords: [], error: null, tried: [] };
  const key = `${h}:${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 300000) return hit.data;

  const tried: string[] = [];
  let result: KeywordResult = { keywords: [], error: null, tried };
  try {
    const token = await googleAccessToken(json, SCOPE);
    let sawAccess = false;
    let sawDisabled = false;
    let sawFound = false;
    for (const prop of [`sc-domain:${h}`, `https://${h}/`, `https://www.${h}/`]) {
      const r = await query(token, prop, days);
      tried.push(`${prop} -> ${r.status}${r.status === 200 ? ` (${r.rows.length} rows)` : ''}`);
      if (r.status === 200) { sawFound = true; result = { keywords: r.rows, error: null, tried }; if (r.rows.length) break; }
      else if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(r.body)) sawDisabled = true;
      else if (r.status === 403) sawAccess = true;
    }
    if (!result.keywords.length && result.error === null) {
      // 200 but empty = property is fine, just no data yet. Otherwise we surface the cause.
      result.error = sawFound ? null : sawDisabled ? 'api_disabled' : sawAccess ? 'no_access' : 'not_found';
    }
  } catch {
    result = { keywords: [], error: null, tried };
  }
  cache.set(key, { ts: Date.now(), data: result });
  return result;
}
