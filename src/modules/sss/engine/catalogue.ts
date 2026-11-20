import type { GameDef, Item, ItemType, RunBy, Settings } from './types';

export const MAX_DRINKS_PER_ORDER = 10;
export const COLD_WAR_MAX = 15;
export const TWO_THIRDS_MAX = 100;

/** Send this many drinks within this many rounds, counting from the round after buying. */
export const BOUNTY = { target: 7, rounds: 3, missQty: 3, missItemId: 'spirit' } as const;

/** What a Mystery Box can pour, and when it reaches the shelf. */
export const MYSTERY = {
  drinkIds: ['soju-shot', 'spirit', 'mystery-cocktail'],
  maxQty: 5,
  fromAct: 2,
  jackpot: 80,
  pickpocketShare: 0.5,
} as const;

/** The Prisoner's Dilemma, per turn: [points, shots] for my choice against theirs. */
export const DILEMMA: Record<string, Record<string, [number, number]>> = {
  silent: { silent: [3, 1], snitch: [0, 5] },
  snitch: { silent: [5, 0], snitch: [1, 3] },
};

export const APP_GAMES: Record<Exclude<RunBy, 'host'>, { emoji: string; name: string }> = {
  coldwar: { emoji: '🧊', name: 'Cold War drinking' },
  trivia: { emoji: '❓', name: 'Trivia' },
  lying: { emoji: '🤥', name: 'Is Jason lying?' },
  anime: { emoji: '🎵', name: 'Anime opening guessing' },
  dilemma: { emoji: '🐀', name: 'Prisoner’s Dilemma' },
  twothirds: { emoji: '🧠', name: 'Two-Thirds of the Average' },
};

/** Sized for about 400 standard drinks across 8 teams and 12 rounds. */
export const PRIZES = [35, 29, 24, 20, 17, 14, 12, 9];

export function defaultSettings(): Settings {
  return {
    startingBudget: 32,
    pickSeconds: 60,
    serveSeconds: 30,
    cooldownGames: 2,
    questionSeconds: 20,
    voteSeconds: 30,
    guessSeconds: 60,
    prizeMoney: [...PRIZES],
    shopSeconds: 90,
    failPointsPct: 10,
    streamStep: 4,
    bountyMultiplier: 5,
    winnerMultiplier: 8,
    bountyMinStake: 5,
    bountyMaxStake: 50,
    bountyMissExtra: 100,
    targetStandards: 400,
    actsCount: 4,
    roundsPerAct: 3,
  };
}

/** Numeric settings a host can change, with their limits. */
export const SETTING_LIMITS: Record<Exclude<keyof Settings, 'prizeMoney'>, [number, number]> = {
  startingBudget: [0, 1000],
  pickSeconds: [15, 300],
  serveSeconds: [10, 120],
  cooldownGames: [0, 5],
  questionSeconds: [5, 120],
  voteSeconds: [5, 120],
  guessSeconds: [10, 300],
  shopSeconds: [0, 600],
  failPointsPct: [0, 100],
  streamStep: [0, 50],
  bountyMultiplier: [1, 10],
  winnerMultiplier: [1, 10],
  bountyMinStake: [1, 100],
  bountyMaxStake: [1, 500],
  bountyMissExtra: [0, 300],
  targetStandards: [0, 5000],
  actsCount: [1, 10],
  roundsPerAct: [1, 10],
};

type Row = [id: string, emoji: string, name: string, desc: string, price: number, type: ItemType, extra?: Partial<Item>];

const SPIRIT_BUNDLES = [
  { qty: 5, cost: 60, points: 17 },
  { qty: 10, cost: 105, points: 35 },
];

