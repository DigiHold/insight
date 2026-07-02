import { NextResponse } from 'next/server';
import { detectBot } from '@/lib/bots';
import { getSite, getSiteByDomain } from '@/lib/sites';
import { insertRows } from '@/lib/clickhouse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The cookieless tracker. Served by a route (not a static file) so we can inspect the
// User-Agent of EVERY request: AI crawlers (ChatGPT, Perplexity, Google...) don't run the
// JS but often fetch the script referenced in the page. We detect them here, server-side,
// with no code to add on the sites themselves. The site and page come from the Referer.
const SCRIPT = `/* Insight — cookieless analytics. */
(function () {
  var s = document.currentScript;
  var site = (s && s.getAttribute('data-site')) || 'unknown';
  var ENDPOINT = 'https://insight.nicolaslecocq.com/api/collect';
  var start = Date.now();
  var sent = false;
  function payload(type, extra) {
    var u = new URL(location.href);
    var body = {
      site: site, type: type, url: location.href, path: location.pathname, query: location.search,
      referrer: document.referrer || '', lang: navigator.language || '',
      sw: window.screen ? window.screen.width : 0,
      utm_source: u.searchParams.get('utm_source') || '', utm_medium: u.searchParams.get('utm_medium') || '',
      utm_campaign: u.searchParams.get('utm_campaign') || '', utm_term: u.searchParams.get('utm_term') || '',
      utm_content: u.searchParams.get('utm_content') || ''
    };
    if (extra) for (var k in extra) body[k] = extra[k];
    return JSON.stringify(body);
  }
  function send(type, extra) {
    try {
      var data = payload(type, extra);
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([data], { type: 'text/plain' }));
      else fetch(ENDPOINT, { method: 'POST', body: data, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
    } catch (e) {}
  }
  send('pageview');
  // Heartbeat based on real ENGAGEMENT, like GA4 ("foreground/focus time").
  // A visitor is counted as "live" only if the tab is (1) visible, (2) in the foreground (focus),
  // and (3) has interacted (mouse/scroll/keyboard/touch) within the last 60 seconds.
  // As a result, a tab left open but abandoned, or a background window on a
  // second screen, stops pinging and disappears from live in ~1min instead of staying "present" for 2h.
  // It comes back instantly as soon as you scroll or regain focus.
  var IDLE_MS = 60000;
  var lastActive = Date.now();
  var focused = document.hasFocus();
  // Any interaction implies focus: we refresh the activity AND reassert focus,
  // which avoids a false "non-focus" state on load in some browsers.
  function bump() { lastActive = Date.now(); focused = true; }
  var acts = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart', 'pointerdown'];
  for (var i = 0; i < acts.length; i++) window.addEventListener(acts[i], bump, { passive: true, capture: true });
  function engaged() { return document.visibilityState === 'visible' && focused && (Date.now() - lastActive) < IDLE_MS; }
  function ping() { if (engaged()) send('ping'); }
  var hb = setInterval(ping, 15000);
  document.addEventListener('click', function (e) {
    bump();
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^https?:\\/\\//.test(href) && a.host !== location.host) send('click', { click_target: href });
  }, true);
  function bye() { if (sent) return; sent = true; send('custom', { duration_ms: Date.now() - start }); }
  // Reliable end of session: visibilitychange (hidden) + pagehide (~91% combined coverage).
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') bye(); else { sent = false; bump(); ping(); } });
  // Focus/blur: a window that loses the foreground (without being hidden) stops being "live".
  window.addEventListener('focus', function () { sent = false; bump(); ping(); });
  window.addEventListener('blur', function () { focused = false; });
  window.addEventListener('pagehide', function () { clearInterval(hb); bye(); });
})();`;

function jsResponse(): NextResponse {
  return new NextResponse(SCRIPT, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // no-store: every request reaches the origin, otherwise a CDN cache would hide the crawlers.
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}

export async function GET(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  const bot = detectBot(ua);
  if (bot) {
    // Site attribution: first ?s=ID (reliable, present in the script URL), otherwise the
    // Referer (the page that loads the script). The path comes from the Referer when available.
    const sid = new URL(req.url).searchParams.get('s') || '';
    const ref = req.headers.get('referer') || '';
    let path = '/';
    let site = sid ? await getSite(sid) : undefined;
    try {
      const u = new URL(ref);
      path = u.pathname;
      if (!site) site = await getSiteByDomain(u.hostname);
    } catch {
      /* no usable Referer */
    }
    if (site) {
      try {
        await insertRows('ai_hits', [{
          site_id: site.id,
          path: path.slice(0, 1024),
          bot_name: bot.bot_name,
          vendor: bot.vendor,
          category: bot.category,
          ua_string: ua.slice(0, 512),
          ip: (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').slice(0, 64),
          verified: 0,
          status_code: 200,
        }]);
      } catch {
        /* best-effort insert */
      }
    }
  }
  return jsResponse();
}
