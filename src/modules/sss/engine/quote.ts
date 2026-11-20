import type { Item } from './types';

/** Cost and points of ordering qty of a drink: a matching bundle, or straight per-drink rates. */
export function quoteDrinks(item: Pick<Item, 'price' | 'points' | 'bundles'>, qty: number) {
  const bundle = item.bundles.find((b) => b.qty === qty) || null;
  return bundle ? { cost: bundle.cost, points: bundle.points, bundle } : { cost: item.price * qty, points: item.points * qty, bundle: null };
}
