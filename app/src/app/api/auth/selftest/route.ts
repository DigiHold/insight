import { NextResponse } from 'next/server';
import { generateSecret, generateToken, verifyToken, keyuri } from '@/lib/totp';
import { readAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary diagnostic. Runs the TOTP self-checks in the real server runtime and
// reports pass/fail only. It never returns any secret or any live code.
export async function GET() {
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

  return NextResponse.json({
    node: process.version,
    now: new Date().toISOString(),
    rfcVectorsPass: rfc,
    freshRoundTrip: roundtrip,
    uriOk,
    storedSecret: storedInfo,
  });
}
