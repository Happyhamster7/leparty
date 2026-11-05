import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import { currentOpenRound, ensurePicksResolved, cooldownParticipantIds } from '@/lib/rounds';
import { moneyBalance, pointsBalance } from '@/lib/ledger';
import { spendingView } from '@/lib/spending';
import { ensureServesResolved, teamServeStatus } from '@/lib/drinks';
import ClaimOnLoad from './ClaimOnLoad';
import PickForm from './PickForm';
import OrderForm from './OrderForm';
import ShopForm from './ShopForm';

export const dynamic = 'force-dynamic';

/**
 * The block console. Confirms the scan worked, claims this device as
 * the team phone, and runs the round state machine once the game
 * starts (docs/halloween-game-design.md, section 4).
 */
export default async function BlockPage({ params }: { params: { token: string } }) {
  const supabase = db();

  const { data: block } = await supabase
    .from('blocks')
    .select('id, name, colour, join_code, in_play, charge, event_id')
    .eq('join_token', params.token)
    .maybeSingle();

  if (!block) notFound();

  const [{ data: event }, { data: members }] = await Promise.all([
    supabase
      .from('events')
      .select('name, theme_title, config')
      .eq('id', block.event_id)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('id, people(display_name)')
      .eq('block_id', block.id),
  ]);

  const roster = (members ?? []) as unknown as {
    id: string;
    people: { display_name: string } | null;
  }[];

  const names = roster
    .map((m) => m.people?.display_name ?? 'Unknown')
    .sort((a, b) => a.localeCompare(b));

  const [balance, points] = await Promise.all([moneyBalance(block.id), pointsBalance(block.id)]);

  let round = await currentOpenRound(block.event_id);
  if (round) await ensurePicksResolved(round);
  if (round) await ensureServesResolved(round);
  if (round) round = await currentOpenRound(block.event_id); // pick up any just-written reveal/resolve

  let roundSection: React.ReactNode = null;

  if (round && round.phase === 'game' && round.games) {
    const { data: ownPicks } = await supabase
      .from('round_players')
      .select('picked_by, participants(people(display_name))')
      .eq('round_id', round.id)
      .eq('block_id', block.id);

    const picked = (ownPicks ?? []) as unknown as {
      picked_by: string;
      participants: { people: { display_name: string } | null } | null;
    }[];

    if (round.games.is_group) {
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">This round</p>
          <p style={{ margin: 0, fontSize: 14 }}>
            Whole team plays &mdash; <strong>{round.games.name}</strong>.
          </p>
        </div>
      );
    } else if (picked.length > 0) {
      const names2 = picked.map(
        (p) =>
          `${p.participants?.people?.display_name ?? 'Unknown'}${p.picked_by === 'auto' ? ' (auto)' : ''}`
      );
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">Your pick{names2.length > 1 ? 's' : ''}</p>
          <p style={{ margin: 0, fontSize: 14 }}>{names2.join(', ')}</p>
        </div>
      );
    } else if (!round.picks_revealed_at) {
      const cooldown = await cooldownParticipantIds(block.event_id);
      const players = roster.map((m) => ({
        id: m.id,
        name: m.people?.display_name ?? 'Unknown',
        onCooldown: cooldown.has(m.id),
      }));

      roundSection = (
        <>
          <p className="eyebrow">{round.games.name}</p>
          <PickForm
            roundId={round.id}
            blockId={block.id}
            token={params.token}
            needed={round.games.players_needed ?? 1}
            players={players}
          />
        </>
      );
    }
  } else if (round && round.phase === 'spending') {
    if (round.shop_closed_at) {
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">Shop&rsquo;s closed</p>
          <p style={{ margin: 0, fontSize: 14 }}>The Warden&rsquo;s moved on to drinks.</p>
        </div>
      );
    } else {
      const view = await spendingView(round, block.id);
      roundSection = (
        <>
          <p className="eyebrow">Spending</p>
          <OrderForm
            roundId={round.id}
            blockId={block.id}
            token={params.token}
            drinkTypes={view.drinkTypes}
            blocks={view.blocks}
            ownOrders={view.ownOrders}
          />
          <p className="eyebrow" style={{ marginTop: 20 }}>
            Shop
          </p>
          <ShopForm roundId={round.id} blockId={block.id} token={params.token} shop={view.shop} />
        </>
      );
    }
  } else if (round && round.phase === 'drinks') {
    const serve = await teamServeStatus(round.id, block.id);
    if (serve.status === 'safe') {
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">Drinks</p>
          <p style={{ margin: 0, fontSize: 14 }}>Safe this round &mdash; nobody owes you anything.</p>
        </div>
      );
    } else if (serve.status === 'queued') {
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">Drinks</p>
          <p style={{ margin: 0, fontSize: 14 }}>
            You owe {serve.drinkCount} this round. Waiting for the bartender to call you up.
          </p>
        </div>
      );
    } else if (serve.status === 'serving') {
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">You&rsquo;re up</p>
          <p style={{ margin: 0, fontSize: 14 }}>
            {serve.drinkCount} to drink. 30 seconds
            {serve.timerEndsAt ? `, ends at ${new Date(serve.timerEndsAt).toLocaleTimeString()}` : ''}.
          </p>
        </div>
      );
    } else {
      roundSection = (
        <div className="box box--dark">
          <p className="eyebrow">Drinks</p>
          <p style={{ margin: 0, fontSize: 14 }}>Done for this round.</p>
        </div>
      );
    }
  }

  return (
    <>
      <ClaimOnLoad blockId={block.id} token={params.token} />
    <div className="shell">
      <div className="topbar" style={{ background: block.colour }}>
        <span>{(event?.theme_title || event?.name || 'LEPARTY').toUpperCase()}</span>
        <span>{block.join_code}</span>
      </div>

      <div className="body">
        <h1 className="huge">{block.name}</h1>
        <hr className="rule" />

        <div className="stat-row">
          <div className="stat">
            <p className="label">Money</p>
            <p className="value">{balance}</p>
          </div>
          <div className="stat">
            <p className="label">Points</p>
            <p className="value">{points}</p>
          </div>
        </div>

        {block.charge ? (
          <>
            <p className="eyebrow">The charge</p>
            <p style={{ fontFamily: 'var(--display)', fontSize: 22, textTransform: 'uppercase' }}>
              {block.charge}
            </p>
          </>
        ) : null}

        {names.length > 0 ? (
          <>
            <p className="eyebrow">Your block</p>
            <div className="box box--quiet">
              {names.map((n) => (
                <div key={n} style={{ fontSize: 15, padding: '3px 0' }}>
                  {n}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="notice">
            This block has nobody in it yet. The Warden draws the blocks once check-in closes.
          </div>
        )}

        {roundSection ?? (
          <div className="box box--dark">
            <p className="eyebrow">Hold tight</p>
            <p style={{ margin: 0, fontSize: 14 }}>
              You&rsquo;re in. The games, the shop and the drinks arrive here when the Warden
              starts the night.
            </p>
          </div>
        )}

        <p className="small">
          Keep this page open &mdash; it remembers you. Anyone else in {block.name} can scan the
          same card.
        </p>
      </div>
    </div>
    </>
  );
}
