/**
 * Shifty Shen's Slammer, as a game module: the shape of its state and
 * of everything that goes in and out of the engine.
 *
 * Two rules shape these types (see docs/rework-plan.md):
 * - The engine never owns people or groups. A team is a `blocks.id`, a
 *   player a `participants.id`; names and membership arrive in the
 *   roster with every call and are never stored.
 * - The engine never writes finished English. The feed and errors are
 *   a code plus parameters; `messages.ts` turns them into words using
 *   the party's theme.
 */

/** Who is here tonight, from the core tables. Passed in on every call. */
export type Roster = {
  groups: { id: string }[];
  members: { id: string; groupId: string | null; away?: boolean }[];
};

export type Role = 'host' | 'bar' | 'team' | 'system';

export type Actor = { role: Role; teamId?: string };

export type Ctx = {
  now: number;
  /** Uniform in [0, 1). Injected so tests can fix the dice. */
  rng: () => number;
  roster: Roster;
  actor: Actor;
};

export type Settings = {
  startingBudget: number;
  pickSeconds: number;
  serveSeconds: number;
  cooldownGames: number;
  questionSeconds: number;
  voteSeconds: number;
  guessSeconds: number;
  prizeMoney: number[];
  shopSeconds: number;
  failPointsPct: number;
  streamStep: number;
  bountyMultiplier: number;
  winnerMultiplier: number;
  bountyMinStake: number;
  bountyMaxStake: number;
  bountyMissExtra: number;
  targetStandards: number;
  actsCount: number;
  roundsPerAct: number;
};

export type ItemType = 'drink' | 'reflect' | 'eyespy' | 'mystery' | 'ghost' | 'nochaser' | 'bounty';

export type Bundle = { qty: number; cost: number; points: number };

export type Item = {
  id: string;
  emoji: string;
  name: string;
  /** May hold {group} and {groups}, filled from the theme when shown. */
  desc: string;
  price: number;
  type: ItemType;
  stock: number | null;
  active: boolean;
  points: number;
  bundles: Bundle[];
  bounty: 'open' | 'winner' | null;
  /** Standard drinks in one, for the hosts' pace tracker. */
  std: number | null;
};

export type RunBy = 'host' | 'coldwar' | 'trivia' | 'lying' | 'anime' | 'dilemma' | 'twothirds';

export type TriviaQuestion = { q: string; options: string[]; answer: number };
export type Opening = { label: string; answers: string[] };

export type GameDef = {
  id: string;
  name: string;
  desc: string;
  rules: string;
  rulesVersion: number;
  /** Players each team sends. 0 means the whole team plays. */
  playersNeeded: number;
  status: 'upcoming' | 'live' | 'done';
  results: Record<string, number> | null;
  runBy: RunBy;
  questions: TriviaQuestion[];
  questionsText: string;
  stories: number;
  openings: Opening[];
  openingsText: string;
};

export type ActPlan = { id: string; name: string; mechanics: string[]; rounds: (string | null)[] };

export type TeamState = {
  /** What the team was paid for its last finish in time; a miss resets it. */
  drinkStream: number;
  reflectUsed: boolean;
  eyeSpyAt: number | null;
  eyeSpyFrom: number | null;
  ghostRound: number | null;
  noChaserRound: number | null;
  pickpockets: number;
};

export type LedgerWhy =
  | 'start'
  | 'prize'
  | 'income'
  | 'jackpot'
  | 'purchase'
  | 'refund'
  | 'pickpocket'
  | 'host'
  | 'stake'
  | 'bounty.won'
  | 'bounty.missed'
  | 'drink.served'
  | 'serve.undone'
  | 'bar.failed';

/**
 * Money and points are never stored: a balance is the sum of these.
 * A wrong ruling is fixed with another entry, never by editing one.
 */
export type LedgerEntry = {
  n: number;
  ts: number;
  teamId: string;
  kind: 'money' | 'points';
  delta: number;
  why: LedgerWhy;
  round: number | null;
  /** The order, bounty or other team this entry is about. */
  ref: string | null;
  /** Counts toward "money earned", the standings tie-break. */
  earned?: boolean;
  note?: string;
};

export type MysteryPrize =
  | { kind: 'jackpot'; amount: number }
  | { kind: 'pickpocket'; pending: true }
  | { kind: 'reflect'; round: number }
  | { kind: 'self' | 'other'; qty: number; itemId: string; targetTeamId: string };

export type Order = {
  id: string;
  ts: number;
  itemId: string | null;
  type: ItemType;
  name: string;
  emoji: string;
  qty: number;
  price: number;
  points: number;
  /** The round running when it was placed, or null between rounds. */
  round: number | null;
  fromTeamId: string | null;
  targetTeamId: string | null;
  status: 'pending' | 'done' | 'cancelled';
  /** Null for a team's own send. */
  origin: null | 'penalty' | 'admin' | 'mystery' | 'game';
  note: string;
  hidden?: boolean;
  noChaser?: boolean;
  queuedRound?: number;
  reflected?: boolean;
  originalTargetTeamId?: string;
  scoresForTeamId?: string;
  pointsAwarded?: number;
  doneAt?: number;
  prize?: MysteryPrize;
};

