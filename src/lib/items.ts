import { db } from '@/lib/supabase';

export type EyeSpyRow = { roundNumber: number; senderName: string; qty: number };

/**
 * "A round-by-round table, from the start of the game, of who sent
 * drinks to whom and how many" (docs/halloween-game-design.md section
 * 7). Only drinks that have actually been served count — orders are
 * secret until then (section 6) — so this is empty until the Drinks
 * phase starts serving, which is expected, not a bug.
 */
export async function eyeSpyReport(targetBlockId: string): Promise<EyeSpyRow[]> {
  const supabase = db();

  const { data: orders } = await supabase
    .from('drink_orders')
    .select('qty, sender_block_id, round_id')
    .eq('target_block_id', targetBlockId)
    .eq('status', 'served')
    .not('sender_block_id', 'is', null);

  if (!orders || orders.length === 0) return [];

  const roundIds = [...new Set(orders.map((o) => o.round_id as string))];
  const senderIds = [...new Set(orders.map((o) => o.sender_block_id as string))];

  const [{ data: rounds }, { data: blocks }] = await Promise.all([
    supabase.from('rounds').select('id, number').in('id', roundIds),
    supabase.from('blocks').select('id, name').in('id', senderIds),
  ]);

  const roundNumberById = new Map((rounds ?? []).map((r) => [r.id as string, r.number as number]));
  const blockNameById = new Map((blocks ?? []).map((b) => [b.id as string, b.name as string]));

  return orders
    .map((o) => ({
      roundNumber: roundNumberById.get(o.round_id as string) ?? 0,
      senderName: blockNameById.get(o.sender_block_id as string) ?? 'Unknown',
      qty: o.qty as number,
    }))
    .sort((a, b) => a.roundNumber - b.roundNumber);
}
