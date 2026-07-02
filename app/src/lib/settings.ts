import { promises as fs } from 'node:fs';
import path from 'node:path';

// Global settings. The Mapbox token is NOT in the code: it comes from the container
// environment (a GitHub secret injected at deploy time) or from an optional /data file.
const dir = (): string => (process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : '/data');
const file = (): string => path.join(dir(), 'mapbox.json');

export async function getMapboxToken(): Promise<string | null> {
  if (process.env.MAPBOX_TOKEN?.trim()) return process.env.MAPBOX_TOKEN.trim();
  try {
    const j = JSON.parse(await fs.readFile(file(), 'utf8')) as { token?: string };
    return j.token?.trim() || null;
  } catch {
    return null;
  }
}

export async function setMapboxToken(token: string): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(file(), JSON.stringify({ token: token.trim() }), 'utf8');
}

// Generic JSON settings store (funnel definitions, chart annotations...).
// One file per key under the data directory.
const safeKey = (k: string): string => k.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    return JSON.parse(await fs.readFile(path.join(dir(), `${safeKey(key)}.json`), 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${safeKey(key)}.json`), JSON.stringify(value), 'utf8');
}
