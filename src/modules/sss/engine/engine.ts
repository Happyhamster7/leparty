import {
  APP_GAMES,
  BOUNTY,
  COLD_WAR_MAX,
  DILEMMA,
  MAX_DRINKS_PER_ORDER,
  MYSTERY,
  SETTING_LIMITS,
  STARTER_GAMES,
  TWO_THIRDS_MAX,
  blankGame,
} from './catalogue';
import { ParseError, cleanRules, cleanText, guessMatches, parseOpenings, parseTrivia, toBool, toInt } from './text';
import type { ErrorCode, FeedKind } from '../messages';
import type {
  Bounty,
  Ctx,
  GameDef,
  Item,
  ItemType,
  LedgerEntry,
  LedgerWhy,
  MysteryPrize,
  Order,
  Phase,
  Play,
  Round,
  RunBy,
  Serve,
  Settings,
  State,
  TeamState,
} from './types';

/** A rule said no. Carries a code and parameters; `messages.ts` has the words. */
export class GameError extends Error {
  constructor(
    public code: ErrorCode,
    public params: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const fail = (code: ErrorCode, params: Record<string, unknown> = {}): never => {
  throw new GameError(code, params);
};

/**
 * Act mechanics: rules an act switches on for its rounds. Each is a set
 * of optional hooks the engine calls while that act is running. Hosts
 * tick them per act in setup. Add one with registerMechanic.
 */
export type Mechanic = {
  name: string;
  desc: string;
  actStart?: (e: Engine, act: { name: string }) => void;
  roundStart?: (e: Engine, round: Round) => void;
  results?: (e: Engine, round: Round) => void;
  drinksStart?: (e: Engine, round: Round) => void;
  /** The price a team pays in the shop. */
  price?: (e: Engine, teamId: string, item: Item, price: number) => number;
  /** The points a served order scores. */
  points?: (e: Engine, order: Order, points: number) => number;
};

export const MECHANICS: Record<string, Mechanic> = {};

export function registerMechanic(key: string, def: Partial<Mechanic>) {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(key)) throw new Error(`Bad mechanic key: ${key}`);
  MECHANICS[key] = { name: key, desc: '', ...def };
}

const ITEM_TYPES: ItemType[] = ['drink', 'reflect', 'eyespy', 'mystery', 'ghost', 'nochaser', 'bounty'];
const TARGETED: ItemType[] = ['drink'];

/** Cost and points of ordering qty of a drink: a matching bundle, or straight per-drink rates. */
export function quoteDrinks(item: Pick<Item, 'price' | 'points' | 'bundles'>, qty: number) {
  const bundle = item.bundles.find((b) => b.qty === qty) || null;
  return bundle ? { cost: bundle.cost, points: bundle.points, bundle } : { cost: item.price * qty, points: item.points * qty, bundle: null };
}

/**
 * The rules. Wraps one state for one call: the caller clones the state,
 * builds an Engine on the clone, runs one action and keeps `e.s`.
 * Nothing here reads a clock or a random number except through `ctx`.
 */
export class Engine {
  private balances: Map<string, number> | null = null;

  constructor(
    public s: State,
    public ctx: Ctx,
  ) {
    this.ensureActs();
    this.ensureTeams();
  }

  // ---------- small things ----------
  get now() {
    return this.ctx.now;
  }

