import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import type { EventRow } from '@/lib/types';
import EventForm from '../../EventForm';
import { setEventStatus } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EditEventPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const { data: event } = await db()
    .from('events')
    .select('*')
    .eq('id', params.eventId)
    .maybeSingle();

  if (!event) notFound();
  const ev = event as EventRow;

  const archive = setEventStatus.bind(null, params.eventId, 'archived');
  const reopen = setEventStatus.bind(null, params.eventId, 'open');

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>WARDEN&rsquo;S CONSOLE</span>
        <Link href={`/host/${params.eventId}`}>BACK</Link>
      </div>

      <div className="body">
        <h1>Edit party</h1>
        <p className="lede">
          Changes show up on guests&rsquo; invite pages straight away, including for people who
          have already signed up.
        </p>

        <EventForm event={ev} />

        <hr className="rule" />

        <h2>Status</h2>
        <p className="small" style={{ marginBottom: 14 }}>
          Currently <strong>{ev.status}</strong>. Archiving keeps everything but hides the party
          from the typed-code lookup, so an old block card can&rsquo;t open it.
        </p>
        <div className="btn-row">
          {ev.status === 'archived' ? (
            <form action={reopen}>
              <button className="btn btn--quiet btn--inline" type="submit">
                REOPEN
              </button>
            </form>
          ) : (
            <form action={archive}>
              <button className="btn btn--quiet btn--inline" type="submit">
                ARCHIVE THIS PARTY
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
