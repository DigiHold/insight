import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Favicon proxy for arbitrary referrer domains. The server downloads the
// site's own icon (SVG preferred) once, caches it on the VPS, and serves it
// from our domain, so the browser never requests an icon from a third party.

const dir = (): string => path.join(process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : '/data', 'domain-icons');
const safe = (d: string): string => d.replace(/[^a-z0-9.-]/gi, '_').slice(0, 120);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const GLOBE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/></svg>';
const globeResponse = (): NextResponse => new NextResponse(GLOBE, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' } });

async function fetchOne(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 256 * 1024) return null;
    const head = buf.subarray(0, 200).toString('utf8').toLowerCase();
    if (head.includes('<!doctype html') || head.includes('<html')) return null;
    const type = res.headers.get('content-type')?.split(';')[0] || (url.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon');
    if (!/^image\//i.test(type)) return null;
    return { buf, type };
  } catch {
    return null;
  }
}

async function download(host: string): Promise<{ buf: Buffer; type: string } | null> {
  const base = `https://${host}`;
  const candidates: string[] = [];
  // Prefer the SVG declared in the page <head>.
  try {
    const page = await fetch(base, { headers: { 'user-agent': UA }, redirect: 'follow' });
    if (page.ok) {
      const html = await page.text();
      for (const link of Array.from(html.matchAll(/<link\b[^>]*rel=["'][^"']*icon[^>]*>/gi)).map((m) => m[0])) {
        const href = link.match(/href=["']([^"']+)["']/i)?.[1];
        if (href) { try { candidates.push(new URL(href, base).toString()); } catch { /* skip */ } }
      }
      // SVG hrefs first.
      candidates.sort((a, b) => (b.endsWith('.svg') ? 1 : 0) - (a.endsWith('.svg') ? 1 : 0));
    }
  } catch { /* fall back to default paths */ }
  for (const p of ['/favicon.svg', '/icon.svg', '/favicon.ico', '/apple-touch-icon.png']) {
    const u = `${base}${p}`;
    if (!candidates.includes(u)) candidates.push(u);
  }
  for (const url of candidates) {
    const got = await fetchOne(url);
    if (got) return got;
  }
  return null;
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('d') || '';
  const host = raw.replace(/[^a-z0-9.-]/gi, '').toLowerCase();
  if (!host || !host.includes('.')) return globeResponse();

  const file = path.join(dir(), safe(host));
  try {
    const buf = await fs.readFile(file);
    const type = (await fs.readFile(`${file}.type`, 'utf8').catch(() => 'image/x-icon')).trim();
    if (buf.length === 0) return globeResponse();
    return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' } });
  } catch { /* not cached yet */ }

  const got = await download(host);
  await fs.mkdir(dir(), { recursive: true }).catch(() => {});
  if (got) {
    await fs.writeFile(file, got.buf).catch(() => {});
    await fs.writeFile(`${file}.type`, got.type).catch(() => {});
    return new NextResponse(new Uint8Array(got.buf), { headers: { 'Content-Type': got.type, 'Cache-Control': 'public, max-age=604800' } });
  }
  // Cache the miss (empty file) so we do not refetch on every request.
  await fs.writeFile(file, Buffer.alloc(0)).catch(() => {});
  return globeResponse();
}
