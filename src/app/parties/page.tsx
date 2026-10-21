import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { loadProfile } from '@/lib/profile';
import { formatHeldOn } from '@/lib/types';
import { joinParty } from './actions';
import JoinButton from './JoinButton';

export const dynamic = 'force-dynamic';

type EventRow = {
  id: string;
  name: string;
  theme_title: string | null;
  theme_blurb: string | null;
  venue: string | null;
  held_on: string | null;
  starts_at_label: string | null;
};

export default async function PartiesPage() {
  const person = await loadProfile();
  if (!person) redirect('/signup');

  const supabase = db();

  const [{ data: events }, { data: mine }] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, theme_title, theme_blurb, venue, held_on, starts_at_label')
      .eq('status', 'open')
      .order('held_on', { ascending: true }),
    supabase.from('participants').select('event_id, rsvp, invite_token').eq('person_id', person.id),
  ]);

  const mineByEvent = new Map((mine ?? []).map((p) => [p.event_id, p]));

  return (
    <div className="shell">
      <div className="topbar">
        <span>{person.display_name.toUpperCase()}</span>
        <Link href="/signup">MY PROFILE</Link>
      </div>

      <div className="body">
        <h1>Parties</h1>
        <p className="lede">Pick one you&rsquo;re coming to.</p>

        {events && events.length > 0 ? (
          (events as EventRow[]).map((e) => {
            const mineRow = mineByEvent.get(e.id);
            const going = mineRow?.rsvp === 'yes';
            const join = joinParty.bind(null, e.id);

            return (
              <div className="box" key={e.id} style={{ marginBottom: 14 }}>
                <p className="eyebrow">
                  {formatHeldOn(e.held_on, e.starts_at_label) || 'Date TBA'}
                </p>
                <h2 style={{ margin: '4px 0 6px' }}>{e.theme_title || e.name}</h2>
                {e.venue ? (
                  <p className="small" style={{ marginBottom: 10 }}>
                    {e.venue}
                  </p>
                ) : null}
                {e.theme_blurb ? (
                  <p style={{ fontSize: 14, marginBottom: 14 }}>{e.theme_blurb}</p>
                ) : null}

                {going ? (
                  <div className="btn-row">
                    <Link
                      className="btn btn--quiet btn--inline"
                      href={`/i/${mineRow?.invite_token}`}
                    >
                      YOU&rsquo;RE GOING — VIEW STATUS
                    </Link>
                  </div>
                ) : (
                  <form action={join}>
                    <JoinButton />
                  </form>
                )}
              </div>
            );
          })
        ) : (
          <div className="box box--quiet">
            <p style={{ margin: 0 }}>No parties open for signup right now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
