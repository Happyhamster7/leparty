import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadInvite } from '@/lib/invite';
import { getTheme } from '@/lib/theme';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import Camera from './Camera';

export const dynamic = 'force-dynamic';

export default async function MugshotPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();
  const theme = getTheme(ctx.event.theme_key);

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
        <span>{theme.intakeLabel.toUpperCase()}</span>
        <span>STEP 2 OF 3</span>
      </div>

      <div className="body">
        <h1>{theme.photoNoun}</h1>
        <p className="lede">
          Goes on the big screen all night, and on every list your name appears in.
        </p>

        <Camera token={params.token} plate={plate} existingUrl={existingUrl} />

        <div className="btn-row" style={{ marginTop: 14 }}>
          <Link className="btn btn--quiet btn--inline" href={`/i/${params.token}/identity`}>
            BACK
          </Link>
        </div>
      </div>
    </div>
  );
}
