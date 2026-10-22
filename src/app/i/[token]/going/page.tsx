import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadInvite } from '@/lib/invite';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import { initials } from '@/lib/types';

export const dynamic = 'force-dynamic';

const COLS = 4;

type Row = {
  id: string;
  photo_path: string | null;
  inmate_number: number | null;
  people: { display_name: string } | null;
};

type Occupant = {
  name: string;
  url: string | null;
  inmateNumber: number | null;
};

function Cell({ occupant }: { occupant: Occupant | null }) {
  if (!occupant) {
    return (
      <div className="cell cell--empty">
        <div className="cell__tag">Vacant</div>
        <div className="cell__frame">
          <div className="cell__bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <p className="cell__number">&mdash;</p>
      </div>
    );
  }

  return (
    <div className="cell">
      <div className="cell__tag" title={occupant.name}>
        {occupant.name}
      </div>
      <div className="cell__frame">
        {occupant.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={occupant.url} alt="" />
        ) : (
          <span className="initials">{initials(occupant.name)}</span>
        )}
        <div className="cell__bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <p className="cell__number">{occupant.inmateNumber ?? '—'}</p>
    </div>
  );
}

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

  const occupants: Occupant[] = list.map((r) => ({
    name: r.people?.display_name ?? 'Unknown',
    url: r.photo_path ? signed.get(r.photo_path) ?? null : null,
    inmateNumber: r.inmate_number,
  }));

  // Fill out the current tier, then always add one more empty tier below —
  // a cellblock should never look like it ends exactly where the roster does.
  const remainder = occupants.length % COLS;
  const toCompleteTier = remainder === 0 ? 0 : COLS - remainder;
  const totalSlots = occupants.length + toCompleteTier + COLS;

  const slots: (Occupant | null)[] = Array.from(
    { length: totalSlots },
    (_, i) => occupants[i] ?? null
  );

  const tiers: (Occupant | null)[][] = [];
  for (let i = 0; i < slots.length; i += COLS) {
    tiers.push(slots.slice(i, i + COLS));
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

        <div className="cellblock" style={{ marginBottom: 20 }}>
          {tiers.map((tier, i) => (
            <div className="tier" key={i}>
              <p className="tier__label">
                {i === tiers.length - 1 ? 'Fresh meat' : `Level ${tiers.length - 1 - i}`}
              </p>
              <div className="tier__row">
                {tier.map((occupant, j) => (
                  <Cell occupant={occupant} key={occupant ? occupant.name + j : `empty-${i}-${j}`} />
                ))}
              </div>
              {i < tiers.length - 1 ? <div className="tier__floor" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>

        <div className="btn-row">
          <Link className="btn btn--quiet btn--inline" href={`/i/${params.token}/booked`}>
            BACK
          </Link>
        </div>
      </div>
    </div>
  );
}
