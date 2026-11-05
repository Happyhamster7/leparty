/**
 * Order-time bundle/bottle pricing (docs/halloween-game-design.md
 * section 6a). The schema has no bundle field, so a qty that exactly
 * matches a bundle size — 5 or 10 for Spirit, Mystery Spirit and
 * Mystery Cocktail; 8 (a bottle) for Soju — is charged the
 * catalogue's bundle total instead of qty × the drink type's linear
 * cost/points. Any other qty, and Wine always (glass only, no
 * bundle), is priced linearly from the drink type's own cost/points.
 */
const BUNDLE_PRICING: Record<string, { cost: number; points: number }> = {
  'Spirit:5': { cost: 60, points: 17 },
  'Spirit:10': { cost: 105, points: 35 },
  'Mystery Spirit:5': { cost: 60, points: 17 },
  'Mystery Spirit:10': { cost: 105, points: 35 },
  'Mystery Cocktail:5': { cost: 72, points: 22 },
  'Mystery Cocktail:10': { cost: 126, points: 46 },
  'Soju:8': { cost: 42, points: 9 },
};

export function priceOrder(
  drinkTypeName: string,
  unitCost: number,
  unitPoints: number,
  qty: number
): { cost: number; points: number } {
  const bundle = BUNDLE_PRICING[`${drinkTypeName}:${qty}`];
  if (bundle) return bundle;
  return { cost: unitCost * qty, points: unitPoints * qty };
}
