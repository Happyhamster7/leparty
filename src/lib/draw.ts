export type Drawee = {
  participantId: string;
  name: string;
  capacity: number;
};

export type ProposedBlock = {
  blockId: string;
  name: string;
  colour: string;
  members: Drawee[];
};

export function blockTotal(b: ProposedBlock): number {
  return b.members.reduce((n, m) => n + m.capacity, 0);
}

export function spread(blocks: ProposedBlock[]): number {
  const used = blocks.filter((b) => b.members.length > 0);
  if (used.length === 0) return 0;
  const totals = used.map(blockTotal);
  return Math.max(...totals) - Math.min(...totals);
}

/**
 * Snake draft by capacity, then local-search swaps.
 *
 * Capacity sorted descending and dealt 1..N, N..1 lands every block
 * within a point or two on its own. Band 1 (not drinking) sorts to the
 * end, so those people get spread one per block rather than clustering,
 * with no special case needed.
 *
 * Blocks are compared on TOTAL capacity, not average. An uneven block
 * carries more drinking capacity, which is correct — it also has more
 * people to spread drinks across, so the two effects roughly cancel.
 */
/** Fisher-Yates. Array.sort is stable, so shuffling first and sorting only on
 *  capacity below randomizes the order among people who tie on capacity,
 *  without randomizing the capacity-driven balance itself. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function proposeDraw(
  people: Drawee[],
  blocks: { id: string; name: string; colour: string }[],
  options?: { randomize?: boolean }
): ProposedBlock[] {
  const proposed: ProposedBlock[] = blocks.map((b) => ({
    blockId: b.id,
    name: b.name,
    colour: b.colour,
    members: [],
  }));

  if (proposed.length === 0) return proposed;

  // Deterministic by default — so navigating to this page (or reloading
  // it, e.g. via "Close check-in & draw blocks") always reproduces the
  // same arrangement instead of silently discarding whatever the host
  // already settled on. Randomize is opt-in, used only by the explicit
  // Reshuffle button in DrawReview.
  const sorted = options?.randomize
    ? shuffle(people).sort((a, b) => b.capacity - a.capacity)
    : [...people].sort((a, b) => b.capacity - a.capacity || a.name.localeCompare(b.name));

  // Snake deal. Uneven headcounts fall out of this naturally: the
  // remainder lands on whichever blocks the serpentine reaches next,
  // which are the ones holding the least capacity so far.
  let i = 0;
  while (i < sorted.length) {
    const forward = Math.floor(i / proposed.length) % 2 === 0;
    const slot = i % proposed.length;
    const target = forward ? slot : proposed.length - 1 - slot;
    proposed[target].members.push(sorted[i]);
    i++;
  }

  return improve(proposed);
}

/**
 * Narrow the gap by swapping pairs between the heaviest and lightest
 * blocks. Stops as soon as a pass finds no improving swap, so it is
 * fast and deterministic.
 */
export function improve(blocks: ProposedBlock[], maxPasses = 30): ProposedBlock[] {
  const out = blocks.map((b) => ({ ...b, members: [...b.members] }));

  for (let pass = 0; pass < maxPasses; pass++) {
    const used = out.filter((b) => b.members.length > 0);
    if (used.length < 2) break;

    let heavy = used[0];
    let light = used[0];
    for (const b of used) {
      if (blockTotal(b) > blockTotal(heavy)) heavy = b;
      if (blockTotal(b) < blockTotal(light)) light = b;
    }

    const gap = blockTotal(heavy) - blockTotal(light);
    if (gap <= 1) break;

    let best: { h: number; l: number; gap: number } | null = null;

    for (let h = 0; h < heavy.members.length; h++) {
      for (let l = 0; l < light.members.length; l++) {
        const delta = heavy.members[h].capacity - light.members[l].capacity;
        if (delta <= 0) continue;
        // Swapping moves 2*delta of difference; overshooting is as bad
        // as undershooting, so compare absolute resulting gaps.
        const after = Math.abs(gap - 2 * delta);
        if (after < gap && (best === null || after < best.gap)) {
          best = { h, l, gap: after };
        }
      }
    }

    if (!best) break;

    const a = heavy.members[best.h];
    const b = light.members[best.l];
    heavy.members[best.h] = b;
    light.members[best.l] = a;
  }

  for (const b of out) {
    b.members.sort((x, y) => x.name.localeCompare(y.name));
  }

  return out;
}

/** Which block a latecomer joins once the draw is done. */
export function lightestBlock(blocks: ProposedBlock[]): ProposedBlock | null {
  const used = blocks.filter((b) => b.members.length > 0);
  if (used.length === 0) return blocks[0] ?? null;
  return used.reduce((min, b) => (blockTotal(b) < blockTotal(min) ? b : min), used[0]);
}
