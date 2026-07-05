// Stripe revenue per site: lists today's and yesterday's charges, cached for 60s.
import { tzDateLabel, tzHourLabel, tzStartOfDayUnix } from './tz';

export interface Revenue {
  currency: string;
  today: number;        // net revenue for the period (gross - refunds)
  changePct: number | null;
  count: number;        // number of payments in the period
  gross: number;        // gross revenue ("New") before refunds
  refunds: number;      // total refunded over the period
  prevSum: number;      // net revenue for the previous period (for deltas)
  prevCount: number;    // number of payments in the previous period
}

interface Charge {
  amount?: number;
  currency?: string;
  paid?: boolean;
  refunded?: boolean;
  created?: number;
}

const cache = new Map<string, { ts: number; data: Revenue | null }>();

export async function validateKey(key: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface ChargeMore { data?: Charge[]; has_more?: boolean }

// Sum of paid charges (net of refunds) over [gte, lt], with pagination.
// Amounts are kept PER CURRENCY (never added across currencies), and the reported
// figures are the account's dominant currency (the one with the most gross). Every
// paid charge is counted, including refunded ones, so `count` matches `gross`.
async function sumCharges(key: string, gte: number, lt: number): Promise<{ sum: number; gross: number; refunds: number; count: number; currency: string }> {
  const grossBy = new Map<string, number>();
  const refundBy = new Map<string, number>();
  const countBy = new Map<string, number>();
  let after = '';
  // Cap high enough to never truncate a real account (200 pages = 20k charges/window).
  for (let page = 0; page < 200; page++) {
    const u = new URL('https://api.stripe.com/v1/charges');
    u.searchParams.set('limit', '100');
    u.searchParams.set('created[gte]', String(gte));
    u.searchParams.set('created[lt]', String(lt));
    if (after) u.searchParams.set('starting_after', after);
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`stripe ${res.status}`);
    const json = (await res.json()) as ChargeMore & { data?: (Charge & { id?: string; amount_refunded?: number })[] };
    const data = json.data ?? [];
    for (const ch of data) {
      if (!ch.paid) continue;
      const cur = ch.currency ?? 'usd';
      grossBy.set(cur, (grossBy.get(cur) ?? 0) + (ch.amount ?? 0) / 100);
      refundBy.set(cur, (refundBy.get(cur) ?? 0) + (ch.amount_refunded ?? 0) / 100);
      countBy.set(cur, (countBy.get(cur) ?? 0) + 1);
    }
    if (!json.has_more || data.length === 0) break;
    after = data[data.length - 1].id ?? '';
    if (!after) break;
  }
  let currency = 'usd';
  let best = -1;
  for (const [cur, g] of grossBy) if (g > best) { best = g; currency = cur; }
  const gross = grossBy.get(currency) ?? 0;
  const refunds = refundBy.get(currency) ?? 0;
  const count = countBy.get(currency) ?? 0;
  return { sum: gross - refunds, gross, refunds, count, currency };
}

// days = 1 -> today (vs yesterday). Otherwise a sliding window of N days (vs the previous N).
async function fetchRevenue(key: string, days: number): Promise<Revenue | null> {
  const now = Math.floor(Date.now() / 1000);
  let curStart: number;
  let prevStart: number;
  let prevEnd: number;
  if (days <= 1) {
    curStart = tzStartOfDayUnix(0);
    prevStart = tzStartOfDayUnix(1);
    prevEnd = curStart;
  } else {
    const span = days * 86400;
    curStart = now - span;
    prevStart = now - 2 * span;
    prevEnd = curStart;
  }
  const cur = await sumCharges(key, curStart, now);
  const prev = await sumCharges(key, prevStart, prevEnd);
  const changePct = prev.sum > 0 ? Math.round(((cur.sum - prev.sum) / prev.sum) * 100) : null;
  return { currency: cur.currency, today: cur.sum, changePct, count: cur.count, gross: cur.gross, refunds: cur.refunds, prevSum: prev.sum, prevCount: prev.count };
}

