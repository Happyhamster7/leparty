import { notFound } from 'next/navigation';
import { loadInvite } from '@/lib/invite';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import Camera from './Camera';

export const dynamic = 'force-dynamic';

export default async function MugshotPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  let existingUrl: string | null = null;
  if (ctx.participant.photo_path) {
    const { data } = await db()
      .storage.from(MUGSHOT_BUCKET)
      .createSignedUrl(ctx.participant.photo_path, 60 * 30);
    existingUrl = data?.signedUrl ?? null;
  }

  const surname = (ctx.person.display_name || '').trim().split(/\s+/).slice(-1)[0] || '';
  const firstInitial = (ctx.person.display_name || '').trim().charAt(0);
  const plate = `${surname.toUpperCase()}, ${firstInitial.toUpperCase()}. · ${
    ctx.participant.inmate_number ?? '----'
  }`;

  return (
    <div className="shell">
      <div className="topbar">
        <span>INTAKE</span>
        <span>STEP 3 OF 3</span>
      </div>

      <div className="body">
        <h1>Mugshot</h1>
        <p className="lede">
          Goes on the big screen all night, and on every list your name appears in.
        </p>

        <Camera token={params.token} plate={plate} existingUrl={existingUrl} />
      </div>
    </div>
  );
}
