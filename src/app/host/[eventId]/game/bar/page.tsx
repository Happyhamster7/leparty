import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { currentOpenRound } from '@/lib/rounds';
import { ensureServesResolved, nextServes, servingNow, drinkBreakdown } from '@/lib/drinks';
import { serveNext, serveDone } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The cafeteria iPad — large text, big buttons, usable with wet hands
 * in dim light (docs/halloween-game-design.md section 6). Shares the
 * host passcode rather than a separate login; "bartender" here just
 * means whichever staff member is holding this screen.
 */
export default async function BarPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();
  const { data: event } = await supabase.from('events').select('id').eq('id', params.eventId).maybeSingle();
  if (!event) notFound();

  let round = await currentOpenRound(params.eventId);
  if (round) await ensureServesResolved(round);
  if (round) round = await currentOpenRound(params.eventId);

  let current: { id: string; blockId: string; blockName: string; drinkCount: number } | undefined;
  let preview: { id: string; blockId: string; blockName: string; drinkCount: number } | undefined;
  let serving: { id: string; blockName: string; timerEndsAt: string | null }[] = [];
  let breakdown: { name: string; qty: number }[] = [];

  const active = !!round && round.phase === 'drinks' && !!round.drinks_started_at;
  if (active && round) {
    const [up, servingNowRows] = await Promise.all([nextServes(round.id), servingNow(round.id)]);
    [current, preview] = up;
    serving = servingNowRows;
    if (current) breakdown = await drinkBreakdown(round.id, current.blockId);
  }

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>THE BAR</span>
        <Link href={`/host/${params.eventId}/game`}>BACK TO GAME CONTROL</Link>
      </div>

      <div className="body">
        {!active || !round ? (
          <div className="notice">
            Nothing to serve right now. The queue builds once the host starts drinks for a round
            from Game control.
          </div>
        ) : (
          <>
            <p className="eyebrow">Up now</p>
            {current ? (
              <>
                <h1 className="huge">{current.blockName}</h1>
                <div className="box box--quiet" style={{ marginBottom: 20 }}>
                  {breakdown.length === 0 ? (
                    <p style={{ margin: 0 }} className="small">
                      No drinks on record for them this round.
                    </p>
                  ) : (
                    breakdown.map((b) => (
                      <div className="meter-row" key={b.name}>
                        <span className="name">{b.name}</span>
                        <span className="count mono">{b.qty}</span>
                      </div>
                    ))
                  )}
                </div>
                <form action={serveNext.bind(null, params.eventId, round.id, current.id)}>
                  <button className="btn" type="submit">
                    Next
                  </button>
                </form>
              </>
            ) : (
              <div className="box box--quiet">
                <p style={{ margin: 0 }}>Nobody&rsquo;s owed a drink this round.</p>
              </div>
            )}

            {preview ? (
              <p className="small" style={{ marginTop: 14 }}>
                Up next: {preview.blockName} ({preview.drinkCount})
              </p>
            ) : null}

            <h2 style={{ marginTop: 28 }}>Currently serving</h2>
            {serving.length === 0 ? (
              <div className="box box--quiet">
                <p style={{ margin: 0 }} className="small">
                  No one&rsquo;s mid-drink.
                </p>
              </div>
            ) : (
              serving.map((s) => (
                <div className="box box--quiet" key={s.id} style={{ marginBottom: 14 }}>
                  <div className="meter-row">
                    <span className="name" style={{ fontWeight: 600 }}>
                      {s.blockName}
                    </span>
                    <span className="count mono">
                      {s.timerEndsAt ? new Date(s.timerEndsAt).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                  <form action={serveDone.bind(null, params.eventId, round.id, s.id)}>
                    <button className="btn btn--ghost" type="submit">
                      Mark done
                    </button>
                  </form>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