export type Penalty = {
  id: string;
  teamId: string;
  qty: number;
  itemId: string | null;
  reason: 'missed_time' | 'missed_bounty';
  fromRound: number;
  appliedRound: number | null;
};

export type Bounty = {
  id: string;
  teamId: string;
  kind: 'open' | 'winner';
  stake: number;
  mult: number;
  startRound: number;
  deadlineRound: number;
  sent: number;
  /** The sends that counted toward it, announced when it's hit. */
  orderIds: string[];
  status: 'active' | 'hit' | 'missed';
  ts: number;
  paid?: number;
  lostExtra?: number;
};

export type Serve = {
  teamId: string;
  orderIds: string[];
  drinks: number;
  servedAt: number | null;
  timerEndsAt: number | null;
  finishedAt: number | null;
  finishedBy: 'timer' | 'host' | null;
  missed: boolean;
  failed: boolean;
  awards: { teamId: string; points: number }[];
  reward: number;
  streamLost: number;
  pointsLost: number;
};

type Timed = { choice: string; ms: number };

export type Play =
  | { kind: 'coldwar'; done?: boolean; deadline: number | null; revealed: boolean; bids: Record<string, { n: number; at: number; auto?: boolean }>; drinks: Record<string, number> | null; order: string[] | null }
  | { kind: 'twothirds'; done?: boolean; deadline: number | null; revealed: boolean; picks: Record<string, { n: number; at: number }>; average: number | null; target: number | null; order: string[] | null; missed: string[] | null; drinks: Record<string, number> | null }
  | { kind: 'trivia'; done?: boolean; deadline: number | null; state: 'ready' | 'asking' | 'revealed'; questions: TriviaQuestion[]; qi: number; askedAt: number | null; answers: Record<string, { choice: number; ms: number }>[]; scores: Record<string, number>; ms: Record<string, number> }
  | { kind: 'lying'; done?: boolean; deadline: number | null; state: 'ready' | 'voting' | 'closed' | 'revealed'; total: number; n: number; openedAt: number | null; votes: Record<string, Timed>[]; truth: string[]; scores: Record<string, number>; ms: Record<string, number> }
  | { kind: 'anime'; done?: boolean; deadline: number | null; state: 'ready' | 'open' | 'won' | 'missed'; items: Opening[]; i: number; openedAt: number | null; winners: (string | null)[]; guesses: Record<string, number>[]; scores: Record<string, number>; ms: Record<string, number> }
  | { kind: 'dilemma'; done?: boolean; deadline: number | null; state: 'ready' | 'open' | 'revealed'; pairs: [string, string][]; total: number; n: number; openedAt: number | null; choices: Record<string, Timed>[]; results: Record<string, { choice: string; auto: boolean; pts: number; shots: number; vs: string; theirs: string }>[]; scores: Record<string, number>; shots: Record<string, number>; ms: Record<string, number> };

export type Phase = 'game' | 'results' | 'spending' | 'drinks' | 'done';

export type Round = {
  id: string;
  number: number;
  act: number;
  inAct: number;
  final: boolean;
  gameId: string;
  gameName: string;
  isGroup: boolean;
  playersNeeded: number;
  phase: Phase;
  startedAt: number;
  pickDeadline: number | null;
  picks: Record<string, string[]>;
  /** A team id (its phone picked), 'auto' or 'group'. */
  pickedBy: Record<string, string>;
  revealedAt: number | null;
  placings: Record<string, number>;
  prizes: Record<string, number>;
  /** An app-run game's suggested placings, for the host to confirm. */
  proposed: Record<string, number> | null;
  winnerTeamId: string | null;
  shopDeadline: number | null;
  drinksStartedAt: number | null;
  reflectTeamId: string | null;
  serves: Serve[];
  completedAt: number | null;
  play?: Play;
};

/** One line of the night's story: a code and its parameters, no words. */
export type FeedEvent = {
  id: string;
  ts: number;
  kind: string;
  params: Record<string, unknown>;
};

export type State = {
  schemaVersion: 1;
  /** Counter behind every id the engine mints, so replays match. */
  seq: number;
  settings: Settings;
  shopOpen: boolean;
  teams: Record<string, TeamState>;
  items: Item[];
  games: GameDef[];
  night: { status: 'draft' | 'live'; confirmedAt: number | null; acts: ActPlan[] };
  rounds: Round[];
  orders: Order[];
  ledger: LedgerEntry[];
  penalties: Penalty[];
  bounties: Bounty[];
  reflects: { teamId: string; round: number }[];
  feed: FeedEvent[];
  /** A big moment every screen shows once. */
  flash: FeedEvent | null;
  /** Points as the room last saw them: published at the end of each act. */
  shown: { points: Record<string, number>; at: { act: string } | 'end' | null };
  winner: { teamId: string; at: number } | null;
};

export type Action = { type: string; args?: Record<string, unknown> };
