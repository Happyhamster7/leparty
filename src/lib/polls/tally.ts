/**
 * The costume vote's rules, with no database in them: what counts as a
 * valid ballot, and how ballots become a result.
 */

export type Candidate = { id: string; name: string; groupId: string | null };
export type Ballot = { best: string[]; worst: string[] };
export type Ranked = { id: string; name: string; groupId: string | null; votes: number };
export type PollResults = { best: Ranked[]; worst: Ranked[]; voters: number };

/**
 * Checks a ballot: up to `picks` for best and up to `picks` for worst,
 * at least one pick in all, every pick someone who is here, and nobody
 * picked twice (not even once as best and once as worst).
 */
export function checkBallot(input: { best?: unknown; worst?: unknown }, candidates: Iterable<string>, picks: number): { ok: true; ballot: Ballot } | { ok: false; error: string } {
  const here = new Set(candidates);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const best = list(input.best);
  const worst = list(input.worst);
  if (best.length > picks || worst.length > picks) return { ok: false, error: `Pick up to ${picks} for best and up to ${picks} for worst.` };
  if (!best.length && !worst.length) return { ok: false, error: 'Pick at least one costume.' };
  const all = [...best, ...worst];
  if (new Set(all).size !== all.length) return { ok: false, error: 'Each person can only be picked once.' };
  if (all.some((id) => !here.has(id))) return { ok: false, error: 'Someone you picked isn’t on the list any more. Pick again.' };
  return { ok: true, ballot: { best, worst } };
}

/**
 * Counts the ballots. Each pick is one vote. Ranked most votes first;
 * a tie goes to the name that comes first, so the result is the same
 * however the ballots are ordered. Picks for someone no longer here
 * are dropped.
 */
export function tally(ballots: Ballot[], candidates: Candidate[]): PollResults {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const rank = (key: 'best' | 'worst'): Ranked[] => {
    const counts = new Map<string, number>();
    for (const b of ballots) for (const id of b[key]) if (byId.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts.entries()]
      .map(([id, votes]) => ({ ...(byId.get(id) as Candidate), votes }))
      .sort((a, z) => z.votes - a.votes || a.name.localeCompare(z.name));
  };
  return { best: rank('best'), worst: rank('worst'), voters: ballots.length };
}
