import type { Metadata } from 'next';
import { getSiteByShareToken, toPublic } from '@/lib/sites';
import Dashboard from '../../dashboard-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Public read-only dashboard for one site, opened by its share token.
// The owner turns this on per site; revenue is never served to public reads.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const site = await getSiteByShareToken(token);
  if (!site) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center px-6 text-center text-sm text-zinc-500">
        This share link is no longer active.
      </main>
    );
  }
  return <Dashboard demoSite={{ ...toPublic(site), shareToken: undefined }} shareToken={token} />;
}
