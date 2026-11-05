import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/supabase';
import { isHost } from '@/lib/host';
import { getTheme } from '@/lib/theme';
import { currentOpenRound, ensurePicksResolved } from '@/lib/rounds';
import { moneyBalances } from '@/lib/ledger';
import { priceOrder } from '@/lib/drinkPricing';
import type { EventRow } from '@/lib/types';
import { startRound, advanceToResults, closeShop } from './actions';
import ResultsForm from './ResultsForm';

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

  const { data: inPlayBlocks } = await supabase
    .from('blocks')
    .select('id, name')
    .eq('event_id', params.eventId)
    .eq('in_play', true)
    .order('name', { ascending: true });
  const blocks = (inPlayBlocks ?? []) as { id: string; name: string }[];

  const balances = round && round.phase !== 'game' ? await moneyBalances(params.eventId) : null;

  const showOrders = !!round && ['spending', 'drinks', 'done'].includes(round.phase);
  let orderRows: { id: string; senderName: string; targetName: string; drinkName: string; qty: number; cost: number }[] = [];
  let itemUseRows: { id: string; buyerName: string; itemName: string }[] = [];

  if (showOrders && round) {
    const [{ data: drinkTypes }, { data: items }, { data: orders }, { data: uses }] = await Promise.all([
      supabase.from('drink_types').select('id, name, cost, points').eq('event_id', params.eventId),
      supabase.from('items').select('id, name').eq('event_id', params.eventId),
      supabase
        .from('drink_orders')
        .select('id, sender_block_id, target_block_id, drink_type_id, qty')
        .eq('round_id', round.id),
      supabase.from('item_uses').select('id, block_id, item_id').eq('round_id', round.id),
    ]);

    const drinkTypeById = new Map(
      (drinkTypes ?? []).map((d) => [d.id as string, d as { id: string; name: string; cost: number; points: number }])
    );
    const itemNameById = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
    const blockNameById = new Map(blocks.map((b) => [b.id, b.name]));

    orderRows = (
      (orders ?? []) as {
        id: string;
        sender_block_id: string | null;
        target_block_id: string;
        drink_type_id: string;
        qty: number;
      }[]
    ).map((o) => {
      const dt = drinkTypeById.get(o.drink_type_id);
      const { cost } = dt ? priceOrder(dt.name, dt.cost, dt.points, o.qty) : { cost: 0 };
      return {
        id: o.id,
        senderName: o.sender_block_id ? blockNameById.get(o.sender_block_id) ?? 'Unknown' : 'Admin',
        targetName: blockNameById.get(o.target_block_id) ?? 'Unknown',
        drinkName: dt?.name ?? 'Unknown',
        qty: o.qty,
        cost,
      };
    });

    itemUseRows = ((uses ?? []) as { id: string; block_id: string; item_id: string }[]).map((u) => ({
      id: u.id,
      buyerName: blockNameById.get(u.block_id) ?? 'Unknown',
      itemName: itemNameById.get(u.item_id) ?? 'Unknown',
    }));
  }

  let revealRows: { blockName: string; names: string[] }[] = [];
  if (round && round.picks_revealed_at) {
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

        {balances ? (
          <>
            <h2>Money standings</h2>
            <div className="box box--quiet" style={{ marginBottom: 24 }}>
              {blocks
                .slice()
                .sort((a, b) => (balances.get(b.id) ?? 0) - (balances.get(a.id) ?? 0))
                .map((b) => (
                  <div className="meter-row" key={b.id}>
                    <span className="name">{b.name}</span>
                    <span className="count mono">{balances.get(b.id) ?? 0}</span>
                  </div>
                ))}
            </div>
          </>
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

        {round && round.phase === 'results' ? (
          <>
            <h2>Enter results</h2>
            <ResultsForm
              eventId={params.eventId}
              roundId={round.id}
              blocks={blocks}
              showScore={round.games?.result_type === 'score'}
            />
          </>
        ) : null}

        {showOrders ? (
          <>
            <h2>Orders this round</h2>
            <div className="box box--quiet" style={{ marginBottom: 24 }}>
              {orderRows.length === 0 && itemUseRows.length === 0 ? (
                <p style={{ margin: 0 }} className="small">
                  No orders or purchases yet.
                </p>
              ) : (
                <>
                  {orderRows.map((o) => (
                    <div className="meter-row" key={o.id}>
                      <span className="name">
                        {o.senderName} → {o.targetName}: {o.qty}× {o.drinkName}
                      </span>
                      <span className="count mono">{o.cost}</span>
                    </div>
                  ))}
                  {itemUseRows.map((u) => (
                    <div className="meter-row" key={u.id}>
                      <span className="name">
                        {u.buyerName} bought {u.itemName}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        ) : null}

        {round && round.phase === 'spending' ? (
          <form action={closeShop.bind(null, params.eventId, round.id)}>
            <button className="btn" type="submit">
              Close shop and move to drinks
            </button>
          </form>
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
