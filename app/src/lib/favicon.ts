import { promises as fs } from 'node:fs';
import path from 'node:path';

const dir = (): string => path.join(process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : '/data', 'favicons');
// Version suffix: bumping it makes us ignore the old files and re-download cleanly.
const safe = (id: string): string => `${id.replace(/[^a-z0-9-]/gi, '')}-v2`;

// A real browser UA: some sites (Cloudflare, etc.) block "bot" user agents.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const svgScore = (link: string): number => (/image\/svg\+xml/i.test(link) || /href=["'][^"']*\.svg/i.test(link) ? 1 : 0);

// A stored file that starts with HTML (an error page) is not a real favicon.
export function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 200).toString('utf8').toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html') || head.includes('<head');
}

async function download(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 512 * 1024) return null;
    const type = res.headers.get('content-type')?.split(';')[0] || (url.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon');
    if (!/^image\//i.test(type)) return null;
    return { buf, type };
  } catch {
    return null;
  }
}

// Download the site's REAL icon (SVG first) and store it on the VPS. We never serve
// an external icon (Google/DuckDuckGo): only the site's own icon, self-hosted.
export async function fetchAndSaveFavicon(id: string, siteUrl: string): Promise<string | null> {
  try {
    const base = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
    const candidates: string[] = [];
    try {
      const page = await fetch(base.toString(), { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (page.ok) {
        const html = await page.text();
        const links = Array.from(html.matchAll(/<link\b[^>]*>/gi)).map((m) => m[0]).filter((l) => /rel=["'][^"']*icon/i.test(l));
        for (const l of [...links].sort((a, b) => svgScore(b) - svgScore(a))) {
          const href = l.match(/href=["']([^"']+)["']/i)?.[1];
          if (href) candidates.push(new URL(href, base).toString());
        }
      }
    } catch { /* page unreachable: we'll try the default paths */ }
    // Usual paths on the site itself (SVG then ICO/PNG), no external source.
    for (const p of ['/favicon.svg', '/icon.svg', '/favicon.ico', '/apple-touch-icon.png']) {
      const u = new URL(p, base).toString();
      if (!candidates.includes(u)) candidates.push(u);
    }

    for (const url of candidates) {
      const got = await download(url);
      if (got) {
        await fs.mkdir(dir(), { recursive: true });
        await fs.writeFile(path.join(dir(), safe(id)), got.buf);
        return got.type;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function readFavicon(id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(dir(), safe(id)));
  } catch {
    return null;
  }
}

export async function deleteFavicon(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(dir(), safe(id)));
  } catch {
    /* ignore */
  }
}
