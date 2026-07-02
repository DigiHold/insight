// Stripe revenue per site: lists today's and yesterday's charges, cached for 60s.

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
async function sumCharges(key: string, gte: number, lt: number): Promise<{ sum: number; gross: number; refunds: number; count: number; currency: string }> {
  let gross = 0;
  let refunds = 0;
  let count = 0;
  let currency = 'usd';
  let after = '';
  for (let page = 0; page < 20; page++) {
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
      currency = ch.currency ?? currency;
      gross += (ch.amount ?? 0) / 100;
      refunds += (ch.amount_refunded ?? 0) / 100;
      if (!ch.refunded) count += 1;
    }
    if (!json.has_more || data.length === 0) break;
    after = data[data.length - 1].id ?? '';
    if (!after) break;
  }
  return { sum: gross - refunds, gross, refunds, count, currency };
}

// days = 1 -> today (vs yesterday). Otherwise a sliding window of N days (vs the previous N).
async function fetchRevenue(key: string, days: number): Promise<Revenue | null> {
  const now = Math.floor(Date.now() / 1000);
  let curStart: number;
  let prevStart: number;
  let prevEnd: number;
  if (days <= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    curStart = Math.floor(d.getTime() / 1000);
    prevStart = curStart - 86400;
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
    for (let page = 0; page < 20; page++) {
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
        const dt = new Date((ch.created ?? 0) * 1000);
        const label = hourly
          ? `${String(dt.getUTCHours()).padStart(2, '0')}:00`
          : `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
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
  let gte: number;
  if (today) { const d = new Date(); d.setUTCHours(0, 0, 0, 0); gte = Math.floor(d.getTime() / 1000); }
  else gte = now - days * 86400;
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
