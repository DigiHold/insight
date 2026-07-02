import { createHash } from 'node:crypto';

// Real visitor IP: Cloudflare first, then X-Forwarded-For, then empty.
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') ?? '';
}

// Country from the Cloudflare header (free). Empty if missing.
export function countryFromHeaders(headers: Headers): string {
  const c = headers.get('cf-ipcountry');
  if (!c || c === 'XX' || c === 'T1') return '';
  return c;
}

// Cookieless visitor identifier: salted hash (secret + ip + ua + day), rotated daily.
// No IP is stored in clear text, and the hash is not reversible.
export function visitorId(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.AUTH_SECRET ?? '';
  return createHash('sha256').update(`${salt}|${ip}|${ua}|${day}`).digest('hex').slice(0, 32);
}