/** Descriptions may use {group} and {groups}; the theme fills them in. */
const SHELF: Row[] = [
  ['spirit', '🥃', 'Spirit', 'A shot of spirits. 5 or 10 at once is cheaper and scores more.', 15, 'drink', { std: 1, points: 3, bundles: SPIRIT_BUNDLES }],
  ['mystery-spirit', '❓', 'Mystery Spirit', 'A blind shot: priced like a Spirit, but nobody knows what gets poured.', 15, 'drink', { std: 1, points: 3, bundles: SPIRIT_BUNDLES }],
  ['soju-shot', '🍶', 'Soju Shot', 'A single soju shot: weaker, cheaper, fewer points.', 7, 'drink', { std: 0.7, points: 1 }],
  ['soju-bottle', '🍾', 'Soju Bottle', 'A whole bottle of soju for the {group} to share (about 8 shots). Poured as one bottle.', 42, 'drink', { std: 4.7, points: 9 }],
  ['wine', '🍷', 'Wine', 'A glass of wine. By the glass only.', 25, 'drink', { std: 1.5, points: 4 }],
  ['mystery-cocktail', '🍹', 'Mystery Cocktail', 'A shot of the house mystery cocktail. 5 or 10 at once is cheaper and scores more.', 18, 'drink', { std: 1, points: 4, bundles: [{ qty: 5, cost: 72, points: 22 }, { qty: 10, cost: 126, points: 46 }] }],
  ['mystery-box', '🎁', 'Mystery Box', 'Opens in Act 2. Could be: a Reflect for next round (drinks aimed at you bounce back to their senders, with their points); 1–5 random drinks landing on your {group} or another one this round; a rare jackpot; or a Pickpocket: pick any {group} and take half its cash (more likely if you’re in the bottom half). No refunds.', 30, 'mystery'],
  ['no-chasers', '🚫', 'No Chasers', 'Every drink your {group} sends this round has to be taken neat: no mixer, no chaser. Covers drinks you already sent this round that haven’t been poured yet.', 50, 'nochaser'],
  ['burner-phone', '🕶️', 'Burner Phone', 'From the moment you buy it until this round ends, every drink your {group} sends shows as Anonymous everywhere. Buy it first, then send. The hosts still know.', 45, 'ghost'],
  ['eye-spy', '👁️', 'Eye Spy', 'At the start of next round, see who has sent drinks to whom, round by round. One per round.', 40, 'eyespy'],
  ['open-bounty', '🎯', 'Open Bounty', 'Stake some of your points. Starting next round, send 7 drinks within 3 rounds and win your stake back multiplied. Miss and you lose the stake and the same again, and owe 3 Spirit shots. One bounty at a time.', 0, 'bounty', { bounty: 'open' }],
  ['winners-bounty', '🏅', 'Winner’s Bounty', 'Only for the {group} that just won this round’s game. Stake some of your points; send 7 drinks within 3 rounds starting next round and win a bigger multiple back. Miss and you lose the stake and the same again, and owe 3 Spirit shots.', 0, 'bounty', { bounty: 'winner' }],
  // Only ever won from a Mystery Box, so it starts off the shelf.
  ['reflect', '🪞', 'Reflect', 'Every drink aimed at your {group} next round bounces back to its sender, and scores for you.', 60, 'reflect', { active: false }],
];

export function defaultItems(): Item[] {
  return SHELF.map(([id, emoji, name, desc, price, type, extra]) => ({
    id,
    emoji,
    name,
    desc,
    price,
    type,
    stock: null,
    active: true,
    points: 0,
    bundles: [],
    bounty: null,
    std: null,
    ...extra,
  }));
}

/** The party's own games: [name, players per team (0 = everyone), run by, rules]. */
export const STARTER_GAMES: [string, number, RunBy, string][] = [
  ['Chinese charades', 0, 'host', 'Team relay: one acts it out, the {group} guesses, then the next person goes.'],
  ['Chinese dance', 0, 'host', 'All {groups} dance; the hosts judge the placings.'],
  ['Basketball', 1, 'host', 'One shooter per {group}.'],
  ['Cup shooting', 1, 'host', 'One shooter per {group}.'],
  ['Trivia', 0, 'trivia', 'Questions on the TV and your {group}’s phone. First tap counts.'],
  ['Cold War drinking', 0, 'coldwar', 'Pick 1–15 shots in secret. The two lowest drink theirs plus the two highest {groups}’ shots.'],
  ['Is Jason lying?', 1, 'host', 'Jason tells a story; your player calls truth or lie. The hosts score it.'],
  ['Dark room cuffs', 1, 'host', ''],
  ['Make Edwin laugh', 1, 'host', 'One player per {group} tries to crack Edwin.'],
  ['Flip cup', 0, 'host', 'Team relay: drink, flip the cup from the edge of the table, next person goes.'],
  ['1 minute chess', 1, 'host', 'One player per {group}, one minute on the clock.'],
  ['Lights off you move, lights on you freeze', 0, 'host', 'Everyone plays. Caught moving when the lights come on and you’re out.'],
  ['Flip 7', 1, 'host', 'One player per {group} plays a hand of Flip 7.'],
  ['Prisoner’s Dilemma', 0, 'dilemma', 'Your {group} is paired with another for every turn. Each turn both secretly pick Stay Silent or Snitch. Both silent: 3 points and 1 shot each. One snitches: the snitch gets 5 points and no shots, the silent {group} 0 points and 5 shots. Both snitch: 1 point and 3 shots each. Most points wins.'],
  ['Two-Thirds of the Average', 0, 'twothirds', 'Every {group} secretly picks a number from 0 to 100. Closest to two-thirds of the average of all picks wins. The furthest {group} drinks a shot for every 10 it was off.'],
  ['Anime opening guessing', 0, 'anime', 'An anime opening plays in the room. Type the anime on your {group}’s phone: only the first {group} to get it right scores.'],
];

export function blankGame(id: string, name: string): GameDef {
  return {
    id,
    name,
    desc: '',
    rules: '',
    rulesVersion: 1,
    playersNeeded: 1,
    status: 'upcoming',
    results: null,
    runBy: 'host',
    questions: [],
    questionsText: '',
    stories: 5,
    openings: [],
    openingsText: '',
  };
}
