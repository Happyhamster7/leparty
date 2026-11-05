import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { getTheme } from '@/lib/theme';
import { currentOpenRound, ensurePicksResolved } from '@/lib/rounds';
import type { EventRow } from '@/lib/types';
import { startRound, advanceToResults } from './actions';

export const dynamic = 'force-dynamic';

export default async function GameControlPage({ params }: { params: { eventId: string } }) {
  if (!isHost()) redirect('/host');

  const supabase = db();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.eventId)
    .maybeSingle();

  if (!event) notFound();
  const ev = event as EventRow;
  const theme = getTheme(ev.theme_key);

  const { data: games } = await supabase
    .from('games')
    .select('id, name, is_group, players_needed')
    .eq('event_id', params.eventId)
    .order('name', { ascending: true });

  let round = await currentOpenRound(params.eventId);
  if (round) await ensurePicksResolved(round);
  // Re-read: ensurePicksResolved may have just set picks_revealed_at.
  if (round) round = await currentOpenRound(params.eventId);

  const canStartNew = !round || round.phase !== 'game';

  let revealRows: { blockName: string; names: string[] }[] = [];
  if (round && round.picks_revealed_at) {
    const [{ data: picks }, { data: blocks }] = await Promise.all([
      supabase
        .from('round_players')
        .select('block_id, picked_by, participants(people(display_name))')
        .eq('round_id', round.id),
      supabase.from('blocks').select('id, name').eq('event_id', params.eventId).eq('in_play', true),
    ]);

    const blockNames = new Map((blocks ?? []).map((b) => [b.id as string, b.name as string]));
    const byBlock = new Map<string, string[]>();

    for (const p of (picks ?? []) as unknown as {
      block_id: string;
      picked_by: string;
      participants: { people: { display_name: string } | null } | null;
    }[]) {
      const name = p.participants?.people?.display_name ?? 'Unknown';
      const label = p.picked_by === 'auto' ? `${name} (auto)` : name;
      const list = byBlock.get(p.block_id) ?? [];
      list.push(label);
      byBlock.set(p.block_id, list);
    }

    revealRows = Array.from(blockNames.entries()).map(([id, name]) => ({
      blockName: name,
      names: byBlock.get(id) ?? [],
    }));
  }

  const roundLabel = round
    ? `Round ${round.number} — ${round.games?.name ?? 'Unknown game'}`
    : 'No round yet';

  return (
    <div className="shell shell--wide">
      <div className="topbar">
        <span>GAME CONTROL</span>
        <Link href={`/host/${params.eventId}`}>BACK TO PARTY</Link>
      </div>

      <div className="body">
        <p className="eyebrow">{theme.hostConsoleLabel}</p>
        <h1>{roundLabel}</h1>

        {round ? (
          <div className="box box--quiet" style={{ marginBottom: 24 }}>
            <div className="meter-row">
              <span className="name">Phase</span>
              <span className="count mono">{round.phase}</span>
            </div>
            {!round.picks_revealed_at && round.pick_deadline ? (
              <div className="meter-row">
                <span className="name">Picks lock at</span>
                <span className="count mono">
                  {new Date(round.pick_deadline).toLocaleTimeString()}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {round && round.phase === 'game' && !round.picks_revealed_at ? (
          <div className="notice">
            Waiting on team picks. Reload this page after the deadline to reveal and auto-pick
            anyone who hasn&rsquo;t submitted.
          </div>
        ) : null}

        {revealRows.length > 0 ? (
          <>
            <h2>Picks</h2>
            <div className="box box--quiet" style={{ marginBottom: 24 }}>
              {revealRows.map((r) => (
                <div className="meter-row" key={r.blockName}>
                  <span className="name">{r.blockName}</span>
                  <span className="count">{r.names.join(', ') || '—'}</span>
                </div>
              ))}
            </div>

            {round && round.phase === 'game' ? (
              <form action={advanceToResults.bind(null, params.eventId, round.id)}>
                <button className="btn" type="submit">
                  Advance to results
                </button>
              </form>
            ) : null}
          </>
        ) : null}

        {canStartNew ? (
          <>
            <h2>Start the next round</h2>
            {games && games.length > 0 ? (
              <form action={startRound.bind(null, params.eventId)}>
                <label className="field" htmlFor="game_id">
                  Game
                </label>
                <select id="game_id" name="game_id" required>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.is_group ? ' (whole team)' : ` (${g.players_needed ?? 1} per team)`}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit" style={{ marginTop: 14 }}>
                  Start round
                </button>
              </form>
            ) : (
              <div className="box box--quiet">
                <p style={{ margin: 0 }}>No games in the catalogue yet.</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
