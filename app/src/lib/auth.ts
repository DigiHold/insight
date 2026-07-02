import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const secret = (): string => process.env.AUTH_SECRET ?? 'dev-secret-change-me';
const dataDir = (): string => (process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : '/data');
const authFile = (): string => path.join(dataDir(), 'auth.json');

export interface AuthState {
  totpSecret?: string;
  enrolled: boolean;
}

export async function readAuth(): Promise<AuthState> {
  try {
    return JSON.parse(await fs.readFile(authFile(), 'utf8')) as AuthState;
  } catch {
    return { enrolled: false };
  }
}

export async function writeAuth(state: AuthState): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(authFile(), JSON.stringify(state), 'utf8');
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkCredentials(email: string, pw: string): boolean {
  const expE = process.env.ADMIN_EMAIL ?? '';
  const expP = process.env.ADMIN_PASSWORD ?? '';
  if (!expE || !expP || !email || !pw) return false;
  return safeEq(email.trim().toLowerCase(), expE.trim().toLowerCase()) && safeEq(pw, expP);
}

function sign(kind: string, exp: number): string {
  const data = `${kind}|${exp}`;
  const sig = createHmac('sha256', secret()).update(data).digest('hex');
  return `${data}|${sig}`;
}

function verify(token: string, kind: string): boolean {
  const parts = token.split('|');
  if (parts.length !== 3) return false;
  const [k, expStr, sig] = parts;
  const exp = Number(expStr);
  if (k !== kind || !Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac('sha256', secret()).update(`${k}|${exp}`).digest('hex');
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function makeSession(days: number): string {
  return sign('session', Date.now() + days * 86400000);
}
export function makePwOk(minutes: number): string {
  return sign('pwok', Date.now() + minutes * 60000);
}
export function validSession(token?: string): boolean {
  return !!token && verify(token, 'session');
}
export function validPwOk(token?: string): boolean {
  return !!token && verify(token, 'pwok');
}
