import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession } from '@/lib/auth';
import { getSite, setShareToken, clearShareToken } from '@/lib/sites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authed(): Promise<boolean> {
  return validSession((await cookies()).get('insight_session')?.value);
}

// Turns the public share link on and returns the token to display.
export async function POST(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let id = '';
  try {
    const b = await req.json();
    id = String(b?.id ?? '').trim();
  } catch {
    id = '';
  }
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  if (!(await getSite(id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const token = await setShareToken(id);
  return NextResponse.json({ token });
}

// Turns it off. The old link stops working immediately.
export async function DELETE(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  await clearShareToken(id);
  return NextResponse.json({ ok: true });
}
