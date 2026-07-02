import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { setGa4, clearGa4 } from '@/lib/sites';
import { getGa4Account, setGa4Account } from '@/lib/ga4-account';
import { validateGa4 } from '@/lib/ga4';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authed(): Promise<boolean> {
  const s = (await cookies()).get('insight_session')?.value;
  return validSession(s);
}

// Returns the email of the global service account if it is already saved.
export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const acc = await getGa4Account();
  return NextResponse.json({ email: acc?.email ?? null });
}

// We only store the (global) service account plus the site's property ID.
// Insight then reads GA4 live on every request, so the numbers match GA4 exactly.
export async function POST(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let siteId = '';
  let propertyId = '';
  let serviceAccount = '';
  try {
    const b = await req.json();
    siteId = String(b?.siteId ?? '').trim();
    propertyId = String(b?.propertyId ?? '').replace(/[^0-9]/g, '');
    serviceAccount = String(b?.serviceAccount ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'missing' }, { status: 400 });
  }
  if (!siteId || !propertyId) return NextResponse.json({ error: 'missing' }, { status: 400 });

  // If a JSON is provided, we save it globally (once for all sites).
  if (serviceAccount) {
    try {
      await setGa4Account(serviceAccount);
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
  }
  const account = await getGa4Account();
  if (!account) return NextResponse.json({ error: 'no_account' }, { status: 400 });

  if (!(await validateGa4(account.json, propertyId))) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await setGa4(siteId, { propertyId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const siteId = new URL(req.url).searchParams.get('siteId') ?? '';
  if (siteId) await clearGa4(siteId);
  return NextResponse.json({ ok: true });
}
