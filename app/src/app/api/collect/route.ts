import { NextResponse } from 'next/server';
import { insertRows } from '@/lib/clickhouse';
import { classifySource } from '@/lib/sources';
import { parseUa } from '@/lib/ua';
import { cityFromHeaders, clientIp, countryFromHeaders, visitorId } from '@/lib/request';
import { isBot } from '@/lib/bots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface Beacon {
  site?: string;
  type?: string;
  iid?: string;
  amount?: number;
  currency?: string;
  goal?: string;
  url?: string;
  path?: string;
  query?: string;
  referrer?: string;
  lang?: string;
  sw?: number;
  click_target?: string;
  duration_ms?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function POST(req: Request) {
  let b: Beacon;
  try {
    b = JSON.parse(await req.text()) as Beacon;
  } catch {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  const ua = req.headers.get('user-agent') ?? '';
  // We ignore bots (headless, previews, monitors, AI crawlers). Like GA4, they must not
  // show up as visitors (for example a fake "US" visitor coming from a datacenter).
  if (isBot(ua)) return new NextResponse(null, { status: 204, headers: CORS });
  const ip = clientIp(req.headers);
  // Self-referral = the tracked site linking to itself (internal navigation). Compare
  // the referrer to the PAGE's own host, not the Insight instance host, so multi-site
  // installs don't log internal clicks as "referral" from their own domain.
  const pageHost = (() => { try { return new URL(str(b.url)).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const selfHost = pageHost || (process.env.PUBLIC_HOST ?? '').replace(/^www\./, '');
  const src = classifySource(str(b.referrer), str(b.utm_source), selfHost);
  const uaInfo = parseUa(ua);

  const path = str(b.path);
  const vid = visitorId(ip, ua, str(b.iid) || undefined);
  const geo = cityFromHeaders(req.headers);

  // Purchase events go to the revenue table with last-touch attribution,
  // so revenue can be broken down by channel and campaign.
  if (str(b.type) === 'purchase') {
    const amount = num(b.amount);
    if (amount > 0 && amount < 1000000) {
      try {
        await insertRows('revenue', [{
          site_id: (str(b.site) || 'unknown').slice(0, 64),
          visitor_id: vid,
          amount: Math.round(amount * 100) / 100,
          currency: (str(b.currency) || 'usd').slice(0, 8).toLowerCase(),
          provider: 'insight',
          source: src.source,
          campaign: str(b.utm_campaign).slice(0, 128),
        }]);
      } catch { /* never break the host site */ }
    }
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  const row = {
    site_id: (str(b.site) || 'unknown').slice(0, 64),
    visitor_id: vid,
    session_id: vid,
    event_type: str(b.type) || 'pageview',
    url: str(b.url).slice(0, 2048),
    pathname: path.slice(0, 1024),
    query: str(b.query).slice(0, 1024),
    referrer: str(b.referrer).slice(0, 2048),
    source: src.source,
    source_type: src.source_type,
    utm_source: str(b.utm_source).slice(0, 128),
    utm_medium: str(b.utm_medium).slice(0, 128),
    utm_campaign: str(b.utm_campaign).slice(0, 128),
    utm_term: str(b.utm_term).slice(0, 128),
    utm_content: str(b.utm_content).slice(0, 128),
    landing_page: path.slice(0, 1024),
    click_target: str(b.click_target).slice(0, 2048),
    country: countryFromHeaders(req.headers),
    region: geo.region.slice(0, 128),
    city: geo.city.slice(0, 128),
    device: uaInfo.device,
    browser: uaInfo.browser,
    os: uaInfo.os,
    language: str(b.lang).slice(0, 16),
    screen_w: Math.max(0, Math.min(num(b.sw), 65535)),
    duration_ms: Math.max(0, Math.min(num(b.duration_ms), 1800000)),
  };

  try {
    await insertRows('events', [row]);
  } catch {
    // We never break the host site, so we swallow the ingestion error.
  }
  return new NextResponse(null, { status: 204, headers: CORS });
}
