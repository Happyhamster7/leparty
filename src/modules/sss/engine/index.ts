import { defaultItems, defaultSettings } from './catalogue';
import { Engine, GameError } from './engine';
import type { Action, Ctx, Role, Roster, State } from './types';

export { Engine, GameError, MECHANICS, quoteDrinks, registerMechanic } from './engine';
export * from './types';

/** Bump when the shape of State changes, and add a step to `migrate`. */
export const SCHEMA_VERSION = 1;

type Args = Record<string, unknown>;
type Handler = (e: Engine, args: Args) => unknown;

/**
 * Everything that can happen, and who may make it happen. A host can
 * do what the bar can. A team's phone acts only for its own team: the
 * team comes from who sent the action, never from the arguments.
 */
const ACTIONS: Record<string, { by: Exclude<Role, 'system'>; run: Handler }> = {
  // setup
  updateSettings: { by: 'host', run: (e, a) => e.updateSettings(a) },
  setShop: { by: 'host', run: (e, a) => e.setShop(a) },
  addGame: { by: 'host', run: (e, a) => ({ gameId: e.addGame(a).id }) },
  updateGame: { by: 'host', run: (e, a) => e.updateGame(a) },
  moveGame: { by: 'host', run: (e, a) => e.moveGame(a) },
  removeGame: { by: 'host', run: (e, a) => e.removeGame(a) },
  loadStarterGames: { by: 'host', run: (e) => e.loadStarterGames() },
  addItem: { by: 'host', run: (e, a) => ({ itemId: e.addItem(a).id }) },
  updateItem: { by: 'host', run: (e, a) => e.updateItem(a) },
  removeItem: { by: 'host', run: (e, a) => e.removeItem(a) },
  renameAct: { by: 'host', run: (e, a) => e.renameAct(a) },
  setActMechanics: { by: 'host', run: (e, a) => e.setActMechanics(a) },
  setSlot: { by: 'host', run: (e, a) => e.setSlot(a) },
  confirmNight: { by: 'host', run: (e) => e.confirmNight() },
  reopenNight: { by: 'host', run: (e) => e.reopenNight() },
  restart: { by: 'host', run: (e) => e.restart() },
  // running a round
  startRound: { by: 'host', run: (e, a) => e.startRound(a) },
  revealPicks: { by: 'host', run: (e) => e.revealPicks() },
  toResults: { by: 'host', run: (e) => e.toResults() },
  enterResults: { by: 'host', run: (e, a) => e.enterResults(a) },
  extendShop: { by: 'host', run: (e, a) => e.extendShop(a) },
  startDrinks: { by: 'host', run: (e) => e.startDrinks() },
  playNext: { by: 'host', run: (e) => e.playNext() },
  playReveal: { by: 'host', run: (e, a) => e.playReveal(a) },
  playFinish: { by: 'host', run: (e) => e.playFinish() },
  crownWinner: { by: 'host', run: (e, a) => e.crownWinner(a) },
  clearWinner: { by: 'host', run: (e) => e.clearWinner() },
  // rulings
  adjustMoney: { by: 'host', run: (e, a) => e.adjustMoney(a) },
  adjustPoints: { by: 'host', run: (e, a) => e.adjustPoints(a) },
  assignDrinks: { by: 'host', run: (e, a) => e.assignDrinks(a) },
  resolveOrder: { by: 'host', run: (e, a) => e.resolveOrder(a) },
  // the bar
  barNext: { by: 'bar', run: (e, a) => e.barNext(a) },
  barStart: { by: 'bar', run: (e, a) => e.barStart(a) },
  barBack: { by: 'bar', run: (e, a) => e.barBack(a) },
  barDone: { by: 'bar', run: (e, a) => e.barDone(a) },
  barFail: { by: 'bar', run: (e, a) => e.barFail(a) },
  // a team's phone
  pick: { by: 'team', run: (e, a) => e.pickPlayers(a) },
  answer: { by: 'team', run: (e, a) => e.playAnswer(a) },
  buy: { by: 'team', run: (e, a) => e.buy(a) },
  pickpocket: { by: 'team', run: (e, a) => e.pickpocket(a) },
};

export const ACTION_TYPES = Object.keys(ACTIONS);

function allowed(role: Role, by: Exclude<Role, 'system'>): boolean {
  return role === by || (role === 'host' && by === 'bar');
}

const blank = (): State => ({
  schemaVersion: SCHEMA_VERSION,
  seq: 0,
  settings: defaultSettings(),
  shopOpen: false,
  teams: {},
  items: defaultItems(),
  games: [],
  night: { status: 'draft', confirmedAt: null, acts: [] },
  rounds: [],
  orders: [],
  ledger: [],
  penalties: [],
  bounties: [],
  reflects: [],
  feed: [],
  flash: null,
  shown: { points: {}, at: null },
  winner: null,
});

/** A new night: the default shelf and the party's games, nothing played. */
export function init(ctx: Omit<Ctx, 'actor'>): State {
  const e = new Engine(blank(), { ...ctx, actor: { role: 'system' } });
  e.loadStarterGames();
  return e.s;
}

/** Brings a stored document up to the current shape. One step per version, each with a test. */
export function migrate(raw: unknown): State {
  const s = raw as State;
  if (!s || s.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unknown session schema: ${String(s?.schemaVersion)}`);
  return s;
}

/**
 * Apply one action. Pure: the state passed in is never touched, and
 * the same state, action and context always give the same result.
 * Throws GameError when a rule says no; nothing is changed then.
 *
 * Any deadline that passed before this action is settled first, so an
 * action never lands in a phase the clock had already ended.
 */
export function reduce(state: State, action: Action, ctx: Ctx): { state: State; result: unknown } {
  const def = ACTIONS[action.type];
  if (!def) throw new GameError('action.unknown');
  if (!allowed(ctx.actor.role, def.by)) throw new GameError('action.forbidden');
  const e = new Engine(structuredClone(state), ctx);
  e.tick();
  const result = def.run(e, action.args || {});
  return { state: e.s, result: result ?? null };
}

/** Settle any deadline that has passed. Returns the new state, or null if nothing was due. */
export function tick(state: State, ctx: Omit<Ctx, 'actor'>): State | null {
  const e = new Engine(structuredClone(state), { ...ctx, actor: { role: 'system' } });
  return e.tick() ? e.s : null;
}

/** When the clock next needs a nudge, or null. */
export function nextDeadline(state: State, roster: Roster): number | null {
  return reader(state, roster, 0).nextDeadline();
}

/** An engine for reading only: works on a copy, so asking a question can't change the night. */
export function reader(state: State, roster: Roster, now: number): Engine {
  return new Engine(structuredClone(state), { now, roster, rng: () => 0, actor: { role: 'system' } });
}
