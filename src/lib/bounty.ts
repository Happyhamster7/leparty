import { db } from '@/lib/supabase';
import { writeLedgerEntries } from '@/lib/ledger';

/**
 * Simplified bounty rules, decided in place of the design doc's
 * undecided per-Act rotation and permanent-bonus reward option (see
 * docs/halloween-game-design.md section 7's implementation note):
 * one fixed target, a money reward on hit, a fixed shot penalty on
 * miss — reusing the same next-round-carryover plumbing a missed
 * drinks timer already uses.
 */
export const BOUNTY_WINDOW_ROUNDS = 3;
export const BOUNTY_TARGET_QTY = 5;
export const BOUNTY_REWARD: Record<string, number> = { open_bounty: 100, winners_bounty: 150 };
export const BOUNTY_MISS_PENALTY_QTY = 3;
export const BOUNTY_MISS_PENALTY_DRINK_NAME = 'Spirit';

/** The one bounty a block has pending, if any — enforces "one active at a time" across both items. */
export async function activeBounty(blockId: string): Promise<{ id: string } | null> {
  const { data } = await db()
    .from('bounties')
    .select('id')
    .eq('block_id', blockId)
    .is('resolved_at', null)
    .maybeSingle();
  return data ?? null;
}

/** Winner's Bounty eligibility: did this block place 1st in the round just played? */
export async function isRoundWinner(roundId: string, blockId: string): Promise<boolean> {
  const { data } = await db()
    .from('game_results')
    .select('id')
    .eq('round_id', roundId)
    .eq('block_id', blockId)
    .eq('placing', 1)
    .maybeSingle();
  return !!data;
}

export async function createBounty(args: {
  itemUseId: string;
  blockId: string;
  eventId: string;
  startRoundNumber: number;
  itemKey: string;
}): Promise<void> {
  await db().from('bounties').insert({
    item_use_id: args.itemUseId,
    block_id: args.blockId,
    event_id: args.eventId,
    start_round_number: args.startRoundNumber,
    deadline_round_number: args.startRoundNumber + BOUNTY_WINDOW_ROUNDS - 1,
    target_qty: BOUNTY_TARGET_QTY,
    target_drink_type_id: null,
    reward_money: BOUNTY_REWARD[args.itemKey] ?? 0,
  });
}

/**
 * Resolves every bounty whose window closes at this round — called
 * when that round's shop closes, since "sent" (not "served") is what
 * counts (docs/halloween-game-design.md section 7 implementation
 * note). Pays the reward on hit; on miss, writes a penalties row the
 * next queue build turns into 3 shots of Spirit, exactly like a
 * missed drinks timer.
 */
export async function resolveBountiesForRound(eventId: string, roundNumber: number): Promise<void> {
  const supabase = db();

  const { data: due } = await supabase
    .from('bounties')
    .select('id, block_id, start_round_number, deadline_round_number, target_qty, target_drink_type_id, reward_money')
    .eq('event_id', eventId)
    .eq('deadline_round_number', roundNumber)
    .is('resolved_at', null);

  if (!due || due.length === 0) return;

  const { data: windowRounds } = await supabase
    .from('rounds')
    .select('id, number')
    .eq('event_id', eventId)
    .gte('number', Math.min(...due.map((b) => b.start_round_number as number)))
    .lte('number', roundNumber);
  const roundIdsByNumber = new Map<number, string>((windowRounds ?? []).map((r) => [r.number as number, r.id as string]));

  for (const bounty of due) {
    const roundIds: string[] = [];
    for (let n = bounty.start_round_number as number; n <= (bounty.deadline_round_number as number); n++) {
      const id = roundIdsByNumber.get(n);
      if (id) roundIds.push(id);
    }

    let sentQty = 0;
    if (roundIds.length > 0) {
      let query = supabase
        .from('drink_orders')
        .select('qty')
        .in('round_id', roundIds)
        .eq('sender_block_id', bounty.block_id)
        .neq('status', 'cancelled');
      if (bounty.target_drink_type_id) query = query.eq('drink_type_id', bounty.target_drink_type_id);

      const { data: orders } = await query;
      sentQty = (orders ?? []).reduce((sum, o) => sum + (o.qty as number), 0);
    }

    const hit = sentQty >= (bounty.target_qty as number);

    if (hit) {
      await writeLedgerEntries([
        {
          block_id: bounty.block_id,
          kind: 'money',
          delta: bounty.reward_money as number,
          reason: 'bounty',
          ref_id: bounty.id,
        },
      ]);
    } else {
      const { data: spirit } = await supabase
        .from('drink_types')
        .select('id')
        .eq('event_id', eventId)
        .eq('name', BOUNTY_MISS_PENALTY_DRINK_NAME)
        .maybeSingle();

      await supabase.from('penalties').insert({
        block_id: bounty.block_id,
        from_round_id: roundIdsByNumber.get(roundNumber),
        kind: 'extra_shot',
        reason: 'failed_bounty',
        qty: BOUNTY_MISS_PENALTY_QTY,
        drink_type_id: spirit?.id ?? null,
      });
    }

    await supabase.from('bounties').update({ resolved_at: new Date().toISOString(), hit }).eq('id', bounty.id);
  }
}
