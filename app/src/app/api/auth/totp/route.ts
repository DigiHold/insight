import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/totp';
import { readAuth, writeAuth, validPwOk, makeSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const pwok = (await cookies()).get('insight_pwok')?.value;
  if (!validPwOk(pwok)) return NextResponse.json({ error: 'expired' }, { status: 401 });

  let code = '';
  try {
    code = String((await req.json())?.code ?? '').trim();
  } catch {
    code = '';
  }

  const auth = await readAuth();
  if (!auth.totpSecret) return NextResponse.json({ error: 'no_secret' }, { status: 400 });
  // window 1: accept the previous/next 30s step to tolerate clock drift.
  if (!verifyToken(code, auth.totpSecret, 1)) {
    return NextResponse.json({ error: 'bad_code' }, { status: 401 });
  }

  if (!auth.enrolled) await writeAuth({ totpSecret: auth.totpSecret, enrolled: true });

  const res = NextResponse.json({ ok: true });
  res.cookies.set('insight_session', makeSession(30), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400,
  });
  res.cookies.set('insight_pwok', '', { path: '/', maxAge: 0 });
  return res;
}
