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
