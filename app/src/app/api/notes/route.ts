import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validSession, demoAllowed } from '@/lib/auth';
import { getJson, setJson } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface Note { date: string; text: string }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Chart annotations: small dated notes (deploy, campaign, viral post).
export async function GET(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  const site = new URL(req.url).searchParams.get('site') ?? '';
  if (!validSession(session) && !demoAllowed(site)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const notes = (await getJson<Note[]>(`notes-${site}`)) ?? [];
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const site = new URL(req.url).searchParams.get('site') ?? '';
  const body = (await req.json().catch(() => ({}))) as { date?: string; text?: string };
  if (!site || !DATE_RE.test(body.date ?? '') || !body.text?.trim()) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const notes = (await getJson<Note[]>(`notes-${site}`)) ?? [];
  notes.push({ date: body.date as string, text: body.text.trim().slice(0, 120) });
  await setJson(`notes-${site}`, notes.slice(-100));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const site = url.searchParams.get('site') ?? '';
  const date = url.searchParams.get('date') ?? '';
  const text = url.searchParams.get('text') ?? '';
  const notes = (await getJson<Note[]>(`notes-${site}`)) ?? [];
  await setJson(`notes-${site}`, notes.filter((n) => !(n.date === date && n.text === text)));
  return NextResponse.json({ ok: true });
}
