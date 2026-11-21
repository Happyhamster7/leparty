import type { GameModule } from '../types';
import { GameError, SCHEMA_VERSION, init, migrate, nextDeadline, reduce, tick } from './engine/index';
import { barView, displayView, hostView, teamView } from './engine/views';
import type { State } from './engine/types';

/** Shifty Shen's Slammer, as the core sees it. */
export const sss: GameModule = {
  key: 'sss',
  name: 'Shifty Shen’s Slammer',
  schemaVersion: SCHEMA_VERSION,
  init: (ctx) => init(ctx),
  migrate,
  reduce: (state, action, ctx) => reduce(state as State, action, ctx),
  tick: (state, ctx) => tick(state as State, ctx),
  nextDeadline: (state, roster) => nextDeadline(state as State, roster),
  view(state, roster, now, viewer) {
    const s = state as State;
    if (viewer.role === 'host') return hostView(s, roster, now);
    if (viewer.role === 'bar') return barView(s, roster, now);
    if (viewer.role === 'team') return teamView(s, roster, now, viewer.teamId);
    return displayView(s, roster, now);
  },
  // The best costume's team scores; the worst costume's team owes a shot in the next queue.
  costumeAwards: ({ bestTeamId, worstTeamId }) => [
    ...(bestTeamId ? [{ type: 'adjustPoints', args: { teamId: bestTeamId, amount: 10, reason: 'the best costume' } }] : []),
    ...(worstTeamId ? [{ type: 'assignDrinks', args: { teamId: worstTeamId, itemId: 'spirit', qty: 1, reason: 'the worst costume' } }] : []),
  ],
  ruleError: (err) => (err instanceof GameError ? { code: err.code, params: err.params } : null),
};
