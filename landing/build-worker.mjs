import { readFileSync, writeFileSync } from 'node:fs';
const HTML = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ORIGIN = 'https://insightsite.nicolaslecocq.com';
const ROBOTS = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`;
const LLMS = `# Insight\n\nInsight is an open-source, cookieless, self-hosted web analytics dashboard. It is a privacy-first alternative to Google Analytics that you run on your own server.\n\n## What it does\n- Real-time visitor dashboard, refreshed every 5 seconds\n- Live world map of current visitors with city, page and referrer\n- Revenue attribution via Stripe, including refunds\n- Funnels and weekly retention cohorts\n- AI crawler tracking (ChatGPT, Claude, Perplexity, Googlebot and others), per page\n- Optional Google Analytics 4 and Search Console import\n- Cookieless first-party tracker, no cookie banner needed\n- Read-only CLI to query the stats from a terminal or an AI assistant\n\n## Facts\n- Licence: MIT, free to use\n- Self-hosted with Docker on your own server\n- No cookies, no fingerprinting, GDPR-friendly\n- Source code: https://github.com/DigiHold/insight\n- Author: Nicolas Lecocq (https://nicolaslecocq.com)\n`;
const OG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0b0b12"/><circle cx="180" cy="120" r="380" fill="#ffa950" fill-opacity="0.12"/><circle cx="1050" cy="560" r="320" fill="#6366f1" fill-opacity="0.12"/><g transform="translate(90,235)"><rect width="120" height="120" rx="30" fill="#ffa950"/><rect x="30" y="74" width="15" height="20" rx="7" fill="#fff" fill-opacity="0.5"/><rect x="52" y="44" width="15" height="50" rx="7" fill="#fff" fill-opacity="0.75"/><rect x="75" y="26" width="15" height="68" rx="7" fill="#fff"/></g><text x="240" y="300" font-family="system-ui,sans-serif" font-size="76" font-weight="800" fill="#fff">Insight</text><text x="92" y="430" font-family="system-ui,sans-serif" font-size="40" font-weight="600" fill="#c7c7d1">Cookieless, self-hosted web analytics</text><text x="92" y="490" font-family="system-ui,sans-serif" font-size="30" fill="#8a8a97">Open source · real-time · privacy-first · you own the data</text></svg>`;

import { readdirSync } from 'node:fs';
const FONTS = {};
for (const f of readdirSync(new URL('./fonts/', import.meta.url))) {
  if (f.endsWith('.woff2')) FONTS['/fonts/' + f] = readFileSync(new URL('./fonts/' + f, import.meta.url)).toString('base64');
}

const worker = `// Insight landing — Cloudflare Worker (auto-generated from index.html by build-worker.mjs)
const HTML = ${JSON.stringify(HTML)};
const ROBOTS = ${JSON.stringify(ROBOTS)};
const SITEMAP = ${JSON.stringify(SITEMAP)};
const LLMS = ${JSON.stringify(LLMS)};
const OG = ${JSON.stringify(OG)};
const FONTS = ${JSON.stringify(FONTS)};
const b64 = (str) => { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const resp = (body, type, secs) => new Response(body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=' + secs } });
export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/robots.txt')  return resp(ROBOTS, 'text/plain; charset=utf-8', 86400);
    if (pathname === '/sitemap.xml') return resp(SITEMAP, 'application/xml; charset=utf-8', 86400);
    if (pathname === '/llms.txt')    return resp(LLMS, 'text/plain; charset=utf-8', 86400);
    if (pathname === '/og.svg')      return resp(OG, 'image/svg+xml; charset=utf-8', 604800);
    if (FONTS[pathname]) return new Response(b64(FONTS[pathname]), { headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } });
    return resp(HTML, 'text/html; charset=utf-8', 300);
  }
};
`;
writeFileSync(new URL('./worker.js', import.meta.url), worker);
console.log('worker.js written,', worker.length, 'bytes');
