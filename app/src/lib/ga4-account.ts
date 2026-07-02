import { promises as fs } from 'node:fs';
import path from 'node:path';

// Global GA4 service account: pasted once, reused for every site.
const dir = (): string => (process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : '/data');
const file = (): string => path.join(dir(), 'ga4-account.json');

export async function getGa4Account(): Promise<{ json: string; email: string } | null> {
  try {
    const json = await fs.readFile(file(), 'utf8');
    const o = JSON.parse(json) as { client_email?: string };
    return { json, email: o.client_email ?? '' };
  } catch {
    return null;
  }
}

export async function setGa4Account(json: string): Promise<void> {
  const o = JSON.parse(json) as { client_email?: string; private_key?: string };
  if (!o.client_email || !o.private_key) throw new Error('bad service account');
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(file(), json, 'utf8');
}
