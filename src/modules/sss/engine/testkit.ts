import { GameError, init, reduce, tick } from './index';
import { hostView, teamView, displayView } from './views';
import type { Roster, State } from './types';

/**
 * A night to play in tests: a roster, a clock you move by hand, and
 * dice you can load. Every action goes through `reduce`, exactly as the
 * app will send it.
 */
export function night({ teams = 3, size = 4 }: { teams?: number; size?: number } = {}) {
  const roster: Roster = { groups: [], members: [] };
  for (let t = 0; t < teams; t++) {
    const id = `T${t + 1}`;
    roster.groups.push({ id });
    for (let m = 0; m < size; m++) roster.members.push({ id: `${id}-p${m + 1}`, groupId: id });
  }
  const n = {
    roster,
    now: 1_000_000,
    /** Queue of dice rolls in [0, 1); when empty, `dice` (default 0) is used. */
    rolls: [] as number[],
    dice: 0,
    state: null as unknown as State,
    rng: () => (n.rolls.length ? (n.rolls.shift() as number) : n.dice),
    ctx: () => ({ now: n.now, rng: n.rng, roster: n.roster }),
    /** Move the clock forward and settle whatever came due. */
    wait(seconds: number) {
      n.now += seconds * 1000;
      const next = tick(n.state, n.ctx());
      if (next) n.state = next;
    },
    host: (type: string, args: Record<string, unknown> = {}) => n.send({ role: 'host' }, type, args),
    bar: (type: string, args: Record<string, unknown> = {}) => n.send({ role: 'bar' }, type, args),
    team: (teamId: string, type: string, args: Record<string, unknown> = {}) => n.send({ role: 'team', teamId }, type, args),
    send(actor: { role: 'host' | 'bar' | 'team'; teamId?: string }, type: string, args: Record<string, unknown>) {
      const out = reduce(n.state, { type, args }, { ...n.ctx(), actor });
      n.state = out.state;
      return out.result as Record<string, unknown> | null;
    },
    /** The error code an action is refused with, or null if it went through. */
    refused(fn: () => unknown): string | null {
      const before = n.state;
      try {
        fn();
        return null;
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        if (n.state !== before) throw new Error('a refused action changed the state');
        return err.code;
      }
    },
    e: () => hostView(n.state, n.roster, n.now),
    seenBy: (teamId: string) => teamView(n.state, n.roster, n.now, teamId),
    tv: () => displayView(n.state, n.roster, n.now),
    money: (teamId: string) => n.e().teams.find((t) => t.id === teamId)!.money,
    points: (teamId: string) => n.e().teams.find((t) => t.id === teamId)!.points,
    gameId: (name: string) => n.state.games.find((g) => g.name === name)!.id,
    /** Start a round of a host-run group game and take it to Spending with these placings. */
    toSpending(placings: Record<string, number>, game = 'Flip cup') {
      n.host('startRound', { gameId: n.gameId(game) });
      n.host('toResults');
      n.host('enterResults', { placings });
    },
    /** Serve every team in line, each finishing in time. */
    drinkUp() {
      for (;;) {
        const r = n.state.rounds[n.state.rounds.length - 1];
        const s = r.phase === 'drinks' ? r.serves.find((x) => !x.finishedAt) : null;
        if (!s) return;
        n.bar('barNext', { teamId: s.teamId });
        n.bar('barStart', { teamId: s.teamId });
        n.bar('barDone', { teamId: s.teamId });
      }
    },
  };
  n.state = init(n.ctx());
  return n;
}
