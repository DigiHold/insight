import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { getSite } from '@/lib/sites';
import { getGa4Account } from '@/lib/ga4-account';
import { fetchKeywords } from '@/lib/gsc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const site = url.searchParams.get('site') ?? '';
  const period = url.searchParams.get('period') ?? '7d';
  // Keywords are a cumulative SEO metric and GSC has latency, so we use a minimum 28-day window.
  const days = period === '90d' ? 90 : period === '30d' ? 30 : 28;

  const s = await getSite(site);
  const acc = await getGa4Account();
  if (!s?.url || !acc) return NextResponse.json({ keywords: [], error: null, tried: [] });

  const { keywords, error, tried } = await fetchKeywords(acc.json, s.url, days);
  return NextResponse.json({ keywords, error, tried });
}
