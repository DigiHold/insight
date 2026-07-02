import { createClient, type ClickHouseClient } from '@clickhouse/client';

let client: ClickHouseClient | null = null;

export function ch(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL ?? 'http://clickhouse:8123',
      username: process.env.CLICKHOUSE_USER ?? 'default',
      password: process.env.CLICKHOUSE_PASSWORD ?? '',
      database: process.env.CLICKHOUSE_DB ?? 'insight',
    });
  }
  return client;
}

export async function insertRows(table: string, values: Record<string, unknown>[]): Promise<void> {
  if (values.length === 0) return;
  await ch().insert({ table, values, format: 'JSONEachRow' });
}

export async function queryRows<T>(query: string, params?: Record<string, unknown>): Promise<T[]> {
  const rs = await ch().query({ query, format: 'JSONEachRow', query_params: params });
  return (await rs.json()) as T[];
}

export async function command(query: string): Promise<void> {
  await ch().command({ query });
}
