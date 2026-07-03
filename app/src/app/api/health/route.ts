import { NextResponse } from 'next/server';
import { queryRows } from '@/lib/clickhouse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await queryRows('SELECT 1 AS ok');
    return NextResponse.json({ status: 'ok', clickhouse: 'up' });
  } catch {
    return NextResponse.json({ status: 'degraded', clickhouse: 'down' }, { status: 503 });
  }
}
