import { db } from '@/lib/supabase';
import type { LedgerKind, LedgerReason } from '@/lib/types';

export type LedgerInsert = {
  block_id: string;
  round_id?: string | null;
  kind: LedgerKind;
  delta: number;
  reason: LedgerReason;
  ref_id?: string | null;
};

/** Append-only — never update or delete a row, see docs/schema.md. */
export async function writeLedgerEntries(entries: LedgerInsert[]) {
  if (entries.length === 0) return;
  await db().from('ledger_entries').insert(entries);
}

/** Money balance for one block, summed from the ledger. */
export async function moneyBalance(blockId: string): Promise<number> {
  const { data: entries } = await db()
    .from('ledger_entries')
    .select('delta')
    .eq('kind', 'money')
    .eq('block_id', blockId);

  return (entries ?? []).reduce((sum, e) => sum + (e.delta as number), 0);
}

/** Money balance for every in-play block, summed from the ledger. */
export async function moneyBalances(eventId: string): Promise<Map<string, number>> {
  const supabase = db();

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id')
    .eq('event_id', eventId)
    .eq('in_play', true);

  const blockIds = (blocks ?? []).map((b) => b.id as string);
  const balances = new Map<string, number>(blockIds.map((id) => [id, 0]));
  if (blockIds.length === 0) return balances;

  const { data: entries } = await supabase
    .from('ledger_entries')
    .select('block_id, delta')
    .eq('kind', 'money')
    .in('block_id', blockIds);

  for (const e of entries ?? []) {
    const id = e.block_id as string;
    balances.set(id, (balances.get(id) ?? 0) + (e.delta as number));
  }
  return balances;
}
