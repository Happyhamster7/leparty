import { db } from '@/lib/supabase';
import type { LedgerKind, LedgerReason } from '@/lib/types';

export type LedgerInsert = {
  block_id: string;
  round_id?: string | null;
  kind: LedgerKind;
  delta: number;
  reason: LedgerReason;
  ref_id?: string | null;
  note?: string | null;
};

/** Append-only — never update or delete a row, see docs/schema.md. */
export async function writeLedgerEntries(entries: LedgerInsert[]) {
  if (entries.length === 0) return;
  await db().from('ledger_entries').insert(entries);
}

async function balanceByKind(blockId: string, kind: LedgerKind): Promise<number> {
  const { data: entries } = await db()
    .from('ledger_entries')
    .select('delta')
    .eq('kind', kind)
    .eq('block_id', blockId);

  return (entries ?? []).reduce((sum, e) => sum + (e.delta as number), 0);
}

/** Money balance for one block, summed from the ledger. */
export async function moneyBalance(blockId: string): Promise<number> {
  return balanceByKind(blockId, 'money');
}

/** Points balance for one block, summed from the ledger. */
export async function pointsBalance(blockId: string): Promise<number> {
  return balanceByKind(blockId, 'points');
}

async function balancesByKind(eventId: string, kind: LedgerKind): Promise<Map<string, number>> {
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
    .eq('kind', kind)
    .in('block_id', blockIds);

  for (const e of entries ?? []) {
    const id = e.block_id as string;
    balances.set(id, (balances.get(id) ?? 0) + (e.delta as number));
  }
  return balances;
}

/** Money balance for every in-play block, summed from the ledger. */
export async function moneyBalances(eventId: string): Promise<Map<string, number>> {
  return balancesByKind(eventId, 'money');
}

/** Points balance for every in-play block, summed from the ledger — the actual win condition. */
export async function pointsBalances(eventId: string): Promise<Map<string, number>> {
  return balancesByKind(eventId, 'points');
}
