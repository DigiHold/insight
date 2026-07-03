import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { checkCredentials, readAuth, writeAuth, makePwOk, type AuthState } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function enrollPayload(auth: AuthState): Promise<{ step: 'enroll'; secret: string; qr: string }> {
  let secret = auth.totpSecret;
  if (!secret) {
    secret = authenticator.generateSecret();
    await writeAuth({ totpSecret: secret, enrolled: false });
  }
  const uri = authenticator.keyuri(process.env.ADMIN_EMAIL ?? 'admin', 'Insight', secret);
  const qr = await QRCode.toDataURL(uri);
  return { step: 'enroll', secret, qr };
}

export async function POST(req: Request) {
  let email = '';
  let pw = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '');
    pw = String(body?.password ?? '');
  } catch {
    email = '';
    pw = '';
  }
  if (!checkCredentials(email, pw)) return NextResponse.json({ error: 'invalid' }, { status: 401 });

  const auth = await readAuth();
  const body = auth.enrolled ? { step: 'totp' as const } : await enrollPayload(auth);
  const res = NextResponse.json(body);
  res.cookies.set('insight_pwok', makePwOk(5), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300,
  });
  return res;
}
