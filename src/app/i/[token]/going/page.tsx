import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadInvite } from '@/lib/invite';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import { initials } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  photo_path: string | null;
  inmate_number: number | null;
  people: { display_name: string } | null;
};

export default async function GoingPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  const supabase = db();

  const { data: rows } = await supabase
    .from('participants')
    .select('id, photo_path, inmate_number, people(display_name)')
    .eq('event_id', ctx.event.id)
    .eq('rsvp', 'yes')
    .order('created_at', { ascending: true });

  const list = (rows ?? []) as unknown as Row[];

  const paths = list.map((r) => r.photo_path).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await supabase.storage
      .from(MUGSHOT_BUCKET)
      .createSignedUrls(paths, 60 * 30);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <span>{(ctx.event.theme_title || ctx.event.name).toUpperCase()}</span>
        <span>{list.length} GOING</span>
      </div>

      <div className="body">
        <h1>Who&rsquo;s going</h1>
        <p className="lede">Everyone booked in so far.</p>

        {list.length > 0 ? (
          <div className="cellblock" style={{ marginBottom: 20 }}>
            {list.map((r) => {
              const url = r.photo_path ? signed.get(r.photo_path) : null;
              const name = r.people?.display_name ?? 'Unknown';
              return (
                <div className="cell" key={r.id}>
                  <div className="cell__tag" title={name}>
                    {name}
                  </div>
                  <div className="cell__frame">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" />
                    ) : (
                      <span className="initials">{initials(name)}</span>
                    )}
                    <div className="cell__bars" aria-hidden="true" />
                  </div>
                  {r.inmate_number ? (
                    <p className="cell__number">{r.inmate_number}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="box box--quiet">
            <p style={{ margin: 0 }}>Nobody&rsquo;s booked in yet &mdash; you&rsquo;re the first.</p>
          </div>
        )}

        <div className="btn-row">
          <Link className="btn btn--quiet btn--inline" href={`/i/${params.token}/booked`}>
            BACK
          </Link>
        </div>
      </div>
    </div>
  );
}
