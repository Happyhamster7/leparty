import { db } from '@/lib/supabase';
import { priceOrder } from '@/lib/drinkPricing';
import { writeLedgerEntries, type LedgerInsert } from '@/lib/ledger';
import type { OpenRound } from '@/lib/rounds';

const SERVE_SECONDS = 30;

/**
 * Builds the drinks queue for a round — idempotent on round_id, see
 * docs/schema.md "Starting the drinks phase". Resolves Reflect (drinks
 * aimed at whoever played it this round bounce back to their senders,
 * scoring for the reflector instead), folds in any unapplied extra-shot
 * penalties from a previous round, counts per team, and inserts `serves`
 * ordered fewest-drinks-first with random tiebreaks.
 */
export async function buildDrinksQueue(round: { id: string; event_id: string }) {
  const supabase = db();

  const { data: existing } = await supabase.from('serves').select('id').eq('round_id', round.id).limit(1);
  if (existing && existing.length > 0) return;

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id')
    .eq('event_id', round.event_id)
    .eq('in_play', true);
  const blockIds = (blocks ?? []).map((b) => b.id as string);

  const { data: reflectItem } = await supabase
    .from('items')
    .select('id')
    .eq('event_id', round.event_id)
    .eq('key', 'reflect')
    .maybeSingle();

  let reflectingBlocks = new Set<string>();
  if (reflectItem) {
    const { data: uses } = await supabase
      .from('item_uses')
      .select('block_id')
      .eq('item_id', reflectItem.id)
      .eq('round_id', round.id);
    reflectingBlocks = new Set((uses ?? []).map((u) => u.block_id as string));
  }

  const { data: pending } = await supabase
    .from('drink_orders')
    .select('id, sender_block_id, target_block_id')
    .eq('round_id', round.id)
    .eq('status', 'pending');

  for (const o of (pending ?? []) as { id: string; sender_block_id: string | null; target_block_id: string }[]) {
    if (o.sender_block_id && o.sender_block_id !== o.target_block_id && reflectingBlocks.has(o.target_block_id)) {
      await supabase
        .from('drink_orders')
        .update({ target_block_id: o.sender_block_id, scores_for_block_id: o.target_block_id, status: 'reflected' })
        .eq('id', o.id);
    }
  }

  /**
   * What drink type an extra-shot penalty pours is undecided — section
   * 11 leaves "other penalty kinds" open and never names one for this
   * one either — so this defaults to the event's cheapest drink type
   * rather than guessing a name that might not exist in the catalogue.
   */
  const { data: cheapest } = await supabase
    .from('drink_types')
    .select('id')
    .eq('event_id', round.event_id)
    .order('cost', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (cheapest && blockIds.length > 0) {
    const { data: unapplied } = await supabase
      .from('penalties')
      .select('id, block_id')
      .in('block_id', blockIds)
      .eq('kind', 'extra_shot')
      .is('applies_round_id', null);

    for (const p of (unapplied ?? []) as { id: string; block_id: string }[]) {
      await supabase.from('drink_orders').insert({
        round_id: round.id,
        sender_block_id: null,
        origin: 'penalty',
        target_block_id: p.block_id,
        drink_type_id: cheapest.id,
        qty: 1,
        status: 'pending',
        penalty_id: p.id,
      });
      await supabase.from('penalties').update({ applies_round_id: round.id }).eq('id', p.id);
    }
  }

  const { data: allOrders } = await supabase
    .from('drink_orders')
    .select('target_block_id, qty')
    .eq('round_id', round.id)
    .neq('status', 'cancelled');

  const totals = new Map<string, number>();
  for (const o of (allOrders ?? []) as { target_block_id: string; qty: number }[]) {
    totals.set(o.target_block_id, (totals.get(o.target_block_id) ?? 0) + o.qty);
  }

  const rows = Array.from(totals.entries())
    .filter(([, qty]) => qty > 0)
    .map(([blockId, qty]) => ({ blockId, qty, tie: Math.random() }))
    .sort((a, b) => a.qty - b.qty || a.tie - b.tie)
    .map((r, i) => ({
      round_id: round.id,
      block_id: r.blockId,
      drink_count: r.qty,
      queue_position: i + 1,
    }));

  if (rows.length > 0) {
    await supabase.from('serves').insert(rows);
  }

  await supabase.from('rounds').update({ drinks_started_at: new Date().toISOString() }).eq('id', round.id);
}

/** The next team waiting to be called, plus one for the bartender's "up next" preview. */
export async function nextServes(
  roundId: string
): Promise<{ id: string; blockId: string; blockName: string; drinkCount: number }[]> {
  const supabase = db();

  const { data: serves } = await supabase
    .from('serves')
    .select('id, block_id, drink_count')
    .eq('round_id', roundId)
    .is('served_at', null)
    .order('queue_position', { ascending: true })
    .limit(2);

  const rows = (serves ?? []) as { id: string; block_id: string; drink_count: number }[];
  if (rows.length === 0) return [];

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, name')
    .in('id', rows.map((r) => r.block_id));
  const nameById = new Map((blocks ?? []).map((b) => [b.id as string, b.name as string]));

  return rows.map((r) => ({
    id: r.id,
    blockId: r.block_id,
    blockName: nameById.get(r.block_id) ?? 'Unknown',
    drinkCount: r.drink_count,
  }));
}

/** Teams currently at the bar — served, 30-second clock running, not yet finished. */
export async function servingNow(
  roundId: string
): Promise<{ id: string; blockName: string; timerEndsAt: string | null }[]> {
  const supabase = db();

  const { data: serves } = await supabase
    .from('serves')
    .select('id, block_id, timer_ends_at')
    .eq('round_id', roundId)
    .not('served_at', 'is', null)
    .is('finished_at', null);

  const rows = (serves ?? []) as { id: string; block_id: string; timer_ends_at: string | null }[];
  if (rows.length === 0) return [];

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, name')
    .in('id', rows.map((r) => r.block_id));
  const nameById = new Map((blocks ?? []).map((b) => [b.id as string, b.name as string]));

  return rows.map((r) => ({
    id: r.id,
    blockName: nameById.get(r.block_id) ?? 'Unknown',
    timerEndsAt: r.timer_ends_at,
  }));
}

/** One team's drink order breakdown by type for this round — shown to the bartender before pouring. */
export async function drinkBreakdown(roundId: string, blockId: string): Promise<{ name: string; qty: number }[]> {
  const supabase = db();

  const { data: orders } = await supabase
    .from('drink_orders')
    .select('drink_type_id, qty')
    .eq('round_id', roundId)
    .eq('target_block_id', blockId)
    .neq('status', 'cancelled');

  if (!orders || orders.length === 0) return [];

  const typeIds = [...new Set(orders.map((o) => o.drink_type_id as string))];
  const { data: types } = await supabase.from('drink_types').select('id, name').in('id', typeIds);
  const nameById = new Map((types ?? []).map((t) => [t.id as string, t.name as string]));

  const totals = new Map<string, number>();
  for (const o of orders as { drink_type_id: string; qty: number }[]) {
    const name = nameById.get(o.drink_type_id) ?? 'Unknown';
    totals.set(name, (totals.get(name) ?? 0) + o.qty);
  }
  return Array.from(totals.entries()).map(([name, qty]) => ({ name, qty }));
}

/**
 * Serves a team: starts their 30-second timer and awards points for
 * every contributing order — to the sender normally, or to whoever
 * played Reflect when scores_for_block_id was set at queue-build time.
 * Points are recomputed from qty so the bundle bonus (section 6a)
 * still applies even though it's never stored on the order row.
 */
export async function markServed(roundId: string, serveId: string) {
  const supabase = db();

  const { data: serve } = await supabase
    .from('serves')
    .select('id, block_id')
    .eq('id', serveId)
    .eq('round_id', roundId)
    .maybeSingle();
  if (!serve) return;

  const { data: orders } = await supabase
    .from('drink_orders')
    .select('id, sender_block_id, scores_for_block_id, drink_type_id, qty')
    .eq('round_id', roundId)
    .eq('target_block_id', serve.block_id)
    .neq('status', 'cancelled');

  const typed = (orders ?? []) as {
    id: string;
    sender_block_id: string | null;
    scores_for_block_id: string | null;
    drink_type_id: string;
    qty: number;
  }[];

  const typeIds = [...new Set(typed.map((o) => o.drink_type_id))];
  const { data: types } = typeIds.length
    ? await supabase.from('drink_types').select('id, name, cost, points').in('id', typeIds)
    : { data: [] };
  const typeById = new Map(
    (types ?? []).map((t) => [t.id as string, t as { id: string; name: string; cost: number; points: number }])
  );

  const pointsByBlock = new Map<string, number>();
  const orderIds: string[] = [];

  for (const o of typed) {
    orderIds.push(o.id);
    const scoringBlock = o.scores_for_block_id ?? o.sender_block_id;
    if (!scoringBlock) continue;
    const type = typeById.get(o.drink_type_id);
    if (!type) continue;
    const { points } = priceOrder(type.name, type.cost, type.points, o.qty);
    pointsByBlock.set(scoringBlock, (pointsByBlock.get(scoringBlock) ?? 0) + points);
  }

  if (orderIds.length > 0) {
    await supabase.from('drink_orders').update({ status: 'served' }).in('id', orderIds);
  }

  const ledger: LedgerInsert[] = Array.from(pointsByBlock.entries()).map(([blockId, points]) => ({
    block_id: blockId,
    round_id: roundId,
    kind: 'points',
    delta: points,
    reason: 'drink_served',
    ref_id: serveId,
  }));
  await writeLedgerEntries(ledger);

  const now = new Date();
  await supabase
    .from('serves')
    .update({
      served_at: now.toISOString(),
      timer_ends_at: new Date(now.getTime() + SERVE_SECONDS * 1000).toISOString(),
    })
    .eq('id', serveId);
}

/** Host/bartender confirms a team finished within time — distinct from the timer lapsing. */
export async function markDone(roundId: string, serveId: string) {
  const supabase = db();
  await supabase
    .from('serves')
    .update({ finished_at: new Date().toISOString(), finished_by: 'host', missed_time: false })
    .eq('id', serveId)
    .eq('round_id', roundId);
  await maybeCompleteRound(roundId);
}

/**
 * Lazy-resolves timers the same way ensurePicksResolved lazy-resolves
 * pick deadlines: a served team whose 30 seconds passed without the
 * host marking it done counts as having missed it, which writes the
 * extra-shot penalty the next round's queue build picks up. Also
 * auto-advances the round to "done" once every team has finished.
 */
export async function ensureServesResolved(round: OpenRound): Promise<void> {
  if (round.phase !== 'drinks' || !round.drinks_started_at) return;

  const supabase = db();
  const { data: overdue } = await supabase
    .from('serves')
    .select('id, block_id, timer_ends_at')
    .eq('round_id', round.id)
    .not('served_at', 'is', null)
    .is('finished_at', null);

  const now = new Date();
  for (const s of (overdue ?? []) as { id: string; block_id: string; timer_ends_at: string | null }[]) {
    if (!s.timer_ends_at || new Date(s.timer_ends_at) > now) continue;

    await supabase
      .from('serves')
      .update({ finished_at: s.timer_ends_at, finished_by: 'timer', missed_time: true })
      .eq('id', s.id);

    await supabase.from('penalties').insert({
      block_id: s.block_id,
      from_round_id: round.id,
      kind: 'extra_shot',
      reason: 'missed_time',
    });
  }

  await maybeCompleteRound(round.id);
}

async function maybeCompleteRound(roundId: string) {
  const supabase = db();
  const { data: round } = await supabase
    .from('rounds')
    .select('id, event_id, drinks_started_at, completed_at')
    .eq('id', roundId)
    .maybeSingle();
  if (!round || !round.drinks_started_at || round.completed_at) return;

  const { data: unfinished } = await supabase
    .from('serves')
    .select('id')
    .eq('round_id', roundId)
    .is('finished_at', null)
    .limit(1);
  if (unfinished && unfinished.length > 0) return;

  await supabase.from('rounds').update({ phase: 'done', completed_at: new Date().toISOString() }).eq('id', roundId);
  await supabase.from('events').update({ phase: 'done' }).eq('id', round.event_id);
}

/** The most recent successfully-uploaded, still-shown clip for a serve, if any. */
export async function latestClipPath(serveId: string): Promise<string | null> {
  const supabase = db();
  const { data: clip } = await supabase
    .from('clips')
    .select('storage_path')
    .eq('serve_id', serveId)
    .eq('upload_state', 'uploaded')
    .eq('status', 'shown')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (clip?.storage_path as string | undefined) ?? null;
}

/** A team's own status during drinks, for its phone and the public screen. */
export async function teamServeStatus(
  roundId: string,
  blockId: string
): Promise<{
  status: 'safe' | 'queued' | 'serving' | 'done';
  serveId: string | null;
  timerEndsAt: string | null;
  drinkCount: number;
}> {
  const supabase = db();
  const { data: serve } = await supabase
    .from('serves')
    .select('id, drink_count, served_at, finished_at, timer_ends_at')
    .eq('round_id', roundId)
    .eq('block_id', blockId)
    .maybeSingle();

  if (!serve) return { status: 'safe', serveId: null, timerEndsAt: null, drinkCount: 0 };
  const serveId = serve.id as string;
  if (serve.finished_at) return { status: 'done', serveId, timerEndsAt: null, drinkCount: serve.drink_count as number };
  if (serve.served_at) {
    return {
      status: 'serving',
      serveId,
      timerEndsAt: serve.timer_ends_at as string | null,
      drinkCount: serve.drink_count as number,
    };
  }
  return { status: 'queued', serveId, timerEndsAt: null, drinkCount: serve.drink_count as number };
}
