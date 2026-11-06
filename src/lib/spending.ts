import { db } from '@/lib/supabase';
import { priceOrder } from '@/lib/drinkPricing';
import { eyeSpyReport, type EyeSpyRow } from '@/lib/items';
import { activeBounty, isRoundWinner } from '@/lib/bounty';

export type SpendingView = {
  drinkTypes: { id: string; name: string; cost: number; points: number }[];
  blocks: { id: string; name: string }[];
  ownOrders: { id: string; targetName: string; drinkName: string; qty: number; cost: number }[];
  shop: ShopEntry[];
};

export type ShopEntry = {
  key: string;
  name: string;
  description: string;
  price: number | null;
  status:
    | 'available'
    | 'bought_this_round'
    | 'bought_tonight'
    | 'taken_this_round'
    | 'not_priced'
    | 'bounty_active'
    | 'not_round_winner';
  eyeSpyResult?: EyeSpyRow[];
};

/** The items the Spending screen can actually sell — see src/lib/catalogue.ts. */
const BUYABLE_ITEM_KEYS = ['eye_spy', 'reflect', 'open_bounty', 'winners_bounty'] as const;
const BOUNTY_ITEM_KEYS = ['open_bounty', 'winners_bounty'] as const;

export type ItemRow = {
  id: string;
  key: string;
  price: number | null;
  limit_per_round: number | null;
  limit_per_night: number | null;
};

/**
 * Shared by the Spending view (to grey out a button) and the buyItem
 * action (to actually enforce it) — see catalogue.ts for why only
 * eye_spy and reflect are priced, and the Reflect description for the
 * "one per round, across all teams" rule this also enforces.
 */
export function computeItemStatus(
  item: ItemRow,
  uses: { round_id: string; block_id: string }[],
  roundId: string,
  blockId: string
): ShopEntry['status'] {
  const ownThisRound = uses.filter((u) => u.round_id === roundId && u.block_id === blockId).length;
  const ownEver = uses.filter((u) => u.block_id === blockId).length;
  const anyThisRound = uses.filter((u) => u.round_id === roundId).length;

  if (item.price === null) return 'not_priced';
  if (item.limit_per_round !== null && ownThisRound >= item.limit_per_round) return 'bought_this_round';
  if (item.limit_per_night !== null && ownEver >= item.limit_per_night) return 'bought_tonight';
  if (item.key === 'reflect' && anyThisRound > 0) return 'taken_this_round';
  return 'available';
}

export async function spendingView(
  round: { id: string; event_id: string },
  blockId: string
): Promise<SpendingView> {
  const supabase = db();

  const [{ data: drinkTypeRows }, { data: blockRows }, { data: orderRows }, { data: itemRows }] =
    await Promise.all([
      supabase.from('drink_types').select('id, name, cost, points').eq('event_id', round.event_id),
      supabase
        .from('blocks')
        .select('id, name')
        .eq('event_id', round.event_id)
        .eq('in_play', true)
        .order('name', { ascending: true }),
      supabase
        .from('drink_orders')
        .select('id, target_block_id, drink_type_id, qty')
        .eq('round_id', round.id)
        .eq('sender_block_id', blockId),
      supabase
        .from('items')
        .select('id, key, name, description, price, limit_per_round, limit_per_night')
        .eq('event_id', round.event_id)
        .in('key', BUYABLE_ITEM_KEYS as unknown as string[]),
    ]);

  const drinkTypes = (drinkTypeRows ?? []) as { id: string; name: string; cost: number; points: number }[];
  const blocks = (blockRows ?? []) as { id: string; name: string }[];
  const drinkTypeById = new Map(drinkTypes.map((d) => [d.id, d]));
  const blockNameById = new Map(blocks.map((b) => [b.id, b.name]));

  const ownOrders = ((orderRows ?? []) as { id: string; target_block_id: string; drink_type_id: string; qty: number }[]).map(
    (o) => {
      const drinkType = drinkTypeById.get(o.drink_type_id);
      const { cost } = drinkType
        ? priceOrder(drinkType.name, drinkType.cost, drinkType.points, o.qty)
        : { cost: 0 };
      return {
        id: o.id,
        targetName: blockNameById.get(o.target_block_id) ?? 'Unknown',
        drinkName: drinkType?.name ?? 'Unknown',
        qty: o.qty,
        cost,
      };
    }
  );

  const items = (itemRows ?? []) as {
    id: string;
    key: string;
    name: string;
    description: string;
    price: number | null;
    limit_per_round: number | null;
    limit_per_night: number | null;
  }[];

  const itemIds = items.map((i) => i.id);
  const { data: usesRows } = itemIds.length
    ? await supabase.from('item_uses').select('item_id, round_id, block_id').in('item_id', itemIds)
    : { data: [] };
  const uses = (usesRows ?? []) as { item_id: string; round_id: string; block_id: string }[];

  const shop: ShopEntry[] = [];
  for (const item of items) {
    const ownUses = uses.filter((u) => u.item_id === item.id);
    let status = computeItemStatus(item, ownUses, round.id, blockId);

    if (status === 'available' && (BOUNTY_ITEM_KEYS as readonly string[]).includes(item.key)) {
      if (await activeBounty(blockId)) {
        status = 'bounty_active';
      } else if (item.key === 'winners_bounty' && !(await isRoundWinner(round.id, blockId))) {
        status = 'not_round_winner';
      }
    }

    shop.push({
      key: item.key,
      name: item.name,
      description: item.description,
      price: item.price,
      status,
      eyeSpyResult:
        item.key === 'eye_spy' && status === 'bought_this_round' ? await eyeSpyReport(blockId) : undefined,
    });
  }

  return { drinkTypes, blocks, ownOrders, shop };
}
