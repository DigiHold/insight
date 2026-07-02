import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticator } from 'otplib';
import { readAuth, writeAuth, validPwOk, makeSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

authenticator.options = { window: 1 };

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
  if (!authenticator.verify({ token: code, secret: auth.totpSecret })) {
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
