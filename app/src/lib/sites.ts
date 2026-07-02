import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const dir = (): string => (process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : '/data');
const file = (): string => path.join(dir(), 'sites.json');

export interface Ga4Config {
  propertyId: string;
}

export interface Site {
  id: string;
  name: string;
  createdAt: number;
  url?: string;
  faviconType?: string;
  stripeKey?: string;
  ga4?: Ga4Config;
}

export interface PublicSite {
  id: string;
  name: string;
  createdAt: number;
  url: string;
  favicon: boolean;
  stripe: boolean;
  ga4: boolean;
}

export function toPublic(s: Site): PublicSite {
  return { id: s.id, name: s.name, createdAt: s.createdAt, url: s.url ?? '', favicon: !!s.faviconType, stripe: !!s.stripeKey, ga4: !!s.ga4 };
}

export async function listSites(): Promise<Site[]> {
  try {
    return JSON.parse(await fs.readFile(file(), 'utf8')) as Site[];
  } catch {
    return [];
  }
}

async function save(sites: Site[]): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(sites), 'utf8');
}

export async function getSite(id: string): Promise<Site | undefined> {
  return (await listSites()).find((s) => s.id === id);
}

const host = (u: string): string => {
  try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// Finds a site from a hostname (e.g. the Referer of a /t.js request).
export async function getSiteByDomain(hostname: string): Promise<Site | undefined> {
  const h = hostname.replace(/^www\./, '').toLowerCase();
  if (!h) return undefined;
  return (await listSites()).find((s) => s.url && host(s.url).toLowerCase() === h);
}

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24);
  return s || 'site';
}

export async function addSite(name: string, url?: string): Promise<Site> {
  const sites = await listSites();
  let id = slug(name);
  if (sites.some((s) => s.id === id)) id = `${id}-${randomBytes(2).toString('hex')}`;
  const site: Site = { id, name: name.trim().slice(0, 60) || id, createdAt: Date.now(), url: url?.trim() || undefined };
  sites.push(site);
  await save(sites);
  return site;
}

export async function setSiteUrl(id: string, url: string): Promise<void> {
  const sites = await listSites();
  const s = sites.find((x) => x.id === id);
  if (!s) return;
  s.url = url.trim() || undefined;
  await save(sites);
}

export async function setFavicon(id: string, faviconType: string): Promise<void> {
  const sites = await listSites();
  const s = sites.find((x) => x.id === id);
  if (!s) return;
  s.faviconType = faviconType;
  await save(sites);
}

export async function removeSite(id: string): Promise<void> {
  await save((await listSites()).filter((s) => s.id !== id));
}

export async function setStripeKey(id: string, key: string): Promise<void> {
  const sites = await listSites();
  const s = sites.find((x) => x.id === id);
  if (!s) return;
  s.stripeKey = key;
  await save(sites);
}

export async function clearStripeKey(id: string): Promise<void> {
  const sites = await listSites();
  const s = sites.find((x) => x.id === id);
  if (!s) return;
  delete s.stripeKey;
  await save(sites);
}

export async function setGa4(id: string, cfg: Ga4Config): Promise<void> {
  const sites = await listSites();
  const s = sites.find((x) => x.id === id);
  if (!s) return;
  s.ga4 = cfg;
  await save(sites);
}

export async function clearGa4(id: string): Promise<void> {
  const sites = await listSites();
  const s = sites.find((x) => x.id === id);
  if (!s) return;
  delete s.ga4;
  await save(sites);
}
