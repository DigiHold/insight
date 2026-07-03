import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateSecret, generateToken, verifyToken, keyuri, findDrift } from '@/lib/totp';
import { readAuth, makePwOk, validPwOk } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary diagnostic. Runs the TOTP self-checks in the real server runtime and
// reports pass/fail only. It never returns any secret or any live code.
export async function GET(req: Request) {
  // 1. RFC 6238 SHA-1 vectors (secret ASCII "12345678901234567890").
  const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const vectors: [number, string][] = [
    [59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [20000000000, '353130'],
  ];
  const rfc = vectors.every(([t, want]) => generateToken(S, t * 1000) === want);

  // 2. Fresh enroll round-trip in this runtime: generate -> current code -> verify.
  const s = generateSecret();
  const roundtrip = verifyToken(generateToken(s), s, 1);

  // 3. State of the stored secret (length only, never the value), and whether the
  //    code the server currently expects for it verifies (proves read path is sane).
  const auth = await readAuth().catch(() => ({ enrolled: false } as { enrolled: boolean; totpSecret?: string }));
  const stored = auth.totpSecret ?? '';
  const storedInfo = {
    present: !!stored,
    length: stored.length,
    charsetOk: /^[A-Z2-7]+$/.test(stored),
    selfVerifies: stored ? verifyToken(generateToken(stored), stored, 1) : false,
    enrolled: !!auth.enrolled,
  };

  const uriOk = keyuri('a@b.com', 'Insight', s).startsWith('otpauth://totp/');

  // If a code is provided, report at which clock-step offset it matches the
  // stored secret (searching +/- 10 min). offset null = wrong secret; nonzero
  // offset = the phone's clock is off by offset*30 seconds.
  const code = new URL(req.url).searchParams.get('code') ?? '';
  const codeCheck = code
    ? (() => { const o = stored ? findDrift(code, stored, 20) : null; return { matches: o !== null, driftSteps: o, driftSeconds: o === null ? null : o * 30 }; })()
    : undefined;

  // Cookie roundtrip probe: read the pwok cookie a previous hit set, then set a
  // fresh one. If the second hit reports valid:false, cookie encoding is broken.
  const raw = (await cookies()).get('insight_pwok')?.value ?? '';
  const pwokCookie = { present: !!raw, valid: validPwOk(raw), sep: raw.includes('|') ? 'pipe' : raw.includes('%7C') ? 'encoded-pipe' : 'other' };

  const res = NextResponse.json({
    node: process.version,
    now: new Date().toISOString(),
    rfcVectorsPass: rfc,
    freshRoundTrip: roundtrip,
    uriOk,
    storedSecret: storedInfo,
    codeCheck,
    pwokCookie,
  });
  res.cookies.set('insight_pwok', makePwOk(5), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300 });
  return res;
}
