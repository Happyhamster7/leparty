import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db, siteUrl } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { potluckTally } from '@/lib/potluck';
import { formatHeldOn, POTLUCK_CATEGORIES, type EventRow } from '@/lib/types';
import BlocksForm, { type BlockEditRow } from './BlocksForm';
import CopyLink from './CopyLink';
import CopyAll from './CopyAll';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  invite_token: string;
  rsvp: 'pending' | 'yes' | 'no';
  potluck_item: string | null;
  potluck_category: string | null;
  dietary_notes: string | null;
  photo_path: string | null;
  inmate_number: number | null;
  signup_completed_at: string | null;
  checked_in_at: string | null;
  person_id: string;
  people: { display_name: string; capacity_band: number | null } | null;
};

export default async function EventPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.eventId)
    .maybeSingle();

  if (!event) notFound();
  const ev = event as EventRow;

  const [{ data: participants }, { data: blocks }, tally, { data: allParts }] =
    await Promise.all([
      supabase
        .from('participants')
        .select(
          'id, invite_token, rsvp, potluck_item, potluck_category, dietary_notes, photo_path, inmate_number, signup_completed_at, checked_in_at, person_id, people(display_name, capacity_band)'
        )
        .eq('event_id', params.eventId)
        .order('created_at', { ascending: true }),
      supabase
        .from('blocks')
        .select('id, name, colour, charge, join_code, in_play')
        .eq('event_id', params.eventId)
        .order('name', { ascending: true }),
      potluckTally(params.eventId),
      supabase.from('participants').select('person_id, block_id'),
    ]);

  const rows = (participants ?? []) as unknown as Row[];
  const base = siteUrl();

  const yes = rows.filter((r) => r.rsvp === 'yes').length;
  const no = rows.filter((r) => r.rsvp === 'no').length;
  const pending = rows.filter((r) => r.rsvp === 'pending').length;
  const complete = rows.filter((r) => r.signup_completed_at).length;
  const photos = rows.filter((r) => r.photo_path).length;

  const attending = rows.filter((r) => r.rsvp === 'yes');
  const capacitySum = attending.reduce((n, r) => n + (r.people?.capacity_band ?? 0), 0);
  const blockCount = ev.config?.block_count ?? 8;
  const perBlock = attending.length > 0 ? capacitySum / blockCount : 0;

  const blockByPerson = new Map<string, string | null>();
  for (const p of (allParts ?? []) as { person_id: string; block_id: string | null }[]) {
    blockByPerson.set(p.person_id, p.block_id);
  }

  const blockRows: BlockEditRow[] = ((blocks ?? []) as {
    id: string;
    name: string;
    colour: string;
    charge: string | null;
    join_code: string;
    in_play: boolean;
  }[]).map((b) => ({
    ...b,
    members: rows.filter((r) => blockByPerson.get(r.person_id) === b.id).length,
  }));

  // Aggregated dietary notes, which is what you actually need while cooking.
  const dietary = rows
    .filter((r) => r.rsvp !== 'no' && r.dietary_notes)
    .map((r) => ({ name: r.people?.display_name ?? 'Unknown', note: r.dietary_notes as string }));

  const allLinks = rows.map(
    (r) => `${r.people?.display_name ?? 'Unknown'}: ${base}/i/${r.invite_token}`
  );

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>WARDEN&rsquo;S CONSOLE</span>
        <Link href="/host">ALL PARTIES</Link>
      </div>

      <div className="body">
        <p className="eyebrow">{ev.status}</p>
        <h1>{ev.name}</h1>
        <p className="lede">
          {[ev.theme_title, formatHeldOn(ev.held_on, ev.starts_at_label), ev.venue]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="btn-row" style={{ marginBottom: 24 }}>
          <Link className="btn btn--inline" href={`/host/${params.eventId}/checkin`}>
            Check-in desk
          </Link>
          <Link className="btn btn--quiet btn--inline" href={`/host/${params.eventId}/draw`}>
            THE DRAW
          </Link>
          <Link className="btn btn--quiet btn--inline" href={`/host/${params.eventId}/cards`}>
            BLOCK CARDS
          </Link>
          <Link className="btn btn--quiet btn--inline" href={`/host/${params.eventId}/edit`}>
            EDIT PARTY
          </Link>
        </div>

        <div className="stat-row">
          <div className="stat">
            <p className="label">Coming</p>
            <p className="value">{yes}</p>
          </div>
          <div className="stat">
            <p className="label">No reply</p>
            <p className="value">{pending}</p>
          </div>
          <div className="stat">
            <p className="label">Can&rsquo;t make it</p>
            <p className="value">{no}</p>
          </div>
          <div className="stat">
            <p className="label">Signup done</p>
            <p className="value">{complete}</p>
          </div>
          <div className="stat">
            <p className="label">Mugshots</p>
            <p className="value">{photos}</p>
          </div>
          <div className="stat">
            <p className="label">Capacity / block</p>
            <p className="value">{perBlock.toFixed(1)}</p>
          </div>
        </div>

        <h2>Potluck</h2>
        <div className="box box--quiet">
          {tally.map((t) => (
            <div className="meter-row" key={t.key}>
              <span className="name">{t.label}</span>
              <span className="count">{t.count}</span>
            </div>
          ))}
        </div>

        {dietary.length > 0 ? (
          <>
            <h2>Allergies and won&rsquo;t-eats</h2>
            <div className="box box--quiet">
              {dietary.map((d) => (
                <div className="meter-row" key={d.name}>
                  <span className="name">{d.note}</span>
                  <span className="count">{d.name}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <h2>Guest list</h2>
        <p className="small" style={{ marginBottom: 14 }}>
          Guests add themselves — share{' '}
          <Link href="/signup">{base.replace(/^https?:\/\//, '')}/signup</Link> to let anyone
          create a profile and pick this party from the open list. Remove anyone below who
          shouldn&rsquo;t be on it.
        </p>

        <div style={{ margin: '18px 0 14px' }}>
          <CopyAll lines={allLinks} />
        </div>

        {rows.length > 0 ? (
          <div className="scroller">
            <table className="list">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>No.</th>
                  <th>Cap</th>
                  <th>RSVP</th>
                  <th>Bringing</th>
                  <th>Notes</th>
                  <th>Photo</th>
                  <th>Invite</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const categoryLabel = POTLUCK_CATEGORIES.find(
                    (c) => c.key === r.potluck_category
                  )?.label;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/host/${params.eventId}/guest/${r.id}`}>
                          <strong>{r.people?.display_name ?? 'Unknown'}</strong>
                        </Link>
                        <div>
                          {r.checked_in_at ? <span className="pill pill--yes">here</span> : null}{' '}
                          {r.signup_completed_at ? (
                            <span className="pill pill--done">booked</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="tight mono">{r.inmate_number ?? '—'}</td>
                      <td className="tight mono">{r.people?.capacity_band ?? '—'}</td>
                      <td className="tight">
                        <span
                          className={
                            r.rsvp === 'yes'
                              ? 'pill pill--yes'
                              : r.rsvp === 'no'
                                ? 'pill pill--no'
                                : 'pill'
                          }
                        >
                          {r.rsvp}
                        </span>
                      </td>
                      <td>
                        {r.potluck_item ? (
                          <>
                            {r.potluck_item}
                            {categoryLabel ? <div className="small">{categoryLabel}</div> : null}
                          </>
                        ) : (
                          <span className="small">—</span>
                        )}
                      </td>
                      <td className="small">{r.dietary_notes || '—'}</td>
                      <td className="tight">{r.photo_path ? 'yes' : '—'}</td>
                      <td className="tight">
                        <CopyLink url={`${base}/i/${r.invite_token}`} />
                      </td>
                      <td className="tight">
                        <Link
                          className="copy-link"
                          href={`/host/${params.eventId}/guest/${r.id}`}
                          style={{ color: 'var(--muted-2)' }}
                        >
                          EDIT
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="box box--quiet">
            <p style={{ margin: 0 }}>
              Nobody on the list yet. Add names above, then copy every link out in one go.
            </p>
          </div>
        )}

        <h2>Cell blocks</h2>
        <p className="small" style={{ marginBottom: 14 }}>
          Created with the party so cards can be printed before anyone replies. The draw only
          fills rosters.
        </p>

        <BlocksForm eventId={params.eventId} blocks={blockRows} />
      </div>
    </div>
  );
}