// Revenue per bucket, using the SAME label as the visitors series (HH:00 for
// today, YYYY-MM-DD otherwise), so it overlays exactly on the chart.
// Each bucket carries n (net new revenue) and r (refunded amount) so the
// chart can stack solid sales and dashed refunds.
export interface RevenueBucket { n: number; r: number }
const seriesCache = new Map<string, { ts: number; data: Record<string, RevenueBucket> }>();

async function seriesBetween(key: string, gte: number, lt: number, hourly: boolean): Promise<Record<string, RevenueBucket>> {
  const out: Record<string, RevenueBucket> = {};
  try {
    let after = '';
    for (let page = 0; page < 200; page++) {
      const u = new URL('https://api.stripe.com/v1/charges');
      u.searchParams.set('limit', '100');
      u.searchParams.set('created[gte]', String(gte));
      u.searchParams.set('created[lt]', String(lt));
      if (after) u.searchParams.set('starting_after', after);
      const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) break;
      const json = (await res.json()) as { data?: (Charge & { id?: string; amount_refunded?: number })[]; has_more?: boolean };
      const data = json.data ?? [];
      for (const ch of data) {
        if (!ch.paid) continue;
        const refunded = (ch.amount_refunded ?? 0) / 100;
        const net = (ch.amount ?? 0) / 100 - refunded;
        const label = hourly ? tzHourLabel(ch.created ?? 0) : tzDateLabel(ch.created ?? 0);
        const cur = out[label] ?? { n: 0, r: 0 };
        cur.n += net;
        cur.r += refunded;
        out[label] = cur;
      }
      if (!json.has_more || data.length === 0) break;
      after = data[data.length - 1].id ?? '';
      if (!after) break;
    }
  } catch {
    /* best-effort */
  }
  return out;
}

export async function stripeSeries(key: string, days: number): Promise<Record<string, RevenueBucket>> {
  const ck = `${key}:${days}`;
  const hit = seriesCache.get(ck);
  if (hit && Date.now() - hit.ts < 60000) return hit.data;
  const now = Math.floor(Date.now() / 1000);
  const today = days <= 1;
  const gte = today ? tzStartOfDayUnix(0) : now - days * 86400;
  const data = await seriesBetween(key, gte, now, today);
  seriesCache.set(ck, { ts: Date.now(), data });
  return data;
}

// Custom date range variant (inclusive from/to unix seconds), daily buckets.
export async function stripeSeriesRange(key: string, gte: number, lt: number): Promise<Record<string, RevenueBucket>> {
  const ck = `${key}:${gte}:${lt}`;
  const hit = seriesCache.get(ck);
  if (hit && Date.now() - hit.ts < 60000) return hit.data;
  const data = await seriesBetween(key, gte, lt, false);
  seriesCache.set(ck, { ts: Date.now(), data });
  return data;
}

// Custom range: current window [gte, lt), previous window of the same length.
export async function stripeRevenueRange(key: string, gte: number, lt: number): Promise<Revenue | null> {
  const ck = `${key}:range:${gte}:${lt}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.ts < 60000) return hit.data;
  let data: Revenue | null = null;
  try {
    const span = lt - gte;
    const cur = await sumCharges(key, gte, lt);
    const prev = await sumCharges(key, gte - span, gte);
    const changePct = prev.sum > 0 ? Math.round(((cur.sum - prev.sum) / prev.sum) * 100) : null;
    data = { currency: cur.currency, today: cur.sum, changePct, count: cur.count, gross: cur.gross, refunds: cur.refunds, prevSum: prev.sum, prevCount: prev.count };
  } catch {
    data = null;
  }
  cache.set(ck, { ts: Date.now(), data });
  return data;
}

export async function stripeRevenue(key: string, days = 1): Promise<Revenue | null> {
  const now = Date.now();
  const ck = `${key}:${days}`;
  const hit = cache.get(ck);
  if (hit && now - hit.ts < 60000) return hit.data;
  let data: Revenue | null = null;
  try {
    data = await fetchRevenue(key, days);
  } catch {
    data = null;
  }
  cache.set(ck, { ts: now, data });
  return data;
}
