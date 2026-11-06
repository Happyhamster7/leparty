import { notFound, redirect } from 'next/navigation';
import { db, CLIPS_BUCKET } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { getTheme } from '@/lib/theme';
import { currentOpenRound, ensurePicksResolved, cooldownParticipantIds } from '@/lib/rounds';
import { ensureServesResolved, teamServeStatus, latestClipPath } from '@/lib/drinks';
import { pointsBalances } from '@/lib/ledger';
import type { EventRow } from '@/lib/types';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic';

/**
 * The public display — mirrored to the TV and monitors via the
 * Lemorele HDMI kit, so this is the one view nobody's directly
 * operating (hence AutoRefresh). Shares the host passcode rather than
 * a separate login, same as the bar iPad: only the host's own laptop
 * ever opens this URL. Never render secret info here — orders and
 * item purchases are explicitly off the public screens (section 6).
 */
export default async function ScreenPage({ params }: { params: { eventId: string } }) {
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

  const { data: inPlayBlocks } = await supabase
    .from('blocks')
    .select('id, name')
    .eq('event_id', params.eventId)
    .eq('in_play', true)
    .order('name', { ascending: true });
  const blocks = (inPlayBlocks ?? []) as { id: string; name: string }[];

  let round = await currentOpenRound(params.eventId);
  if (round) await ensurePicksResolved(round);
  if (round) await ensureServesResolved(round);
  if (round) round = await currentOpenRound(params.eventId);

  const [points, cooldownIds] = await Promise.all([
    pointsBalances(params.eventId),
    cooldownParticipantIds(params.eventId),
  ]);

  let cooldownNames: { name: string; blockName: string }[] = [];
  if (cooldownIds.size > 0) {
    const { data: participants } = await supabase
      .from('participants')
      .select('id, block_id, people(display_name)')
      .in('block_id', blocks.map((b) => b.id));

    const blockNameById = new Map(blocks.map((b) => [b.id, b.name]));
    cooldownNames = ((participants ?? []) as unknown as {
      id: string;
      block_id: string;
      people: { display_name: string } | null;
    }[])
      .filter((p) => cooldownIds.has(p.id))
      .map((p) => ({
        name: p.people?.display_name ?? 'Unknown',
        blockName: blockNameById.get(p.block_id) ?? 'Unknown',
      }));
  }

  let revealRows: { blockName: string; names: string[] }[] = [];
  if (round && round.phase === 'game' && round.picks_revealed_at) {
    const { data: picks } = await supabase
      .from('round_players')
      .select('block_id, picked_by, participants(people(display_name))')
      .eq('round_id', round.id);

    const blockNames = new Map(blocks.map((b) => [b.id, b.name]));
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

  let drinksGrid: { blockName: string; status: string; videoUrl: string | null }[] = [];
  if (round && round.phase === 'drinks') {
    drinksGrid = await Promise.all(
      blocks.map(async (b) => {
        const serve = await teamServeStatus(round!.id, b.id);
        const label =
          serve.status === 'safe'
            ? 'Safe this round'
            : serve.status === 'queued'
              ? `Queued (${serve.drinkCount})`
              : serve.status === 'serving'
                ? 'Drinking now'
                : 'Done';

        let videoUrl: string | null = null;
        if (serve.serveId && (serve.status === 'serving' || serve.status === 'done')) {
          const path = await latestClipPath(serve.serveId);
          if (path) {
            const { data: signed } = await supabase.storage.from(CLIPS_BUCKET).createSignedUrl(path, 60 * 10);
            videoUrl = signed?.signedUrl ?? null;
          }
        }

        return { blockName: b.name, status: label, videoUrl };
      })
    );
  }

  const roundLabel = round
    ? `Round ${round.number} — ${round.games?.name ?? 'Unknown game'}`
    : 'Waiting to start';

  return (
    <div className="shell shell--wide">
      <AutoRefresh />
      <div className="topbar">
        <span>{(ev.theme_title || ev.name || 'LEPARTY').toUpperCase()}</span>
        <span>{theme.hostTitle}&rsquo;s screen</span>
      </div>

      <div className="body">
        {ev.ended_at ? (
          <>
            <p className="eyebrow mono">GAME OVER</p>
            <h1 className="huge">{blocks.find((b) => b.id === ev.winner_block_id)?.name ?? 'Unknown'} wins</h1>
          </>
        ) : (
          <>
            <p className="eyebrow mono">{round ? round.phase.toUpperCase() : 'INTAKE'}</p>
            <h1 className="huge">{roundLabel}</h1>
          </>
        )}

        {round && round.phase === 'game' && !round.picks_revealed_at && round.pick_deadline ? (
          <p className="small" style={{ marginBottom: 20 }}>
            Picks lock at {new Date(round.pick_deadline).toLocaleTimeString()}.
          </p>
        ) : null}

        <h2>Leaderboard</h2>
        <div className="box box--quiet" style={{ marginBottom: 28 }}>
          {blocks
            .slice()
            .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0))
            .map((b, i) => (
              <div className="meter-row" key={b.id}>
                <span className="name">
                  {i + 1}. {b.name}
                </span>
                <span className="count mono">{points.get(b.id) ?? 0}</span>
              </div>
            ))}
        </div>

        {revealRows.length > 0 ? (
          <>
            <h2>Picks</h2>
            <div className="box box--quiet" style={{ marginBottom: 28 }}>
              {revealRows.map((r) => (
                <div className="meter-row" key={r.blockName}>
                  <span className="name">{r.blockName}</span>
                  <span className="count">{r.names.join(', ') || '—'}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {round && round.phase === 'results' ? (
          <div className="notice">The {theme.hostTitle} is entering results.</div>
        ) : null}

        {round && round.phase === 'spending' ? (
          <div className="notice">Spending is open. Orders stay secret until they&rsquo;re served.</div>
        ) : null}

        {round && round.phase === 'drinks' ? (
          <>
            <h2>At the bar</h2>
            <div className="grid-2">
              {drinksGrid.map((d) => (
                <div className="box box--quiet" key={d.blockName}>
                  <p className="eyebrow" style={{ marginBottom: 4 }}>
                    {d.blockName}
                  </p>
                  {d.videoUrl ? (
                    <video
                      src={d.videoUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ width: '100%', display: 'block' }}
                    />
                  ) : (
                    <p style={{ margin: 0 }}>{d.status}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {round && round.phase === 'done' ? <div className="notice">Round complete.</div> : null}

        {cooldownNames.length > 0 ? (
          <>
            <h2 style={{ marginTop: 28 }}>On cooldown</h2>
            <div className="box box--quiet">
              {cooldownNames.map((c, i) => (
                <div className="meter-row" key={`${c.name}-${i}`}>
                  <span className="name">{c.name}</span>
                  <span className="count small">{c.blockName}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
