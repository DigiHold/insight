import { NextResponse } from 'next/server';
import { queryRows } from '@/lib/clickhouse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // serverTime lets the operator confirm the clock is in sync (TOTP depends on it).
  const serverTime = new Date().toISOString();
  try {
    await queryRows('SELECT 1 AS ok');
    return NextResponse.json({ status: 'ok', clickhouse: 'up', serverTime });
  } catch {
    return NextResponse.json({ status: 'degraded', clickhouse: 'down', serverTime }, { status: 503 });
  }
}
