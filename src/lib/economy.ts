/**
 * Placeholder prize-money-per-placing curve. "Prize money for each
 * placing" is still an open question (docs/halloween-game-design.md
 * section 11) — these numbers are a stand-in, not a decision.
 *
 * Scaled so a round's placings average roughly the 50-55 money per
 * team the section 6a "350 standards" target implies: summed and
 * divided by 8 this lands at 52.5.
 */
const PRIZE_MONEY_BY_PLACING = [90, 75, 65, 55, 45, 40, 30, 20];

/** Placings beyond the table's length are paid the last (lowest) tier. */
export function prizeMoneyForPlacing(placing: number): number {
  if (placing < 1) return 0;
  const idx = Math.min(placing, PRIZE_MONEY_BY_PLACING.length) - 1;
  return PRIZE_MONEY_BY_PLACING[idx];
}
