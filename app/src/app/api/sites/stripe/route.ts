import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { setStripeKey, clearStripeKey } from '@/lib/sites';
import { validateKey } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authed(): Promise<boolean> {
  const s = (await cookies()).get('insight_session')?.value;
  return validSession(s);
}

export async function POST(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let siteId = '';
  let key = '';
  try {
    const body = await req.json();
    siteId = String(body?.siteId ?? '').trim();
    key = String(body?.key ?? '').trim();
  } catch {
    siteId = '';
    key = '';
  }
  if (!siteId || !key) return NextResponse.json({ error: 'missing' }, { status: 400 });
  if (!(await validateKey(key))) return NextResponse.json({ error: 'invalid_key' }, { status: 400 });
  await setStripeKey(siteId, key);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const siteId = new URL(req.url).searchParams.get('siteId') ?? '';
  if (siteId) await clearStripeKey(siteId);
  return NextResponse.json({ ok: true });
}
