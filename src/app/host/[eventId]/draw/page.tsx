import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import type { EventRow } from '@/lib/types';
import type { Drawee } from '@/lib/draw';
import DrawReview from './DrawReview';
import { clearDraw, reopenCheckIn } from '../nightActions';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  block_id: string | null;
  people: { display_name: string; capacity_band: number | null } | null;
};

export default async function DrawPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.eventId)
    .maybeSingle();

  if (!event) notFound();
  const ev = event as EventRow;

  const [{ data: rows }, { data: blocks }] = await Promise.all([
    supabase
      .from('participants')
      .select('id, block_id, people(display_name, capacity_band)')
      .eq('event_id', params.eventId)
      .eq('rsvp', 'yes')
      .not('checked_in_at', 'is', null),
    supabase
      .from('blocks')
      .select('id, name, colour')
      .eq('event_id', params.eventId)
      .order('name', { ascending: true }),
  ]);

  const list = (rows ?? []) as unknown as Row[];
  const alreadyDrawn = list.length > 0 && list.every((r) => r.block_id);

  const people: Drawee[] = list.map((r) => ({
    participantId: r.id,
    name: r.people?.display_name ?? 'Unknown',
    capacity: r.people?.capacity_band ?? 3,
  }));

  const reopen = reopenCheckIn.bind(null, params.eventId);
  const clear = clearDraw.bind(null, params.eventId);

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>{(ev.theme_title || ev.name).toUpperCase()} &middot; THE DRAW</span>
        <Link href={`/host/${params.eventId}`}>CONSOLE</Link>
      </div>

      <div className="body">
        <h1>The draw</h1>
        <p className="lede">
          Snake draft by capacity, then swaps to narrow the gap. Blocks are compared on total
          capacity, not average, so an uneven block is fine.
        </p>

        {people.length === 0 ? (
          <div className="box box--quiet">
            <p style={{ margin: 0 }}>
              Nobody is checked in yet, so there&rsquo;s nothing to draw. Run check-in first.
            </p>
            <div style={{ marginTop: 14 }}>
              <Link className="btn btn--inline" href={`/host/${params.eventId}/checkin`}>
                Open check-in
              </Link>
            </div>
          </div>
        ) : (
          <>
            {alreadyDrawn ? (
              <div className="notice">
                These blocks are already drawn and in play. Reshuffling or confirming again
                reassigns everyone &mdash; which is usually the wrong move once the night has
                started.
              </div>
            ) : null}

            <DrawReview
              eventId={params.eventId}
              people={people}
              blocks={(blocks ?? []) as { id: string; name: string; colour: string }[]}
            />

            <hr className="rule" />

            <div className="btn-row no-print">
              <form action={reopen}>
                <button className="btn btn--quiet btn--inline" type="submit">
                  REOPEN CHECK-IN
                </button>
              </form>
              {alreadyDrawn ? (
                <form action={clear}>
                  <button className="btn btn--quiet btn--inline" type="submit">
                    CLEAR THE DRAW
                  </button>
                </form>
              ) : null}
              <Link className="btn btn--quiet btn--inline" href={`/host/${params.eventId}/cards`}>
                BLOCK CARDS
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
