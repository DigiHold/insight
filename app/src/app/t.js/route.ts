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
  var ENDPOINT = '__ORIGIN__/api/collect';
  // By default the tracker stores NOTHING on the visitor's device: no cookies,
  // no localStorage. Visitors are counted with a salted hash that rotates daily
  // (server-side), which keeps the "no consent banner" claim true in the EU,
  // where the storage rule covers localStorage exactly like cookies.
  // Opt-in: data-persist="true" on the script tag stores a random first-party id
  // in localStorage for precise returning-visitor and retention tracking. Sites
  // that enable it should cover it in their privacy policy (and, for EU
  // audiences, their consent flow).
  var iid = '';
  if (s && s.getAttribute('data-persist') === 'true') {
    try {
      iid = localStorage.getItem('_ins_id') || '';
      if (!iid) {
        iid = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
          return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
        });
        localStorage.setItem('_ins_id', iid);
      }
    } catch (e) {}
  }
  function payload(type, extra) {
    var u = new URL(location.href);
    var body = {
      site: site, type: type, iid: iid, url: location.href, path: location.pathname, query: location.search,
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
  // Single-page apps (React, Next, Vue...) change the URL without reloading, so a
  // plain load-time pageview would miss every client-side navigation. We wrap the
  // History API and listen to popstate to record a pageview on each real path change.
  var lastPath = location.pathname;
  function route() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send('pageview');
  }
  var _push = history.pushState;
  history.pushState = function () { _push.apply(this, arguments); route(); };
  var _replace = history.replaceState;
  history.replaceState = function () { _replace.apply(this, arguments); route(); };
  window.addEventListener('popstate', route);
  // Heartbeat based on ENGAGEMENT, like GA4 ("foreground time"). A visitor is "live"
  // while the tab is (1) visible and (2) in the foreground (focused). No interaction is
  // required, so someone reading an article without scrolling still counts. Switching
  // tab, minimizing, or locking the screen drops the visibility/focus and they go offline.
  var engagedMs = 0;   // foreground time accrued so far
  var sentMs = 0;      // foreground time already reported to the server
  // Assume focus when the page loads visible; mobile browsers rarely fire focus events,
  // so we lean on visibility there and only clear focus on an explicit blur.
  var focused = !document.hidden;
  // Foreground = visible AND focused, exactly like GA4 engagement time. No interaction is
  // required, so reading a page without scrolling counts; hiding, blurring or closing pauses it.
  function foreground() { return document.visibilityState === 'visible' && focused; }
  var fgSince = foreground() ? Date.now() : 0;
  // Add the current foreground stretch to the total, then restart the clock if still foreground.
  // A stretch longer than 30s means the heartbeat (every 15s) did NOT keep firing, so the tab
  // was really backgrounded or the machine slept without a visibility/blur event. We drop that
  // gap instead of crediting it, which is what caused a full "30 min" to appear on return.
  function tick() { if (fgSince) { var d = Date.now() - fgSince; if (d > 0 && d <= 30000) engagedMs += d; } fgSince = foreground() ? Date.now() : 0; }
  function bump() { focused = true; if (!fgSince && foreground()) fgSince = Date.now(); }
  var acts = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart', 'pointerdown'];
  for (var i = 0; i < acts.length; i++) window.addEventListener(acts[i], bump, { passive: true, capture: true });
  // LIVE presence: visible + foreground, so a reader stays online without interacting.
  function engaged() { return foreground(); }
  // Report engagement the GA4 way: INCREMENTALLY. Each heartbeat (and the final one on exit)
  // sends only the foreground time gained since the last report, so every value is small
  // (bounded by the interval) and a single row can never be a bogus 30 minutes. The delta
  // rides on the ping, so there is no extra request; the dashboard sums them per visitor.
  function report(final) {
    tick();
    var d = engagedMs - sentMs;
    if (d > 0) { sentMs = engagedMs; send(final ? 'custom' : 'ping', { duration_ms: d }); }
    else if (!final && engaged()) send('ping');
  }
  var hb = setInterval(report, 15000);
  document.addEventListener('click', function (e) {
    bump();
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^https?:\\/\\//.test(href) && a.host !== location.host) send('click', { click_target: href });
  }, true);
  function bye() { report(true); }
  // Reliable end of session: visibilitychange (hidden) + pagehide (~91% combined coverage).
  document.addEventListener('visibilitychange', function () { tick(); if (document.visibilityState === 'hidden') bye(); else { bump(); report(); } });
  // Focus/blur: losing the foreground pauses the engagement clock.
  window.addEventListener('focus', function () { bump(); report(); });
  window.addEventListener('blur', function () { focused = false; tick(); });
  window.addEventListener('pagehide', function () { clearInterval(hb); bye(); });
  // Public API: window.insight('purchase', { amount: 99, currency: 'usd' })
  // on a thank-you page attributes revenue to this visitor's source.
  window.insight = function (name, props) {
    if (name === 'purchase' && props && typeof props.amount === 'number') {
      send('purchase', { amount: props.amount, currency: props.currency || 'usd' });
    } else if (typeof name === 'string' && name) {
      send('goal', { goal: String(name).slice(0, 64) });
    }
  };
})();`;

function jsResponse(req: Request): NextResponse {
  // The collect endpoint follows the host serving the script, so any self-hosted
  // instance reports to itself, never to a hardcoded domain.
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const origin = host ? `https://${host}` : new URL(req.url).origin;
  return new NextResponse(SCRIPT.replace('__ORIGIN__', origin), {
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
  return jsResponse(req);
}
