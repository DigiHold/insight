import { listSites, toPublic } from '@/lib/sites';
import Dashboard from '../dashboard-client';

export const dynamic = 'force-dynamic';

// Public read-only demo of the dashboard for one site (DEMO_SITE_ID).
// No session required; the API only serves that site and strips revenue.
export default async function DemoPage() {
  const id = process.env.DEMO_SITE_ID ?? '';
  const site = id ? (await listSites()).find((s) => s.id === id) : undefined;
  if (!site) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center px-6 text-center text-sm text-zinc-500">
        The live demo is not enabled on this instance.
      </main>
    );
  }
  return <Dashboard demoSite={toPublic(site)} />;
}
