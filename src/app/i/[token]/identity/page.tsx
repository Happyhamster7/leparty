import { notFound } from 'next/navigation';
import { loadInvite } from '@/lib/invite';
import IdentityForm from './IdentityForm';

export const dynamic = 'force-dynamic';

export default async function IdentityPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  return (
    <div className="shell">
      <div className="topbar">
        <span>INTAKE</span>
        <span>STEP 1 OF 3</span>
      </div>

      <div className="body">
        <h1>Who are you</h1>
        <p className="lede">Asked once. Next party, we&rsquo;ll already have this.</p>

        <IdentityForm
          token={params.token}
          name={ctx.person.display_name || ''}
          band={ctx.person.capacity_band}
        />
      </div>
    </div>
  );
}
