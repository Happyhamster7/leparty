import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadInvite, nextStep, hasAttendedBefore } from '@/lib/invite';
import { formatHeldOn } from '@/lib/types';
import { db } from '@/lib/supabase';
import { setRsvp } from './actions';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  const { event, participant, person } = ctx;
  const token = params.token;
  const returning = await hasAttendedBefore(ctx);
  const step = nextStep(ctx, returning);
  const done = Boolean(participant.signup_completed_at);

  const { count } = await db()
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('rsvp', 'yes');

  const yes = count ?? 0;

  const sayYes = setRsvp.bind(null, token, 'yes');
  const sayNo = setRsvp.bind(null, token, 'no');

  return (
    <div className="shell">
      <div className="topbar">
        <span>DEPT. OF CORRECTIONS</span>
        <span>FORM 1-A</span>
      </div>

      <div className="body">
        <p className="eyebrow">Notice of detainment</p>
        <h1 className="huge">{event.theme_title || event.name}</h1>
        <hr className="rule" />
        <p className="mono">
          {[formatHeldOn(event.held_on, event.starts_at_label), event.venue]
            .filter(Boolean)
            .join(' · ')
            .toUpperCase()}
        </p>

        {event.theme_blurb ? (
          <p style={{ marginTop: 22, fontSize: 15, color: 'var(--ink-soft)' }}>
            {event.theme_blurb}
          </p>
        ) : null}

        {event.dress_code ? (
          <div className="box" style={{ marginTop: 22 }}>
            <p className="eyebrow">Dress code</p>
            <p style={{ margin: 0, fontSize: 14 }}>
              {event.dress_code}
              {event.dress_code_notes ? ` ${event.dress_code_notes}` : ''}
            </p>
          </div>
        ) : null}

        {done ? (
          <>
            <div className="notice">
              You&rsquo;re booked in, {person.display_name}. Nothing else to do until the night.
            </div>
            <Link className="btn" href={`/i/${token}/booked`}>
              See your paperwork
            </Link>
          </>
        ) : participant.rsvp === 'no' ? (
          <>
            <div className="notice">You said you can&rsquo;t make it.</div>
            <form action={sayYes}>
              <button className="btn" type="submit">
                Actually, I can come
              </button>
            </form>
          </>
        ) : participant.rsvp === 'yes' ? (
          <>
            {returning && step !== 'identity' ? (
              <div className="notice">
                Welcome back. We still have your details &mdash; you only need to say what
                you&rsquo;re bringing.
              </div>
            ) : null}
            <Link className="btn" href={`/i/${token}/${step}`}>
              {step === 'booked' ? 'See your paperwork' : 'Report for intake'}
            </Link>
            <div style={{ marginTop: 12 }}>
              <form action={sayNo}>
                <button className="btn btn--quiet" type="submit">
                  CAN&rsquo;T MAKE IT
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <form action={sayYes}>
              <button className="btn" type="submit">
                Report for intake
              </button>
            </form>
            <div style={{ marginTop: 12 }}>
              <form action={sayNo}>
                <button className="btn btn--quiet" type="submit">
                  CAN&rsquo;T MAKE IT
                </button>
              </form>
            </div>
          </>
        )}

        <p
          className="mono"
          style={{ textAlign: 'center', marginTop: 16, marginBottom: 0, fontSize: 11 }}
        >
          {yes} BOOKED SO FAR
        </p>
      </div>
    </div>
  );
}
