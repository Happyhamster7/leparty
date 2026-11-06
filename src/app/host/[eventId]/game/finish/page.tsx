import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { pointsBalances } from '@/lib/ledger';
import { confirmWinner } from './actions';

export const dynamic = 'force-dynamic';

/** Final standings and the host's confirmed winner — docs/halloween-game-design.md section 12. */
export default async function FinishPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();
  const { data: event } = await supabase
    .from('events')
    .select('id, ended_at, winner_block_id')
    .eq('id', params.eventId)
    .maybeSingle();
  if (!event) notFound();

  const { data: blockRows } = await supabase
    .from('blocks')
    .select('id, name')
    .eq('event_id', params.eventId)
    .eq('in_play', true)
    .order('name', { ascending: true });
  const blocks = (blockRows ?? []) as { id: string; name: string }[];

  const points = await pointsBalances(params.eventId);
  const ranked = blocks
    .slice()
    .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0));
  const topScore = ranked.length ? points.get(ranked[0].id) ?? 0 : 0;

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>END OF NIGHT</span>
        <Link href={`/host/${params.eventId}/game`}>BACK TO GAME CONTROL</Link>
      </div>

      <div className="body">
        {event.ended_at ? (
          <>
            <p className="eyebrow">Confirmed {new Date(event.ended_at).toLocaleString()}</p>
            <h1 className="huge">{blocks.find((b) => b.id === event.winner_block_id)?.name ?? 'Unknown'} wins</h1>
            <h2 style={{ marginTop: 28 }}>Final standings</h2>
            <div className="box box--quiet">
              {ranked.map((b, i) => (
                <div className="meter-row" key={b.id}>
                  <span className="name">
                    {i + 1}. {b.name}
                  </span>
                  <span className="count mono">{points.get(b.id) ?? 0}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>Final standings</h1>
            <p className="small">
              Confirming locks in the winner — shown on the public screen and can&rsquo;t be undone
              from here.
            </p>
            <form action={confirmWinner.bind(null, params.eventId)}>
              <div className="radios">
                {ranked.map((b) => (
                  <label className="radio" key={b.id}>
                    <input type="radio" name="block_id" value={b.id} defaultChecked={(points.get(b.id) ?? 0) === topScore} />
                    <span style={{ flex: 1 }}>{b.name}</span>
                    <span className="mono">{points.get(b.id) ?? 0}</span>
                  </label>
                ))}
              </div>
              <button className="btn" type="submit">
                Confirm winner
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