  id(prefix: string): string {
    return `${prefix}${++this.s.seq}`;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.ctx.rng() * arr.length))];
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.ctx.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  log(kind: FeedKind, params: Record<string, unknown> = {}) {
    this.s.feed.unshift({ id: this.id('f'), ts: this.now, kind, params });
    if (this.s.feed.length > 250) this.s.feed.length = 250;
  }

  flash(kind: FeedKind, params: Record<string, unknown> = {}) {
    this.s.flash = { id: this.id('x'), ts: this.now, kind, params };
  }

  // ---------- who is playing: always read from the roster ----------
  /** People on a team who are here, in roster order. */
  members(teamId: string): string[] {
    return this.ctx.roster.members.filter((m) => m.groupId === teamId && !m.away).map((m) => m.id);
  }

  /** Teams with anyone on them take part. */
  inPlay(): string[] {
    const withPeople = new Set(this.ctx.roster.members.filter((m) => m.groupId && !m.away).map((m) => m.groupId));
    return this.ctx.roster.groups.map((g) => g.id).filter((id) => withPeople.has(id));
  }

  /** A team's first appearance opens its account. A late team gets the same start as everyone. */
  ensureTeams() {
    for (const id of this.inPlay()) {
      if (this.s.teams[id]) continue;
      this.s.teams[id] = { drinkStream: 0, reflectUsed: false, eyeSpyAt: null, eyeSpyFrom: null, ghostRound: null, noChaserRound: null, pickpockets: 0 };
      if (this.s.settings.startingBudget > 0) this.entry(id, 'money', this.s.settings.startingBudget, 'start');
    }
  }

  mustTeam(id: unknown): string {
    const teamId = String(id || '');
    if (!this.s.teams[teamId] || !this.inPlay().includes(teamId)) fail('team.unknown');
    return teamId;
  }

  team(id: string): TeamState {
    return this.s.teams[id];
  }

  /** The team an action is made for: the phone that sent it. */
  actorTeam(): string {
    const id = this.ctx.actor.teamId;
    if (this.ctx.actor.role !== 'team' || !id) fail('team.only');
    return this.mustTeam(id);
  }

  // ---------- the ledger: balances are sums, never stored ----------
  entry(teamId: string, kind: 'money' | 'points', delta: number, why: LedgerWhy, extra: Partial<Pick<LedgerEntry, 'ref' | 'earned' | 'note'>> = {}) {
    if (!delta) return;
    const round = this.round && this.round.phase !== 'done' ? this.round.number : null;
    this.s.ledger.push({ n: ++this.s.seq, ts: this.now, teamId, kind, delta, why, round, ref: extra.ref ?? null, ...(extra.earned ? { earned: true } : {}), ...(extra.note ? { note: extra.note } : {}) });
    this.balances = null;
  }

  private sum(key: string): number {
    if (!this.balances) {
      this.balances = new Map();
      for (const e of this.s.ledger) {
        const k = `${e.kind}:${e.teamId}`;
        this.balances.set(k, (this.balances.get(k) || 0) + e.delta);
        if (e.earned) this.balances.set(`earned:${e.teamId}`, (this.balances.get(`earned:${e.teamId}`) || 0) + e.delta);
      }
    }
    return this.balances.get(key) || 0;
  }

  money(teamId: string): number {
    return this.sum(`money:${teamId}`);
  }

  points(teamId: string): number {
    return this.sum(`points:${teamId}`);
  }

  /** Money won tonight (prizes, drink income, jackpots, host payouts): the standings tie-break. */
  earned(teamId: string): number {
    return this.sum(`earned:${teamId}`);
  }

  /** Take points away, but never below zero. Returns what was actually taken. */
  takePoints(teamId: string, amount: number, why: LedgerWhy, ref?: string, note?: string): number {
    const lost = Math.min(Math.max(0, this.points(teamId)), Math.max(0, amount));
    this.entry(teamId, 'points', -lost, why, { ref, note });
    return lost;
  }

  // ---------- settings ----------
  updateSettings(input: Record<string, unknown>) {
    const st = this.s.settings as unknown as Record<string, number>;
    for (const [k, [lo, hi]] of Object.entries(SETTING_LIMITS)) {
      if (input[k] === undefined || input[k] === '') continue;
      st[k] = Math.min(hi, Math.max(lo, toInt(input[k], st[k])));
    }
    if (input.prizeMoney !== undefined) {
      const list = (Array.isArray(input.prizeMoney) ? input.prizeMoney : String(input.prizeMoney).split(','))
        .map((x) => Math.min(1000, Math.max(0, toInt(x, 0))))
        .slice(0, 12);
      if (list.length) this.s.settings.prizeMoney = list;
    }
    this.ensureActs();
  }

  /** Hosts can open or shut the shop between rounds; inside a round it follows the phase. */
  setShop({ open }: { open?: unknown }) {
    const next = toBool(open);
    if (next === this.s.shopOpen) return;
    this.s.shopOpen = next;
    this.log(next ? 'shop.opened' : 'shop.closed');
  }

  // ---------- money and points by hand ----------
  adjustMoney({ teamId, amount, reason }: { teamId?: unknown; amount?: unknown; reason?: unknown }) {
    const t = this.mustTeam(teamId);
    const amt = toInt(amount);
    if (!amt) fail('amount.zero');
    const note = cleanText(reason, 80);
    // A fine never takes a team below zero.
    const delta = amt > 0 ? amt : -Math.min(Math.max(0, this.money(t)), -amt);
    this.entry(t, 'money', delta, 'host', { earned: amt > 0, note });
    this.log(amt > 0 ? 'money.paid' : 'money.docked', { teamId: t, amount: Math.abs(delta), note });
  }

  adjustPoints({ teamId, amount, reason }: { teamId?: unknown; amount?: unknown; reason?: unknown }) {
    const t = this.mustTeam(teamId);
    const amt = toInt(amount);
    if (!amt) fail('amount.zero');
    const note = cleanText(reason, 80);
    if (amt > 0) this.entry(t, 'points', amt, 'host', { note });
    else this.takePoints(t, -amt, 'host', undefined, note);
    this.log(amt > 0 ? 'points.given' : 'points.taken', { teamId: t, note });
  }

  // ---------- the games library ----------
  game(id: unknown): GameDef | null {
    return this.s.games.find((g) => g.id === id) || null;
  }

  private configureGame(g: GameDef, { runBy, questions, stories, openings }: Record<string, unknown>) {
    const read = <T>(parse: (text: unknown) => T, text: unknown, code: 'game.triviaLine' | 'game.openingLine'): T => {
      try {
        return parse(text);
      } catch (err) {
        if (err instanceof ParseError) return fail(code, { line: err.line, letters: err.letters });
        throw err;
      }
    };
    if (openings !== undefined) {
      g.openings = read(parseOpenings, openings, 'game.openingLine');
      g.openingsText = String(openings).slice(0, 12000);
    }
    if (questions !== undefined) {
      g.questions = read(parseTrivia, questions, 'game.triviaLine');
      g.questionsText = String(questions).slice(0, 12000);
    }
    if (runBy !== undefined && runBy !== '') {
      if (runBy !== 'host' && !APP_GAMES[runBy as Exclude<RunBy, 'host'>]) fail('game.kind');
      g.runBy = runBy as RunBy;
      if (runBy !== 'host') g.playersNeeded = 0; // app-run games are played by the whole team on its phone
    }
    if (stories !== undefined && stories !== '') g.stories = Math.min(20, Math.max(1, toInt(stories, 5)));
  }

  addGame(input: Record<string, unknown>): GameDef {
    const name = cleanText(input.name, 60);
    if (!name) fail('game.name');
    const g = blankGame(this.id('g'), name);
    g.desc = cleanText(input.desc, 200);
    g.rules = cleanRules(input.rules);
    g.playersNeeded = Math.min(10, Math.max(0, toInt(input.playersNeeded, 1)));
    this.configureGame(g, input);
    this.s.games.push(g);
    return g;
  }

  updateGame({ gameId, ...input }: Record<string, unknown>) {
    const g = this.game(gameId) || fail('game.unknown');
    this.configureGame(g, input);
    if (input.playersNeeded !== undefined && input.playersNeeded !== '' && g.runBy === 'host') g.playersNeeded = Math.min(10, Math.max(0, toInt(input.playersNeeded, 1)));
    const before = JSON.stringify([g.name, g.desc, g.rules]);
    if (input.name !== undefined && cleanText(input.name, 60)) g.name = cleanText(input.name, 60);
    if (input.desc !== undefined) g.desc = cleanText(input.desc, 200);
    if (input.rules !== undefined) g.rules = cleanRules(input.rules);
    // A changed briefing pops up on every phone again.
    if (JSON.stringify([g.name, g.desc, g.rules]) !== before) {
      g.rulesVersion += 1;
      if (g.status === 'live') this.log('game.rulesUpdated', { game: g.name });
    }
  }

  moveGame({ gameId, dir }: { gameId?: unknown; dir?: unknown }) {
    const i = this.s.games.findIndex((g) => g.id === gameId);
    if (i < 0) fail('game.unknown');
    const j = i + (toInt(dir) < 0 ? -1 : 1);
    if (j < 0 || j >= this.s.games.length) return;
    [this.s.games[i], this.s.games[j]] = [this.s.games[j], this.s.games[i]];
  }

  removeGame({ gameId }: { gameId?: unknown }) {
    this.s.games = this.s.games.filter((g) => g.id !== gameId);
    // Rounds that were going to play it go back to empty; played rounds keep their history.
    for (const act of this.s.night.acts) act.rounds = act.rounds.map((x) => (x === gameId ? null : x));
  }

  /** Load the party's games into the library, skipping any it already has by name. */
  loadStarterGames() {
    const have = new Set(this.s.games.map((g) => g.name.toLowerCase()));
    let added = 0;
    for (const [name, playersNeeded, runBy, rules] of STARTER_GAMES) {
      if (have.has(name.toLowerCase())) continue;
      this.addGame({ name, playersNeeded, runBy, rules, stories: runBy === 'dilemma' ? 3 : undefined });
      added += 1;
    }
    return { added };
  }

  // ---------- the shelf ----------
  item(id: unknown): Item | null {
    return this.s.items.find((i) => i.id === id) || null;
  }

  private sanitizeItem(input: Record<string, unknown>, existing: Partial<Item>): Item {
    const out = { ...existing } as Item;
    if (input.name !== undefined) out.name = cleanText(input.name, 40);
    if (input.desc !== undefined) out.desc = cleanText(input.desc, 400);
    if (input.emoji !== undefined) out.emoji = cleanText(input.emoji, 4) || '📦';
    if (input.price !== undefined) out.price = Math.max(0, toInt(input.price));
    if (input.type !== undefined) {
      if (!ITEM_TYPES.includes(input.type as ItemType)) fail('item.type');
      out.type = input.type as ItemType;
    }
    if (input.stock !== undefined) out.stock = input.stock === '' || input.stock === null ? null : Math.max(0, toInt(input.stock));
    if (input.points !== undefined) out.points = Math.min(50, Math.max(0, toInt(input.points)));
    if (input.std !== undefined) out.std = input.std === '' || input.std === null ? null : Math.max(0, Number(input.std) || 0);
    if (input.active !== undefined) out.active = toBool(input.active);
    if (!out.name) fail('item.name');
    return out;
  }

  addItem(input: Record<string, unknown>): Item {
    const type = (input.type as ItemType) || 'drink';
    const item = this.sanitizeItem({ emoji: '📦', price: 10, type, stock: null, points: type === 'drink' ? 1 : 0, active: true, desc: '', ...input }, { bundles: [], bounty: null, std: type === 'drink' ? 1 : null });
    item.id = this.id('i');
    this.s.items.push(item);
    return item;
  }

  updateItem({ itemId, ...input }: Record<string, unknown>) {
    const i = this.s.items.findIndex((x) => x.id === itemId);
    if (i < 0) fail('item.unknown');
    this.s.items[i] = this.sanitizeItem(input, this.s.items[i]);
  }

  removeItem({ itemId }: { itemId?: unknown }) {
    this.s.items = this.s.items.filter((i) => i.id !== itemId);
  }

  /** The Mystery Box reaches the shelf with the first round of Act 2. */
  mysteryOpen(): boolean {
    const n = this.round?.number || 0;
    return n > 0 && this.slotOf(n).act >= MYSTERY.fromAct;
  }

  itemLive(i: Item): boolean {
    if (i.type === 'mystery' && !this.mysteryOpen()) return false;
    return i.active;
  }

  cheapestDrink(): Item | null {
    return this.s.items.filter((i) => i.type === 'drink' && i.active).sort((a, b) => a.price - b.price)[0] || null;
  }

  // ---------- buying ----------
  order(id: string): Order | null {
    return this.s.orders.find((o) => o.id === id) || null;
  }

  /** The round a power-up bought now starts in: the one after the round in progress, or the next to start. */
  nextTurn(): number {
    const r = this.round;
    return r && r.phase !== 'done' ? r.number + 1 : this.s.rounds.length + 1;
  }

  private checkPurchase(teamId: string, { itemId, targetTeamId, qty, stake }: Record<string, unknown>) {
    if (!this.s.shopOpen) fail('shop.closed');
    const item = this.item(itemId);
    if (!item || !this.itemLive(item)) return fail('item.offShelf');
    if (item.stock !== null && item.stock <= 0) fail('item.soldOut');
    let price = item.price;
    let drinks: { qty: number; points: number } | null = null;
    if (item.type === 'drink') {
      const q = toInt(qty, 1);
      if (q < 1 || q > MAX_DRINKS_PER_ORDER) fail('drink.qty', { max: MAX_DRINKS_PER_ORDER });
      const quote = quoteDrinks(item, q);
      drinks = { qty: q, points: quote.points };
      price = quote.cost;
    }
    price = Math.max(0, Math.round(this.foldMechanics(this.round?.number || this.s.rounds.length || 1, 'price', price, teamId, item)));
    if (this.money(teamId) < price) fail('money.short', { teamId, has: this.money(teamId), price });
    const t = this.team(teamId);
    const r = this.round;
    const live = r && r.phase !== 'done' ? r : null;
    if (item.type === 'reflect') {
      if (t.reflectUsed) fail('reflect.used');
      if (this.s.reflects.some((x) => x.round === this.nextTurn())) fail('reflect.taken');
    }
    if (item.type === 'eyespy' && t.eyeSpyFrom === this.nextTurn()) fail('eyespy.one');
    if (item.type === 'nochaser') {
      if (!live) fail('nochaser.noRound');
      if (t.noChaserRound === live!.number) fail('nochaser.has');
    }
    if (item.type === 'ghost') {
      if (!live) fail('ghost.noRound');
      if (t.ghostRound === live!.number) fail('ghost.has');
    }
    let staked = 0;
    if (item.type === 'bounty') {
      if (this.activeBounty(teamId)) fail('bounty.running');
      if (item.bounty === 'winner' && (live?.phase !== 'spending' || live.winnerTeamId !== teamId)) fail('bounty.winnerOnly');
      const st = this.s.settings;
      staked = toInt(stake, 0);
      if (staked < st.bountyMinStake || staked > st.bountyMaxStake) fail('bounty.stake', { min: st.bountyMinStake, max: st.bountyMaxStake });
      if (staked > this.points(teamId)) fail('bounty.short', { points: this.points(teamId) });
    }
    let target: string | null = null;
    if (TARGETED.includes(item.type)) {
      target = this.mustTeam(targetTeamId);
      if (target === teamId) fail('target.self');
    }
    return { item, price, drinks, staked, target, live };
  }

  /** A team's phone buys something. The team is whoever sent the action. */
  buy(input: Record<string, unknown>) {
    const teamId = this.actorTeam();
    const { item, price, drinks, staked, target, live } = this.checkPurchase(teamId, input);
    const t = this.team(teamId);
    const order: Order = {
      id: this.id('o'),
      ts: this.now,
      itemId: item.id,
      type: item.type,
      name: item.name,
      emoji: item.emoji,
      qty: drinks?.qty ?? 1,
      price,
      points: drinks?.points ?? 0,
      round: live?.number ?? null,
      fromTeamId: teamId,
      targetTeamId: target,
      status: 'done',
      origin: null,
      note: cleanText(input.note, 120),
    };
    this.entry(teamId, 'money', -price, 'purchase', { ref: order.id });
    if (item.stock !== null) item.stock -= 1;

    if (item.type === 'drink') {
      // Drinks score when the bar serves them, not when they're bought.
      order.status = 'pending';
      if (live && t.ghostRound === live.number) order.hidden = true;
      if (live && t.noChaserRound === live.number) order.noChaser = true;
      this.s.orders.unshift(order);
      this.log('drink.sent', { fromTeamId: order.hidden ? null : teamId, toTeamId: target, itemId: item.id, name: item.name, emoji: item.emoji, qty: order.qty });
      this.countBounty(teamId, order);
      return { orderId: order.id, status: order.status };
    }

    if (item.type === 'mystery') return this.openMysteryBox(teamId, order);

    this.s.orders.unshift(order);
    if (item.type === 'reflect') {
      this.s.reflects.push({ teamId, round: this.nextTurn() });
      t.reflectUsed = true;
      this.log('shop.secret', { teamId });
    }
    if (item.type === 'eyespy') t.eyeSpyFrom = this.nextTurn();
    if (item.type === 'nochaser') {
      // Covers what this team already sent this round and the bar hasn't poured.
      t.noChaserRound = live!.number;
      for (const o of this.s.orders) if (o.type === 'drink' && o.fromTeamId === teamId && !o.origin && !o.queuedRound && o.round === live!.number && o.status === 'pending') o.noChaser = true;
      this.log('nochaser.bought', { teamId: t.ghostRound === live!.number ? null : teamId });
    }
    if (item.type === 'ghost') {
      // Anonymous from now until the round ends; what's already sent was already announced.
      t.ghostRound = live!.number;
      order.hidden = true;
      this.log('ghost.bought');
    }
    if (item.type === 'bounty') {
      const start = this.nextTurn();
      const kind = item.bounty || 'open';
      const mult = kind === 'winner' ? this.s.settings.winnerMultiplier : this.s.settings.bountyMultiplier;
      const b: Bounty = { id: this.id('b'), teamId, kind, stake: staked, mult, startRound: start, deadlineRound: start + BOUNTY.rounds - 1, sent: 0, orderIds: [], status: 'active', ts: this.now };
      // The stake leaves the score now and comes back multiplied if the bounty is hit.
      this.entry(teamId, 'points', -staked, 'stake', { ref: b.id });
      this.s.bounties.push(b);
      this.log('bounty.placed', { teamId, bounty: kind, target: BOUNTY.target, rounds: BOUNTY.rounds, startRound: start });
    }
    return { orderId: order.id, status: 'stashed' };
  }

  /**
   * A Mystery Box rolls on the spot. Odds by shares: Reflect 2 (while the
   * team can still have one), random drinks 4, Pickpocket 2, Jackpot 1,
   * plus 2 more Pickpocket shares for a team in the bottom half.
   */
  private openMysteryBox(teamId: string, order: Order) {
    const t = this.team(teamId);
    const next = this.nextTurn();
    const canReflect = !t.reflectUsed && !this.s.reflects.some((x) => x.round === next);
    const all = this.inPlay();
    const others = all.filter((id) => id !== teamId);
    const ahead = others.filter((id) => this.points(id) > this.points(teamId)).length;
    const underdog = others.length > 0 && ahead >= all.length / 2;
    const shares = [...(canReflect ? ['reflect', 'reflect'] : []), 'drinks', 'drinks', 'drinks', 'drinks', 'jackpot', 'pickpocket', 'pickpocket', ...(underdog ? ['pickpocket', 'pickpocket'] : [])];
    let kind = this.pick(shares);
    if (kind === 'pickpocket' && !others.some((id) => this.money(id) > 0)) kind = 'jackpot'; // nobody has anything to steal
    let prize: MysteryPrize;
    if (kind === 'jackpot') {
      this.entry(teamId, 'money', MYSTERY.jackpot, 'jackpot', { ref: order.id, earned: true });
      prize = { kind: 'jackpot', amount: MYSTERY.jackpot };
      this.log('mystery.jackpot', { teamId, amount: MYSTERY.jackpot });
    } else if (kind === 'pickpocket') {
      // The team picks who to rob on its phone, whenever it likes.
      t.pickpockets += 1;
      prize = { kind: 'pickpocket', pending: true };
      this.log('mystery.pickpocket', { teamId });
    } else if (kind === 'reflect') {
      this.s.reflects.push({ teamId, round: next });
      t.reflectUsed = true;
      prize = { kind: 'reflect', round: next };
      this.log('mystery.secret', { teamId });
    } else {
      const pool = MYSTERY.drinkIds.map((id) => this.item(id)).filter((i): i is Item => !!i && i.type === 'drink');
      const drink = pool.length ? this.pick(pool) : this.cheapestDrink();
      if (!drink) return fail('item.offShelf');
      const qty = 1 + Math.floor(this.ctx.rng() * MYSTERY.maxQty);
      const onSelf = !others.length || this.ctx.rng() < 0.5;
      const target = onSelf ? teamId : this.pick(others);
      this.s.orders.unshift({
        id: this.id('o'), ts: this.now, itemId: drink.id, type: 'drink', name: drink.name, emoji: drink.emoji, qty, price: 0, points: 0,
        round: order.round, fromTeamId: teamId, targetTeamId: target, status: 'pending', origin: 'mystery', note: '',
      });
      prize = { kind: onSelf ? 'self' : 'other', qty, itemId: drink.id, targetTeamId: target };
      this.log(onSelf ? 'mystery.self' : 'mystery.other', { teamId, toTeamId: target, name: drink.name, emoji: drink.emoji, qty });
    }
    order.prize = prize;
    this.s.orders.unshift(order);
    return { orderId: order.id, status: 'mystery', mystery: prize };
  }

  /** A team with a Pickpocket picks who to rob: half their cash, rounded down. */
  pickpocket({ targetTeamId }: { targetTeamId?: unknown }) {
    const teamId = this.actorTeam();
    const t = this.team(teamId);
    if (!(t.pickpockets > 0)) fail('pickpocket.none');
    const victim = this.mustTeam(targetTeamId);
    if (victim === teamId) fail('target.self');
    const amount = Math.floor(this.money(victim) * MYSTERY.pickpocketShare);
    if (amount < 1) fail('pickpocket.broke', { teamId: victim });
    t.pickpockets -= 1;
    this.entry(victim, 'money', -amount, 'pickpocket', { ref: teamId });
    this.entry(teamId, 'money', amount, 'pickpocket', { ref: victim });
    this.log('pickpocket.done', { teamId, toTeamId: victim, amount });
    this.flash('pickpocket.done', { teamId, toTeamId: victim, amount });
    return { amount, targetTeamId: victim };
  }

  /** Host: mark a waiting order delivered by hand, or cancel and refund it. */
  resolveOrder({ orderId, action }: { orderId?: unknown; action?: unknown }) {
    const o = this.order(String(orderId)) || fail('order.unknown');
    if (o.status !== 'pending') {
      // Tapping twice is harmless; only a different ruling on a closed order is refused.
      if ((action === 'done' && o.status === 'done') || (action === 'cancel' && o.status === 'cancelled')) return;
      fail('order.closed');
    }
    if (action === 'done') {
      // A drink delivered outside the bar queue still scores for its sender.
      const scorer = o.type === 'drink' && !o.origin ? o.scoresForTeamId || o.fromTeamId : null;
      if (scorer && this.s.teams[scorer]) {
        o.pointsAwarded = o.points;
        this.entry(scorer, 'points', o.points, 'drink.served', { ref: o.id });
      }
      o.status = 'done';
      o.doneAt = this.now;
    } else if (action === 'cancel') {
      if (o.fromTeamId && !o.origin && this.s.teams[o.fromTeamId]) this.entry(o.fromTeamId, 'money', o.price, 'refund', { ref: o.id });
      o.status = 'cancelled';
      this.log('order.cancelled', { name: o.name, emoji: o.emoji, qty: o.qty, teamId: o.origin ? null : o.fromTeamId });
    } else fail('action.unknown');
    this.unqueue(o);
  }

  /**
   * An order settled by hand leaves the bar queue: its team's count
   * drops, and a team with nothing left drops out of line, owed no
   * drink income and risking no penalty for drinks that aren't there.
   * Only a team not yet called up can hold a waiting order.
   */
  private unqueue(o: Order) {
    const r = this.round;
    if (!r || r.phase !== 'drinks') return;
    const s = r.serves.find((x) => !x.servedAt && x.orderIds.includes(o.id));
    if (!s) return;
    s.orderIds = s.orderIds.filter((id) => id !== o.id);
    s.drinks -= o.qty;
    if (!s.orderIds.length) r.serves = r.serves.filter((x) => x !== s);
    this.checkRoundDone();
  }

  /** Host: drop drinks straight into the next queue. They score nobody. */
  assignDrinks({ teamId, itemId, qty, reason }: Record<string, unknown>) {
    if (this.round?.phase === 'drinks') fail('assign.queueBuilt');
    const t = this.mustTeam(teamId);
    const item = this.item(itemId);
    if (!item || item.type !== 'drink') return fail('assign.drink');
    const q = Math.min(MAX_DRINKS_PER_ORDER, Math.max(1, toInt(qty, 1)));
    const note = cleanText(reason, 80);
    this.s.orders.unshift({
      id: this.id('o'), ts: this.now, itemId: item.id, type: 'drink', name: item.name, emoji: item.emoji, qty: q, price: 0, points: 0,
      round: this.round && this.round.phase !== 'done' ? this.round.number : null, fromTeamId: null, targetTeamId: t, status: 'pending', origin: 'admin', note,
    });
    this.log('drink.assigned', { toTeamId: t, name: item.name, emoji: item.emoji, qty: q, note });
  }

  // ---------- the night's setup: acts, their mechanics, and a game per round ----------
  /** The acts list follows the settings (acts × rounds per act); growing keeps what's there, shrinking trims. */
  ensureActs() {
    const st = this.s.settings;
    const night = this.s.night;
    const n = Math.max(1, st.actsCount);
    const per = Math.max(1, st.roundsPerAct);
    night.acts = Array.from({ length: n }, (_, i) => {
      const a = night.acts[i];
      return {
        id: a?.id || this.id('a'),
        name: a?.name || '',
        // Kept even if this process doesn't know the key: dropping it here would silently save the loss.
        mechanics: a?.mechanics || [],
        rounds: Array.from({ length: per }, (_, j) => a?.rounds[j] ?? null),
      };
    });
  }

  totalRounds(): number {
    return Math.max(1, this.s.settings.actsCount) * Math.max(1, this.s.settings.roundsPerAct);
  }

  /** Where round n sits in the night. A blank act name means "Act n", worded by the theme. */
  slotOf(n: number) {
    const per = Math.max(1, this.s.settings.roundsPerAct);
    const act = Math.floor((n - 1) / per) + 1;
    const inAct = ((n - 1) % per) + 1;
    return { act, inAct, final: inAct === per, actName: this.s.night.acts[act - 1]?.name || '' };
  }

  private mustAct(act: unknown) {
    return this.s.night.acts[toInt(act, 0) - 1] || fail('act.unknown');
  }

  renameAct({ act, name }: { act?: unknown; name?: unknown }) {
    this.mustAct(act).name = cleanText(name, 40);
  }

  setActMechanics({ act, mechanics }: { act?: unknown; mechanics?: unknown }) {
    const a = this.mustAct(act);
    const list = (Array.isArray(mechanics) ? mechanics : String(mechanics || '').split(',')).map((k) => String(k).trim()).filter(Boolean);
    for (const k of list) if (!MECHANICS[k]) fail('mechanic.unknown', { key: k });
    a.mechanics = [...new Set(list)];
  }

  /** Choose the game for one round of one act. A round that's been played can't change. */
  setSlot({ act, slot, gameId }: { act?: unknown; slot?: unknown; gameId?: unknown }) {
    const a = this.mustAct(act);
    const i = toInt(slot, 0);
    if (i < 1 || i > a.rounds.length) fail('slot.unknown');
    if ((toInt(act) - 1) * Math.max(1, this.s.settings.roundsPerAct) + i <= this.s.rounds.length) fail('slot.played');
    if (gameId && !this.game(gameId)) fail('game.unknown');
    a.rounds[i - 1] = gameId ? String(gameId) : null;
  }

  /** Lock the setup in: every round needs a game. After this the rounds follow the sequence. */
  confirmNight() {
    const night = this.s.night;
    const empty = night.acts.reduce((n, a) => n + a.rounds.filter((x) => !x || !this.game(x)).length, 0);
    if (empty) fail('night.emptyRounds', { count: empty });
    night.status = 'live';
    night.confirmedAt = this.now;
    // Keep the library in play order, so everything that reads it agrees with the sequence.
    const order = night.acts.flatMap((a) => a.rounds);
    this.s.games.sort((x, y) => (order.indexOf(x.id) + 1 || 999) - (order.indexOf(y.id) + 1 || 999));
    this.log('night.confirmed', { acts: night.acts.length, rounds: order.length });
  }

  reopenNight() {
    this.s.night.status = 'draft';
  }

  private actOf(roundNumber: number) {
    return this.s.night.acts[this.slotOf(roundNumber).act - 1] || null;
  }

  private runMechanics(roundNumber: number, hook: 'actStart' | 'roundStart' | 'results' | 'drinksStart', arg: never) {
    for (const k of this.actOf(roundNumber)?.mechanics || []) (MECHANICS[k]?.[hook] as ((e: Engine, a: never) => void) | undefined)?.(this, arg);
  }

  /** Mechanics that adjust a value (price, points) pass it along in turn. */
  private foldMechanics(roundNumber: number, hook: 'price' | 'points', value: number, ...args: unknown[]): number {
    for (const k of this.actOf(roundNumber)?.mechanics || []) {
      const fn = MECHANICS[k]?.[hook] as ((e: Engine, ...rest: unknown[]) => number) | undefined;
      if (fn) value = fn(this, ...args, value);
    }
    return value;
  }

  // ---------- rounds: game → results → spending → drinks ----------
  get round(): Round | null {
    return this.s.rounds[this.s.rounds.length - 1] || null;
  }

  private mustRound(phase?: Phase): Round {
    const r = this.round;
    if (!r || r.phase === 'done') return fail('round.none');
    if (phase && r.phase !== phase) fail('round.phase', { phase });
    return r;
  }

  /** Players who played either of the last few non-group rounds before this one. */
  cooldownIds(before: Round | null = this.round): Set<string> {
    const n = this.s.settings.cooldownGames;
    if (!n) return new Set();
    const past = this.s.rounds.filter((r) => r !== before && r.revealedAt && !r.isGroup).slice(-n);
    return new Set(past.flatMap((r) => Object.values(r.picks).flat()));
  }

  gamesPlayed(playerId: string): number {
    return this.s.rounds.filter((r) => r.revealedAt && Object.values(r.picks).some((ids) => ids.includes(playerId))).length;
  }

  eligibleFor(round: Round, teamId: string): string[] {
    const cd = round.isGroup ? new Set<string>() : this.cooldownIds(round);
    return this.members(teamId).filter((id) => !cd.has(id));
  }

  startRound({ gameId }: { gameId?: unknown } = {}) {
    if (this.round && this.round.phase !== 'done') fail('round.running');
    const number = this.s.rounds.length + 1;
    if (number > this.totalRounds()) fail('round.last');
    const slot = this.slotOf(number);
    const planned = this.s.night.acts[slot.act - 1]?.rounds[slot.inAct - 1];
    const g = (gameId ? this.game(gameId) : (planned && this.game(planned)) || this.s.games.find((x) => x.status !== 'done')) || fail('round.noGame');
    const teams = this.inPlay();
    if (!teams.length) fail('round.noTeams');
    const st = this.s.settings;
    const app = g.runBy !== 'host' ? g.runBy : null;
    if (app === 'trivia' && !g.questions.length) fail('game.noQuestions', { game: g.name });
    if (app === 'anime' && !g.openings.length) fail('game.noOpenings', { game: g.name });
    const isGroup = !g.playersNeeded || !!app;
    const r: Round = {
      id: this.id('r'), number, act: slot.act, inAct: slot.inAct, final: slot.final, gameId: g.id, gameName: g.name, isGroup, playersNeeded: g.playersNeeded || 0,
      phase: 'game', startedAt: this.now, pickDeadline: isGroup ? null : this.now + st.pickSeconds * 1000, picks: {}, pickedBy: {}, revealedAt: null,
      placings: {}, prizes: {}, proposed: null, winnerTeamId: null, shopDeadline: null, drinksStartedAt: null, reflectTeamId: null, serves: [], completedAt: null,
    };
    const act = this.actOf(number);
    if (slot.inAct === 1) this.log('act.started', { act: slot.act, name: slot.actName, rounds: st.roundsPerAct, mechanics: (act?.mechanics || []).map((k) => MECHANICS[k]?.name).filter(Boolean) });
    this.s.rounds.push(r);
    if (slot.inAct === 1) this.runMechanics(number, 'actStart', { name: slot.actName } as never);
    const box = this.s.items.find((i) => i.type === 'mystery' && i.active);
    if (box && slot.act === MYSTERY.fromAct && slot.inAct === 1) {
      this.log('mystery.arrived', { price: box.price, jackpot: MYSTERY.jackpot });
      this.flash('mystery.arrived', { price: box.price, jackpot: MYSTERY.jackpot });
    }
    this.runMechanics(number, 'roundStart', r as never);
    // An Eye Spy bought last round opens now, covering every drink sent so far.
    for (const t of Object.values(this.s.teams)) if (t.eyeSpyFrom === number) t.eyeSpyAt = this.now;
    for (const other of this.s.games) if (other.status === 'live') other.status = 'upcoming';
    g.status = 'live';
    g.rulesVersion += 1; // pops the briefing on every phone
    this.s.shopOpen = false;
    if (isGroup) {
      for (const id of teams) {
        r.picks[id] = this.eligibleFor(r, id);
        r.pickedBy[id] = 'group';
      }
      r.revealedAt = this.now;
      if (app) r.play = this.newPlay(app, g);
    }
    this.log('round.started', { round: number, act: slot.act, inAct: slot.inAct, final: slot.final, actName: slot.actName, game: g.name, app, playersNeeded: r.playersNeeded, seconds: st.pickSeconds });
    return { roundId: r.id };
  }

  /** A team's phone picks who plays. */
  pickPlayers({ playerIds }: { playerIds?: unknown }) {
    const teamId = this.actorTeam();
    const r = this.mustRound('game');
    if (r.revealedAt) fail('picks.in');
    if (r.pickDeadline && this.now > r.pickDeadline) fail('picks.late');
    const ids = [...new Set((Array.isArray(playerIds) ? playerIds : String(playerIds || '').split(',')).map(String))].filter(Boolean);
    const eligible = this.eligibleFor(r, teamId);
    for (const id of ids) if (!eligible.includes(id)) fail('picks.ineligible', { playerId: id });
    const need = Math.min(r.playersNeeded, eligible.length);
    if (ids.length !== need) fail('picks.count', { count: need });
    r.picks[teamId] = ids;
    r.pickedBy[teamId] = teamId;
    if (this.inPlay().every((id) => r.picks[id])) this.revealPicks();
    return { picked: ids.length };
  }

  /** Fill in any team that hasn't picked (fewest games played first), then show everyone's picks at once. */
  revealPicks() {
    const r = this.mustRound('game');
    if (r.revealedAt) return;
    for (const id of this.inPlay()) {
      if (r.picks[id]) continue;
      const pool = this.shuffle(this.eligibleFor(r, id)).sort((a, b) => this.gamesPlayed(a) - this.gamesPlayed(b));
      r.picks[id] = pool.slice(0, r.playersNeeded);
      r.pickedBy[id] = 'auto';
    }
    r.revealedAt = this.now;
    this.log('picks.revealed', { game: r.gameName, picks: r.picks });
  }

  toResults() {
    const r = this.mustRound('game');
    if (!r.revealedAt) this.revealPicks();
    r.phase = 'results';
  }

  prizeFor(place: number): number {
    const pm = this.s.settings.prizeMoney;
    return place >= 1 ? pm[Math.min(place, pm.length) - 1] || 0 : 0;
  }

  /**
   * Ranking and reward are separate: placings decide who won; rewards
   * are the money each team actually gets. With no reward given, a team
   * gets its place's prize money plus any bonus.
   */
  enterResults({ placings = {}, rewards = {}, bonus = {} }: { placings?: Record<string, unknown>; rewards?: Record<string, unknown>; bonus?: Record<string, unknown> }) {
    const r = this.mustRound('results');
    const clean: Record<string, number> = {};
    for (const id of this.inPlay()) {
      const n = toInt(placings[id], 0);
      if (n >= 1) clean[id] = n;
    }
    if (!Object.keys(clean).length) fail('results.empty');
    for (const [teamId, place] of Object.entries(clean)) {
      const given = rewards[teamId];
      const prize = given !== undefined && given !== '' ? Math.min(1000, Math.max(0, toInt(given, 0))) : this.prizeFor(place) + Math.max(0, toInt(bonus[teamId], 0));
      r.prizes[teamId] = prize;
      this.entry(teamId, 'money', prize, 'prize', { ref: r.id, earned: true });
    }
    r.placings = clean;
    r.proposed = null;
    const first = Object.entries(clean).sort((a, b) => a[1] - b[1])[0];
    r.winnerTeamId = first && first[1] === 1 ? first[0] : null;
    const g = this.game(r.gameId);
    if (g) {
      g.status = 'done';
      g.results = { ...r.prizes };
    }
    this.log('results.entered', { game: r.gameName, placings: clean, prizes: r.prizes });
    r.phase = 'spending';
    this.s.shopOpen = true;
    r.shopDeadline = this.s.settings.shopSeconds ? this.now + this.s.settings.shopSeconds * 1000 : null;
    this.runMechanics(r.number, 'results', r as never);
  }

  /** Host gives the shop more time (or starts the clock if it had none). */
  extendShop({ seconds = 30 }: { seconds?: unknown } = {}) {
    const r = this.mustRound('spending');
    r.shopDeadline = Math.max(r.shopDeadline || 0, this.now) + Math.min(300, Math.max(5, toInt(seconds, 30))) * 1000;
  }

  /** Close the shop, settle bounties, and line every team up at the bar. Built once per round. */
  startDrinks() {
    const r = this.mustRound('spending');
    r.shopDeadline = null;
    this.s.shopOpen = false;
    this.runMechanics(r.number, 'drinksStart', r as never);
    this.resolveBounties(r);
    // Reflect: drinks aimed at the reflector go back to their senders and score for the reflector.
    r.reflectTeamId = this.s.reflects.find((x) => x.round === r.number)?.teamId || null;
    const reflector = r.reflectTeamId;
    const orders = this.s.orders.filter((o) => o.type === 'drink' && o.status === 'pending' && !o.queuedRound);
    for (const o of orders) {
      if (reflector && o.targetTeamId === reflector && o.fromTeamId && o.fromTeamId !== reflector) {
        o.reflected = true;
        o.originalTargetTeamId = o.targetTeamId;
        o.targetTeamId = o.fromTeamId;
        o.scoresForTeamId = reflector;
      }
      o.queuedRound = r.number;
    }
    if (reflector) this.log('reflect.played', { teamId: reflector });
    // Penalties owed from earlier rounds join the queue as their own orders.
    const cheapest = this.cheapestDrink();
    for (const pen of this.s.penalties.filter((x) => !x.appliedRound && x.fromRound < r.number)) {
      if (!this.s.teams[pen.teamId]) continue;
      const drink = (pen.itemId && this.item(pen.itemId)) || cheapest;
      const o: Order = {
        id: this.id('o'), ts: this.now, itemId: drink?.id || null, type: 'drink', name: drink?.name || '', emoji: drink?.emoji || '🥃', qty: pen.qty, price: 0, points: 0,
        round: r.number, fromTeamId: null, targetTeamId: pen.teamId, status: 'pending', origin: 'penalty', note: pen.reason, queuedRound: r.number,
      };
      this.s.orders.unshift(o);
      orders.push(o);
      pen.appliedRound = r.number;
    }
    // One serve per team that owes drinks: fewest first, ties random.
    const byTeam: Record<string, Order[]> = {};
    for (const o of orders) if (o.targetTeamId) (byTeam[o.targetTeamId] ||= []).push(o);
    r.serves = this.shuffle(Object.entries(byTeam))
      .map(([teamId, list]): Serve => ({
        teamId, orderIds: list.map((o) => o.id), drinks: list.reduce((a, o) => a + o.qty, 0), servedAt: null, timerEndsAt: null, finishedAt: null,
        finishedBy: null, missed: false, failed: false, awards: [], reward: 0, streamLost: 0, pointsLost: 0,
      }))
      .sort((a, b) => a.drinks - b.drinks);
    r.phase = 'drinks';
    r.drinksStartedAt = this.now;
    this.log('drinks.started', { order: r.serves.map((s) => s.teamId) });
    this.checkRoundDone();
  }

  // ---------- the bar: every action names its team, so a double tap can't skip anyone ----------
  private serveOf(r: Round, teamId: unknown): Serve {
    return r.serves.find((x) => x.teamId === teamId) || fail('bar.noServe');
  }

  /** Call this team up. It must be the next in line. Pays the senders their points. */
  barNext({ teamId }: { teamId?: unknown }) {
    const r = this.mustRound('drinks');
    const s = this.serveOf(r, teamId);
    if (s.servedAt) return; // already called up: a second tap changes nothing
    if (r.serves.find((x) => !x.servedAt) !== s) fail('bar.notNext');
    s.servedAt = this.now;
    s.timerEndsAt = null; // the bartender starts the clock once the drinks are poured
    const awards: Record<string, number> = {};
    for (const id of s.orderIds) {
      const o = this.order(id);
      if (!o || o.status !== 'pending') continue;
      o.status = 'done';
      o.doneAt = this.now;
      const scorer = o.scoresForTeamId || o.fromTeamId;
      if (!scorer || o.origin || !this.s.teams[scorer]) continue;
      const pts = this.foldMechanics(r.number, 'points', o.points, o);
      o.pointsAwarded = pts;
      awards[scorer] = (awards[scorer] || 0) + pts;
    }
    s.awards = Object.entries(awards).map(([id, points]) => ({ teamId: id, points }));
    for (const a of s.awards) this.entry(a.teamId, 'points', a.points, 'drink.served', { ref: s.teamId });
    this.log('bar.called', { teamId: s.teamId, drinks: s.drinks });
  }

  /** The drinks are poured and the team is ready: start its clock. */
  barStart({ teamId }: { teamId?: unknown }) {
    const r = this.mustRound('drinks');
    const s = this.serveOf(r, teamId);
    if (!s.servedAt) fail('bar.notCalled');
    if (s.finishedAt || s.timerEndsAt) return;
    s.timerEndsAt = this.now + this.s.settings.serveSeconds * 1000;
    this.log('bar.clock', { teamId: s.teamId, seconds: this.s.settings.serveSeconds });
  }

  /** Called the wrong team up: put it back in line and take the points back. */
  barBack({ teamId }: { teamId?: unknown }) {
    const r = this.mustRound('drinks');
    const s = this.serveOf(r, teamId);
    if (!s.servedAt) return;
    if (s.finishedAt) fail('bar.finished');
    // The last team called up that is still drinking. A team that finished after it doesn't block the undo.
    if ([...r.serves].reverse().find((x) => x.servedAt && !x.finishedAt) !== s) fail('bar.notLast');
    for (const a of s.awards) this.takePoints(a.teamId, a.points, 'serve.undone', s.teamId);
    for (const id of s.orderIds) {
      const o = this.order(id);
      if (o && o.status === 'done') {
        o.status = 'pending';
        delete o.doneAt;
        delete o.pointsAwarded;
      }
    }
    s.servedAt = s.timerEndsAt = null;
    s.awards = [];
  }

  /** This team couldn't finish its drinks: it loses a share of its points and its drink income, but owes no extra shot. */
  barFail({ teamId }: { teamId?: unknown }) {
    const r = this.mustRound('drinks');
    const s = this.serveOf(r, teamId);
    if (!s.servedAt) fail('bar.notCalled');
    if (s.finishedAt) return;
    s.finishedAt = this.now;
    s.finishedBy = 'host';
    s.missed = s.failed = true;
    const t = this.team(s.teamId);
    const pts = this.points(s.teamId);
    s.pointsLost = this.takePoints(s.teamId, pts > 0 ? Math.max(1, Math.round((pts * this.s.settings.failPointsPct) / 100)) : 0, 'bar.failed');
    s.streamLost = t.drinkStream;
    t.drinkStream = 0;
    this.log('bar.failed', { teamId: s.teamId, pct: this.s.settings.failPointsPct, streamLost: s.streamLost });
    this.checkRoundDone();
  }

  /** This team finished inside its time. Each round it does, it's paid one step more than last time. */
  barDone({ teamId }: { teamId?: unknown }) {
    const r = this.mustRound('drinks');
    const s = this.serveOf(r, teamId);
    if (!s.servedAt) fail('bar.notCalled');
    if (s.finishedAt) return;
    s.finishedAt = this.now;
    s.finishedBy = 'host';
    const t = this.team(s.teamId);
    t.drinkStream += this.s.settings.streamStep;
    s.reward = t.drinkStream;
    this.entry(s.teamId, 'money', s.reward, 'income', { ref: r.id, earned: true });
    this.log('bar.done', { teamId: s.teamId, reward: s.reward, next: t.drinkStream + this.s.settings.streamStep });
    this.checkRoundDone();
  }

  // ---------- the clock: lazy, settles any deadline that has passed ----------
  tick(): boolean {
    const r = this.round;
    if (!r) return false;
    const now = this.now;
    let changed = false;
    if (r.phase === 'game' && !r.revealedAt && r.pickDeadline && now >= r.pickDeadline) {
      this.revealPicks();
      changed = true;
    }
    const pl = r.phase === 'game' ? r.play : undefined;
    if (pl && pl.deadline && now >= pl.deadline) {
      if (pl.kind === 'coldwar' && !pl.revealed) this.revealColdWar(r);
      if (pl.kind === 'twothirds' && !pl.revealed) this.revealTwoThirds(r);
      if (pl.kind === 'dilemma' && pl.state === 'open') this.resolveDilemma(r);
      if (pl.kind === 'trivia' && pl.state === 'asking') this.revealQuestion(r);
      if (pl.kind === 'anime' && pl.state === 'open') {
        pl.state = 'missed';
        pl.deadline = null;
        this.log('anime.timeUp', { n: pl.i + 1, answer: pl.items[pl.i].answers[0] });
      }
      if (pl.kind === 'lying' && pl.state === 'voting') {
        pl.state = 'closed';
        pl.deadline = null;
      }
      changed = true;
    }
    if (r.phase === 'spending' && r.shopDeadline && now >= r.shopDeadline) {
      this.log('shop.timeUp');
      this.startDrinks();
      changed = true;
    }
    if (r.phase === 'drinks') {
      for (const s of r.serves) {
        if (!(s.servedAt && !s.finishedAt && s.timerEndsAt && now >= s.timerEndsAt)) continue;
        s.finishedAt = s.timerEndsAt;
        s.finishedBy = 'timer';
        s.missed = true;
        const t = this.team(s.teamId);
        s.streamLost = t.drinkStream;
        t.drinkStream = 0;
        this.s.penalties.push({ id: this.id('p'), teamId: s.teamId, qty: 1, itemId: this.cheapestDrink()?.id || null, reason: 'missed_time', fromRound: r.number, appliedRound: null });
        this.log('bar.timeUp', { teamId: s.teamId, streamLost: s.streamLost });
        changed = true;
      }
      if (this.checkRoundDone()) changed = true;
    }
    return changed;
  }

  /** The next moment the clock needs to act on, so screens know when to nudge it. */
  nextDeadline(): number | null {
    const r = this.round;
    if (!r) return null;
    if (r.phase === 'game' && !r.revealedAt) return r.pickDeadline;
    if (r.phase === 'game' && r.play?.deadline) return r.play.deadline;
    if (r.phase === 'spending' && r.shopDeadline) return r.shopDeadline;
    if (r.phase === 'drinks') {
      const ends = r.serves.filter((s) => s.servedAt && !s.finishedAt && s.timerEndsAt).map((s) => s.timerEndsAt as number);
      return ends.length ? Math.min(...ends) : null;
    }
    return null;
  }

  private checkRoundDone(): boolean {
    const r = this.round;
    if (!r || r.phase !== 'drinks' || r.serves.some((s) => !s.finishedAt)) return false;
    r.phase = 'done';
    r.completedAt = this.now;
    const last = r.number >= this.totalRounds();
    this.log('round.done', { round: r.number, act: r.act, inAct: r.inAct, final: r.final, actName: this.slotOf(r.number).actName, last });
    // Points go public only at the end of each act.
    if (r.final || last) this.revealPoints({ act: this.slotOf(r.number).actName || String(r.act) });
    // The last act's final round ends the night.
    if (last && !this.s.winner) this.crownWinner({});
    return true;
  }

  /** Publish every team's points as they stand. Until the next act ends, the TV and other teams see these. */
  private revealPoints(at: { act: string } | 'end') {
    this.s.shown = { points: Object.fromEntries(Object.keys(this.s.teams).map((id) => [id, this.points(id)])), at };
    if (at !== 'end') this.log('points.published', { act: at.act });
  }

  /** Most points wins; money earned breaks a tie. */
  standings(): string[] {
    return this.inPlay().sort((a, b) => this.points(b) - this.points(a) || this.earned(b) - this.earned(a));
  }

  crownWinner({ teamId }: { teamId?: unknown }) {
    const t = teamId ? this.mustTeam(teamId) : this.standings()[0] || fail('round.noTeams');
    this.s.winner = { teamId: t, at: this.now };
    this.revealPoints('end');
    this.log('winner.crowned', { teamId: t, points: this.points(t) });
  }

  clearWinner() {
    this.s.winner = null;
  }

  /** Back to round 1 with the same setup: everything that happened is wiped, the library and sequence stay. */
  restart() {
    const s = this.s;
    Object.assign(s, { rounds: [], orders: [], bounties: [], reflects: [], penalties: [], ledger: [], teams: {}, feed: [], flash: null, winner: null, shopOpen: false, shown: { points: {}, at: null } });
    this.balances = null;
    for (const g of s.games) {
      g.status = 'upcoming';
      g.results = null;
    }
    this.ensureTeams();
    this.log('night.restarted');
  }

  // ---------- bounties ----------
  activeBounty(teamId: string): Bounty | null {
    return this.s.bounties.find((b) => b.teamId === teamId && b.status === 'active') || null;
  }

  /** Every drink a team sends counts toward its bounty, the moment it's sent. */
  private countBounty(teamId: string, order: Order) {
    const b = this.activeBounty(teamId);
    const r = this.round;
    if (!b || !r || r.phase === 'done' || r.number < b.startRound) return;
    b.sent += order.qty;
    b.orderIds.push(order.id);
    if (b.sent < BOUNTY.target) return;
    b.status = 'hit';
    b.paid = b.stake * b.mult;
    this.entry(teamId, 'points', b.paid, 'bounty.won', { ref: b.id });
    // Hitting a bounty is public, and so is how: the sends that did it are named, Burner Phone or not.
    const sends = b.orderIds.map((id) => this.order(id)).filter((o): o is Order => !!o).map((o) => ({ toTeamId: o.targetTeamId, name: o.name, emoji: o.emoji, qty: o.qty }));
    this.log('bounty.hit', { teamId, bounty: b.kind, sends });
  }

  /** A bounty past its last round when the shop closes is missed: the stake is gone, the same again comes off, and shots are owed. */
  private resolveBounties(r: Round) {
    for (const b of this.s.bounties.filter((x) => x.status === 'active' && r.number >= x.deadlineRound)) {
      b.status = 'missed';
      b.lostExtra = this.s.teams[b.teamId] ? this.takePoints(b.teamId, Math.round((b.stake * this.s.settings.bountyMissExtra) / 100), 'bounty.missed', b.id) : 0;
      this.s.penalties.push({ id: this.id('p'), teamId: b.teamId, qty: BOUNTY.missQty, itemId: BOUNTY.missItemId, reason: 'missed_bounty', fromRound: r.number, appliedRound: null });
      this.log('bounty.missed', { teamId: b.teamId, qty: BOUNTY.missQty });
    }
  }

  // ---------- app-run games: the team phones play, the app scores ----------
  private newPlay(kind: Exclude<RunBy, 'host'>, g: GameDef): Play {
    const deadline = this.now + this.s.settings.pickSeconds * 1000;
    if (kind === 'coldwar') return { kind, bids: {}, deadline, revealed: false, drinks: null, order: null };
    if (kind === 'twothirds') return { kind, picks: {}, deadline, revealed: false, average: null, target: null, order: null, missed: null, drinks: null };
    if (kind === 'trivia') return { kind, questions: g.questions.map((q) => ({ ...q })), qi: -1, state: 'ready', deadline: null, askedAt: null, answers: [], scores: {}, ms: {} };
    if (kind === 'dilemma') {
      // Random pairs for the whole game; an odd team out plays the House, which picks at random.
      const ids = this.shuffle(this.inPlay());
      const pairs: [string, string][] = [];
      for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1] || 'house']);
      return { kind, pairs, total: Math.min(10, g.stories || 3), n: 0, state: 'ready', deadline: null, openedAt: null, choices: [], results: [], scores: {}, shots: {}, ms: {} };
    }
    if (kind === 'anime') return { kind, items: g.openings.map((o) => ({ ...o })), i: -1, state: 'ready', deadline: null, openedAt: null, winners: [], guesses: [], scores: {}, ms: {} };
    return { kind: 'lying', total: g.stories || 5, n: 0, state: 'ready', deadline: null, openedAt: null, votes: [], truth: [], scores: {}, ms: {} };
  }

  private mustPlay(): Round & { play: Play } {
    const r = this.mustRound('game');
    if (!r.play) fail('play.none');
    return r as Round & { play: Play };
  }

  /** A team's phone answers: shots, a number, a choice, a trivia answer, a typed guess or a vote. */
  playAnswer({ value }: { value?: unknown }) {
    const teamId = this.actorTeam();
    const r = this.mustPlay();
    const pl = r.play;
    const now = this.now;
    const teams = this.inPlay();
    const late = pl.deadline !== null && now > pl.deadline;
    if (pl.kind === 'coldwar') {
      if (pl.revealed) fail('play.revealed');
      if (late) fail('play.late');
      const n = toInt(value, 0);
      if (n < 1 || n > COLD_WAR_MAX) fail('coldwar.range', { max: COLD_WAR_MAX });
      pl.bids[teamId] = { n, at: now };
      if (teams.every((id) => pl.bids[id])) this.revealColdWar(r);
      return { locked: n };
    }
    if (pl.kind === 'twothirds') {
      if (pl.revealed) fail('play.revealed');
      if (late) fail('play.late');
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > TWO_THIRDS_MAX) fail('twothirds.range', { max: TWO_THIRDS_MAX });
      if (pl.picks[teamId]) fail('play.answered');
      pl.picks[teamId] = { n, at: now };
      if (teams.every((id) => pl.picks[id])) this.revealTwoThirds(r);
      return { locked: n };
    }
    if (pl.kind === 'dilemma') {
      if (pl.state !== 'open' || late) fail('play.closed');
      if (value !== 'silent' && value !== 'snitch') fail('dilemma.choice');
      const box = pl.choices[pl.n];
      if (box[teamId]) fail('play.answered');
      box[teamId] = { choice: String(value), ms: now - (pl.openedAt || now) };
      if (teams.every((id) => box[id])) this.resolveDilemma(r);
      return { picked: value };
    }
    if (pl.kind === 'trivia') {
      if (pl.state !== 'asking' || late) fail('play.closed');
      const q = pl.questions[pl.qi];
      const choice = toInt(value, -1);
      if (!(choice >= 0 && choice < q.options.length)) fail('trivia.choice');
      const box = pl.answers[pl.qi];
      if (box[teamId]) fail('play.answered');
      box[teamId] = { choice, ms: now - (pl.askedAt || now) };
      if (teams.every((id) => box[id])) this.revealQuestion(r);
      return { answered: true };
    }
    if (pl.kind === 'anime') {
      if (pl.state !== 'open' || late) fail('play.closed');
      const guess = cleanText(value, 80);
      if (!guess) fail('anime.blank');
      const tries = (pl.guesses[pl.i] ||= {});
      tries[teamId] = (tries[teamId] || 0) + 1;
      if (!guessMatches(guess, pl.items[pl.i].answers)) return { correct: false };
      this.awardOpening(r, teamId, now - (pl.openedAt || now));
      return { correct: true };
    }
    if (pl.state !== 'voting' || late) fail('play.closed');
    if (value !== 'truth' && value !== 'lie') fail('lying.choice');
    const box = pl.votes[pl.n];
    if (box[teamId]) fail('play.answered');
    box[teamId] = { choice: String(value), ms: now - (pl.openedAt || now) };
    if (teams.every((id) => box[id])) pl.state = 'closed';
    return { voted: value };
  }

  /** Host: the next question, story, opening or turn. */
  playNext() {
    const pl = this.mustPlay().play;
    const st = this.s.settings;
    if (pl.kind === 'trivia') {
      if (pl.state === 'asking') fail('play.revealFirst');
      if (pl.qi + 1 >= pl.questions.length) fail('play.wasLast');
      pl.qi += 1;
      pl.answers[pl.qi] = {};
      pl.askedAt = this.now;
      pl.deadline = this.now + st.questionSeconds * 1000;
      pl.state = 'asking';
    } else if (pl.kind === 'lying') {
      if (pl.state === 'voting' || pl.state === 'closed') fail('play.revealFirst');
      if (pl.n >= pl.total) fail('play.wasLast');
      pl.n += 1;
      pl.votes[pl.n] = {};
      pl.openedAt = this.now;
      pl.deadline = this.now + st.voteSeconds * 1000;
      pl.state = 'voting';
    } else if (pl.kind === 'anime') {
      if (pl.state === 'open') fail('play.revealFirst');
      if (pl.i + 1 >= pl.items.length) fail('play.wasLast');
      pl.i += 1;
      pl.openedAt = this.now;
      pl.deadline = this.now + st.guessSeconds * 1000;
      pl.state = 'open';
    } else if (pl.kind === 'dilemma') {
      if (pl.state === 'open') fail('play.revealFirst');
      if (pl.n >= pl.total) fail('play.wasLast');
      pl.n += 1;
      pl.choices[pl.n] = {};
      pl.openedAt = this.now;
      pl.deadline = this.now + st.voteSeconds * 1000;
      pl.state = 'open';
    } else fail('play.noNext');
  }

  /** Host (or the clock): show the answer. A story needs the host to say what it really was. */
  playReveal({ truth, teamId }: { truth?: unknown; teamId?: unknown } = {}) {
    const r = this.mustPlay();
    const pl = r.play;
    if (pl.kind === 'coldwar') return this.revealColdWar(r);
    if (pl.kind === 'twothirds') return this.revealTwoThirds(r);
    if (pl.kind === 'dilemma') {
      if (pl.state !== 'open') fail('play.closed');
      return this.resolveDilemma(r);
    }
    if (pl.kind === 'anime') {
      if (pl.state !== 'open') fail('play.closed');
      if (teamId) return this.awardOpening(r, this.mustTeam(teamId), this.now - (pl.openedAt || this.now)); // a near miss the hosts allow
      pl.state = 'missed';
      pl.deadline = null;
      this.log('anime.nobody', { n: pl.i + 1, answer: pl.items[pl.i].answers[0] });
      return;
    }
    if (pl.kind === 'trivia') {
      if (pl.state !== 'asking') fail('play.closed');
      return this.revealQuestion(r);
    }
    if (pl.state !== 'voting' && pl.state !== 'closed') fail('play.closed');
    if (truth !== 'truth' && truth !== 'lie') fail('lying.truth');
    pl.truth[pl.n] = String(truth);
    let right = 0;
    for (const [id, v] of Object.entries(pl.votes[pl.n] || {})) {
      if (v.choice !== truth) continue;
      right += 1;
      pl.scores[id] = (pl.scores[id] || 0) + 1;
      pl.ms[id] = (pl.ms[id] || 0) + v.ms;
    }
    pl.state = 'revealed';
    pl.deadline = null;
    this.log('lying.revealed', { n: pl.n, truth, right });
  }

  /** The first team to name the opening takes it; it closes for everyone else. */
  private awardOpening(r: Round & { play: Play }, teamId: string, ms: number) {
    const pl = r.play;
    if (pl.kind !== 'anime') return;
    pl.winners[pl.i] = teamId;
    pl.scores[teamId] = (pl.scores[teamId] || 0) + 1;
    pl.ms[teamId] = (pl.ms[teamId] || 0) + ms;
    pl.state = 'won';
    pl.deadline = null;
    this.log('anime.named', { teamId, n: pl.i + 1, answer: pl.items[pl.i].answers[0] });
  }

  private revealQuestion(r: Round) {
    const pl = r.play;
    if (pl?.kind !== 'trivia') return;
    const q = pl.questions[pl.qi];
    for (const [id, a] of Object.entries(pl.answers[pl.qi] || {})) {
      if (a.choice !== q.answer) continue;
      pl.scores[id] = (pl.scores[id] || 0) + 1;
      pl.ms[id] = (pl.ms[id] || 0) + a.ms;
    }
    pl.state = 'revealed';
    pl.deadline = null;
  }

  /** A game's shots go into this round's bar queue like any other drinks, scoring nobody. */
  private queueGameShots(drinks: Record<string, number>, r: Round) {
    const shot = this.item('spirit') || this.cheapestDrink();
    for (const [teamId, qty] of Object.entries(drinks)) {
      if (!qty || !this.s.teams[teamId]) continue;
      this.s.orders.unshift({
        id: this.id('o'), ts: this.now, itemId: shot?.id || null, type: 'drink', name: shot?.name || '', emoji: shot?.emoji || '🥃', qty, price: 0, points: 0,
        round: r.number, fromTeamId: null, targetTeamId: teamId, status: 'pending', origin: 'game', note: r.gameName,
      });
    }
  }

  /**
   * Two-Thirds of the Average: closest to ⅔ of the average pick wins;
   * ties go to whoever locked in first. Teams that didn't pick rank
   * last and drink 1 each; the furthest picker drinks 1 per 10 off.
   */
  private revealTwoThirds(r: Round) {
    const pl = r.play;
    if (pl?.kind !== 'twothirds' || pl.revealed) return;
    const ids = this.inPlay();
    const pickers = ids.filter((id) => pl.picks[id]);
    const missed = this.shuffle(ids.filter((id) => !pl.picks[id]));
    const avg = pickers.length ? pickers.reduce((n, id) => n + pl.picks[id].n, 0) / pickers.length : 0;
    const target = Math.round(avg * (2 / 3) * 10) / 10;
    const gap = (id: string) => Math.abs(pl.picks[id].n - target);
    pickers.sort((a, b) => gap(a) - gap(b) || pl.picks[a].at - pl.picks[b].at);
    const drinks: Record<string, number> = {};
    for (const id of missed) drinks[id] = 1;
    const far = pickers[pickers.length - 1];
    if (far && pickers.length > 1) drinks[far] = Math.min(10, Math.max(1, Math.ceil(gap(far) / 10)));
    Object.assign(pl, { average: Math.round(avg * 10) / 10, target, order: [...pickers, ...missed], missed, drinks, revealed: true, deadline: null });
    this.queueGameShots(drinks, r);
    this.log('twothirds.revealed', { average: pl.average, target, closest: pickers[0] || null, closestPick: pickers[0] ? pl.picks[pickers[0]].n : null, furthest: far && drinks[far] ? far : null, furthestDrinks: far ? drinks[far] || 0 : 0 });
  }

  /** Prisoner's Dilemma: settle this turn for every pair. A team that didn't pick stays silent; the House picks at random. */
  private resolveDilemma(r: Round) {
    const pl = r.play;
    if (pl?.kind !== 'dilemma' || pl.state !== 'open') return;
    const box = pl.choices[pl.n] || {};
    const res: (typeof pl.results)[number] = {};
    const pairs: { a: string; b: string; ca: string; cb: string }[] = [];
    for (const [a, b] of pl.pairs) {
      const pickOf = (id: string) => (id === 'house' ? { choice: this.ctx.rng() < 0.5 ? 'silent' : 'snitch', auto: false } : box[id] ? { choice: box[id].choice, auto: false } : { choice: 'silent', auto: true });
      const ca = pickOf(a);
      const cb = pickOf(b);
      for (const [me, mine, theirs, vs] of [[a, ca, cb, b], [b, cb, ca, a]] as const) {
        if (me === 'house') continue;
        const [pts, shots] = DILEMMA[mine.choice][theirs.choice];
        res[me] = { choice: mine.choice, auto: mine.auto, pts, shots, vs, theirs: theirs.choice };
        pl.scores[me] = (pl.scores[me] || 0) + pts;
        pl.shots[me] = (pl.shots[me] || 0) + shots;
      }
      pairs.push({ a, b, ca: ca.choice, cb: cb.choice });
    }
    pl.results[pl.n] = res;
    pl.state = 'revealed';
    pl.deadline = null;
    this.log('dilemma.turn', { n: pl.n, pairs });
  }

  /**
   * Cold War: the two lowest drink their own shots plus the two highest
   * teams' shots (lowest takes the highest's); the two highest drink
   * nothing; anyone in between drinks their own. Places go by number,
   * highest first.
   */
  private revealColdWar(r: Round) {
    const pl = r.play;
    if (pl?.kind !== 'coldwar' || pl.revealed) return;
    const teams = this.inPlay();
    for (const id of teams) if (!pl.bids[id]) pl.bids[id] = { n: 1, at: Number.MAX_SAFE_INTEGER, auto: true };
    const order = [...teams].sort((a, b) => pl.bids[b].n - pl.bids[a].n || pl.bids[a].at - pl.bids[b].at);
    const k = Math.min(2, Math.floor(order.length / 2));
    const high = order.slice(0, k);
    const low = order.slice(order.length - k).reverse(); // lowest first
    const drinks: Record<string, number> = {};
    for (const id of order) drinks[id] = pl.bids[id].n;
    high.forEach((id, i) => {
      drinks[low[i]] += pl.bids[id].n;
      drinks[id] = 0;
    });
    Object.assign(pl, { order, drinks, revealed: true, deadline: null });
    this.queueGameShots(drinks, r);
    this.log('coldwar.revealed', { bids: order.map((id) => ({ teamId: id, n: pl.bids[id].n })), drinkers: low.map((id) => ({ teamId: id, drinks: drinks[id] })) });
  }

  /** Host: place the teams by score. The round stops on Results with those places filled in, for the host to confirm. */
  playFinish() {
    const r = this.mustPlay();
    const pl = r.play;
    let order: string[];
    if (pl.kind === 'coldwar') {
      this.revealColdWar(r);
      order = pl.order || [];
    } else if (pl.kind === 'twothirds') {
      this.revealTwoThirds(r);
      order = pl.order || [];
    } else if (pl.kind === 'dilemma') {
      this.resolveDilemma(r);
      // Most points first; fewer shots drunk breaks a tie.
      order = this.inPlay().sort((a, b) => (pl.scores[b] || 0) - (pl.scores[a] || 0) || (pl.shots[a] || 0) - (pl.shots[b] || 0));
      this.queueGameShots(pl.shots, r);
    } else {
      if (pl.kind === 'trivia' && pl.state === 'asking') this.revealQuestion(r);
      if (pl.kind === 'anime' && pl.state === 'open') pl.state = 'missed';
      if (pl.kind === 'lying' && (pl.state === 'voting' || pl.state === 'closed')) fail('play.revealFirst');
      // Most right first; faster breaks a tie.
      order = this.inPlay().sort((a, b) => (pl.scores[b] || 0) - (pl.scores[a] || 0) || (pl.ms[a] ?? Infinity) - (pl.ms[b] ?? Infinity));
    }
    pl.done = true;
    pl.deadline = null;
    r.phase = 'results';
    r.proposed = Object.fromEntries(order.map((id, i) => [id, i + 1]));
    this.log('play.finished', { game: r.gameName });
  }

  // ---------- things the screens ask ----------
  /** Standard drinks sent so far (game shots and penalties included), for the hosts' pace tracker. */
  standardsSent(): number {
    let total = 0;
    for (const o of this.s.orders) {
      if (o.type !== 'drink' || o.status === 'cancelled') continue;
      total += o.qty * (this.item(o.itemId)?.std ?? 1);
    }
    return Math.round(total * 10) / 10;
  }

  /** Eye Spy: every drink sent up to the moment it opened, round by round. */
  eyeSpyTable(teamId: string) {
    const at = this.s.teams[teamId]?.eyeSpyAt;
    if (!at) return null;
    const rows: Record<string, number> = {};
    for (const o of this.s.orders) {
      if (o.type !== 'drink' || !o.fromTeamId || o.ts > at || o.status === 'cancelled') continue;
      const from = o.hidden && o.fromTeamId !== teamId ? 'anonymous' : o.fromTeamId;
      const key = `${o.queuedRound || 0}|${from}|${o.originalTargetTeamId || o.targetTeamId}`;
      rows[key] = (rows[key] || 0) + o.qty;
    }
    return {
      at,
      rows: Object.entries(rows)
        .map(([k, qty]) => {
          const [round, from, to] = k.split('|');
          return { round: Number(round), from, to, qty };
        })
        .sort((a, b) => (a.round || 999) - (b.round || 999) || b.qty - a.qty),
    };
  }
}

export type { Settings };
