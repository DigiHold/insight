import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validSession } from '@/lib/auth';
import Dashboard from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = (await cookies()).get('insight_session')?.value;
  if (!validSession(session)) redirect('/login');
  return <Dashboard />;
}
