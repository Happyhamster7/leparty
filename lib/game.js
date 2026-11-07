// Core game state + rules for Shifty Shen's Slammer.
// Everything here is plain data manipulation so it can be tested without sockets.
const crypto = require('crypto');

class GameError extends Error {}
const fail = (msg) => {
  throw new GameError(msg);
};
const uid = () => crypto.randomBytes(6).toString('hex');
const secret = () => crypto.randomBytes(18).toString('hex');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Block codes skip letters and digits that look alike (0/O, 1/I/L, 8/B).
const CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY234679';
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const toInt = (v, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};
const toBool = (v) => v === true || v === 'true' || v === 'on';
const cleanText = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Multi-line game rules: keep line breaks, tidy each line.
const cleanRules = (v) =>
  String(v ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1200);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const HOLDING = 'holding'; // pseudo team id used as a commissary target

// The two hosts have identical powers; the title only changes how they show up in the feed.
const HOSTS = {
  warden: { name: 'Warden', title: 'The Warden' },
  officer: { name: 'Commissary Officer', title: 'The Commissary Officer' },
};
const hostTitle = (role) => HOSTS[role]?.title || 'The Warden';

const CHARGES = [
  'Grand Theft Auto-Tune',
  'Excessive Vibing in a No-Vibe Zone',
  'Aggravated Karaoke',
  'Possession of an Illegal Amount of Drip',
  'Unlicensed Dad Jokes',
  'First-Degree Double Dipping',
  'Loitering With Intent to Party',
  'Impersonating a DJ',
  'Conspiracy to Commit Shenanigans',
  'Felony Ghosting',
  'Reckless Endangerment of the Dance Floor',
  'Smuggling Snacks Past Security',
  'Breaking and Entering the Group Chat',
  'Tax Evasion (Bar Tab)',
  'Assault With a Deadly Playlist',
  'Arson (Too Hot)',
  'Public Display of Being Shifty',
  'Embezzling Shots',
  'Resisting a Rest',
  'Being an Accessory to Shen',
];

const TEAM_COLORS = ['#ff7a00', '#2f80ed', '#27ae60', '#eb5757', '#9b51e0', '#f2c94c', '#56ccf2', '#e91e63'];

const ITEM_TYPES = {
  drink: { label: 'Send drinks', target: 'team' },
  supply: { label: 'For your block', target: null },
  gift: { label: 'Send a drink', target: 'team' },
  punishment: { label: 'Punishment', target: 'team' },
  bail: { label: 'Bail bond', target: 'holdingPlayer' },
  deflect: { label: 'Deflect card', target: null },
  reflect: { label: 'Reflect', target: null },
  eyespy: { label: 'Eye Spy', target: null },
  mystery: { label: 'Mystery Box', target: null },
  ghost: { label: 'Burner Phone', target: null },
  nochaser: { label: 'No Chasers', target: null },
  bounty: { label: 'Bounty', target: null },
  warp: { label: 'Wish (gacha pull)', target: null },
};

// The night runs in four acts. Hosts flip between them; each one reskins every screen and switches on its own mechanics.
// Act lineups. Every act runs one of four rule sets (its `engine`: gta, genshin, tft or amongus);
// an act can rename that engine's money, items, prizes, roles, riddles and patrons.
const ARCADE_ACTS = [
  {
    id: 'gta',
    engine: 'gta',
    landscape: false,
    numeral: 'I',
    name: 'Vice City',
    game: 'GTA',
    emoji: '🌴',
    tagline: 'Hit the streets. Every block for itself.',
    currency: { symbol: '$', name: 'cash' },
    splash: { passed: 'Mission passed', failed: 'Mission failed', kicked: 'Wasted' },
    rules: [
      'Stick-Ups are on the shelf: rob another block of 10 cash. They can deflect it back at you.',
      'Your wanted level sits in the top corner. Owed drinks, open punishments and the Holding Cell all raise it.',
    ],
  },
  {
    id: 'genshin',
    engine: 'genshin',
    landscape: true,
    numeral: 'II',
    name: 'Wish Upon Teyvat',
    game: 'Genshin Impact',
    emoji: '✨',
    tagline: 'Ad astra abyssosque. Wish responsibly.',
    currency: { symbol: '✦', name: 'Primogems' },
    splash: { passed: 'Challenge completed', failed: 'Challenge failed', kicked: 'Party defeated' },
    rules: [
      'Turn your phone sideways: this act is played in landscape, like the game.',
      'Wish on the event banner for your whole party: Wish ×1 or Wish ×10. 3★ is mostly trash, 4★ is decent, 5★ is a jackpot.',
      'Pity: your party’s 8th wish without a 5★ is a guaranteed 5★.',
      'Some wishes hand the wisher drinks to give out to anyone.',
    ],
  },
  {
    id: 'tft',
    engine: 'tft',
    landscape: true,
    numeral: 'III',
    name: 'Convergence',
    game: 'TFT',
    emoji: '♟️',
    tagline: 'Econ, streak, augment. Top four or bust.',
    currency: { symbol: '🪙', name: 'gold' },
    splash: { passed: 'Victory', failed: 'Defeat', kicked: 'Eliminated' },
    rules: [
      'Each block picks one Augment from three (the Shot Caller picks, if you have one). It lasts the whole act.',
      'Interest: after every game, each block earns 1 gold per 10 it hasn’t spent, up to 5. Saving pays.',
      'Streaks: win or lose heats in a row for bonus gold: +1 at 2, +2 at 3, +3 at 4 or more.',
    ],
  },
  {
    id: 'amongus',
    engine: 'amongus',
    landscape: true,
    numeral: 'IV',
    name: 'Emergency Meeting',
    game: 'Among Us',
    emoji: '🚨',
    tagline: 'There is an Impostor among us. Maybe several.',
    currency: { symbol: '', name: 'credits' },
    splash: { passed: 'Victory', failed: 'Defeat', kicked: 'Ejected' },
    rules: [
      'Snitches are Impostors now, and the stakes double: sabotage skims twice as much, and catching one pays double.',
      'Every Block Vote is an Emergency Meeting. Find them before the final reveal.',
    ],
  },
];

// The Long Night: one night at Slammer Penitentiary, told in four chapters.
const LONG_NIGHT_ACTS = [
  {
    id: 'booking',
    engine: 'gta',
    numeral: 'I',
    name: 'Booking Day',
    game: 'Shawshank',
    emoji: '🗂️',
    tagline: 'Welcome to Slammer Penitentiary. Smile for the mugshot.',
    currency: { symbol: '🍜', name: 'soups' },
    splash: { passed: 'Good behaviour', failed: 'Written up', kicked: 'Transferred' },
    itemSkin: { emoji: '🧼', name: 'Cell Toss', desc: 'Toss another block’s cells and pocket up to 10 of their soups. They can deflect it back at you.' },
    words: { wanted: 'Rap sheet' },
    rules: [
      'Ramen is currency in here: every credit is a soup.',
      'Cell Tosses are on the shelf: raid another block and pocket up to 10 of their soups. They can deflect it back at you.',
      'Your rap sheet is in the top corner. Owed drinks, open punishments and the Holding Cell all add stars.',
    ],
  },
  {
    id: 'arkham',
    engine: 'genshin',
    numeral: 'II',
    name: 'Arkham Asylum',
    game: 'Batman villains',
    emoji: '🃏',
    tagline: 'The inmates are running the asylum.',
    currency: { symbol: '❓', name: 'Riddler tokens' },
    splash: { passed: 'Ha! Ha! Ha!', failed: 'Foiled again', kicked: 'Recaptured' },
    itemSkin: { emoji: '🃏', name: 'Joker’s Wild', desc: 'Draw from the Joker’s deck for your gang. A royal flush is guaranteed on pity.' },
    prizes: {
      5: [
        { emoji: '🂡', name: 'Royal Flush', text: '+40 Riddler tokens for your gang', credits: 40 },
        { emoji: '🗝️', name: 'Get Out of Arkham Free', text: 'A free Deflect card', deflect: 1 },
        { emoji: '🤡', name: 'Joker Gas', text: '25 credits', credits: 25 },
      ],
      4: [
        { emoji: '🐧', name: 'Penguin’s Stash', text: '+12 Riddler tokens for your gang', credits: 12 },
        { emoji: '🪞', name: 'Hall of Mirrors', text: 'A free Deflect card', deflect: 1 },
        { emoji: '💉', name: 'Bribed Orderly', text: '15 credits', credits: 15 },
        { emoji: '😂', name: 'Laughing Gas', text: '10 credits', credits: 10 },
      ],
      3: [
        { emoji: '🐔', name: 'Rubber Chicken', text: '+3 back', credits: 3 },
        { emoji: '💨', name: 'Whoopee Cushion', text: 'Nothing. Absolutely nothing.' },
        { emoji: '🥧', name: 'Pie in the Face', text: 'The drawer takes a sip', sip: 1 },
      ],
    },
    visions: {
      Pyro: { label: 'Joker', emoji: '🃏', color: '#8e44c9', resonance: 'Clown Posse' },
      Hydro: { label: 'Killer Croc', emoji: '🐊', color: '#4f8a3c', resonance: 'Sewer Kings' },
      Anemo: { label: 'Scarecrow', emoji: '🎃', color: '#c98b3a', resonance: 'Fear Toxin' },
      Electro: { label: 'Riddler', emoji: '❓', color: '#2fbf5a', resonance: 'Riddle Me This' },
      Dendro: { label: 'Poison Ivy', emoji: '🌿', color: '#2e9e6a', resonance: 'Green Thumbs' },
      Cryo: { label: 'Mr. Freeze', emoji: '❄️', color: '#7fd0f0', resonance: 'Cold Snap' },
      Geo: { label: 'Bane', emoji: '💪', color: '#7a7f8a', resonance: 'Venom Rush' },
    },
    commissions: [
      'Riddle me this: get someone to tell you their villain origin story',
      'Make three different people laugh like the Joker',
      'Find someone with your patron villain and plot something',
      'Mr. Freeze insists: finish a full glass of water',
      'Convince a host you are perfectly, completely sane',
      'Leave a riddle for another block and get them to solve it',
      'Speak in your best Bane voice for one whole sentence',
      'Get someone to swap seats with you without saying why',
      'Show someone a card trick (or fake one convincingly)',
      'Strike your most villainous pose for a photo',
      'Compliment someone’s costume, fully in character',
      'Trade an accessory with someone for ten minutes',
    ],
    words: {
      menu: 'Patient File', rank: 'Threat Level', world: 'Security Tier', vision: 'Patron', uid: 'Patient no.',
      commissions: 'Riddler’s Riddles', guild: 'the Riddler', banner: 'The Joker’s Deck', bannerTag: 'Wild Card',
      bannerSub: 'Featured gang', draw: 'Draw', drew: 'drew', pity: 'Guaranteed royal flush within', party: 'Your Gang', resonance: 'Gang bonus',
      bannerCopy: 'Draw for your whole gang with Riddler tokens. Higher odds of a royal flush!',
      topList: 'Most Dangerous Patients', complete: 'Solved', completeBtn: 'Solve',
    },
    rules: [
      'Draw from the Joker’s deck for your whole gang: one card, or ten. Mostly jokes, sometimes a jackpot.',
      'Every 8th draw without a royal flush is a guaranteed royal flush.',
      'Solve the Riddler’s four riddles in your Patient File for Riddler tokens and Threat Level.',
      'Everyone has a patron villain. Two of the same on one block is a gang bonus on every riddle.',
    ],
  },
  {
    id: 'heist',
    engine: 'tft',
    numeral: 'III',
    name: 'The Heist',
    game: 'Money Heist',
    emoji: '🎭',
    tagline: 'Nobody gets hurt. Everybody gets paid.',
    currency: { symbol: '€', name: 'euros' },
    splash: { passed: 'Vault cracked', failed: 'Alarm tripped', kicked: 'Burned' },
    augments: {
      windfall: { emoji: '🏦', name: 'Berlin', desc: 'Leads the first vault run: +20 € right now.' },
      rich: { emoji: '🧠', name: 'The Professor', desc: '+5 € now, and the printing press pays your block up to 10.' },
      hustler: { emoji: '🖨️', name: 'Nairobi', desc: 'Runs the presses: everything in the shop costs 25% less.' },
      hunt: { emoji: '🔫', name: 'Denver', desc: '+4 € every time your block wins a heat.' },
      built: { emoji: '🛡️', name: 'Helsinki', desc: 'Muscle: a free Deflect card and a free Bribe, right now.' },
      crown: { emoji: '🔥', name: 'Tokyo', desc: '+30 € now, but everyone on the block owes 2 drinks.' },
    },
    words: { augment: 'heist role', augmentPick: 'Pick your crew’s heist role', play: 'THE PLAN', interest: 'The printing press ran', streak: 'Heist streak' },
    rules: [
      'Each crew picks one heist role from three (the Shot Caller picks): Berlin, Nairobi, Tokyo and friends.',
      'The printing press: after every game, each block earns 1 € per 10 it hasn’t spent, up to 5.',
      'Win or lose heats in a row for streak money: +1 at 2, +2 at 3, +3 at 4 or more.',
    ],
  },
  {
    id: 'escape',
    engine: 'amongus',
    numeral: 'IV',
    name: 'The Great Escape',
    game: 'Prison Break',
    emoji: '🔦',
    tagline: 'Lights out at midnight. There’s a rat in every block.',
    currency: { symbol: '', name: 'favours', short: 'favours' },
    splash: { passed: 'Over the wall', failed: 'Back in your cell', kicked: 'Thrown to the guards' },
    words: { snitch: 'Rat', meeting: 'Lockdown', meetingSub: 'Find the rat', task: 'Escape plan', onTask: '🔦 Digging', inMeeting: '🚨 Lockdown' },
    rules: [
      'Snitches are rats now, and the stakes double: sabotage skims twice as much, and catching one pays double.',
      'Every Block Vote is a Lockdown. Find the rats before the escape.',
    ],
  },
];

// One look all night: the pixel skin, no act changes and no act-only mechanics.
const SLAMMER_ACT = {
  id: 'slammer',
  engine: 'pixel',
  numeral: 'I',
  name: 'The Slammer',
  game: 'Pixel',
  emoji: '🔒',
  tagline: 'Do the crime, do the time, do the shots.',
  currency: { symbol: '$', name: 'cash' },
  splash: { passed: 'Good behaviour', failed: 'Written up', kicked: 'Transferred' },
  rules: [
    'Win games to earn cash ($) for your block.',
    'Send drinks to other blocks from the Commissary. Each drink costs cash and scores points: Spirit 3, Soju Shot 1, Soju Bottle 9, Wine 4, Mystery Cocktail 4. Sending 5 or 10 Spirits or Cocktails at once is cheaper and scores extra.',
    'Drinks land on a block, not a person: the block decides who drinks them.',
    'Most points at the end of the night wins.',
  ],
};

const ACT_SETS = {
  single: { name: 'One look all night (no acts)', acts: [SLAMMER_ACT] },
  longnight: { name: 'The Long Night (prison & villains)', acts: LONG_NIGHT_ACTS },
  arcade: { name: 'Game Night (GTA, Genshin, TFT, Among Us)', acts: ARCADE_ACTS },
};
const ALL_ACTS = [SLAMMER_ACT, ...LONG_NIGHT_ACTS, ...ARCADE_ACTS];
const ENGINES = ['gta', 'genshin', 'tft', 'amongus'];

// TFT act: each block picks one of three.
const AUGMENTS = {
  windfall: { emoji: '🎁', name: 'Windfall', desc: '+20 gold right now.' },
  rich: { emoji: '💰', name: 'Rich Get Richer', desc: '+5 gold now, and your interest cap rises from 5 to 10.' },
  hustler: { emoji: '🏷️', name: 'Hustler', desc: 'Everything in the shop costs 25% less for your block.' },
  hunt: { emoji: '🗡️', name: 'Thrill of the Hunt', desc: '+4 gold every time your block wins a heat.' },
  built: { emoji: '🛡️', name: 'Built Different', desc: 'A free Deflect card and a free Bribe, right now.' },
  crown: { emoji: '👑', name: 'Cursed Crown', desc: '+30 gold now, but everyone on the block owes 2 drinks.' },
};

// Genshin act: every inmate gets a Vision; two or more of one element on a block is an Elemental Resonance.
const VISIONS = {
  Pyro: { color: '#ef7938', resonance: 'Fervent Flames' },
  Hydro: { color: '#4cc2f1', resonance: 'Soothing Water' },
  Anemo: { color: '#74c2a8', resonance: 'Impetuous Winds' },
  Electro: { color: '#af8ec1', resonance: 'High Voltage' },
  Dendro: { color: '#a5c83b', resonance: 'Sprawling Greenery' },
  Cryo: { color: '#9fd6e3', resonance: 'Shattering Ice' },
  Geo: { color: '#fab632', resonance: 'Enduring Rock' },
};
// Stable per inmate, so a reload never changes someone's element.
const visionFor = (id) => {
  const names = Object.keys(VISIONS);
  let n = 0;
  for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return names[n % names.length];
};

// Genshin act: four small party quests per inmate, paid in Primogems and Adventure EXP.
const COMMISSIONS = [
  'Clink glasses with someone from another block',
  'Find someone with your Vision and high-five them',
  'Teach someone from another block a secret handshake',
  'Take a group selfie with your whole party',
  'Do your best Paimon: "Paimon is NOT emergency food!"',
  'Get someone to tell you who their main is',
  'Compliment a host on their outfit, to their face',
  'Hydrate: finish a full glass of water',
  'Explain gacha to someone in under 10 seconds',
  'Strike a dramatic Elemental Burst pose for a photo',
  'Make someone laugh without saying a word',
  'Learn the name of someone you just met tonight',
];
const COMMISSION_REWARD = { primos: 2, exp: 100 };
const COMMISSION_BONUS = { primos: 5, exp: 250 };
// Adventure EXP for everything else an inmate does.
const EXP = { wish: 10, drink: 25, sentence: 50 };
const adventureRank = (exp) => Math.min(60, 1 + Math.floor((exp || 0) / 200));

// Genshin act: what a Wish can pull, by rarity.
const WARP_PRIZES = {
  5: [
    { emoji: '💎', name: 'Won the 50/50', text: '+40 Primogems for your party', credits: 40 },
    { emoji: '🌙', name: 'Welkin Moon', text: 'A free Deflect card', deflect: 1 },
    { emoji: '🧟', name: 'Lost the 50/50', text: '25 credits', credits: 25 },
  ],
  4: [
    { emoji: '💰', name: 'Mora Chest', text: '+12 Primogems for your party', credits: 12 },
    { emoji: '🔄', name: 'Constellation', text: 'A free Deflect card', deflect: 1 },
    { emoji: '💵', name: 'Fragile Resin', text: '15 credits', credits: 15 },
    { emoji: '🥃', name: 'Shot to Give', text: '10 credits', credits: 10 },
  ],
  3: [
    { emoji: '🗡️', name: 'Cool Steel', text: '+3 back', credits: 3 },
    { emoji: '🏏', name: 'Debate Club', text: 'Nothing. Absolutely nothing.' },
    { emoji: '🔱', name: 'Black Tassel', text: 'The wisher takes a sip', sip: 1 },
  ],
};

// Drinks a block sends to another block (LeParty's menu). Price and points are per drink;
// ordering exactly a bundle's quantity charges the bundle instead: cheaper, and worth a few more points.
// The receiving block decides who drinks them.
const MAX_DRINKS_PER_ORDER = 10;
// Act mechanics: rules an act switches on for its rounds. Each is a set of optional hooks the engine
// calls while that act is running:
//   actStart(game, act)              the act's first round starts
//   roundStart(game, round)          any round in the act starts
//   results(game, round)             placings are in and prizes paid
//   drinksStart(game, round)         the bar queue is about to be built
//   price(game, team, item, price)   → the price a block pays in the shop
//   points(game, order, points)      → the points a served drink order scores
// Hosts switch mechanics on per act in Setup. Add one with registerMechanic(key, { name, desc, ...hooks }).
const ACT_MECHANICS = {};
function registerMechanic(key, def) {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(key)) throw new Error(`Bad mechanic key: ${key}`);
  ACT_MECHANICS[key] = { name: key, desc: '', ...def };
}

// Games the app runs on the block phones and scores itself. Everything else is host-run.
const APP_GAMES = {
  coldwar: { emoji: '🧊', name: 'Cold War drinking' },
  trivia: { emoji: '❓', name: 'Trivia' },
  lying: { emoji: '🤥', name: 'Is Jason lying?' },
  anime: { emoji: '🎵', name: 'Anime opening guessing' },
  dilemma: { emoji: '🐀', name: 'Prisoner’s Dilemma' },
  twothirds: { emoji: '🧠', name: 'Two-Thirds of the Average' },
};
// The Prisoner's Dilemma, per turn and per block: [points, shots] for my choice against theirs.
const DILEMMA = {
  silent: { silent: [3, 1], snitch: [0, 5] },
  snitch: { silent: [5, 0], snitch: [1, 3] },
};
const TWO_THIRDS_MAX = 100;

// Anime openings, one per line: "Label | right answer | other accepted spelling | …".
function parseOpenings(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [label, ...answers] = line.split('|').map((x) => cleanText(x, 120)).filter(Boolean);
      if (!answers.length) fail(`Opening line ${i + 1}: write "Label | anime | other spellings…".`);
      return { label, answers };
    });
}

// Typed answers forgive case, punctuation, spaces, a leading "the" and a typo or two on longer names.
const squash = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function guessMatches(guess, answers) {
  const g = squash(guess);
  if (!g) return false;
  return answers.some((ans) => {
    const a = squash(ans);
    if (!a) return false;
    if (a === g) return true;
    const slack = a.length >= 12 ? 2 : a.length >= 6 ? 1 : 0;
    return slack > 0 && Math.abs(a.length - g.length) <= slack && editDistance(a, g) <= slack;
  });
}
const COLD_WAR_MAX = 15;

// The party's own games, loaded into the library with one tap in Setup. [name, players per block (0 = whole block), run by, rules]
const STARTER_GAMES = [
  ['Chinese charades', 0, 'host', 'Team relay: one acts it out, the block guesses, then the next person goes.'],
  ['Chinese dance', 0, 'host', 'All blocks dance; the hosts judge the placings.'],
  ['Basketball', 1, 'host', 'One shooter per block.'],
  ['Cup shooting', 1, 'host', 'One shooter per block.'],
  ['Trivia', 0, 'trivia', 'Questions on the TV and your block’s phone. First tap counts.'],
  ['Cold War drinking', 0, 'coldwar', 'Pick 1–15 shots in secret. The two lowest drink theirs plus the two highest blocks’ shots.'],
  ['Is Jason lying?', 1, 'host', 'Jason tells a story; your player calls truth or lie. The hosts score it.'],
  ['Dark room cuffs', 1, 'host', ''],
  ['Make Edwin laugh', 1, 'host', 'One player per block tries to crack Edwin.'],
  ['Flip cup', 0, 'host', 'Team relay: drink, flip the cup from the edge of the table, next person goes.'],
  ['1 minute chess', 1, 'host', 'One player per block, one minute on the clock.'],
  ['Lights off you move, lights on you freeze', 0, 'host', 'Everyone plays. Caught moving when the lights come on and you’re out.'],
  ['Flip 7', 1, 'host', 'One player per block plays a hand of Flip 7.'],
  ['Prisoner’s Dilemma', 0, 'dilemma', 'Your block is paired with another for every turn. Each turn both blocks secretly pick Stay Silent or Snitch. Both silent: 3 points and 1 shot each. One snitches: the snitch gets 5 points and no shots, the silent block 0 points and 5 shots. Both snitch: 1 point and 3 shots each. Most points wins.'],
  ['Two-Thirds of the Average', 0, 'twothirds', 'Every block secretly picks a number from 0 to 100. Closest to two-thirds of the average of all picks wins. The furthest block drinks a shot for every 10 it was off.'],
  ['Anime opening guessing', 0, 'anime', 'An anime opening plays in the room. Type the anime on your block’s phone: only the first block to get it right scores.'],
];

// Trivia questions, one per line: "Question | answer A | answer B | answer C | answer D | B".
// Two to four answers; the last field is the right one, as a letter, a number or the answer itself.
function parseTrivia(text) {
  const out = [];
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = line.split('|').map((x) => cleanText(x, 160)).filter(Boolean);
      if (parts.length < 4) fail(`Trivia line ${i + 1}: write "Question | answer | answer | … | right answer".`);
      const [q, ...rest] = parts;
      const key = rest.pop();
      const options = rest.slice(0, 4);
      let answer = /^[A-Da-d]$/.test(key) ? key.toUpperCase().charCodeAt(0) - 65 : /^[1-4]$/.test(key) ? Number(key) - 1 : options.findIndex((o) => o.toLowerCase() === key.toLowerCase());
      if (!(answer >= 0 && answer < options.length)) fail(`Trivia line ${i + 1}: the last part should say which answer is right (A–${String.fromCharCode(64 + options.length)}).`);
      out.push({ q, options, answer });
    });
  return out;
}

// Bump when the stocked shelf changes; older saves get any missing LeParty items on load.
const CATALOGUE = 4;
// Bounties: send this many drinks within this many rounds (the buying round counts as the first).
// Bounties are bought with points, not cash: the block stakes points, and hitting the target pays the stake
// back multiplied (3x for an Open Bounty, 5x for the Winner's Bounty). Missing loses the stake.
const BOUNTY = { target: 7, rounds: 3, missQty: 3, missDrink: 'Spirit' };
// The night's money is tuned so blocks can send about this many standard drinks in total.
const ECONOMY = 9;
// Off the shelf tonight: mixers and ice, and the stash (Deflect Card, Bail Bond, wishes).
const RETIRED_TYPES = ['supply', 'deflect', 'bail', 'warp'];
// What a Mystery Box can pour, and how many (1 to MYSTERY.maxQty), on your block or another.
const MYSTERY = { drinks: ['Soju Shot', 'Spirit', 'Mystery Cocktail'], maxQty: 5, fromRound: 2, jackpot: 100, pickpocketShare: 0.5 };
const OLD_PRIZES = [90, 75, 65, 55, 45, 40, 30, 20];
const PRIZES = [44, 36, 30, 25, 21, 18, 15, 11]; // 8 blocks: $200 a round, about $2,400 over 12 rounds
// What a block can take when it hits a Winner's Bounty. Each lasts the rest of the night and stacks.
const WINNER_REWARDS = {
  bonus: { emoji: '🎁', name: 'Bonus drinks', desc: 'Every order you send lands with +1 extra drink on the target, free.' },
  fewer: { emoji: '🛡️', name: 'Fewer drinks', desc: 'Every order sent to your block lands with 1 fewer drink.' },
  points: { emoji: '⭐', name: '+1 point per drink', desc: 'Every drink you send scores 1 extra point.' },
};
const ordinalOf = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
// LeParty's items. Reflect and the bounties only make sense inside a round.
const LEPARTY_ITEMS = [
  ['🎁', 'Mystery Box', 'Opens from round 2. Could be: a Reflect for next round (drinks aimed at you bounce back to their senders, with their points); 1–5 random drinks (Soju Shot, Spirit or Mystery Cocktail) landing on your block or another one this round; a rare $100 Jackpot; or a Pickpocket: pick any block and take half its cash (more likely if you’re in the bottom half). No refunds.', 30, 'mystery'],
  ['🚫', 'No Chasers', 'Every drink your block sends this round has to be taken neat: no mixer, no chaser. Covers drinks you already sent this round that haven’t been poured yet.', 50, 'nochaser'],
  ['🕶️', 'Burner Phone', 'From the moment you buy it until this round ends, every drink your block sends shows as Anonymous on the TV, in the feed, to the blocks you hit and in Eye Spy. Buy it first, then send. The hosts still know.', 45, 'ghost'],
  ['👁️', 'Eye Spy', 'At the start of next round, see who has sent drinks to whom, round by round. One per round.', 40, 'eyespy'],
  ['🎯', 'Open Bounty', 'Stake some of your points. Starting next round, send 7 drinks within 3 rounds and win 5× your stake back. Miss and you lose the stake AND the same again, and owe 3 Spirit shots. One bounty at a time.', 0, 'bounty', { bounty: 'open' }],
  ['🏅', 'Winner’s Bounty', 'Only for the block that just won this round’s game. Stake some of your points; send 7 drinks within 3 rounds starting next round and win 8× your stake back. Miss and you lose the stake AND the same again, and owe 3 Spirit shots.', 0, 'bounty', { bounty: 'winner' }],
];
const DRINK_MENU = [
  ['🥃', 'Spirit', 'A shot of spirits. 5 or 10 at once is cheaper and scores more.', 15, 'drink', { std: 1, points: 3, bundles: [{ qty: 5, cost: 60, points: 17 }, { qty: 10, cost: 105, points: 35 }] }],
  ['❓', 'Mystery Spirit', 'A blind shot: priced like a Spirit, but nobody knows what gets poured.', 15, 'drink', { std: 1, points: 3, bundles: [{ qty: 5, cost: 60, points: 17 }, { qty: 10, cost: 105, points: 35 }] }],
  ['🍶', 'Soju Shot', 'A single soju shot: weaker, cheaper, fewer points.', 7, 'drink', { std: 0.7, points: 1 }],
  ['🍾', 'Soju Bottle', 'A whole bottle of soju for the block to share (about 8 shots). Poured as one bottle.', 42, 'drink', { std: 4.7, points: 9 }],
  ['🍷', 'Wine', 'A glass of wine. By the glass only.', 25, 'drink', { std: 1.5, points: 4 }],
  ['🍹', 'Mystery Cocktail', 'A shot of the house mystery cocktail. 5 or 10 at once is cheaper and scores more.', 18, 'drink', { std: 1, points: 4, bundles: [{ qty: 5, cost: 72, points: 22 }, { qty: 10, cost: 126, points: 46 }] }],
];

function defaultItems() {
  const items = [
    ['🍋', 'Lime & Soda Water', 'Mixer delivered to your block.', 5, 'supply'],
    ['🥤', 'Red Bull', 'Energy mixer delivered to your block.', 10, 'supply'],
    ['🧃', 'Juice Box Mixer', 'OJ / cran / pineapple for your block.', 8, 'supply'],
    ['🧊', 'Ice Run', 'A fresh bucket of ice for your block.', 4, 'supply'],
    ...DRINK_MENU,
    ...LEPARTY_ITEMS,
    ['🥵', 'Shot Penalty', 'Everyone in the target takes a penalty drink.', 25, 'punishment', { drinks: 1 }],
    ['⛓️', 'Chain Gang', 'Target must stay linked arm-in-arm for the next game.', 20, 'punishment'],
    ['💪', 'Yard Drills', '10 push-ups (or squats) for everyone in the target.', 12, 'punishment'],
    ['🔍', 'Shakedown', 'Guards raid the target block: they lose 15 credits.', 20, 'punishment', { drain: 15 }],
    ['🎤', 'Confession Booth', 'Target must sing a chorus of a song of your choice.', 15, 'punishment'],
    ['🔑', 'Bail Bond', 'Spring someone out of the Holding Cell and onto your block.', 30, 'bail'],
    ['🔄', 'Deflect Card', 'Bounce an incoming punishment back to whoever sent it.', 30, 'deflect'],
    ...actItems(),
  ];
  return items.map(itemFromRow).map((i) => (RETIRED_TYPES.includes(i.type) ? { ...i, active: false } : i));
}

// Shelf items that only show up during one act.
function actItems() {
  return [
    ['🔫', 'Stick-Up', 'Rob another block: steal up to 10 of their cash. They can deflect it back at you.', 12, 'punishment', { drain: 10, steal: true, act: 'gta' }],
    ['✨', 'Intertwined Fate', 'One wish on the event banner for your party. Guaranteed 5★ on pity.', 10, 'warp', { act: 'genshin' }],
  ];
}

// Items that put drinks in front of another block: drinks, gifts, and punishments that carry penalty drinks.
function sendsDrinks(item) {
  return item.type === 'drink' || item.type === 'gift' || (item.type === 'punishment' && item.drinks > 0);
}

// Cost and points of ordering qty of a drink: a matching bundle, or straight per-drink rates.
function quoteDrinks(item, qty) {
  const bundle = (item.bundles || []).find((b) => b.qty === qty);
  return bundle ? { cost: bundle.cost, points: bundle.points, bundle } : { cost: item.price * qty, points: (item.points || 0) * qty, bundle: null };
}

function itemFromRow([emoji, name, desc, price, type, extra]) {
  return ({
    id: uid(),
    emoji,
    name,
    desc,
    price,
    type,
    stock: null,
    active: true,
    drain: extra?.drain ?? 0,
    drinks: extra?.drinks ?? 0,
    steal: extra?.steal ?? false,
    act: extra?.act ?? null,
    points: extra?.points ?? 0,
    bundles: extra?.bundles ?? [],
    bounty: extra?.bounty ?? null,
    std: extra?.std ?? null,
  });
}


function defaultSettings() {
  return {
    partyName: 'Shifty Shen\'s Slammer',
    tagline: 'Do the crime, do the time, do the shots.',
    houseRules: 'Every drink can be swapped for a water or a sip — no questions asked. Look after each other.',
    spendMode: 'request', // anyone | request | captain
    requestSeconds: 2,
    startingBudget: 40,
    maxBlockSize: 10,
    lepartyEventId: '', // the LeParty event whose check-ins and blocks this night mirrors
    holdingDrinks: 1,
    holdingRules: 'Drink 1 extra per round. Play every game with your weak hand. Address everyone on a block as "boss".',
    actSet: 'single', // which act lineup the night runs: single (one look, no acts), longnight or arcade
    introVideos: {}, // optional video link per act id; blank plays the built-in trailer
    clipsEnabled: true,
    clipsNeedApproval: false, // true: a host okays each Shot Cam clip before the TV shows it
    warpPity: 8,
    warp5: 6,
    warp4: 25,
    shopOpen: true, // false: hosts have closed the commissary; nobody can buy until it reopens
    phoneMode: process.env.PHONE_MODE === 'guest' ? 'guest' : 'team', // team: one phone per block, claimed with the block's code; guest: every guest books in on their own phone
    pickSeconds: 60, // blocks pick their players within this long
    serveSeconds: 30, // each block's time at the bar
    cooldownGames: 2, // anyone who played the last N (non-group) games sits this one out
    questionSeconds: 20, // app-run trivia: time to answer each question
    voteSeconds: 30, // app-run "Is Jason lying?": time to vote on each story
    guessSeconds: 60, // anime openings: time to type the answer
    prizeMoney: [...PRIZES], // cash for 1st, 2nd, ... (later places get the last)
    shopSeconds: 90, // Spending: the shop closes and drinks start when this runs out (0 = the host closes it)
    failPointsPct: 10, // couldn't finish its drinks at the bar: lose this % of its points
    streamStep: 5, // drink income: grows by this each round a block finishes in time ($5, $10, $15…); a miss resets it to 0
    bountyMultiplier: 5, // Open Bounty pays the stake back ×5
    winnerMultiplier: 8, // Winner's Bounty pays the stake back ×8
    bountyMinStake: 5,
    bountyMaxStake: 50,
    bountyMissExtra: 100, // missing a bounty also takes this % of the stake again off the score (never below 0)
    targetStandards: 400, // the night's standard drinks, for the hosts' pace tracker
    actsCount: 4, // the night runs this many acts…
    roundsPerAct: 3, // …of this many rounds; the last round of each act is its final round
  };
}

function defaultState() {
  return {
    version: 2,
    settings: defaultSettings(),
    teams: [],
    players: [],
    items: defaultItems(),
    orders: [],
    games: [],
    feed: [],
    announcement: null,
    hosts: [], // [{ token, role }]
    act: 0, // index into the current lineup's acts
    introAt: 0, // when the TV last started an act intro
    clips: [], // Shot Cam videos for the TV carousel
    actItems: true, // act-only shelf items have been stocked
    drinkMenu: true, // the drink menu replaced the old Send a Round / Buy Them a Shot
    catalogue: CATALOGUE, // LeParty's Reflect, Eye Spy and bounties are stocked, with next-round wording
    economy: ECONOMY, // the money rework: staked bounties, ramping drink income, prizes for ~400 standards
    reflects: [], // { teamId, round }: Reflect bought for a coming round
    rounds: [], // LeParty rounds: game → results → spending → drinks
    penalties: [], // drinks owed into a later round's queue (missed timer, missed bounty)
    bounties: [],
    winner: null, // { teamId, at } once the hosts crown a block
    night: { status: 'draft', confirmedAt: null, acts: [] }, // the night's sequence: each act's name, mechanics and games per round
    leparty: { lastSync: null, eventName: '', error: '', changes: [] }, // the LeParty sync's last result
  };
}

// Solitary and the snitch game are gone: old saves lose their sentences, roles and sabotage tasks.
function normalizePlayer({ solitary, role, revealed, task, tasksDone, dirt, skimmed, dealerDrinks, ...p }) {
  return {
    teamId: null,
    isCaptain: false,
    drinksOwed: 0,
    drinksDone: 0,
    sentences: [],
    adventureExp: 0,
    commissions: [],
    commissionBonus: false,
    ...p,
    vision: VISIONS[p.vision] ? p.vision : visionFor(p.id),
  };
}

class Game {
  constructor(state) {
    this.s = state || defaultState();
    const stocked = !state || state.actItems;
    // Fill in anything added in later versions of the schema.
    const hasDrinkMenu = !state || state.drinkMenu;
    // Read before the defaults below fill the field in, or an old save would look up to date.
    const storedCatalogue = state ? state.catalogue || 0 : CATALOGUE;
    const d = defaultState();
    for (const k of Object.keys(d)) if (this.s[k] === undefined) this.s[k] = d[k];
    const stored = this.s.settings || {};
    this.s.settings = { ...defaultSettings(), ...stored };
    if (stored.spendMode === undefined && stored.captainOnlySpending) this.s.settings.spendMode = 'captain';
    delete this.s.settings.captainOnlySpending;
    for (const k of ['solitaryDrinks', 'solitaryRules', 'tipRounds', 'caughtSnitchRounds']) delete this.s.settings[k];
    if (!hasDrinkMenu) {
      // Older saves: stock the drink menu and retire the two old one-size drink gifts.
      const have = new Set(this.s.items.map((i) => i.name));
      this.s.items.unshift(...DRINK_MENU.filter((r) => !have.has(r[1])).map(itemFromRow));
      for (const i of this.s.items) if (i.type === 'gift' && ['Send a Round', 'Buy Them a Shot'].includes(i.name)) i.active = false;
      this.s.drinkMenu = true;
    }
    for (const i of this.s.items) {
      i.points ??= 0;
      i.bundles ??= [];
    }
    this.ensureActs();
    // Blocks now hold up to 10; saves still on the old default of 5 move up.
    if (!stored.blockSize10) {
      if (!stored.maxBlockSize || stored.maxBlockSize === 5) this.s.settings.maxBlockSize = 10;
      this.s.settings.blockSize10 = true;
    }
    if (this.s.settings.partyName === 'Shifty Shen Slammer') this.s.settings.partyName = "Shifty Shen's Slammer"; // old default
    // The snitch game is gone: drop its state, its settings and its shop items from older saves.
    delete this.s.mafia;
    delete this.s.claims;
    for (const k of ['snitchChance', 'snitchBounty', 'wrongfulPenalty', 'tipDrinks', 'tasksEnabled', 'sabotageSkim', 'snitchRewardDrinks', 'snitchPrize', 'drinksPerSabotage', 'sabotageTasks']) delete this.s.settings[k];
    this.s.items = this.s.items.filter((i) => !['intel', 'immunity'].includes(i.type));
    for (const i of this.s.items) if (i.name === 'Snitch Slip') Object.assign(i, { name: 'Deflect Card', desc: 'Bounce an incoming punishment back to whoever sent it.' });
    this.s.players = this.s.players.map(normalizePlayer);
    if (Array.isArray(this.s.adminTokens)) {
      this.s.hosts.push(...this.s.adminTokens.map((token) => ({ token, role: 'warden' })));
      delete this.s.adminTokens;
    }
    for (const t of this.s.teams) {
      t.inventory = { deflect: 0, ...t.inventory };
      delete t.inventory.immunity;
      delete t.intel;
      t.ledger ||= [];
      t.requests ||= [];
      t.nickname ??= '';
      t.motto ??= '';
      t.pity ??= 0;
      t.streak ??= 0;
      t.augment ??= null;
      t.augmentOffer ??= [];
      t.joinToken ??= secret().slice(0, 16);
      t.joinCode ??= this.newBlockCode();
      t.phoneAt ??= null;
      t.points ??= 0;
      t.bonusPerDrink ??= 0;
      t.bonusDrinks ??= 0;
      t.fewerDrinks ??= 0;
      t.drinkStream ??= 0;
      t.ghostRound ??= null;
      t.noChaserRound ??= null;
      t.pickpockets ??= 0;
      t.reflectUsed ??= false;
      t.eyeSpyAt ??= null;
      t.eyeSpyFrom ??= null;
    }
    for (const g of this.s.games) {
      g.playersNeeded ??= 1;
      g.runBy ??= 'host';
      g.questions ??= [];
      g.questionsText ??= '';
      g.stories ??= 5;
      g.openings ??= [];
      g.openingsText ??= '';
      delete g.solitaryRule;
      delete g.sabotage;
      if (g.name === 'Anime opening guessing' && g.runBy === 'trivia' && !g.questions?.length) g.runBy = 'anime'; // first version used multiple choice
    }
    if (storedCatalogue < CATALOGUE) {
      const have = new Set(this.s.items.map((i) => i.name));
      this.s.items.push(...LEPARTY_ITEMS.filter((r) => !have.has(r[1])).map(itemFromRow));
      for (const row of LEPARTY_ITEMS) {
        const it = this.s.items.find((i) => i.name === row[1]);
        if (it) it.desc = row[2]; // power-ups now start the round after they're bought
      }
      this.s.catalogue = CATALOGUE;
    }
    if ((this.s.economy || 0) < ECONOMY) {
      // The money rework: points-staked bounties, a ramping drink income, and prizes sized for ~400 standards.
      const st = this.s.settings;
      if (st.startingBudget === 20) st.startingBudget = 40;
      if (JSON.stringify(st.prizeMoney) === JSON.stringify(OLD_PRIZES)) st.prizeMoney = [...PRIZES];
      delete st.streakCredits;
      for (const row of [...LEPARTY_ITEMS, ...DRINK_MENU]) {
        const it = this.s.items.find((i) => i.name === row[1]);
        if (!it) continue;
        if (row[4] === 'bounty') Object.assign(it, { desc: row[2], price: 0 });
        if (row[4] === 'mystery') it.desc = row[2];
        if (row[5]?.std != null) it.std ??= row[5].std;
      }
      for (const t of this.s.teams) delete t.drinkStreak;
      // Reflect is only won from a Mystery Box now.
      for (const it of this.s.items) if (it.type === 'reflect') it.active = false;
      if (!this.s.items.some((i) => i.type === 'mystery')) {
        const row = LEPARTY_ITEMS.find((r) => r[4] === 'mystery');
        const at = this.s.items.findIndex((i) => i.type === 'eyespy');
        this.s.items.splice(at < 0 ? this.s.items.length : at, 0, itemFromRow(row));
      }
      if (!this.s.items.some((i) => i.type === 'ghost')) {
        const at = this.s.items.findIndex((i) => i.type === 'eyespy');
        this.s.items.splice(at < 0 ? this.s.items.length : at, 0, itemFromRow(LEPARTY_ITEMS.find((r) => r[4] === 'ghost')));
      }
      if (!this.s.items.some((i) => i.type === 'nochaser')) {
        const at = this.s.items.findIndex((i) => i.type === 'ghost');
        this.s.items.splice(at < 0 ? this.s.items.length : at, 0, itemFromRow(LEPARTY_ITEMS.find((r) => r[4] === 'nochaser')));
      }
      for (const it of this.s.items) if (RETIRED_TYPES.includes(it.type)) it.active = false;
      // Soju splits into a shot and a whole bottle, so the bar pours a bottle as a bottle, not 8 shots.
      const soju = this.s.items.find((i) => i.type === 'drink' && i.name === 'Soju');
      if (soju) Object.assign(soju, { name: 'Soju Shot', desc: DRINK_MENU.find((r) => r[1] === 'Soju Shot')[2], bundles: [] });
      if (!this.s.items.some((i) => i.name === 'Soju Bottle')) {
        const at = this.s.items.findIndex((i) => i.name === 'Soju Shot');
        this.s.items.splice(at < 0 ? this.s.items.length : at + 1, 0, itemFromRow(DRINK_MENU.find((r) => r[1] === 'Soju Bottle')));
      }
      for (const p of this.s.penalties || []) if (p.drinkName === 'Soju') p.drinkName = 'Soju Shot';
      // Riskier, richer bounties: move the old defaults up (a host's own numbers are left alone).
      const st9 = this.s.settings;
      if (st9.bountyMultiplier === 3) st9.bountyMultiplier = 5;
      if (st9.winnerMultiplier === 5) st9.winnerMultiplier = 8;
      if (st9.bountyMaxStake === 30) st9.bountyMaxStake = 50;
      // New app-run games join an existing library (a fresh one gets them with the rest).
      if (this.s.games.length) {
        const have = new Set(this.s.games.map((g) => g.name.toLowerCase()));
        for (const [name, playersNeeded, runBy, rules] of STARTER_GAMES) if (['dilemma', 'twothirds'].includes(runBy) && !have.has(name.toLowerCase())) this.addGame({ name, playersNeeded, runBy, rules, stories: runBy === 'dilemma' ? 3 : undefined });
      }
      this.s.economy = ECONOMY;
    }
    if (!ACT_SETS[this.s.settings.actSet]) this.s.settings.actSet = 'single';
    if (!this.acts[this.s.act]) this.s.act = 0;
    for (const g of this.s.games) {
      g.rules ??= '';
      g.rulesVersion ??= 1;
      g.heats ??= [];
    }
    for (const i of this.s.items) {
      i.drinks ??= 0;
      i.drain ??= 0;
      i.steal ??= false;
      i.act ??= null;
      // Act II used to be Honkai: Star Rail.
      if (i.act === 'honkai') {
        i.act = 'genshin';
        if (i.type === 'warp' && i.name === 'Warp') Object.assign(i, { emoji: '✨', name: 'Intertwined Fate', desc: 'One wish on the event banner for your party. Guaranteed 5★ on pity.' });
      }
    }
    // Saves from before the acts existed get the act-only items stocked once.
    if (!stocked) {
      this.s.items.push(...actItems().map(itemFromRow));
      this.s.actItems = true;
    }
  }

  // ---------- acts ----------
  get acts() {
    return (ACT_SETS[this.s.settings.actSet] || ACT_SETS.single).acts;
  }

  get act() {
    return this.acts[this.s.act] || this.acts[0];
  }

  // Mechanics follow the act's engine, whatever the act is called.
  actIs(engine) {
    return this.act.engine === engine;
  }

  setAct({ index }) {
    const i = toInt(index, -1);
    if (!this.acts[i]) fail('No such act.');
    if (i === this.s.act) return;
    this.s.act = i;
    this.startAct();
  }

  // Runs whenever a new act begins: TV intro, the engine's setup and the feed line.
  startAct() {
    const a = this.act;
    this.s.introAt = Date.now();
    if (a.engine === 'tft') for (const t of this.s.teams) this.offerAugments(t);
    if (a.engine === 'genshin') for (const p of this.s.players) this.dealCommissions(p);
    this.log(`ACT ${a.numeral}: ${a.name.toUpperCase()}. ${a.tagline}`, 'announce', a.emoji);
  }

  // The current act's names for its engine's things.
  augmentInfo(id) {
    return { ...AUGMENTS[id], ...this.act.augments?.[id] };
  }

  skinItem(i) {
    return i && i.act && i.act === this.act.engine && this.act.itemSkin ? { ...i, ...this.act.itemSkin } : i;
  }

  visionsView() {
    const out = {};
    for (const [k, v] of Object.entries(VISIONS)) out[k] = { label: k, ...v, ...this.act.visions?.[k] };
    return out;
  }

  // Genshin act: a fresh set of four, once per inmate per act.
  dealCommissions(p) {
    if (p.commissions.length) return;
    p.commissions = shuffle(this.act.commissions || COMMISSIONS).slice(0, 4).map((text) => ({ id: uid(), text, done: false }));
    p.commissionBonus = false;
  }

  resonance(teamId) {
    const counts = {};
    for (const m of this.members(teamId)) counts[m.vision] = (counts[m.vision] || 0) + 1;
    return Object.keys(counts).filter((v) => counts[v] >= 2);
  }

  completeCommission(playerId, { commissionId }) {
    const p = this.mustPlayer(playerId);
    if (!this.actIs('genshin')) fail('Those are only posted in Act II.');
    const c = p.commissions.find((x) => x.id === commissionId) || fail('That commission is gone.');
    if (c.done) fail('Already turned in.');
    c.done = true;
    p.adventureExp += COMMISSION_REWARD.exp;
    const team = p.teamId ? this.team(p.teamId) : null;
    // A party with an Elemental Resonance earns a little extra on every commission.
    const bonus = team ? this.resonance(team.id).length : 0;
    if (team) this.bank(team, COMMISSION_REWARD.primos + bonus, `Commission: ${p.name}`);
    let all = false;
    if (!p.commissionBonus && p.commissions.every((x) => x.done)) {
      p.commissionBonus = true;
      p.adventureExp += COMMISSION_BONUS.exp;
      if (team) this.bank(team, COMMISSION_BONUS.primos, `Daily Commission bonus: ${p.name}`);
      this.log(`${p.name} finished all four Daily Commissions! The Adventurers' Guild pays out${team ? ` ${COMMISSION_BONUS.primos} Primogems to ${team.name}` : ''}.`, 'team', '📜');
      all = true;
    }
    return { all, primos: team ? COMMISSION_REWARD.primos + bonus : 0, rank: adventureRank(p.adventureExp) };
  }

  // ---------- Shot Cam: blocks film their shots for the TV ----------
  // Checks before the upload, so nobody's video is stored for nothing.
  canClip(playerId) {
    const p = this.mustPlayer(playerId);
    if (!this.s.settings.clipsEnabled) fail('Shot Cam is switched off right now.');
    if (!p.teamId) fail('Only inmates on a block can send clips to the TV.');
    const last = this.s.clips.find((c) => c.playerId === p.id);
    if (last && Date.now() - last.ts < 20000) fail('Easy, director. Wait a few seconds before the next clip.');
    return p;
  }

  addClip(playerId, { url, type, caption }) {
    const p = this.canClip(playerId);
    const clip = {
      id: uid(),
      ts: Date.now(),
      url: String(url),
      type: String(type || 'video/mp4').slice(0, 60),
      caption: cleanText(caption, 80),
      playerId: p.id,
      playerName: p.name,
      teamId: p.teamId,
      status: this.s.settings.clipsNeedApproval ? 'pending' : 'live',
    };
    this.s.clips.unshift(clip);
    // Keep the newest 60; the TV only cycles through what's live.
    const dropped = this.s.clips.splice(60);
    if (clip.status === 'live') this.log(`🎥 ${this.teamName(p.teamId)} sent a Shot Cam clip to the TV${clip.caption ? `: “${clip.caption}”` : ''}.`, 'team', '🎥');
    return { clipId: clip.id, status: clip.status, deleteFiles: dropped.map((c) => c.url) };
  }

  reviewClip({ clipId, action }) {
    const c = this.s.clips.find((x) => x.id === clipId) || fail('That clip is gone.');
    if (action === 'remove') {
      this.s.clips = this.s.clips.filter((x) => x !== c);
      return { deleteFiles: [c.url] };
    }
    if (!['live', 'hidden'].includes(action)) fail('Show, hide or remove.');
    const wasLive = c.status === 'live';
    c.status = action;
    if (action === 'live' && !wasLive) this.log(`🎥 New on the Shot Cam: ${this.teamName(c.teamId)}${c.caption ? ` — “${c.caption}”` : ''}.`, 'team', '🎥');
  }

  // The TV plays the current act's intro whenever this changes.
  playIntro() {
    this.s.introAt = Date.now();
  }

  offerAugments(t) {
    if (!t.augment && !t.augmentOffer.length) t.augmentOffer = shuffle(Object.keys(AUGMENTS)).slice(0, 3);
  }

  // Credits that land outside a game payout show up in the block's account activity.
  bank(t, n, text) {
    t.budget += n;
    t.ledger.unshift({ ts: Date.now(), amount: n, text });
    if (t.ledger.length > 30) t.ledger.length = 30;
  }

  pickAugment(playerId, { augmentId }) {
    const p = this.mustPlayer(playerId);
    if (!this.actIs('tft')) fail('Roles are only on offer in Act III.');
    if (!p.teamId) fail('You need to be on a block to pick an augment.');
    const t = this.mustTeam(p.teamId);
    if (t.augment) fail(`${t.name} already picked ${this.augmentInfo(t.augment).name}.`);
    if (!p.isCaptain && this.members(t.id).some((m) => m.isCaptain)) fail('Your Shot Caller picks the augment.');
    if (!t.augmentOffer.includes(augmentId)) fail('That augment isn’t on offer.');
    const a = this.augmentInfo(augmentId);
    t.augment = augmentId;
    t.augmentOffer = [];
    if (augmentId === 'windfall') this.bank(t, 20, a.name);
    if (augmentId === 'rich') this.bank(t, 5, a.name);
    if (augmentId === 'crown') {
      this.bank(t, 30, a.name);
      for (const m of this.members(t.id)) m.drinksOwed += 2;
    }
    if (augmentId === 'built') {
      t.inventory.deflect++;
    }
    this.log(`${t.name} picked the ${a.name} ${this.act.words?.augment || 'augment'}.${augmentId === 'crown' ? ' Heavy is the head: 2 drinks each.' : ''}`, 'team', a.emoji);
  }

  // TFT act: a heat's top scorer extends its win streak, everyone else its loss streak; long streaks pay.
  payStreaks(teamIds, results) {
    if (!Object.keys(results).length) return;
    const top = Math.max(...teamIds.map((id) => results[id] || 0));
    const paid = [];
    for (const id of teamIds) {
      const t = this.team(id);
      if (!t) continue;
      const won = (results[id] || 0) === top;
      t.streak = won ? Math.max(0, t.streak) + 1 : Math.min(0, t.streak) - 1;
      const len = Math.abs(t.streak);
      let bonus = len >= 4 ? 3 : len === 3 ? 2 : len === 2 ? 1 : 0;
      if (won && t.augment === 'hunt') bonus += 4;
      if (bonus) {
        this.bank(t, bonus, `${won ? 'Win' : 'Loss'} streak ×${len}`);
        paid.push(`${t.name} +${bonus} (${won ? 'win' : 'loss'} streak ×${len})`);
      }
    }
    if (paid.length) this.log(`${this.act.words?.streak || 'Streak gold'}: ${paid.join(', ')}.`, 'money', '🔥');
  }

  payInterest() {
    const paid = [];
    for (const t of this.s.teams) {
      const n = Math.min(t.augment === 'rich' ? 10 : 5, Math.floor(t.budget / 10));
      if (!n) continue;
      this.bank(t, n, this.act.words?.interest ? 'Printing press' : 'Interest');
      paid.push(`${t.name} +${n}`);
    }
    if (paid.length) this.log(`${this.act.words?.interest || 'Interest paid'}: ${paid.join(', ')}.`, 'money', '🪙');
  }

  priceFor(team, item) {
    return this.actIs('tft') && team?.augment === 'hustler' ? Math.ceil(item.price * 0.75) : item.price;
  }

  itemLive(i) {
    return i.active && (!i.act || i.act === this.act.engine);
  }

  // Genshin act: one wish, paid for by the block.
  warp(p, team) {
    const st = this.s.settings;
    team.pity++;
    p.adventureExp += EXP.wish;
    const r = Math.random() * 100;
    const stars = team.pity >= st.warpPity || r < st.warp5 ? 5 : r < st.warp5 + st.warp4 ? 4 : 3;
    if (stars === 5) team.pity = 0;
    const prize = pick((this.act.prizes || WARP_PRIZES)[stars]);
    if (prize.credits) this.bank(team, prize.credits, `Warp: ${prize.name}`);
    if (prize.deflect) team.inventory.deflect += prize.deflect;
    if (prize.sip) p.drinksOwed += prize.sip;
    if (stars === 5) this.log(`${team.name} got a 5★! ${p.name} ${this.act.words?.drew || 'wished'} and hit ${prize.emoji} ${prize.name}: ${prize.text}.`, 'announce', '🌟');
    else if (stars === 4) this.log(`${team.name} got a 4★: ${prize.emoji} ${prize.name}.`, 'shop', '✨');
    return { stars, emoji: prize.emoji, name: prize.name, text: prize.text };
  }

  // ---------- lookups ----------
  team(id) {
    return this.s.teams.find((t) => t.id === id) || null;
  }
  player(id) {
    return this.s.players.find((p) => p.id === id) || null;
  }
  item(id) {
    return this.s.items.find((i) => i.id === id) || null;
  }
  order(id) {
    return this.s.orders.find((o) => o.id === id) || null;
  }
  game(id) {
    return this.s.games.find((g) => g.id === id) || null;
  }
  playerByToken(token) {
    if (!token) return null;
    return this.s.players.find((p) => p.token === token) || null;
  }
  hostRole(token) {
    if (!token) return null;
    return this.s.hosts.find((h) => h.token === token)?.role || null;
  }
  mustTeam(id) {
    return this.team(id) || fail('That block no longer exists.');
  }
  mustPlayer(id) {
    return this.player(id) || fail('That inmate is not in the system.');
  }
  teamName(id) {
    if (id === HOLDING) return 'the Holding Cell';
    return this.team(id)?.name || 'the void';
  }

  // A player is in exactly one place: a block or the Holding Cell.
  status(p) {
    return p.teamId ? 'block' : 'holding';
  }
  members(teamId) {
    return this.s.players.filter((p) => p.teamId === teamId && !p.device);
  }
  holding() {
    return this.s.players.filter((p) => !p.device && this.status(p) === 'holding');
  }

  log(text, kind = 'info', emoji = '📢') {
    this.s.feed.unshift({ id: uid(), ts: Date.now(), kind, text, emoji });
    if (this.s.feed.length > 250) this.s.feed.length = 250;
  }

  // ---------- auth ----------
  newHostToken(role) {
    if (!HOSTS[role]) fail('Unknown host role.');
    const token = secret();
    this.s.hosts.push({ token, role });
    if (this.s.hosts.length > 30) this.s.hosts.shift();
    return token;
  }

  join(rawName) {
    if (this.s.settings.phoneMode === 'team') fail('Each block plays on one phone: scan your block’s card, or type its code.');
    const name = cleanText(rawName, 24);
    if (!name) fail('Give the booking officer a name.');
    if (this.s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      fail('Someone is already booked under that name. Add a last initial, or ask a host to reset you.');
    }
    const used = new Set(this.s.players.map((p) => p.inmateNo));
    let inmateNo;
    do inmateNo = String(10000 + Math.floor(Math.random() * 90000));
    while (used.has(inmateNo));
    const player = normalizePlayer({
      id: uid(),
      token: secret(),
      name,
      inmateNo,
      charge: pick(CHARGES),
      joinedAt: Date.now(),
    });
    this.s.players.push(player);
    if (this.actIs('genshin')) this.dealCommissions(player);
    this.logBooking(player);
    return player;
  }

  // With 40 guests arriving, bookings fold into one feed line instead of 40.
  logBooking(player) {
    const last = this.s.feed[0];
    if (last && last.kind === 'join' && Array.isArray(last.names) && Date.now() - last.ts < 10 * 60 * 1000) {
      last.names.push(player.name);
      last.ts = Date.now();
    } else {
      this.s.feed.unshift({ id: uid(), ts: Date.now(), kind: 'join', emoji: '🚔', names: [player.name], charge: player.charge });
      if (this.s.feed.length > 250) this.s.feed.length = 250;
    }
    const e = this.s.feed[0];
    const n = e.names.length;
    e.text =
      n === 1
        ? `${e.names[0]} was booked into the Holding Cell, charged with ${e.charge}.`
        : `Booked into the Holding Cell: ${e.names.slice(-4).reverse().join(', ')}${n > 4 ? ` and ${n - 4} more` : ''}. ${n} inmates and counting.`;
  }

  // ---------- settings / broadcast ----------
  updateSettings(input) {
    const st = this.s.settings;
    const text = { lepartyEventId: 64, partyName: 40, tagline: 80, houseRules: 200, holdingRules: 240, };
    for (const [k, max] of Object.entries(text)) {
      if (input[k] === undefined) continue;
      const v = cleanText(input[k], max);
      if (v || k !== 'partyName') st[k] = v;
    }
    if (input.spendMode !== undefined) {
      if (!['anyone', 'request', 'captain'].includes(input.spendMode)) fail('Unknown spending mode.');
      st.spendMode = input.spendMode;
    }
    if (input.clipsEnabled !== undefined) st.clipsEnabled = toBool(input.clipsEnabled);
    if (input.clipsNeedApproval !== undefined) st.clipsNeedApproval = toBool(input.clipsNeedApproval);
    if (input.phoneMode !== undefined) {
      if (!['team', 'guest'].includes(input.phoneMode)) fail('Unknown phone mode.');
      st.phoneMode = input.phoneMode;
    }
    if (input.shopOpen !== undefined && toBool(input.shopOpen) !== st.shopOpen) {
      st.shopOpen = toBool(input.shopOpen);
      this.log(st.shopOpen ? 'The commissary is open. Get spending.' : 'The commissary is closed. No more orders until it reopens.', 'shop', st.shopOpen ? '🛒' : '🔒');
    }
    if (input.actSet !== undefined && input.actSet !== st.actSet) {
      if (!ACT_SETS[input.actSet]) fail('Unknown act lineup.');
      st.actSet = input.actSet;
      this.s.act = Math.min(this.s.act, this.acts.length - 1);
      this.startAct();
    }
    for (const a of ALL_ACTS) {
      const v = input[`introVideo_${a.id}`];
      if (v === undefined) continue;
      const url = String(v).trim().slice(0, 500);
      if (url && !/^https:\/\//i.test(url)) fail('Intro videos need an https:// link.');
      st.introVideos = { ...st.introVideos, [a.id]: url };
    }
    const nums = {
      startingBudget: [0, 1000],
      maxBlockSize: [2, 12],
      holdingDrinks: [0, 5],
      requestSeconds: [1, 5],
      warpPity: [1, 50],
      warp5: [0, 100],
      warp4: [0, 100],
      actsCount: [1, 10],
      roundsPerAct: [1, 10],
      pickSeconds: [15, 300],
      shopSeconds: [0, 600],
      serveSeconds: [10, 120],
      cooldownGames: [0, 5],
      questionSeconds: [5, 120],
      voteSeconds: [5, 120],
      guessSeconds: [10, 300],
      streamStep: [0, 50],
      failPointsPct: [0, 100],
      bountyMultiplier: [1, 10],
      winnerMultiplier: [1, 10],
      bountyMinStake: [1, 100],
      bountyMaxStake: [1, 500],
      bountyMissExtra: [0, 300],
      targetStandards: [0, 5000],
    };
    for (const [k, [lo, hi]] of Object.entries(nums)) {
      if (input[k] === undefined || input[k] === '') continue;
      st[k] = Math.min(hi, Math.max(lo, toInt(input[k], st[k])));
    }
    this.ensureActs();
  }

  announce({ text, by }) {
    const t = cleanText(text, 200);
    if (!t) fail('Announcement is empty.');
    this.s.announcement = { text: t, ts: Date.now(), byName: hostTitle(by).replace(/^The /, 'the ') };
    this.log(t, 'announce', '📣');
  }

  clearAnnouncement() {
    this.s.announcement = null;
  }

  // ---------- blocks (teams) ----------
  nextBlockName() {
    const used = new Set(this.s.teams.map((t) => t.name));
    for (let i = 0; i < 26; i++) {
      const n = `Block ${String.fromCharCode(65 + i)}`;
      if (!used.has(n)) return n;
    }
    return `Block ${this.s.teams.length + 1}`;
  }

  addTeam({ name, color } = {}) {
    const team = {
      id: uid(),
      name: cleanText(name, 30) || this.nextBlockName(),
      color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : TEAM_COLORS[this.s.teams.length % TEAM_COLORS.length],
      budget: this.s.settings.startingBudget,
      earned: 0,
      points: 0,
      bonusPerDrink: 0, // Winner's Bounty: extra points on every drink sent
      bonusDrinks: 0, // Winner's Bounty: free extra drinks on every order sent
      fewerDrinks: 0, // Winner's Bounty: drinks knocked off every order received
      drinkStream: 0, // the cash the block got for its last finish in time; grows each round, a miss resets it
      reflectUsed: false,
      eyeSpyAt: null, // when the block's Eye Spy last opened
      eyeSpyFrom: null, // the round its latest Eye Spy opens in // +1 every time the block sends a drink; most points wins the night
      inventory: { deflect: 0 },
      ledger: [],
      requests: [],
      nickname: '',
      motto: '',
      pity: 0,
      streak: 0,
      augment: null,
      augmentOffer: [],
      joinToken: secret().slice(0, 16), // in the block's card QR code
      joinCode: this.newBlockCode(), // typed on the booking page
      phoneAt: null,
    };
    if (this.actIs('tft')) this.offerAugments(team);
    this.s.teams.push(team);
    return team;
  }

  newBlockCode() {
    const used = new Set(this.s.teams.map((t) => t.joinCode));
    let code;
    do code = Array.from({ length: 4 }, () => pick([...CODE_CHARS])).join('');
    while (used.has(code));
    return code;
  }

  // ---------- LeParty sync ----------
  // LeParty runs signup, check-in and the draw; this night mirrors its blocks and checked-in guests.
  // Re-running is safe: guests and blocks are matched by LeParty id (or, the first time, by name),
  // latecomers and moves follow LeParty, and nobody is deleted mid-game: guests who drop off LeParty's
  // list are only flagged for the hosts.
  applyRoster({ event, blocks = [], guests = [] }) {
    const changes = [];
    const byName = (list, name) => list.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    const teamFor = {};
    for (const b of blocks) {
      let t = this.s.teams.find((x) => x.lepartyId === b.id) || this.s.teams.find((x) => !x.lepartyId && x.name.toLowerCase() === b.name.toLowerCase());
      if (!t) {
        t = this.addTeam({ name: b.name, color: /^#[0-9a-f]{6}$/i.test(b.colour || '') ? b.colour : undefined });
        changes.push(`New block: ${t.name}`);
      }
      t.lepartyId = b.id;
      if (b.name && t.name !== cleanText(b.name, 30)) t.name = cleanText(b.name, 30);
      if (/^#[0-9a-f]{6}$/i.test(b.colour || '')) t.color = b.colour;
      teamFor[b.id] = t;
    }
    const people = this.s.players.filter((p) => !p.device);
    const seen = new Set();
    for (const g of guests) {
      const name = cleanText(g.name, 24);
      if (!name) continue;
      let p = people.find((x) => x.lepartyId === g.id) || people.find((x) => !x.lepartyId && x.name.toLowerCase() === name.toLowerCase());
      const team = g.blockId ? teamFor[g.blockId] || null : null;
      if (!p) {
        const used = new Set(this.s.players.map((x) => x.inmateNo));
        let inmateNo;
        do inmateNo = String(10000 + Math.floor(Math.random() * 90000));
        while (used.has(inmateNo));
        // A name already taken by someone else gets the LeParty name with a mark, never a duplicate.
        const unique = byName(people, name) ? `${name.slice(0, 21)} (2)` : name;
        p = normalizePlayer({ id: uid(), token: null, name: unique, inmateNo, charge: pick(CHARGES), joinedAt: Date.now(), teamId: team?.id || null });
        this.s.players.push(p);
        people.push(p);
        changes.push(this.s.leparty.lastSync ? `Late check-in: ${p.name} → ${team ? team.name : 'Holding'}` : `${p.name} → ${team ? team.name : 'Holding'}`);
      } else if (team && p.teamId !== team.id) {
        changes.push(`${p.name} moved: ${p.teamId ? this.teamName(p.teamId) : 'Holding'} → ${team.name}`);
        p.teamId = team.id;
        p.isCaptain = false;
      }
      p.lepartyId = g.id;
      seen.add(p.id);
      const gone = !!g.leftEarly;
      if (gone && !p.lepartyGone) changes.push(`${p.name} left early (flagged in LeParty)`);
      p.lepartyGone = gone;
    }
    // Anyone imported before who's no longer checked in: flag them, don't remove them.
    for (const p of people) {
      if (p.lepartyId && !seen.has(p.id) && !p.lepartyGone) {
        p.lepartyGone = true;
        changes.push(`${p.name} is no longer checked in on LeParty`);
      }
    }
    const firstSync = !this.s.leparty.lastSync;
    this.s.leparty = { lastSync: Date.now(), eventName: cleanText(event?.name || event?.theme_title || '', 80), error: '', changes: [...changes, ...(firstSync ? [] : this.s.leparty.changes || [])].slice(0, 20) };
    if (changes.length) {
      const late = changes.filter((c) => c.startsWith('Late check-in'));
      if (firstSync) this.log(`Imported from LeParty: ${plural(guests.length, 'guest')} on ${plural(blocks.length, 'block')}.`, 'join', '🔗');
      else for (const c of late) this.log(`🚔 ${c}`, 'join', '🚔');
    }
    return { changed: changes.length > 0, changes };
  }

  lepartyError({ message }) {
    this.s.leparty = { ...this.s.leparty, error: cleanText(message, 160), errorAt: Date.now() };
  }

  // ---------- team phones ----------
  // Scanning a block's card (or typing its code) makes this device the block's phone; the latest scan wins.
  // The phone is a hidden member of the block that acts for it: it never plays, drinks or shows up in rosters.
  phoneOf(teamId) {
    return this.s.players.find((p) => p.device && p.teamId === teamId) || null;
  }

  claimBlock({ token, code }) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const team = this.s.teams.find((t) => (token && t.joinToken === token) || (c && t.joinCode === c));
    if (!team) fail(token ? 'That card isn’t valid any more. Ask a host for your block’s new code.' : 'No block has that code. Check the card and try again.');
    let p = this.phoneOf(team.id);
    if (!p) {
      p = normalizePlayer({ id: uid(), token: secret(), name: `${team.name} phone`, inmateNo: '00000', charge: '', joinedAt: Date.now(), device: true, teamId: team.id, isCaptain: true });
      this.s.players.push(p);
    } else {
      p.token = secret(); // signs the previous phone out
    }
    team.phoneAt = Date.now();
    return p;
  }

  // A leaked card: new code and QR, and whichever phone holds the block is signed out.
  reissueBlockCode({ teamId }) {
    const team = this.mustTeam(teamId);
    team.joinToken = secret().slice(0, 16);
    team.joinCode = this.newBlockCode();
    const p = this.phoneOf(team.id);
    if (p) p.token = secret();
    team.phoneAt = null;
    this.log(`${team.name} has a new block code. Their old card no longer works.`, 'team', '🔑');
  }

  // Hosts add the night's guests by name (one per line); with no block they wait in Holding for Build blocks.
  addGuests({ names, teamId }) {
    const team = teamId ? this.mustTeam(teamId) : null;
    const list = String(names || '').split(/[\n,]/).map((n) => cleanText(n, 24)).filter(Boolean);
    if (!list.length) fail('Type at least one name.');
    const taken = new Set(this.s.players.map((p) => p.name.toLowerCase()));
    const used = new Set(this.s.players.map((p) => p.inmateNo));
    const added = [];
    for (const name of list) {
      if (taken.has(name.toLowerCase())) continue;
      taken.add(name.toLowerCase());
      let inmateNo;
      do inmateNo = String(10000 + Math.floor(Math.random() * 90000));
      while (used.has(inmateNo));
      used.add(inmateNo);
      const p = normalizePlayer({ id: uid(), token: null, name, inmateNo, charge: pick(CHARGES), joinedAt: Date.now(), teamId: team?.id || null });
      this.s.players.push(p);
      added.push(p.name);
    }
    if (added.length) this.log(`Booked in: ${added.join(', ')}${team ? ` on ${team.name}` : ''}.`, 'join', '🚔');
    return { added: added.length, skipped: list.length - added.length };
  }

  seedTeams({ count }) {
    const n = Math.min(8, Math.max(1, toInt(count, 4)));
    for (let i = 0; i < n; i++) this.addTeam();
  }

  // Splits everyone waiting in the Holding Cell into blocks of (at most) maxBlockSize,
  // creating as many blocks as needed and topping up the smallest ones first.
  buildBlocks() {
    const pool = shuffle(this.holding());
    if (!pool.length) fail('Nobody is waiting in the Holding Cell.');
    const max = this.s.settings.maxBlockSize;
    const onBlocks = this.s.players.filter((p) => p.teamId).length;
    const needed = Math.max(this.s.teams.length, Math.ceil((onBlocks + pool.length) / max));
    while (this.s.teams.length < needed) this.addTeam();
    const counts = Object.fromEntries(this.s.teams.map((t) => [t.id, this.members(t.id).length]));
    for (const p of pool) {
      const smallest = shuffle(this.s.teams).sort((a, b) => counts[a.id] - counts[b.id])[0];
      p.teamId = smallest.id;
      counts[smallest.id]++;
    }
    const summary = this.s.teams.map((t) => `${t.name} (${counts[t.id]})`).join(', ');
    this.log(`Blocks assigned! ${summary}. Check your phone for your block.`, 'team', '🔐');
  }

  updateTeam({ teamId, name, color, nickname, motto }) {
    const t = this.mustTeam(teamId);
    if (name !== undefined && cleanText(name, 30)) t.name = cleanText(name, 30);
    if (color && /^#[0-9a-f]{6}$/i.test(color)) t.color = color;
    if (nickname !== undefined) t.nickname = cleanText(nickname, 32);
    if (motto !== undefined) t.motto = cleanText(motto, 80);
  }

  // The Shot Caller names the block (anyone can if the block has no Shot Caller).
  renameBlock(playerId, { nickname, motto }) {
    const p = this.mustPlayer(playerId);
    if (!p.teamId) fail('You need to be on a block to rename it.');
    const t = this.mustTeam(p.teamId);
    if (!p.isCaptain && this.members(t.id).some((m) => m.isCaptain)) fail('Only your Shot Caller can rename the block.');
    const nick = cleanText(nickname, 32);
    const changed = nick && nick !== t.nickname;
    t.nickname = nick;
    if (motto !== undefined) t.motto = cleanText(motto, 80);
    if (changed) this.log(`${t.name} will now be known as “${nick}”.`, 'team', '🏷️');
  }

  removeTeam({ teamId }) {
    this.mustTeam(teamId);
    this.s.teams = this.s.teams.filter((t) => t.id !== teamId);
    this.s.players = this.s.players.filter((p) => !(p.device && p.teamId === teamId));
    for (const p of this.s.players) {
      if (p.teamId === teamId) {
        p.teamId = null;
        p.isCaptain = false;
      }
    }
  }

  adjustBudget({ teamId, amount, reason, by }) {
    const t = this.mustTeam(teamId);
    const amt = toInt(amount);
    if (!amt) fail('Amount must be a non-zero number.');
    const before = t.budget;
    t.budget = Math.max(0, t.budget + amt);
    if (amt > 0) t.earned += amt;
    const why = cleanText(reason, 80);
    if (amt > 0) this.log(`${hostTitle(by)} paid ${t.name} ${this.cash(amt)}${why ? ` for ${why}` : ''}.`, 'money', '💰');
    else this.log(`${hostTitle(by)} docked ${t.name} ${this.cash(before - t.budget)}${why ? ` for ${why}` : ''}.`, 'money', '💸');
  }

  // Host correction to the scoreboard. Points only change through sends and this.
  adjustPoints({ teamId, amount, reason, by }) {
    const t = this.mustTeam(teamId);
    const amt = toInt(amount);
    if (!amt) fail('Amount must be a non-zero number.');
    const before = t.points;
    t.points = Math.max(0, t.points + amt);
    const why = cleanText(reason, 80);
    const n = Math.abs(t.points - before);
    this.log(`${hostTitle(by)} ${amt > 0 ? 'gave' : 'took'} ${t.name} some points${amt > 0 ? '' : ' away'}${why ? ` for ${why}` : ''}. The standings update at the end of the act.`, 'money', '⭐');
  }

  setInventory({ teamId, kind, count }) {
    const t = this.mustTeam(teamId);
    if (kind !== 'deflect') fail('Unknown inventory type.');
    t.inventory[kind] = Math.max(0, toInt(count));
  }

  // ---------- players ----------
  updatePlayer({ playerId, name, teamId, isCaptain }) {
    const p = this.mustPlayer(playerId);
    if (name !== undefined && cleanText(name, 24)) p.name = cleanText(name, 24);
    if (teamId !== undefined) {
      const was = p.teamId;
      p.teamId = teamId ? this.mustTeam(teamId).id : null;
      if (p.teamId !== was) {
        p.isCaptain = false;
        if (p.teamId && !was) this.log(`${p.name} was paroled out of the Holding Cell onto ${this.teamName(p.teamId)}.`, 'team', '🕊️');
        else if (p.teamId) this.log(`${p.name} was transferred to ${this.teamName(p.teamId)}.`, 'team', '🚐');
        else this.log(`${p.name} was thrown into the Holding Cell by the hosts.`, 'team', '🕳️');
      }
    }
    if (isCaptain !== undefined) {
      const on = toBool(isCaptain);
      if (on) {
        if (!p.teamId) fail('Put them on a block first.');
        for (const o of this.members(p.teamId)) o.isCaptain = false;
      }
      p.isCaptain = on;
      if (on) this.log(`${p.name} is now Shot Caller of ${this.teamName(p.teamId)}.`, 'team', '👑');
    }
  }

  // Deletes inmates for good, along with anything still pointing at them.
  // Their phones get logged out; past orders and feed lines stay as history.
  removePlayers({ playerIds }) {
    const ids = new Set((Array.isArray(playerIds) ? playerIds : String(playerIds || '').split(',')).map((x) => String(x).trim()).filter(Boolean));
    const gone = this.s.players.filter((p) => ids.has(p.id));
    if (!gone.length) fail('Pick at least one inmate to remove.');
    this.s.players = this.s.players.filter((p) => !ids.has(p.id));
    for (const t of this.s.teams) {
      t.requests = t.requests.filter((r) => !ids.has(r.by));
      for (const r of t.requests) r.seconds = r.seconds.filter((id) => !ids.has(id));
    }
    return { removed: gone.length };
  }

  removePlayer({ playerId }) {
    this.mustPlayer(playerId);
    return this.removePlayers({ playerIds: [playerId] });
  }

  // Wipes everyone and everything that happened, keeping the setup: settings, shop, games and host logins.
  freshStart({ confirm }) {
    if (String(confirm || '').trim().toUpperCase() !== 'RESET') fail('Type RESET to confirm.');
    const s = this.s;
    s.players = [];
    s.teams = [];
    s.orders = [];
    s.feed = [];
    s.announcement = null;
    s.act = 0;
    s.shownPoints = {};
    s.shownAt = null;
    const files = s.clips.map((c) => c.url);
    s.clips = [];
    for (const g of s.games) {
      g.status = 'upcoming';
      g.results = null;
      g.heats = [];
    }
    this.log('Fresh start. The Slammer is open for bookings.', 'info', '🔓');
    return { deleteFiles: files };
  }

  // ---------- holding / drinks ----------
  // End-of-round bookkeeping: penalty drinks for the Holding Cell.
  tickRound() {
    const st = this.s.settings;
    const inHolding = this.holding();
    for (const p of inHolding) p.drinksOwed += st.holdingDrinks;
    if (inHolding.length && st.holdingDrinks) this.log(`Round penalties: Holding Cell (${inHolding.length}) drinks ${st.holdingDrinks} each. Pay up!`, 'lockup', '🍺');
  }

  drank(playerId) {
    const p = this.mustPlayer(playerId);
    if (p.drinksOwed < 1) fail('You’re all paid up. Nice.');
    p.drinksOwed--;
    p.drinksDone++;
    p.adventureExp += EXP.drink;
  }

  // ---------- punishments handed to people ----------
  // A host target: 'all', 'holding', 'team:<id>' or 'player:<id>'.
  resolveTarget(target) {
    const [kind, id] = String(target || '').split(':');
    if (kind === 'all') return { label: 'everyone', victims: [...this.s.players] };
    if (kind === 'holding') return { label: 'the Holding Cell', victims: this.holding() };
    if (kind === 'team') {
      const t = this.mustTeam(id);
      return { label: t.name, victims: this.members(t.id) };
    }
    if (kind === 'player') {
      const p = this.mustPlayer(id);
      return { label: p.name, victims: [p] };
    }
    fail('Pick who gets punished.');
  }

  sentence(p, { text, reason, from }) {
    p.sentences.unshift({ id: uid(), ts: Date.now(), text, reason: reason || '', from, status: 'open' });
    if (p.sentences.length > 30) p.sentences.length = 30;
  }

  // Hosts can hand anyone drinks, a written punishment, or both.
  assignPunishment({ target, drinks, text, reason, by }) {
    const { label, victims } = this.resolveTarget(target);
    if (!victims.length) fail(`Nobody is in ${label} right now.`);
    const n = Math.min(10, Math.max(0, toInt(drinks)));
    const t = cleanText(text, 120);
    if (!n && !t) fail('Give them drinks, a punishment, or both.');
    const why = cleanText(reason, 80);
    for (const v of victims) {
      v.drinksOwed += n;
      if (t) this.sentence(v, { text: t, reason: why, from: hostTitle(by) });
    }
    const each = victims.length > 1 ? ' each' : '';
    const parts = [n && `${plural(n, 'drink')}${each}`, t && `“${t}”`].filter(Boolean).join(' + ');
    this.log(`${hostTitle(by)} sentenced ${label}: ${parts}${why ? ` for ${why}` : ''}.`, 'punish', '⚖️');
    return { count: victims.length };
  }

  completeSentence(playerId, { sentenceId }) {
    const p = this.mustPlayer(playerId);
    const x = p.sentences.find((y) => y.id === sentenceId && y.status === 'open') || fail('Already done.');
    x.status = 'done';
    x.doneAt = Date.now();
    p.adventureExp += EXP.sentence;
  }

  clearSentence({ playerId, sentenceId }) {
    const p = this.mustPlayer(playerId);
    const x = p.sentences.find((y) => y.id === sentenceId) || fail('Not found.');
    x.status = 'cleared';
  }

  adjustDrinks({ playerId, amount }) {
    const p = this.mustPlayer(playerId);
    p.drinksOwed = Math.max(0, p.drinksOwed + toInt(amount));
  }

  // ---------- games / rounds ----------
  // How a game is run: by the hosts (they enter placings) or by the app on the block phones.
  configureGame(g, { runBy, questions, stories, openings }) {
    if (openings !== undefined) {
      g.openings = parseOpenings(openings);
      g.openingsText = String(openings).slice(0, 12000);
    }
    if (runBy !== undefined && runBy !== '') {
      if (runBy !== 'host' && !APP_GAMES[runBy]) fail('Unknown kind of game.');
      g.runBy = runBy;
      if (runBy !== 'host') g.playersNeeded = 0; // app-run games are played by the whole block on its phone
    }
    if (questions !== undefined) {
      g.questions = parseTrivia(questions);
      g.questionsText = String(questions).slice(0, 12000);
    }
    if (stories !== undefined && stories !== '') g.stories = Math.min(20, Math.max(1, toInt(stories, 5)));
  }

  // Load the party's games into the library, skipping any it already has by name.
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

  addGame({ name, desc, rules, holdingRule, playersNeeded, runBy, questions, stories, openings }) {
    const n = cleanText(name, 60);
    if (!n) fail('Game needs a name.');
    const g = {
      id: uid(),
      name: n,
      desc: cleanText(desc, 200),
      rules: cleanRules(rules),
      rulesVersion: 1,
      holdingRule: cleanText(holdingRule, 160),
      playersNeeded: Math.min(10, Math.max(0, toInt(playersNeeded, 1))), // 0 = group game, the whole block plays
      heats: [],
      status: 'upcoming',
      results: null,
      createdAt: Date.now(),
      runBy: 'host',
      questions: [],
      questionsText: '',
      stories: 5,
      openings: [],
      openingsText: '',
    };
    this.configureGame(g, { runBy, questions, stories, openings });
    this.s.games.push(g);
    return g;
  }

  updateGame({ gameId, name, desc, rules, holdingRule, playersNeeded, runBy, questions, stories, openings }) {
    const g = this.game(gameId) || fail('Game not found.');
    this.configureGame(g, { runBy, questions, stories, openings });
    if (playersNeeded !== undefined && playersNeeded !== '') g.playersNeeded = Math.min(10, Math.max(0, toInt(playersNeeded, 1)));
    const before = JSON.stringify([g.name, g.desc, g.rules, g.holdingRule]);
    if (name !== undefined && cleanText(name, 60)) g.name = cleanText(name, 60);
    if (desc !== undefined) g.desc = cleanText(desc, 200);
    if (rules !== undefined) g.rules = cleanRules(rules);
    if (holdingRule !== undefined) g.holdingRule = cleanText(holdingRule, 160);
    // A changed briefing pops up on every phone again.
    if (JSON.stringify([g.name, g.desc, g.rules, g.holdingRule]) !== before) {
      g.rulesVersion = (g.rulesVersion || 1) + 1;
      if (g.status === 'live') this.log(`Rules updated for ${g.name}. Check the briefing on your phone.`, 'game', '📋');
    }
  }

  setGameStatus({ gameId, status }) {
    const g = this.game(gameId) || fail('Game not found.');
    if (!['upcoming', 'live', 'done'].includes(status)) fail('Unknown status.');
    if (status === 'live') {
      for (const o of this.s.games) if (o.status === 'live' && o.id !== g.id) o.status = 'upcoming';
      this.log(`NOW IN THE YARD: ${g.name}${g.desc ? ` — ${g.desc.replace(/[.!]+$/, '')}` : ''}. Your briefing is on your phone.`, 'game', '🏁');
    }
    const wasLive = g.status === 'live';
    g.status = status;
  }

  moveGame({ gameId, dir }) {
    const i = this.s.games.findIndex((g) => g.id === gameId);
    if (i < 0) fail('Game not found.');
    const j = i + (toInt(dir) < 0 ? -1 : 1);
    if (j < 0 || j >= this.s.games.length) return;
    [this.s.games[i], this.s.games[j]] = [this.s.games[j], this.s.games[i]];
  }

  finishGame({ gameId, results, penalties = true }) {
    const g = this.game(gameId) || fail('Game not found.');
    const clean = {};
    for (const [teamId, pts] of Object.entries(results || {})) {
      const n = toInt(pts);
      if (n && this.team(teamId)) clean[teamId] = n;
    }
    for (const [teamId, n] of Object.entries(clean)) {
      const t = this.team(teamId);
      t.budget = Math.max(0, t.budget + n);
      if (n > 0) t.earned += n;
    }
    // Heats were paid as they finished; the game's results show the total.
    const total = { ...clean };
    for (const h of g.heats || []) {
      if (h.status !== 'done') h.status = 'skipped';
      for (const [id, n] of Object.entries(h.results || {})) total[id] = (total[id] || 0) + n;
    }
    if (this.actIs('tft')) {
      if (!g.heats.length) this.payStreaks(this.s.teams.filter((t) => this.members(t.id).length).map((t) => t.id), clean);
      this.payInterest();
    }
    g.status = 'done';
    g.results = total;
    const summary = Object.entries(total)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${this.teamName(id)} ${n > 0 ? '+' : ''}${n}`)
      .join(', ');
    this.log(`${g.name} is over! ${summary || 'No credits paid out.'}`, 'game', '🏆');
    if (toBool(penalties)) this.tickRound();
  }

  // ---------- heats / matchups ----------
  // With 8 or so blocks, games run as heats: a few blocks at a time, each heat paid out on its own.
  mustGame(id) {
    return this.game(id) || fail('Game not found.');
  }

  heatLabel(g, h) {
    return `Heat ${g.heats.indexOf(h) + 1}: ${h.teamIds.map((id) => this.teamName(id)).join(' vs ')}`;
  }

  makeHeats({ gameId, size }) {
    const g = this.mustGame(gameId);
    if (g.status === 'done') fail('That game is over.');
    if (g.heats.some((h) => h.status !== 'upcoming')) fail('Heats have already started. Add heats by hand instead.');
    const teams = shuffle(this.s.teams.filter((t) => this.members(t.id).length));
    if (teams.length < 2) fail('Need at least 2 blocks with inmates.');
    const n = size === 'all' ? teams.length : Math.max(2, toInt(size, 2));
    const groups = [];
    for (let i = 0; i < teams.length; i += n) groups.push(teams.slice(i, i + n).map((t) => t.id));
    // Nobody plays alone: a leftover block joins the previous heat.
    if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(...groups.pop());
    g.heats = groups.map((teamIds) => ({ id: uid(), teamIds, status: 'upcoming', results: null }));
    this.log(`Matchups for ${g.name}: ${g.heats.map((h) => this.heatLabel(g, h)).join(' · ')}`, 'game', '🥊');
  }

  addHeat({ gameId, teamIds }) {
    const g = this.mustGame(gameId);
    if (g.status === 'done') fail('That game is over.');
    const ids = [...new Set((Array.isArray(teamIds) ? teamIds : String(teamIds || '').split(',')).map((x) => String(x).trim()).filter(Boolean))];
    for (const id of ids) this.mustTeam(id);
    if (ids.length < 2) fail('Pick at least 2 blocks for a heat.');
    const h = { id: uid(), teamIds: ids, status: 'upcoming', results: null };
    g.heats.push(h);
    this.log(`New matchup for ${g.name}: ${this.heatLabel(g, h)}`, 'game', '🥊');
  }

  removeHeat({ gameId, heatId }) {
    const g = this.mustGame(gameId);
    const h = g.heats.find((x) => x.id === heatId) || fail('Heat not found.');
    if (h.status === 'done') fail('That heat already paid out.');
    g.heats = g.heats.filter((x) => x !== h);
  }

  clearHeats({ gameId }) {
    const g = this.mustGame(gameId);
    if (g.heats.some((h) => h.status === 'done')) fail('Some heats already paid out.');
    g.heats = [];
  }

  startHeat({ gameId, heatId }) {
    const g = this.mustGame(gameId);
    const h = g.heats.find((x) => x.id === heatId) || fail('Heat not found.');
    if (h.status === 'done') fail('That heat is over.');
    if (g.status !== 'live') this.setGameStatus({ gameId, status: 'live' });
    for (const o of g.heats) if (o.status === 'live') o.status = 'upcoming';
    h.status = 'live';
    this.log(`${g.name} — ${this.heatLabel(g, h)}. You're up!`, 'game', '🥊');
  }

  finishHeat({ gameId, heatId, results }) {
    const g = this.mustGame(gameId);
    const h = g.heats.find((x) => x.id === heatId) || fail('Heat not found.');
    if (h.status === 'done') fail('That heat already paid out.');
    const clean = {};
    for (const [teamId, pts] of Object.entries(results || {})) {
      const n = toInt(pts);
      if (n && h.teamIds.includes(teamId) && this.team(teamId)) clean[teamId] = n;
    }
    for (const [teamId, n] of Object.entries(clean)) {
      const t = this.team(teamId);
      t.budget = Math.max(0, t.budget + n);
      if (n > 0) t.earned += n;
    }
    h.status = 'done';
    h.results = clean;
    if (this.actIs('tft')) this.payStreaks(h.teamIds, clean);
    const summary = Object.entries(clean)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${this.teamName(id)} ${n > 0 ? '+' : ''}${n}`)
      .join(', ');
    const left = g.heats.filter((x) => x.status !== 'done').length;
    this.log(`${g.name} Heat ${g.heats.indexOf(h) + 1} is done. ${summary || 'No credits paid out.'}${left ? '' : ' That was the last heat.'}`, 'game', '🏁');
  }

  removeGame({ gameId }) {
    this.s.games = this.s.games.filter((g) => g.id !== gameId);
    // Rounds that were going to play it go back to empty (played rounds keep their history).
    for (const act of this.ensureActs().acts) act.rounds = act.rounds.map((x) => (x === gameId ? null : x));
  }

  // ---------- commissary items ----------
  sanitizeItem(input, existing = {}) {
    const out = { ...existing };
    if (input.name !== undefined) out.name = cleanText(input.name, 40);
    if (input.desc !== undefined) out.desc = cleanText(input.desc, 160);
    if (input.emoji !== undefined) out.emoji = cleanText(input.emoji, 4) || '📦';
    if (input.price !== undefined) out.price = Math.max(0, toInt(input.price));
    if (input.type !== undefined) {
      if (!ITEM_TYPES[input.type]) fail('Unknown item type.');
      out.type = input.type;
    }
    if (input.stock !== undefined) out.stock = input.stock === '' || input.stock === null ? null : Math.max(0, toInt(input.stock));
    if (input.drain !== undefined) out.drain = Math.max(0, toInt(input.drain));
    if (input.drinks !== undefined) out.drinks = Math.min(5, Math.max(0, toInt(input.drinks)));
    if (input.points !== undefined) out.points = Math.min(50, Math.max(0, toInt(input.points)));
    if (input.active !== undefined) out.active = toBool(input.active);
    if (input.steal !== undefined) out.steal = toBool(input.steal);
    if (input.act !== undefined) {
      if (input.act && !ENGINES.includes(input.act)) fail('Unknown act.');
      out.act = input.act || null;
    }
    if (!out.name) fail('Item needs a name.');
    return out;
  }

  addItem(input) {
    const item = this.sanitizeItem({ emoji: '📦', price: 10, type: 'supply', stock: null, drain: 0, drinks: 0, points: input.type === 'drink' ? 1 : 0, steal: false, act: null, active: true, desc: '', ...input });
    item.bundles = [];
    item.id = uid();
    this.s.items.push(item);
    return item;
  }

  updateItem({ itemId, ...input }) {
    const i = this.s.items.findIndex((x) => x.id === itemId);
    if (i < 0) fail('Item not found.');
    this.s.items[i] = this.sanitizeItem(input, this.s.items[i]);
  }

  removeItem({ itemId }) {
    this.s.items = this.s.items.filter((i) => i.id !== itemId);
  }

  // ---------- buying ----------
  // Checks that a block can buy something, without changing anything.
  checkPurchase(team, { itemId, targetTeamId, targetPlayerId, count, qty, stake }) {
    if (!this.s.settings.shopOpen) fail('The commissary is closed. Wait for the hosts to open it again.');
    const stocked = this.item(itemId);
    if (!stocked || !this.itemLive(stocked)) fail('That item is off the shelf.');
    // Names come from the current act; stock is counted on the shelf item itself.
    const item = this.skinItem(stocked);
    if (item.stock !== null && item.stock <= 0) fail('Sold out. The commissary is waiting on a shipment.');
    // Wishes come singly or in tens, like the game.
    const n = item.type === 'warp' && toInt(count) === 10 ? 10 : 1;
    let price = this.priceFor(team, item) * n;
    let drinks = null;
    if (item.type === 'drink') {
      const q = toInt(qty, 1);
      if (q < 1 || q > MAX_DRINKS_PER_ORDER) fail(`Send between 1 and ${MAX_DRINKS_PER_ORDER} drinks at a time.`);
      const quote = quoteDrinks(item, q);
      drinks = { qty: q, points: quote.points, bundle: quote.bundle };
      price = this.priceFor(team, { price: quote.cost });
    }
    price = Math.max(0, Math.round(this.foldMechanics(this.round?.number || this.s.rounds.length || 1, 'price', price, team, item)));
    if (team.budget < price) fail(`Not enough ${this.act?.currency?.name || 'credits'}. ${team.name} has ${this.cash(team.budget)}, this costs ${this.cash(price)}.`);
    if (item.type === 'reflect') {
      if (team.reflectUsed) fail('Your block has already used its Reflect tonight.');
      if (this.s.reflects.some((x) => x.round === this.nextTurn())) fail('Another block already has Reflect for next round.');
    }
    if (item.type === 'eyespy' && team.eyeSpyFrom === this.nextTurn()) fail('One Eye Spy per round.');
    if (item.type === 'mystery' && (this.round?.number || 0) < MYSTERY.fromRound) fail(`Mystery Boxes open from round ${MYSTERY.fromRound}.`);
    if (item.type === 'nochaser') {
      if (!this.round || this.round.phase === 'done') fail('No Chasers only works while a round is on.');
      if (team.noChaserRound === this.round.number) fail('Your block already has No Chasers this round.');
    }
    if (item.type === 'ghost') {
      if (!this.round || this.round.phase === 'done') fail('A Burner Phone only works while a round is on.');
      if (team.ghostRound === this.round.number) fail('Your block is already anonymous this round.');
    }
    if (item.type === 'bounty') {
      if (this.activeBounty(team.id)) fail('Your block already has a bounty running.');
      if (item.bounty === 'winner' && (this.round?.phase !== 'spending' || this.round.winnerTeamId !== team.id)) fail('Only the block that just won this round’s game can buy the Winner’s Bounty.');
      const st = this.s.settings;
      const n = toInt(stake, 0);
      if (n < st.bountyMinStake || n > st.bountyMaxStake) fail(`Stake between ${st.bountyMinStake} and ${st.bountyMaxStake} points.`);
      if (n > (team.points || 0)) fail(`Your block only has ${plural(team.points || 0, 'point')} to stake.`);
    }
    const kind = ITEM_TYPES[item.type].target;
    let targetId = null;
    let bailee = null;
    if (kind === 'team') {
      if (targetTeamId === HOLDING) {
        if (!this.holding().length) fail('The Holding Cell is empty right now.');
        targetId = HOLDING;
      } else {
        targetId = this.mustTeam(targetTeamId).id;
        if (targetId === team.id) fail('Pick a different block.');
      }
    }
    if (kind === 'holdingPlayer') {
      bailee = this.mustPlayer(targetPlayerId);
      if (this.status(bailee) !== 'holding') fail(`${bailee.name} isn’t waiting in the Holding Cell.`);
      if (this.members(team.id).length >= this.s.settings.maxBlockSize) fail(`${team.name} is full (${this.s.settings.maxBlockSize} max). Someone has to go first…`);
    }
    return { item, stocked, targetId, bailee, price, count: n, drinks, stake: item.type === 'bounty' ? toInt(stake, 0) : null };
  }

  // How many blockmates must second a request before it goes through without the Shot Caller.
  secondsNeeded(team, requesterId) {
    const others = this.members(team.id).filter((m) => m.id !== requesterId).length;
    return Math.min(this.s.settings.requestSeconds, others);
  }

  buy(playerId, input) {
    const p = this.mustPlayer(playerId);
    if (!p.teamId) fail('Holding Cell inmates don’t get a commissary account. Get yourself bailed onto a block!');
    const team = this.mustTeam(p.teamId);
    const mode = this.s.settings.spendMode;
    if (mode === 'captain' && !p.isCaptain) fail('Only your Shot Caller can spend the block budget tonight.');
    if (mode === 'request' && !p.isCaptain && this.secondsNeeded(team, p.id) > 0) return this.requestPurchase(p, team, input);
    return this.purchase(p, team, input);
  }

  purchase(p, team, { itemId, targetTeamId, targetPlayerId, note, count, qty, stake: staked }) {
    const { item, stocked, targetId, bailee, price, count: n, drinks, stake } = this.checkPurchase(team, { itemId, targetTeamId, targetPlayerId, count, qty, stake: staked });
    team.budget -= price;
    if (stocked.stock !== null) stocked.stock--;
    const base = {
      id: uid(),
      ts: Date.now(),
      itemId: item.id,
      name: item.name,
      emoji: item.emoji,
      type: item.type,
      price,
      drain: item.drain || 0,
      drinks: item.drinks || 0,
      steal: !!item.steal,
      desc: item.desc || '',
      buyerId: p.id,
      buyerName: p.name,
      fromTeamId: team.id,
      originalFromTeamId: team.id,
      note: cleanText(note, 120),
      bounces: 0,
      history: [],
    };

    if (item.type === 'deflect') {
      team.inventory[item.type] = (team.inventory[item.type] || 0) + 1;
      this.log(`${team.name} made a suspicious purchase at the commissary…`, 'shop', '🤫');
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'warp') {
      const warps = Array.from({ length: n }, () => this.warp(p, team));
      const best = warps.reduce((a, b) => (b.stars > a.stars ? b : a));
      const order = { ...base, name: n > 1 ? `${item.name} ×${n}` : item.name, targetTeamId: team.id, status: 'done', warp: best, warps };
      this.s.orders.unshift(order);
      return order;
    }

    if (item.type === 'reflect') {
      this.s.reflects.push({ teamId: team.id, round: this.nextTurn() });
      team.reflectUsed = true;
      this.log(`${team.name} made a suspicious purchase at the commissary…`, 'shop', '🤫');
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'mystery') return this.openMysteryBox(team, base);

    if (item.type === 'nochaser') {
      // Everything this block sends this round is taken neat, including what it already sent and isn't poured yet.
      const r = this.round;
      team.noChaserRound = r.number;
      for (const o of this.s.orders) if (o.type === 'drink' && o.fromTeamId === team.id && !o.origin && !o.queuedRound && o.ts >= (r.startedAt || 0) && o.status === 'pending') o.noChaser = true;
      this.s.orders.unshift({ ...base, status: 'done' });
      const anon = team.ghostRound === r.number;
      this.log(`🚫 ${anon ? 'Someone' : team.name} bought No Chasers: every drink ${anon ? 'they send' : `${team.name} sends`} this round is taken neat!`, 'shop', '🚫');
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'ghost') {
      // Anonymous from now until this round ends (anything already sent was already announced).
      team.ghostRound = this.round.number;
      this.s.orders.unshift({ ...base, status: 'done', hidden: true });
      this.log('🕶️ Someone bought a Burner Phone. Their drinks this round are anonymous.', 'shop', '🕶️');
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'eyespy') {
      team.eyeSpyFrom = this.nextTurn();
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'bounty') {
      const start = this.nextTurn();
      const kind = item.bounty || 'open';
      const mult = kind === 'winner' ? this.s.settings.winnerMultiplier : this.s.settings.bountyMultiplier;
      team.points -= stake; // the stake leaves the score now and comes back multiplied if the bounty is hit
      this.s.bounties.push({ id: uid(), teamId: team.id, kind, stake, mult, startRound: start, deadlineRound: start + BOUNTY.rounds - 1, sent: 0, status: 'active', ts: Date.now() });
      this.log(`🎯 ${team.name} put out a ${kind === 'winner' ? 'Winner’s' : 'Open'} Bounty: ${BOUNTY.target} drinks in ${BOUNTY.rounds} rounds, starting ${this.slotOf(start).label}. How much they staked is secret.`, 'shop', '🎯');
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'bail') {
      bailee.teamId = team.id;
      bailee.isCaptain = false;
      const order = { ...base, targetTeamId: team.id, targetPlayerId: bailee.id, targetPlayerName: bailee.name, status: 'done' };
      this.s.orders.unshift(order);
      this.log(`🔑 ${team.name} posted bail for ${bailee.name}! They’re out of the Holding Cell and on the block.`, 'team', '🔑');
      return order;
    }

    const order = {
      ...base,
      targetTeamId: targetId || team.id,
      status: item.type === 'punishment' && targetId !== HOLDING ? 'incoming' : 'pending',
      // Sending drinks is how a block scores: drinks score their menu points (bundles a little more);
      // older one-size gifts and penalty-drink punishments score 1. Points stay with the buyer even if deflected.
      points: drinks ? drinks.points : sendsDrinks(item) ? 1 : 0,
    };
    if (drinks) {
      order.qty = drinks.qty;
      order.name = drinks.qty > 1 ? `${drinks.qty}× ${item.name}${drinks.bundle?.label ? ` (${drinks.bundle.label.toLowerCase()})` : ''}` : item.name;
    }
    // Drinks score when the bar serves them; everything else scores now.
    if (!drinks && order.points) {
      team.points += order.points;
      order.pointsCredited = true;
    }
    if (drinks) this.countBounty(team, drinks.qty);
    if (drinks && team.ghostRound && team.ghostRound === this.round?.number && this.round.phase !== 'done') order.hidden = true;
    if (drinks && team.noChaserRound && team.noChaserRound === this.round?.number && this.round.phase !== 'done') order.noChaser = true;
    this.s.orders.unshift(order);
    if (item.type === 'supply') this.log(`${team.name} bought ${item.emoji} ${item.name}.`, 'shop', '🛒');
    if (item.type === 'gift') this.log(`${team.name} sent ${item.emoji} ${item.name} to ${this.teamName(targetId)}! 🥂`, 'shop', '🎁');
    if (item.type === 'drink') this.log(`${order.hidden ? '🕶️ Anonymous' : team.name} sent ${item.emoji} ${order.name} to ${this.teamName(targetId)}! 🥂`, 'shop', '🎁');
    if (item.type === 'punishment') {
      if (targetId === HOLDING) {
        this.log(`${team.name} hit the Holding Cell with ${item.emoji} ${item.name}! No deflects for the unhoused.`, 'punish', '🕳️');
        this.enforce(order);
      } else {
        this.log(`${team.name} ordered ${item.emoji} ${item.name} on ${this.teamName(targetId)}! Will they deflect?`, 'punish', '⚠️');
      }
    }
    return order;
  }

  // A Mystery Box rolls on the spot: Reflect for next round (if the block can still have one), or 1–5
  // random drinks on the buyer's own block or a random other block, poured in this round's drinks.
  openMysteryBox(team, base) {
    const next = this.nextTurn();
    const canReflect = !team.reflectUsed && !this.s.reflects.some((x) => x.round === next);
    const others = this.s.teams.filter((t) => t.id !== team.id);
    // Odds by shares: Reflect 2 (while the block can still have one), random drinks 4, Pickpocket 2, Jackpot 1
    // (the rare one), plus 2 more Pickpocket shares for a block in the bottom half (at least half the blocks have more points).
    const ahead = others.filter((t) => (t.points || 0) > (team.points || 0)).length;
    const underdog = others.length > 0 && ahead >= this.s.teams.length / 2;
    const shares = [...(canReflect ? ['reflect', 'reflect'] : []), 'drinks', 'drinks', 'drinks', 'drinks', 'jackpot', 'pickpocket', 'pickpocket', ...(underdog ? ['pickpocket', 'pickpocket'] : [])];
    let kind = shares[Math.min(shares.length - 1, Math.floor(Math.random() * shares.length))];
    const marks = others.filter((t) => t.budget > 0);
    if (kind === 'pickpocket' && !marks.length) kind = 'jackpot'; // nobody has anything to steal
    let prize;
    if (kind === 'jackpot') {
      this.bank(team, MYSTERY.jackpot, 'Mystery Box jackpot');
      team.earned += MYSTERY.jackpot;
      prize = { kind: 'jackpot', amount: MYSTERY.jackpot };
      this.log(`🎁 ${team.name} opened a Mystery Box… and hit the JACKPOT: +${this.cash(MYSTERY.jackpot)}! 💰`, 'shop', '💰');
    } else if (kind === 'pickpocket') {
      // The block picks who to rob on its phone, whenever it likes: half of that block's cash.
      team.pickpockets = (team.pickpockets || 0) + 1;
      prize = { kind: 'pickpocket', pending: true };
      this.log(`🎁 ${team.name} opened a Mystery Box… and got a PICKPOCKET. Somebody’s about to lose half their cash. 🫳`, 'shop', '🫳');
    } else if (kind === 'reflect') {
      this.s.reflects.push({ teamId: team.id, round: next });
      team.reflectUsed = true;
      prize = { kind: 'reflect', round: next, label: this.slotOf(next).label };
      this.log(`🎁 ${team.name} opened a Mystery Box… what’s inside is a secret.`, 'shop', '🎁');
    } else {
      const names = MYSTERY.drinks.filter((n) => this.s.items.some((i) => i.type === 'drink' && i.name === n));
      const choice = pick(names.length ? names : ['Spirit']);
      const drink = this.s.items.find((i) => i.type === 'drink' && i.name === choice) || this.cheapestDrink();
      const qty = 1 + Math.floor(Math.random() * MYSTERY.maxQty);
      const onSelf = !others.length || Math.random() < 0.5;
      const target = onSelf ? team : pick(others);
      this.s.orders.unshift({
        ...base, id: uid(), itemId: drink.id, name: qty > 1 ? `${qty}× ${drink.name}` : drink.name, emoji: drink.emoji, type: 'drink',
        price: 0, drain: 0, drinks: 0, points: 0, qty, targetTeamId: target.id, status: 'pending', origin: 'mystery', note: 'Mystery Box',
      });
      prize = { kind: onSelf ? 'self' : 'other', qty, drink: drink.name, emoji: drink.emoji, targetTeamId: target.id };
      this.log(onSelf
        ? `🎁 ${team.name} opened a Mystery Box… and it’s ${qty}× ${drink.emoji} ${drink.name} for themselves! 😂`
        : `🎁 ${team.name} opened a Mystery Box… and ${qty}× ${drink.emoji} ${drink.name} lands on ${target.name}!`, 'shop', '🎁');
    }
    const order = { ...base, status: 'done', prize };
    this.s.orders.unshift(order);
    return { ...order, status: 'mystery', mystery: prize };
  }

  // A block with a Pickpocket from a Mystery Box picks who to rob: it takes half their cash (rounded down).
  pickpocket(playerId, { targetTeamId }) {
    const p = this.mustPlayer(playerId);
    if (!p.teamId) fail('You need to be on a block for that.');
    const team = this.mustTeam(p.teamId);
    if (!(team.pickpockets > 0)) fail('Your block has no Pickpocket to use.');
    const victim = this.mustTeam(targetTeamId);
    if (victim.id === team.id) fail('Rob someone else.');
    const amount = Math.floor(victim.budget * MYSTERY.pickpocketShare);
    if (amount < 1) fail(`${victim.name} is broke. Pick another block.`);
    team.pickpockets -= 1;
    this.bank(victim, -amount, `Pickpocketed by ${team.name}`);
    this.bank(team, amount, `Pickpocketed ${victim.name}`);
    this.log(`🫳 ${team.name} pickpocketed ${victim.name}: ${this.cash(amount)}, half their cash!`, 'shop', '🫳');
    // Everyone hears about it: every phone and the TV splash this.
    this.s.flash = { id: uid(), ts: Date.now(), kind: 'pickpocket', emoji: '🫳', title: 'PICKPOCKET!', text: `${team.name} stole ${this.cash(amount)} from ${victim.name}`, fromTeamId: team.id, toTeamId: victim.id };
    return { amount, targetTeamId: victim.id };
  }

  // ---------- block purchase requests ----------
  // In "request" mode a blockmate proposes a purchase; it goes through when the Shot Caller
  // approves it or enough blockmates second it. Requests are only visible inside the block.
  requestPurchase(p, team, input) {
    const { item, targetId, bailee, price, count, drinks, stake } = this.checkPurchase(team, input);
    if (team.requests.length >= 12) fail('Your block has too many open requests. Settle some first.');
    const req = {
      id: uid(),
      ts: Date.now(),
      by: p.id,
      byName: p.name,
      itemId: item.id,
      name: count > 1 ? `${item.name} ×${count}` : drinks && drinks.qty > 1 ? `${drinks.qty}× ${item.name}` : item.name,
      emoji: item.emoji,
      price,
      count,
      qty: drinks?.qty || null,
      stake,
      points: drinks?.points || 0,
      type: item.type,
      targetTeamId: targetId,
      targetPlayerId: bailee?.id || null,
      targetPlayerName: bailee?.name || null,
      note: cleanText(input.note, 120),
      seconds: [],
    };
    team.requests.unshift(req);
    return { status: 'requested', requestId: req.id };
  }

  findRequest(p, requestId) {
    if (!p.teamId) fail('You need to be on a block for that.');
    const team = this.mustTeam(p.teamId);
    const req = team.requests.find((r) => r.id === requestId) || fail('That request is gone.');
    return { team, req };
  }

  fulfillRequest(team, req, approver) {
    const requester = this.player(req.by);
    const buyer = requester && requester.teamId === team.id ? requester : approver;
    const out = this.purchase(buyer, team, { itemId: req.itemId, targetTeamId: req.targetTeamId, targetPlayerId: req.targetPlayerId, note: req.note, count: req.count, qty: req.qty, stake: req.stake });
    team.requests = team.requests.filter((r) => r.id !== req.id);
    return out;
  }

  secondRequest(playerId, { requestId }) {
    const p = this.mustPlayer(playerId);
    const { team, req } = this.findRequest(p, requestId);
    if (req.by === p.id) fail('You can’t second your own request.');
    if (req.seconds.includes(p.id)) fail('You already seconded it.');
    req.seconds.push(p.id);
    if (req.seconds.length >= this.secondsNeeded(team, req.by)) return this.fulfillRequest(team, req, p);
    return { status: 'seconded' };
  }

  approveRequest(playerId, { requestId }) {
    const p = this.mustPlayer(playerId);
    const { team, req } = this.findRequest(p, requestId);
    if (!p.isCaptain) fail('Only the Shot Caller can approve on their own. Second it instead.');
    return this.fulfillRequest(team, req, p);
  }

  dropRequest(playerId, { requestId }) {
    const p = this.mustPlayer(playerId);
    const { team, req } = this.findRequest(p, requestId);
    if (req.by !== p.id && !p.isCaptain) fail('Only whoever asked, or the Shot Caller, can drop it.');
    team.requests = team.requests.filter((r) => r.id !== req.id);
  }

  respondPunishment(playerId, { orderId, choice }) {
    const p = this.mustPlayer(playerId);
    const o = this.order(orderId);
    if (!o || o.type !== 'punishment' || o.status !== 'incoming') fail('That punishment is already settled.');
    if (p.teamId !== o.targetTeamId) fail('That punishment is not aimed at your block.');
    const team = this.mustTeam(o.targetTeamId);
    if (choice === 'deflect') {
      if ((team.inventory.deflect || 0) < 1) fail('Your block has no deflect cards. Take it like a champ.');
      if (!this.team(o.fromTeamId)) fail('The sender’s block no longer exists. Nowhere to bounce it.');
      team.inventory.deflect--;
      const from = o.fromTeamId;
      o.history.push({ ts: Date.now(), by: p.name, teamId: team.id, action: 'deflect' });
      o.fromTeamId = team.id;
      o.targetTeamId = from;
      o.bounces++;
      this.log(`🔄 ${team.name} played a Deflect Card! ${o.emoji} ${o.name} bounces back to ${this.teamName(from)}!`, 'punish', '🔄');
      return o;
    }
    if (choice === 'accept') {
      o.history.push({ ts: Date.now(), by: p.name, teamId: team.id, action: 'accept' });
      this.enforce(o);
      return o;
    }
    fail('Choose to take it or deflect it.');
  }

  // Applies a punishment's automatic effects (credit drain, penalty drinks) and hands it to the hosts.
  enforce(o) {
    o.status = 'pending';
    const victims =
      o.targetTeamId === HOLDING ? this.holding() : this.members(o.targetTeamId);
    // A dare-style punishment (no drinks, no credit drain) lands on each victim's to-do list.
    const dare = !o.drinks && !o.drain;
    for (const v of victims) {
      v.drinksOwed += o.drinks || 0;
      if (dare) this.sentence(v, { text: `${o.emoji} ${o.name}${o.desc ? `: ${o.desc}` : ''}`, reason: o.note ? `“${o.note}”` : '', from: this.teamName(o.fromTeamId) });
    }
    const team = this.team(o.targetTeamId);
    let drained = 0;
    if (team && o.drain) {
      drained = Math.min(team.budget, o.drain);
      team.budget -= drained;
    }
    o.drained = drained;
    const thief = o.steal && drained ? this.team(o.fromTeamId) : null;
    if (thief) this.bank(thief, drained, `${o.name} on ${team.name}`);
    const extras = [drained && (thief ? `got robbed of ${drained} by ${thief.name}` : `lost ${drained} credits`), o.drinks && `owes ${plural(o.drinks, 'drink')} each`].filter(Boolean);
    const who = this.teamName(o.targetTeamId);
    this.log(`${who[0].toUpperCase()}${who.slice(1)} is serving ${o.emoji} ${o.name}${extras.length ? ` and ${extras.join(' and ')}` : ''}.`, 'punish', '⚖️');
  }

  resolveOrder({ orderId, action, by }) {
    const o = this.order(orderId) || fail('Order not found.');
    if (action === 'enforce') {
      if (o.status !== 'incoming') fail('Only incoming punishments can be forced.');
      o.history.push({ ts: Date.now(), by: HOSTS[by]?.name || 'Warden', action: 'forced' });
      this.enforce(o);
    } else if (action === 'done') {
      if (!['pending', 'incoming'].includes(o.status)) fail('Order already closed.');
      // A drink delivered by hand, outside the bar queue, still scores for its sender.
      const scorer = o.type === 'drink' && !o.origin && this.team(o.scoresForTeamId || o.fromTeamId);
      if (scorer) {
        o.pointsAwarded = (o.points || 0) + this.perk(scorer, 'points', this.round?.number || 0) * (o.qty || 1);
        scorer.points += o.pointsAwarded;
      }
      o.status = 'done';
      o.doneAt = Date.now();
      o.resolvedBy = by || 'warden';
    } else if (action === 'cancel') {
      if (!['pending', 'incoming'].includes(o.status)) fail('Order already closed.');
      const payer = this.team(o.originalFromTeamId || o.fromTeamId);
      if (payer) payer.budget += o.price;
      if (payer && o.pointsCredited) payer.points = Math.max(0, payer.points - o.points);
      o.status = 'cancelled';
      o.resolvedBy = by || 'warden';
      this.log(`${hostTitle(by)} cancelled ${o.emoji} ${o.name}. ${payer ? `${payer.name} was refunded.` : ''}`, 'shop', '🚫');
    } else fail('Unknown action.');
  }

  // ---------- rounds (LeParty's game loop) ----------
  // Each round runs Game → Results → Spending → Drinks. Blocks pick who plays, hosts enter placings
  // and prize money is paid, blocks spend and send drinks, then the bar serves each block in turn.

  get round() {
    return this.s.rounds[this.s.rounds.length - 1] || null;
  }

  // Blocks with anyone on them take part in rounds.
  inPlayTeams() {
    return this.s.teams.filter((t) => this.members(t.id).length);
  }

  // Players who played either of the last cooldownGames non-group rounds before this one.
  cooldownIds(beforeRound = this.round) {
    const st = this.s.settings;
    const past = this.s.rounds.filter((r) => r !== beforeRound && r.revealedAt && !r.isGroup).slice(-st.cooldownGames);
    return new Set(past.flatMap((r) => Object.values(r.picks).flat()));
  }

  gamesPlayed(playerId) {
    return this.s.rounds.filter((r) => r.revealedAt && Object.values(r.picks).some((ids) => ids.includes(playerId))).length;
  }

  // Who on a block may play this round: anyone not on cooldown.
  eligibleFor(round, teamId) {
    const cd = round.isGroup ? new Set() : this.cooldownIds(round);
    return this.members(teamId).filter((m) => !cd.has(m.id));
  }

  mustRound(phase) {
    const r = this.round;
    if (!r || r.phase === 'done') fail('No round is running. Start one first.');
    if (phase && r.phase !== phase) fail(`That only works in the ${phase} phase.`);
    return r;
  }

  // Where round n sits in the night: Act 2 · Round 1, Act 2 · Final round…
  slotOf(n) {
    const per = Math.max(1, this.s.settings.roundsPerAct);
    const act = Math.floor((n - 1) / per) + 1;
    const inAct = ((n - 1) % per) + 1;
    const final = inAct === per;
    const name = this.s.night?.acts?.[act - 1]?.name || `Act ${act}`;
    return { act, inAct, final, actName: name, label: `${name} · ${final ? 'Final round' : `Round ${inAct}`}` };
  }

  // ---------- the night's setup: acts, their names and mechanics, and a game per round ----------
  // The acts list follows Settings (acts × rounds per act); growing keeps what's there, shrinking trims.
  ensureActs() {
    const st = this.s.settings;
    const night = (this.s.night ||= { status: 'draft', confirmedAt: null, acts: [] });
    const n = Math.max(1, st.actsCount);
    const per = Math.max(1, st.roundsPerAct);
    night.acts = Array.from({ length: n }, (_, i) => {
      const a = night.acts[i] || {};
      const rounds = Array.from({ length: per }, (_, j) => (a.rounds || [])[j] ?? null);
      return { id: a.id || uid(), name: a.name || `Act ${i + 1}`, mechanics: (a.mechanics || []).filter((k) => ACT_MECHANICS[k]), rounds };
    });
    return night;
  }

  // Round number for act a (1-based) and slot i (1-based).
  roundNumberOf(a, i) {
    return (a - 1) * Math.max(1, this.s.settings.roundsPerAct) + i;
  }

  mustAct(act) {
    const a = this.ensureActs().acts[toInt(act, 0) - 1];
    if (!a) fail('No such act.');
    return a;
  }

  renameAct({ act, name }) {
    const a = this.mustAct(act);
    a.name = cleanText(name, 40) || `Act ${toInt(act)}`;
  }

  setActMechanics({ act, mechanics }) {
    const a = this.mustAct(act);
    const list = (Array.isArray(mechanics) ? mechanics : String(mechanics || '').split(',')).map((k) => String(k).trim()).filter(Boolean);
    for (const k of list) if (!ACT_MECHANICS[k]) fail(`Unknown mechanic: ${k}`);
    a.mechanics = [...new Set(list)];
  }

  // Choose the game for one round of one act. A round that's already been played can't change.
  setSlot({ act, slot, gameId }) {
    const a = this.mustAct(act);
    const i = toInt(slot, 0);
    if (i < 1 || i > a.rounds.length) fail('No such round.');
    if (this.roundNumberOf(toInt(act), i) <= this.s.rounds.length) fail('That round has already been played.');
    if (gameId && !this.game(gameId)) fail('Game not found.');
    a.rounds[i - 1] = gameId || null;
  }

  // Lock the setup in: every round needs a game. After this the rounds follow the sequence.
  confirmNight({ by } = {}) {
    const night = this.ensureActs();
    const empty = night.acts.reduce((n, a) => n + a.rounds.filter((x) => !x || !this.game(x)).length, 0);
    if (empty) fail(`Choose a game for every round first (${plural(empty, 'round')} still empty).`);
    night.status = 'live';
    night.confirmedAt = Date.now();
    // Keep the games list in play order, so everything that reads it agrees with the sequence.
    const order = night.acts.flatMap((a) => a.rounds);
    this.s.games.sort((x, y) => (order.indexOf(x.id) + 1 || 999) - (order.indexOf(y.id) + 1 || 999));
    this.log(`🎬 The night is set: ${night.acts.map((a) => a.name).join(', ')}. ${plural(order.length, 'round')} to play.`, 'announce', '🎬');
  }

  // Back to editing the setup (rounds already played stay as they were).
  reopenNight() {
    this.ensureActs().status = 'draft';
  }

  // The act a round belongs to, and its mechanics' hooks.
  actOf(roundNumber) {
    return this.ensureActs().acts[this.slotOf(roundNumber).act - 1] || null;
  }

  runMechanics(roundNumber, hook, ...args) {
    const act = this.actOf(roundNumber);
    for (const k of act?.mechanics || []) ACT_MECHANICS[k]?.[hook]?.(this, ...args);
  }

  // Mechanics that adjust a value (price, points) pass it along in turn.
  foldMechanics(roundNumber, hook, value, ...args) {
    const act = this.actOf(roundNumber);
    for (const k of act?.mechanics || []) {
      const fn = ACT_MECHANICS[k]?.[hook];
      if (fn) value = fn(this, ...args, value);
    }
    return value;
  }

  // The round a power-up bought now starts in: the one after the round in progress, or the next to start.
  nextTurn() {
    const r = this.round;
    return r && r.phase !== 'done' ? r.number + 1 : this.s.rounds.length + 1;
  }

  // How much of a Winner's Bounty reward a block has in round n (host-set base + rewards active by then).
  perk(team, kind, n) {
    const base = { bonus: team.bonusDrinks, fewer: team.fewerDrinks, points: team.bonusPerDrink }[kind] || 0;
    return base + this.s.bounties.filter((b) => b.teamId === team.id && b.reward === kind && b.rewardFrom <= n).length;
  }

  totalRounds() {
    return Math.max(1, this.s.settings.actsCount) * Math.max(1, this.s.settings.roundsPerAct);
  }

  // The schedule in play order: game i fills round i.
  nextGame() {
    return this.s.games.find((g) => g.status !== 'done') || null;
  }

  startRound({ gameId } = {}) {
    if (this.round && this.round.phase !== 'done') fail(`${this.round.label || `Round ${this.round.number}`} is still running.`);
    const number = this.s.rounds.length + 1;
    if (number > this.totalRounds()) fail(`That was the final round of Act ${this.s.settings.actsCount}. Crown the winner.`);
    const planned = this.ensureActs().acts[this.slotOf(number).act - 1]?.rounds[this.slotOf(number).inAct - 1];
    const g = (gameId ? this.game(gameId) : (planned && this.game(planned)) || this.nextGame()) || fail('Pick a game for this round.');
    if (!this.inPlayTeams().length) fail('Build some blocks first.');
    const st = this.s.settings;
    const slot = this.slotOf(number);
    const app = APP_GAMES[g.runBy] ? g.runBy : null;
    if (app === 'trivia' && !g.questions?.length) fail(`${g.name} has no trivia questions yet. Add them in Setup.`);
    if (app === 'anime' && !g.openings?.length) fail(`${g.name} has no openings yet. Add them in Setup.`);
    const isGroup = !g.playersNeeded || !!app;
    const r = {
      id: uid(),
      number,
      act: slot.act,
      inAct: slot.inAct,
      final: slot.final,
      label: slot.label,
      gameId: g.id,
      gameName: g.name,
      isGroup,
      playersNeeded: g.playersNeeded || 0,
      phase: 'game',
      startedAt: Date.now(),
      pickDeadline: isGroup ? null : Date.now() + st.pickSeconds * 1000,
      picks: {},
      pickedBy: {},
      revealedAt: null,
      placings: {},
      prizes: {},
      winnerTeamId: null,
      drinksStartedAt: null,
      reflectTeamId: null,
      serves: [],
      completedAt: null,
    };
    if (slot.inAct === 1) {
      const act = this.actOf(number);
      const mech = (act?.mechanics || []).map((k) => ACT_MECHANICS[k]?.name).filter(Boolean);
      this.log(`🎬 ${slot.actName.toUpperCase()} begins: ${plural(st.roundsPerAct, 'round')}, the last one is the act’s final round.${mech.length ? ` This act: ${mech.join(', ')}.` : ''}`, 'announce', '🎬');
    }
    this.s.rounds.push(r);
    if (slot.inAct === 1) this.runMechanics(number, 'actStart', this.actOf(number));
    this.runMechanics(number, 'roundStart', r);
    // Eye Spy bought last round opens now, covering every drink sent so far.
    for (const t of this.s.teams) if (t.eyeSpyFrom === r.number) t.eyeSpyAt = Date.now();
    for (const other of this.s.games) if (other.status === 'live') other.status = 'upcoming';
    g.status = 'live';
    g.rulesVersion = (g.rulesVersion || 1) + 1; // pops the briefing on every phone
    st.shopOpen = false;
    if (isGroup) {
      for (const t of this.inPlayTeams()) {
        r.picks[t.id] = this.eligibleFor(r, t.id).map((m) => m.id);
        r.pickedBy[t.id] = 'group';
      }
      r.revealedAt = Date.now();
      if (app) {
        r.play = this.newPlay(app, g);
        this.log(`${r.label.toUpperCase()}: ${g.name}. ${app === 'coldwar' ? `Every block picks 1–${COLD_WAR_MAX} shots on its phone, in secret. ${st.pickSeconds} seconds!` : app === 'twothirds' ? `Every block picks 0–${TWO_THIRDS_MAX} on its phone, in secret. ${st.pickSeconds} seconds!` : 'Play it on your block’s phone!'}`, 'game', APP_GAMES[app].emoji);
      } else this.log(`${r.label.toUpperCase()}: ${g.name}. Everyone plays!`, 'game', '🎲');
    } else {
      this.log(`${r.label.toUpperCase()}: ${g.name}. Each block picks ${plural(r.playersNeeded, 'player')} on their phones. ${st.pickSeconds} seconds!`, 'game', '🎲');
    }
    return r;
  }

  pickPlayers(playerId, { playerIds }) {
    const p = this.mustPlayer(playerId);
    if (!p.teamId) fail('Only inmates on a block pick players.');
    const r = this.mustRound('game');
    if (r.revealedAt) fail('Picks are already in.');
    if (r.pickDeadline && Date.now() > r.pickDeadline) fail('Time’s up. The hosts are picking for you.');
    const ids = [...new Set(Array.isArray(playerIds) ? playerIds : String(playerIds || '').split(','))].filter(Boolean);
    const eligible = this.eligibleFor(r, p.teamId);
    const ok = new Set(eligible.map((m) => m.id));
    for (const id of ids) if (!ok.has(id)) fail(`${this.player(id)?.name || 'That inmate'} can’t play this round.`);
    const need = Math.min(r.playersNeeded, eligible.length);
    if (ids.length !== need) fail(`Pick exactly ${plural(need, 'player')}.`);
    r.picks[p.teamId] = ids;
    r.pickedBy[p.teamId] = p.id;
    if (this.inPlayTeams().every((t) => r.picks[t.id])) this.revealPicks();
    return { picked: ids.length };
  }

  // Fill in any block that hasn't picked (fewest games played first), then show everyone's picks.
  revealPicks() {
    const r = this.mustRound('game');
    if (r.revealedAt) return;
    for (const t of this.inPlayTeams()) {
      if (r.picks[t.id]) continue;
      const pool = shuffle(this.eligibleFor(r, t.id)).sort((a, b) => this.gamesPlayed(a.id) - this.gamesPlayed(b.id));
      r.picks[t.id] = pool.slice(0, r.playersNeeded).map((m) => m.id);
      r.pickedBy[t.id] = 'auto';
    }
    r.revealedAt = Date.now();
    const line = this.inPlayTeams()
      .map((t) => `${t.name}: ${(r.picks[t.id] || []).map((id) => this.player(id)?.name).join(', ') || 'nobody'}`)
      .join(' · ');
    this.log(`Picks are in for ${r.gameName}! ${line}`, 'game', '📣');
  }

  // Host moves the round on to entering results.
  toResults() {
    const r = this.mustRound('game');
    if (!r.revealedAt) this.revealPicks();
    r.phase = 'results';
  }

  // Money in the night's currency for feed lines: $20, or 20 credits.
  cash(n) {
    const c = this.act?.currency || {};
    return c.symbol ? `${c.symbol}${n}` : `${n} ${c.name || 'credits'}`;
  }

  // What a place pays by default (the host can award less, or more, in the results form).
  prizeFor(place) {
    const pm = this.s.settings.prizeMoney;
    return place >= 1 ? pm[Math.min(place, pm.length) - 1] || 0 : 0;
  }

  // Ranking and reward are separate: placings decide who won (and the Winner's Bounty); rewards are
  // the credits each block actually gets. A block with no reward given gets its place's prize money.
  enterResults({ placings = {}, rewards = {}, bonus = {} }) {
    const r = this.mustRound('results');
    const st = this.s.settings;
    const clean = {};
    for (const t of this.inPlayTeams()) {
      const n = toInt(placings[t.id], 0);
      if (n >= 1) clean[t.id] = n;
    }
    if (!Object.keys(clean).length) fail('Enter at least one placing.');
    for (const [teamId, place] of Object.entries(clean)) {
      const t = this.team(teamId);
      const given = rewards[teamId];
      const prize = given !== undefined && given !== ''
        ? Math.min(1000, Math.max(0, toInt(given, 0)))
        : this.prizeFor(place) + Math.max(0, toInt(bonus[teamId], 0));
      r.prizes[teamId] = prize;
      if (prize) {
        this.bank(t, prize, `${ordinalOf(place)} in ${r.gameName}`);
        t.earned += prize;
      }
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
    const summary = Object.entries(clean)
      .sort((a, b) => a[1] - b[1])
      .map(([id, place]) => `${ordinalOf(place)} ${this.teamName(id)} +${this.cash(r.prizes[id])}`)
      .join(', ');
    this.log(`${r.gameName} results: ${summary}. The commissary is open!`, 'game', '🏆');
    r.phase = 'spending';
    st.shopOpen = true;
    r.shopDeadline = st.shopSeconds ? Date.now() + st.shopSeconds * 1000 : null;
    this.runMechanics(r.number, 'results', r);
  }

  // Host gives the shop more time (or starts the clock if it had none).
  extendShop({ seconds = 30 } = {}) {
    const r = this.mustRound('spending');
    const add = Math.min(300, Math.max(5, toInt(seconds, 30))) * 1000;
    r.shopDeadline = Math.max(r.shopDeadline || 0, Date.now()) + add;
  }

  // Close the shop, settle bounties, and line up every block at the bar.
  startDrinks() {
    const r = this.mustRound('spending');
    r.shopDeadline = null;
    this.s.settings.shopOpen = false;
    this.runMechanics(r.number, 'drinksStart', r);
    this.resolveBounties(r);
    // Reflect: drinks aimed at the reflector go back to their senders and score for the reflector.
    r.reflectTeamId = this.s.reflects.find((x) => x.round === r.number)?.teamId || null;
    const reflector = r.reflectTeamId && this.team(r.reflectTeamId);
    const orders = this.s.orders.filter((o) => o.type === 'drink' && o.status === 'pending' && !o.queuedRound);
    for (const o of orders) {
      if (reflector && o.targetTeamId === reflector.id && o.fromTeamId && o.fromTeamId !== reflector.id) {
        o.reflected = true;
        o.originalTargetTeamId = o.targetTeamId;
        o.targetTeamId = o.fromTeamId;
        o.scoresForTeamId = reflector.id;
      }
      o.queuedRound = r.number;
      // Winner's Bounty rewards: free extra drinks from the sender, fewer for a shielded target.
      const sender = !o.reflected && this.team(o.fromTeamId);
      const target = o.fromTeamId && this.team(o.targetTeamId);
      const extra = sender ? this.perk(sender, 'bonus', r.number) : 0;
      const fewer = target ? this.perk(target, 'fewer', r.number) : 0;
      if (extra || fewer) {
        o.pourQty = Math.max(0, (o.qty || 1) + extra - fewer);
        o.adjust = [extra && `+${extra} bonus`, fewer && `−${fewer} shield`].filter(Boolean).join(', ');
      }
    }
    // An order shielded down to nothing never reaches the bar; its sender still scores.
    for (const o of orders.filter((x) => x.pourQty === 0)) {
      const scorer = this.team(o.scoresForTeamId || o.fromTeamId);
      if (scorer) {
        o.pointsAwarded = (o.points || 0) + this.perk(scorer, 'points', r.number) * (o.qty || 1);
        scorer.points += o.pointsAwarded;
      }
      o.status = 'done';
      o.doneAt = Date.now();
    }
    orders.splice(0, orders.length, ...orders.filter((x) => x.pourQty !== 0));
    if (reflector) this.log(`🪞 ${reflector.name} played Reflect! Every drink aimed at them goes back to whoever sent it.`, 'shop', '🪞');
    // Penalties owed from earlier rounds join the queue as their own orders.
    const cheapest = this.cheapestDrink();
    for (const pen of this.s.penalties.filter((x) => !x.appliedRound && x.fromRound < r.number)) {
      if (!this.team(pen.teamId)) continue;
      const drink = this.s.items.find((i) => i.type === 'drink' && i.name === pen.drinkName) || cheapest;
      const o = {
        id: uid(), ts: Date.now(), itemId: drink?.id || null, name: `${pen.qty}× ${drink?.name || 'shot'}`, emoji: drink?.emoji || '🥃', type: 'drink',
        price: 0, drain: 0, drinks: 0, steal: false, desc: pen.reason, buyerId: null, buyerName: 'Penalty', fromTeamId: null, originalFromTeamId: null,
        note: pen.reason, bounces: 0, history: [], targetTeamId: pen.teamId, status: 'pending', points: 0, qty: pen.qty, origin: 'penalty', queuedRound: r.number,
      };
      this.s.orders.unshift(o);
      orders.push(o);
      pen.appliedRound = r.number;
    }
    // One serve per block that owes drinks: fewest first, ties random.
    const byTeam = {};
    for (const o of orders) (byTeam[o.targetTeamId] ||= []).push(o);
    r.serves = shuffle(Object.entries(byTeam))
      .map(([teamId, list]) => ({ teamId, orderIds: list.map((o) => o.id), drinks: list.reduce((a, o) => a + (o.pourQty ?? o.qty ?? 1), 0), servedAt: null, timerEndsAt: null, finishedAt: null, missed: false, awards: [] }))
      .sort((a, b) => a.drinks - b.drinks);
    r.phase = 'drinks';
    r.drinksStartedAt = Date.now();
    this.log(r.serves.length ? `Drinks time! Order at the bar: ${r.serves.map((s) => this.teamName(s.teamId)).join(' → ')}.` : 'Nobody sent any drinks this round. Lucky.', 'game', '🍻');
    this.checkRoundDone();
  }

  cheapestDrink() {
    return this.s.items.filter((i) => i.type === 'drink' && i.active).sort((a, b) => a.price - b.price)[0] || null;
  }

  // Bartender: serve the next block in line. Starts its timer and pays the senders their points.
  barNext() {
    const r = this.mustRound('drinks');
    const s = r.serves.find((x) => !x.servedAt);
    if (!s) fail('Everyone’s been served.');
    s.servedAt = Date.now();
    s.timerEndsAt = s.servedAt + this.s.settings.serveSeconds * 1000;
    const awards = {};
    for (const id of s.orderIds) {
      const o = this.order(id);
      if (!o || o.status !== 'pending') continue;
      o.status = 'done';
      o.doneAt = s.servedAt;
      const scorer = this.team(o.scoresForTeamId || o.fromTeamId);
      if (!scorer || o.origin === 'penalty' || o.origin === 'admin') continue;
      const pts = this.foldMechanics(r.number, 'points', (o.points || 0) + this.perk(scorer, 'points', r.number) * (o.qty || 1), o);
      o.pointsAwarded = pts;
      awards[scorer.id] = (awards[scorer.id] || 0) + pts;
    }
    s.awards = Object.entries(awards).map(([teamId, points]) => ({ teamId, points }));
    for (const a of s.awards) this.team(a.teamId).points += a.points;
    this.log(`🍻 ${this.teamName(s.teamId)} is at the bar: ${plural(s.drinks, 'drink')}, ${this.s.settings.serveSeconds} seconds on the clock!`, 'game', '⏱️');
    return s;
  }

  // Bartender pressed Next by mistake: put the last block that's still drinking back in line.
  barBack() {
    const r = this.mustRound('drinks');
    const s = [...r.serves].reverse().find((x) => x.servedAt && !x.finishedAt);
    if (!s) fail('Nothing to undo.');
    for (const a of s.awards) {
      const t = this.team(a.teamId);
      if (t) t.points = Math.max(0, t.points - a.points);
    }
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

  // Host/bartender: this block couldn't finish its drinks (not the same as running out of time).
  // It loses 10% of its points and its drink income goes back to $0; there's no extra shot next round.
  barFail({ teamId }) {
    const r = this.mustRound('drinks');
    const s = r.serves.find((x) => x.teamId === teamId);
    if (!s || !s.servedAt) fail('That block hasn’t been served yet.');
    if (s.finishedAt) fail('That block is already done.');
    s.finishedAt = Date.now();
    s.finishedBy = 'host';
    s.missed = true;
    s.failed = true;
    const t = this.team(teamId);
    if (t) {
      const pts = t.points || 0;
      const lost = pts > 0 ? Math.max(1, Math.round(pts * this.s.settings.failPointsPct / 100)) : 0;
      t.points = pts - lost;
      s.pointsLost = lost;
      s.streamLost = t.drinkStream || 0;
      t.drinkStream = 0;
      this.log(`❌ ${t.name} couldn’t finish their drinks: they lose ${this.s.settings.failPointsPct}% of their points${s.streamLost ? `, and their drink income is back to ${this.cash(0)}` : ''}.`, 'punish', '❌');
    }
    this.checkRoundDone();
  }

  // Host/bartender: this block finished inside its time.
  barDone({ teamId }) {
    const r = this.mustRound('drinks');
    const s = r.serves.find((x) => x.teamId === teamId);
    if (!s || !s.servedAt) fail('That block hasn’t been served yet.');
    if (s.finishedAt) return;
    s.finishedAt = Date.now();
    s.finishedBy = 'host';
    // Drink income: each round a block finishes in time it's paid one step more than last time ($5, $10, $15…).
    const t = this.team(teamId);
    if (t) {
      t.drinkStream = (t.drinkStream || 0) + this.s.settings.streamStep;
      s.reward = t.drinkStream;
      if (s.reward) {
        this.bank(t, s.reward, `Finished ${plural(s.drinks, 'drink')} in time`);
        t.earned += s.reward;
      }
      this.log(`✅ ${t.name} finished in time: +${this.cash(s.reward)}. Next time: ${this.cash(t.drinkStream + this.s.settings.streamStep)}.`, 'money', '✅');
    }
    this.checkRoundDone();
  }

  // Lazy clock: deadlines that passed since the last action. Safe to call any time.
  tick(now = Date.now()) {
    const r = this.round;
    if (!r) return false;
    let changed = false;
    if (r.phase === 'game' && !r.revealedAt && r.pickDeadline && now >= r.pickDeadline) {
      this.revealPicks();
      changed = true;
    }
    const pl = r.phase === 'game' && r.play;
    if (pl && pl.deadline && now >= pl.deadline) {
      if (pl.kind === 'coldwar' && !pl.revealed) this.revealColdWar(r);
      if (pl.kind === 'twothirds' && !pl.revealed) this.revealTwoThirds(r);
      if (pl.kind === 'dilemma' && pl.state === 'open') this.resolveDilemma(r);
      if (pl.kind === 'trivia' && pl.state === 'asking') this.revealQuestion(r);
      if (pl.kind === 'anime' && pl.state === 'open') {
        pl.state = 'missed';
        pl.deadline = null;
        this.log(`🎵 Time’s up on opening ${pl.i + 1}: it was ${pl.items[pl.i].answers[0]}.`, 'game', '🎵');
      }
      if (pl.kind === 'lying' && pl.state === 'voting') {
        pl.state = 'closed';
        pl.deadline = null;
      }
      changed = true;
    }
    if (r.phase === 'spending' && r.shopDeadline && now >= r.shopDeadline) {
      this.log('⏰ Time’s up! The shop is closed. To the bar!', 'game', '⏰');
      this.startDrinks();
      changed = true;
    }
    if (r.phase === 'drinks') {
      for (const s of r.serves) {
        if (s.servedAt && !s.finishedAt && s.timerEndsAt && now >= s.timerEndsAt) {
          s.finishedAt = s.timerEndsAt;
          s.finishedBy = 'timer';
          s.missed = true;
          const t = this.team(s.teamId);
          if (t) {
            s.streamLost = t.drinkStream;
            t.drinkStream = 0;
          }
          const drink = this.cheapestDrink();
          this.s.penalties.push({ id: uid(), teamId: s.teamId, qty: 1, drinkName: drink?.name || 'Soju Shot', reason: 'Missed the 30 seconds', fromRound: r.number, appliedRound: null });
          this.log(`⏰ ${this.teamName(s.teamId)} ran out of time. That’s an extra shot next round${s.streamLost ? `, and their drink income is back to ${this.cash(0)}` : ''}.`, 'punish', '⏰');
          changed = true;
        }
      }
      if (this.checkRoundDone()) changed = true;
    }
    return changed;
  }

  // The next moment the clock needs to act on, so screens know when to call tick.
  nextDeadline() {
    const r = this.round;
    if (!r) return null;
    if (r.phase === 'game' && !r.revealedAt) return r.pickDeadline;
    if (r.phase === 'game' && r.play?.deadline) return r.play.deadline;
    if (r.phase === 'spending' && r.shopDeadline) return r.shopDeadline;
    if (r.phase === 'drinks') return Math.min(...r.serves.filter((s) => s.servedAt && !s.finishedAt).map((s) => s.timerEndsAt), Infinity) || null;
    return null;
  }

  checkRoundDone() {
    const r = this.round;
    if (!r || r.phase !== 'drinks' || r.serves.some((s) => !s.finishedAt)) return false;
    r.phase = 'done';
    r.completedAt = Date.now();
    const last = r.number >= this.totalRounds();
    this.log(last ? `${r.label} is done. That’s the night!` : r.final ? `${r.label} is done. That’s the end of ${r.actName || this.slotOf(r.number).actName}.` : `${r.label} is done.`, 'game', '✅');
    this.tickRound();
    // Points go public only at the end of each act: the TV and other blocks see this snapshot.
    if (r.final || last) this.revealPoints(r.actName || this.slotOf(r.number).actName);
    // The last act's final round ends the night: most points wins (credits earned break a tie).
    if (last && !this.s.winner) this.crownWinner({});
    return true;
  }

  // Publish every block's points as they stand now. Until the next act ends, the TV and the other blocks
  // see these; each block still sees its own live score, and hosts see everything live.
  revealPoints(actName) {
    this.s.shownPoints = Object.fromEntries(this.s.teams.map((t) => [t.id, t.points || 0]));
    this.s.shownAt = actName || null;
    this.log(`📊 ${actName ? `End of ${actName}: ` : ''}the standings are updated on the TV.`, 'announce', '📊');
  }

  // Host drops drinks straight into the current round's queue (before drinks start).
  assignDrinks({ teamId, itemId, qty, reason, by }) {
    const r = this.round;
    if (r && r.phase === 'drinks') fail('This round’s queue is already built. Assign it after the round.');
    const t = this.mustTeam(teamId);
    const item = this.item(itemId);
    if (!item || item.type !== 'drink') fail('Pick a drink.');
    const q = Math.min(MAX_DRINKS_PER_ORDER, Math.max(1, toInt(qty, 1)));
    const why = cleanText(reason, 80);
    this.s.orders.unshift({
      id: uid(), ts: Date.now(), itemId: item.id, name: q > 1 ? `${q}× ${item.name}` : item.name, emoji: item.emoji, type: 'drink', price: 0, drain: 0, drinks: 0,
      steal: false, desc: '', buyerId: null, buyerName: hostTitle(by), fromTeamId: null, originalFromTeamId: null, note: why, bounces: 0, history: [],
      targetTeamId: t.id, status: 'pending', points: 0, qty: q, origin: 'admin',
    });
    this.log(`${hostTitle(by)} sent ${t.name} ${q}× ${item.emoji} ${item.name}${why ? ` for ${why}` : ''}.`, 'punish', '🍺');
  }

  // ---------- app-run games ----------
  // The block phones play; the app scores, places the blocks by score (ties: faster wins) and pays prizes.
  newPlay(kind, g) {
    if (kind === 'coldwar') return { kind, bids: {}, deadline: Date.now() + this.s.settings.pickSeconds * 1000, revealed: false, drinks: null };
    if (kind === 'trivia') return { kind, questions: g.questions.map((q) => ({ ...q })), qi: -1, state: 'ready', deadline: null, askedAt: null, answers: [], scores: {}, ms: {} };
    if (kind === 'twothirds') return { kind, picks: {}, deadline: Date.now() + this.s.settings.pickSeconds * 1000, revealed: false, average: null, target: null, order: null, drinks: null };
    if (kind === 'dilemma') {
      // Random pairs for the whole game; an odd block out plays the House, which picks at random.
      const ids = this.inPlayTeams().map((t) => t.id).sort(() => Math.random() - 0.5);
      const pairs = [];
      for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1] || 'house']);
      return { kind, pairs, total: Math.min(10, g.stories || 3), n: 0, state: 'ready', deadline: null, openedAt: null, choices: [], results: [], scores: {}, shots: {}, ms: {} };
    }
    if (kind === 'anime') return { kind, items: g.openings.map((o) => ({ ...o })), i: -1, state: 'ready', deadline: null, openedAt: null, winners: [], guesses: [], scores: {}, ms: {} };
    return { kind, total: g.stories || 5, n: 0, state: 'ready', deadline: null, openedAt: null, votes: [], truth: [], scores: {}, ms: {} };
  }

  mustPlay(kind) {
    const r = this.mustRound('game');
    if (!r.play || (kind && r.play.kind !== kind)) fail('There’s no app-run game in progress.');
    return r;
  }

  // A block phone answers: Cold War shots (1–15), a trivia answer (0–3) or Truth/Lie.
  playAnswer(playerId, { value }) {
    const p = this.mustPlayer(playerId);
    if (!p.teamId) fail('Only a block can answer.');
    const r = this.mustPlay();
    const pl = r.play;
    const now = Date.now();
    const teams = this.inPlayTeams().map((t) => t.id);
    if (pl.kind === 'coldwar') {
      if (pl.revealed) fail('The shots are already revealed.');
      if (now > pl.deadline) fail('Time’s up.');
      const n = toInt(value, 0);
      if (n < 1 || n > COLD_WAR_MAX) fail(`Pick between 1 and ${COLD_WAR_MAX} shots.`);
      pl.bids[p.teamId] = { n, at: now };
      if (teams.every((id) => pl.bids[id])) this.revealColdWar(r);
      return { locked: n };
    }
    if (pl.kind === 'twothirds') {
      if (pl.revealed) fail('The numbers are already revealed.');
      if (now > pl.deadline) fail('Time’s up.');
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > TWO_THIRDS_MAX) fail(`Pick a whole number from 0 to ${TWO_THIRDS_MAX}.`);
      if (pl.picks[p.teamId]) fail('Your block already locked in a number.');
      pl.picks[p.teamId] = { n, at: now };
      if (teams.every((id) => pl.picks[id])) this.revealTwoThirds(r);
      return { locked: n };
    }
    if (pl.kind === 'dilemma') {
      if (pl.state !== 'open' || now > pl.deadline) fail('No turn is open right now.');
      if (!['silent', 'snitch'].includes(value)) fail('Pick Stay Silent or Snitch.');
      const box = pl.choices[pl.n];
      if (box[p.teamId]) fail('Your block already picked this turn.');
      box[p.teamId] = { choice: value, ms: now - pl.openedAt };
      if (teams.every((id) => box[id])) this.resolveDilemma(r);
      return { picked: value };
    }
    if (pl.kind === 'trivia') {
      if (pl.state !== 'asking' || now > pl.deadline) fail('No question is open right now.');
      const q = pl.questions[pl.qi];
      const choice = toInt(value, -1);
      if (!(choice >= 0 && choice < q.options.length)) fail('Pick one of the answers.');
      const box = pl.answers[pl.qi];
      if (box[p.teamId]) fail('Your block already answered this one.');
      box[p.teamId] = { choice, ms: now - pl.askedAt };
      if (teams.every((id) => box[id])) this.revealQuestion(r);
      return { answered: true };
    }
    if (pl.kind === 'anime') {
      if (pl.state !== 'open' || now > pl.deadline) fail('No opening is playing right now.');
      const guess = cleanText(value, 80);
      if (!guess) fail('Type the anime’s name.');
      const tries = (pl.guesses[pl.i] ||= {});
      tries[p.teamId] = (tries[p.teamId] || 0) + 1;
      if (!guessMatches(guess, pl.items[pl.i].answers)) return { correct: false };
      this.awardOpening(r, p.teamId, now - pl.openedAt);
      return { correct: true };
    }
    if (pl.state !== 'voting' || now > pl.deadline) fail('Voting isn’t open right now.');
    if (!['truth', 'lie'].includes(value)) fail('Vote Truth or Lie.');
    const box = pl.votes[pl.n];
    if (box[p.teamId]) fail('Your block already voted on this story.');
    box[p.teamId] = { choice: value, ms: now - pl.openedAt };
    if (teams.every((id) => box[id])) pl.state = 'closed';
    return { voted: value };
  }

  // Host: the next trivia question, or open the vote on the next story.
  playNext() {
    const r = this.mustPlay();
    const pl = r.play;
    const st = this.s.settings;
    if (pl.kind === 'trivia') {
      if (pl.state === 'asking') fail('Reveal this question’s answer first.');
      if (pl.qi + 1 >= pl.questions.length) fail('That was the last question. Tap Finish to place the blocks.');
      pl.qi += 1;
      pl.answers[pl.qi] = {};
      pl.askedAt = Date.now();
      pl.deadline = pl.askedAt + st.questionSeconds * 1000;
      pl.state = 'asking';
      return;
    }
    if (pl.kind === 'lying') {
      if (['voting', 'closed'].includes(pl.state)) fail('Say whether the last story was true first.');
      if (pl.n >= pl.total) fail('That was the last story. Tap Finish to place the blocks.');
      pl.n += 1;
      pl.votes[pl.n] = {};
      pl.openedAt = Date.now();
      pl.deadline = pl.openedAt + st.voteSeconds * 1000;
      pl.state = 'voting';
      return;
    }
    if (pl.kind === 'anime') {
      if (pl.state === 'open') fail('This opening is still open. Wait, or tap Nobody got it.');
      if (pl.i + 1 >= pl.items.length) fail('That was the last opening. Tap Finish to place the blocks.');
      pl.i += 1;
      pl.openedAt = Date.now();
      pl.deadline = pl.openedAt + st.guessSeconds * 1000;
      pl.state = 'open';
      return;
    }
    if (pl.kind === 'dilemma') {
      if (pl.state === 'open') fail('This turn is still open. Reveal it first.');
      if (pl.n >= pl.total) fail('That was the last turn. Tap Finish to place the blocks.');
      pl.n += 1;
      pl.choices[pl.n] = {};
      pl.openedAt = Date.now();
      pl.deadline = pl.openedAt + st.voteSeconds * 1000;
      pl.state = 'open';
      return;
    }
    fail('This game has no next step: reveal, then finish.');
  }

  // Host (or the clock): show the answer. "Is Jason lying?" needs the host to say what it really was.
  playReveal({ truth, teamId } = {}) {
    const r = this.mustPlay();
    const pl = r.play;
    if (pl.kind === 'coldwar') return this.revealColdWar(r);
    if (pl.kind === 'twothirds') return this.revealTwoThirds(r);
    if (pl.kind === 'dilemma') {
      if (pl.state !== 'open') fail('No turn is open.');
      return this.resolveDilemma(r);
    }
    if (pl.kind === 'anime') {
      if (pl.state !== 'open') fail('No opening is playing.');
      if (teamId) return this.awardOpening(r, this.mustTeam(teamId).id, Date.now() - pl.openedAt); // a near-miss the hosts allow
      pl.state = 'missed';
      pl.deadline = null;
      this.log(`🎵 Nobody got opening ${pl.i + 1}: it was ${pl.items[pl.i].answers[0]}.`, 'game', '🎵');
      return;
    }
    if (pl.kind === 'trivia') {
      if (pl.state !== 'asking') fail('No question is open.');
      return this.revealQuestion(r);
    }
    if (!['voting', 'closed'].includes(pl.state)) fail('No story is being voted on.');
    if (!['truth', 'lie'].includes(truth)) fail('Was it the truth or a lie?');
    pl.truth[pl.n] = truth;
    for (const [teamId, v] of Object.entries(pl.votes[pl.n] || {})) {
      if (v.choice !== truth) continue;
      pl.scores[teamId] = (pl.scores[teamId] || 0) + 1;
      pl.ms[teamId] = (pl.ms[teamId] || 0) + v.ms;
    }
    pl.state = 'revealed';
    this.log(`🤥 Story ${pl.n}: it was ${truth === 'truth' ? 'the TRUTH' : 'a LIE'}! ${Object.values(pl.votes[pl.n] || {}).filter((v) => v.choice === truth).length} block(s) called it.`, 'game', '🤥');
  }

  // The first block to name the opening takes it; it closes for everyone else.
  awardOpening(r, teamId, ms) {
    const pl = r.play;
    pl.winners[pl.i] = teamId;
    pl.scores[teamId] = (pl.scores[teamId] || 0) + 1;
    pl.ms[teamId] = (pl.ms[teamId] || 0) + ms;
    pl.state = 'won';
    pl.deadline = null;
    this.log(`🎵 ${this.teamName(teamId)} named opening ${pl.i + 1} first: ${pl.items[pl.i].answers[0]}!`, 'game', '🎵');
  }

  revealQuestion(r) {
    const pl = r.play;
    const q = pl.questions[pl.qi];
    for (const [teamId, a] of Object.entries(pl.answers[pl.qi] || {})) {
      if (a.choice !== q.answer) continue;
      pl.scores[teamId] = (pl.scores[teamId] || 0) + 1;
      pl.ms[teamId] = (pl.ms[teamId] || 0) + a.ms;
    }
    pl.state = 'revealed';
    pl.deadline = null;
  }

  // Everyone's numbers come out. The two lowest drink their own shots plus the two highest blocks' shots
  // (lowest takes the highest's, second lowest the second highest's); the two highest drink nothing;
  // anyone in between drinks their own. Places go by number, highest first.
  // A game's shots go into this round's bar queue like any other drinks (Spirits, scoring nobody).
  queueGameShots(drinks, label, emoji = '🎲') {
    const shot = this.s.items.find((i) => i.type === 'drink' && i.name === 'Spirit') || this.cheapestDrink();
    for (const [teamId, qty] of Object.entries(drinks)) {
      if (!qty || !this.team(teamId)) continue;
      this.s.orders.unshift({
        id: uid(), ts: Date.now(), itemId: shot?.id || null, name: `${qty}× ${shot?.name || 'shot'} (${label})`, emoji, type: 'drink', price: 0, drain: 0, drinks: 0,
        steal: false, desc: '', buyerId: null, buyerName: label, fromTeamId: null, originalFromTeamId: null, note: label, bounces: 0, history: [],
        targetTeamId: teamId, status: 'pending', points: 0, qty, origin: 'game',
      });
    }
  }

  // Two-Thirds of the Average: closest to ⅔ of the average pick wins; ties go to whoever locked in first.
  // Blocks that didn't pick rank last (in random order) and drink 1 each; the furthest picker drinks 1 per 10 off.
  revealTwoThirds(r) {
    const pl = r.play;
    if (pl.revealed) return;
    const ids = this.inPlayTeams().map((t) => t.id);
    const pickers = ids.filter((id) => pl.picks[id]);
    const missed = ids.filter((id) => !pl.picks[id]).sort(() => Math.random() - 0.5);
    const avg = pickers.length ? pickers.reduce((n, id) => n + pl.picks[id].n, 0) / pickers.length : 0;
    const target = Math.round(avg * (2 / 3) * 10) / 10;
    const gap = (id) => Math.abs(pl.picks[id].n - target);
    pickers.sort((a, b) => gap(a) - gap(b) || pl.picks[a].at - pl.picks[b].at);
    const drinks = {};
    for (const id of missed) drinks[id] = 1;
    const far = pickers[pickers.length - 1];
    if (far && pickers.length > 1) drinks[far] = Math.min(10, Math.max(1, Math.ceil(gap(far) / 10)));
    pl.average = Math.round(avg * 10) / 10;
    pl.target = target;
    pl.order = [...pickers, ...missed];
    pl.missed = missed;
    pl.drinks = drinks;
    pl.revealed = true;
    pl.deadline = null;
    this.queueGameShots(drinks, 'Two-Thirds', '🧠');
    const top = pickers[0];
    this.log(`🧠 Two-thirds of the average (${pl.average}) is ${target}. ${top ? `${this.teamName(top)} was closest with ${pl.picks[top].n}!` : 'Nobody picked.'}${far && drinks[far] ? ` ${this.teamName(far)} was furthest off and drinks ${drinks[far]}.` : ''}`, 'game', '🧠');
  }

  // Prisoner's Dilemma: settle this turn for every pair. A block that didn't pick stays silent; the House picks at random.
  resolveDilemma(r) {
    const pl = r.play;
    if (pl.state !== 'open') return;
    const box = pl.choices[pl.n] || {};
    const res = {};
    const lines = [];
    for (const [a, b] of pl.pairs) {
      const pickOf = (id) => (id === 'house' ? { choice: Math.random() < 0.5 ? 'silent' : 'snitch', house: true } : box[id] || { choice: 'silent', auto: true });
      const ca = pickOf(a);
      const cb = pickOf(b);
      for (const [me, mine, theirs, vs] of [[a, ca, cb, b], [b, cb, ca, a]]) {
        if (me === 'house') continue;
        const [pts, shots] = DILEMMA[mine.choice][theirs.choice];
        res[me] = { choice: mine.choice, auto: !!mine.auto, pts, shots, vs, theirs: theirs.choice };
        pl.scores[me] = (pl.scores[me] || 0) + pts;
        pl.shots[me] = (pl.shots[me] || 0) + shots;
      }
      const word = (c) => (c.choice === 'snitch' ? 'snitched' : 'stayed silent');
      lines.push(`${b === 'house' ? `${this.teamName(a)} ${word(ca)}, the House ${word(cb)}` : `${this.teamName(a)} ${word(ca)}, ${this.teamName(b)} ${word(cb)}`}`);
    }
    pl.results[pl.n] = res;
    pl.state = 'revealed';
    pl.deadline = null;
    this.log(`🐀 Turn ${pl.n}: ${lines.join(' · ')}.`, 'game', '🐀');
  }

  revealColdWar(r) {
    const pl = r.play;
    if (pl.revealed) return;
    const teams = this.inPlayTeams();
    for (const t of teams) if (!pl.bids[t.id]) pl.bids[t.id] = { n: 1, at: Infinity, auto: true };
    const order = teams.map((t) => t.id).sort((a, b) => pl.bids[b].n - pl.bids[a].n || pl.bids[a].at - pl.bids[b].at);
    const k = Math.min(2, Math.floor(order.length / 2));
    const high = order.slice(0, k);
    const low = order.slice(order.length - k).reverse(); // lowest first
    const drinks = {};
    for (const id of order) drinks[id] = pl.bids[id].n;
    high.forEach((id, i) => {
      drinks[low[i]] += pl.bids[id].n;
      drinks[id] = 0;
    });
    pl.order = order;
    pl.drinks = drinks;
    pl.revealed = true;
    pl.deadline = null;
    this.queueGameShots(drinks, 'Cold War', '🧊');
    this.log(`🧊 Cold War: ${order.map((id) => `${this.teamName(id)} ${pl.bids[id].n}`).join(' · ')}. ${low.map((id) => `${this.teamName(id)} drinks ${drinks[id]}`).join(', ')}!`, 'game', '🧊');
  }

  // Host: place the blocks by score and pay the prizes (the normal Results step, done by the app).
  playFinish() {
    const r = this.mustPlay();
    const pl = r.play;
    let order;
    if (pl.kind === 'coldwar') {
      if (!pl.revealed) this.revealColdWar(r);
      order = pl.order;
    } else if (pl.kind === 'twothirds') {
      if (!pl.revealed) this.revealTwoThirds(r);
      order = pl.order;
    } else if (pl.kind === 'dilemma') {
      if (pl.state === 'open') this.resolveDilemma(r);
      // Most points first; fewer shots drunk breaks a tie.
      order = this.inPlayTeams()
        .map((t) => t.id)
        .sort((a, b) => (pl.scores[b] || 0) - (pl.scores[a] || 0) || (pl.shots[a] || 0) - (pl.shots[b] || 0));
      this.queueGameShots(pl.shots, 'Prisoner’s Dilemma');
    } else {
      if (pl.state === 'asking') this.revealQuestion(r);
      if (pl.kind === 'anime' && pl.state === 'open') pl.state = 'missed';
      if (['voting', 'closed'].includes(pl.state)) fail('Say whether the last story was true first.');
      order = this.inPlayTeams()
        .map((t) => t.id)
        .sort((a, b) => (pl.scores[b] || 0) - (pl.scores[a] || 0) || (pl.ms[a] ?? Infinity) - (pl.ms[b] ?? Infinity));
    }
    pl.done = true;
    r.phase = 'results';
    // The app ranks the blocks; the host checks the rewards and pays them from the results form.
    r.proposed = Object.fromEntries(order.map((id, i) => [id, i + 1]));
    this.log(`${r.gameName} is over! The hosts are confirming the results.`, 'game', '🏁');
  }

  // ---------- bounties ----------
  activeBounty(teamId) {
    return this.s.bounties.find((b) => b.teamId === teamId && b.status === 'active') || null;
  }

  // Every drink a block sends counts toward its bounty, the moment it's sent.
  countBounty(team, qty) {
    const b = this.activeBounty(team.id);
    if (!b || !this.round || this.round.phase === 'done' || this.round.number < b.startRound) return;
    b.sent += qty;
    if (b.sent < BOUNTY.target) return;
    b.status = 'hit';
    b.hitAt = Date.now();
    // Bounties from before the rework had no stake: they pay the old flat 25 points.
    const won = b.stake != null ? b.stake * (b.mult || 3) : 25;
    b.paid = won;
    team.points += won;
    this.log(`🎯 ${team.name} hit their ${b.kind === 'winner' ? 'Winner’s' : 'Open'} Bounty! The payout shows at the end of the act.`, 'shop', '🎯');
  }

  // Bounties past their last round when its shop closes are missed: the block owes Spirit shots next round.
  resolveBounties(r) {
    for (const b of this.s.bounties.filter((x) => x.status === 'active' && r.number >= x.deadlineRound)) {
      b.status = 'missed';
      // Riskier: the stake is already gone, and a miss takes the same again (never below 0).
      const t = this.team(b.teamId);
      if (t && b.stake) {
        const extra = Math.min(t.points || 0, Math.round((b.stake * this.s.settings.bountyMissExtra) / 100));
        t.points = (t.points || 0) - extra;
        b.lostExtra = extra;
      }
      this.s.penalties.push({ id: uid(), teamId: b.teamId, qty: BOUNTY.missQty, drinkName: BOUNTY.missDrink, reason: 'Missed a bounty', fromRound: r.number, appliedRound: null });
      this.log(`💀 ${this.teamName(b.teamId)} missed their bounty${b.stake ? ', lost their stake and the same again' : ''}. ${BOUNTY.missQty} shots of ${BOUNTY.missDrink} next round.`, 'punish', '💀');
    }
  }

  // ---------- the end ----------
  crownWinner({ teamId, by }) {
    const t = teamId ? this.mustTeam(teamId) : [...this.s.teams].sort((a, b) => b.points - a.points || b.earned - a.earned)[0];
    if (!t) fail('No blocks to crown.');
    this.s.winner = { teamId: t.id, at: Date.now() };
    this.s.shownPoints = Object.fromEntries(this.s.teams.map((x) => [x.id, x.points || 0]));
    this.s.shownAt = 'the end of the night';
    this.log(`👑 ${t.name} wins ${this.s.settings.partyName} with ${plural(t.points, 'point')}!`, 'announce', '👑');
  }

  clearWinner() {
    this.s.winner = null;
  }

  // Eye Spy: every drink sent up to the moment the block bought it, round by round.
  eyeSpyTable(team) {
    if (!team.eyeSpyAt) return null;
    const rows = {};
    for (const o of this.s.orders) {
      if (o.type !== 'drink' || !o.fromTeamId || o.ts > team.eyeSpyAt || o.status === 'cancelled') continue;
      const from = o.hidden && o.fromTeamId !== team.id ? 'anonymous' : o.fromTeamId;
      const key = `${o.queuedRound || 0}|${from}|${o.originalTargetTeamId || o.targetTeamId}`;
      rows[key] = (rows[key] || 0) + (o.qty || 1);
    }
    return {
      at: team.eyeSpyAt,
      rows: Object.entries(rows)
        .map(([k, qty]) => {
          const [round, from, to] = k.split('|');
          return { round: Number(round), from, to, qty };
        })
        .sort((a, b) => (a.round || 999) - (b.round || 999) || b.qty - a.qty),
    };
  }

  // ---------- views ----------
  publicPlayer(p, viewer) {
    return {
      id: p.id,
      name: p.name,
      inmateNo: p.inmateNo,
      charge: p.charge,
      teamId: p.teamId,
      isCaptain: p.isCaptain,
      status: this.status(p),
      drinksOwed: p.drinksOwed,
      sentencesOpen: p.sentences.filter((x) => x.status === 'open').length,
      drinksDone: p.drinksDone,
      vision: p.vision,
      adventureExp: p.adventureExp,
    };
  }

  baseView(viewer) {
    const s = this.s;
    const isAdmin = viewer === 'admin';
    return {
      settings: { ...s.settings },
      itemTypes: ITEM_TYPES,
      act: s.act,
      introAt: s.introAt || 0,
      clips: s.clips
        .filter((c) => isAdmin || c.status === 'live' || (viewer && viewer.teamId && c.teamId === viewer.teamId))
        .map(({ playerId, ...c }) => (isAdmin ? { playerId, ...c } : c)),
      acts: this.acts,
      actSets: Object.fromEntries(Object.entries(ACT_SETS).map(([k, v]) => [k, v.name])),
      warpPrizes: this.act.prizes || WARP_PRIZES,
      visions: this.visionsView(),
      commissionReward: { ...COMMISSION_REWARD, bonus: COMMISSION_BONUS },
      augments: Object.fromEntries(Object.keys(AUGMENTS).map((k) => [k, this.augmentInfo(k)])),
      teams: s.teams.map((t) => {
        const own = isAdmin || (viewer && viewer.teamId === t.id);
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          budget: t.budget,
          earned: t.earned,
          // Other blocks' points are the last act-end snapshot; your own block's are live.
          points: own ? t.points : s.shownPoints?.[t.id] ?? 0,
          pointsLive: own,
          inventory: own ? { ...t.inventory } : null,
          ledger: own ? t.ledger.slice(0, 15) : null,
          requests: own ? t.requests : null,
          nickname: t.nickname,
          motto: t.motto,
          streak: t.streak,
          augment: t.augment,
          pity: own ? t.pity : null,
          bonusPerDrink: t.bonusPerDrink,
          bonusDrinks: t.bonusDrinks,
          fewerDrinks: t.fewerDrinks,
          drinkStream: t.drinkStream,
          // Block cards are for hosts only: anyone who sees a code can take over that block's phone.
          ...(isAdmin ? { joinCode: t.joinCode, joinToken: t.joinToken, phoneAt: t.phoneAt } : {}),
          reflectUsed: own ? t.reflectUsed : null,
          pickpockets: own ? t.pickpockets || 0 : null,
          augmentOffer: own ? t.augmentOffer : null,
        };
      }),
      players: s.players.filter((p) => !p.device).map((p) =>
        isAdmin ? { ...this.publicPlayer(p, null), fromLeParty: !!p.lepartyId, lepartyGone: !!p.lepartyGone, sentences: p.sentences } : this.publicPlayer(p, viewer),
      ),
      items: isAdmin ? s.items : s.items.filter((i) => this.itemLive(i)).map((i) => this.skinItem(i)),
      games: s.games,
      rounds: this.roundsHistory(),
      plan: { acts: s.settings.actsCount, perAct: s.settings.roundsPerAct, total: this.totalRounds() },
      winner: s.winner,
      pointsAsOf: s.shownAt || null,
      flash: s.flash && Date.now() - s.flash.ts < 120000 ? s.flash : null, // a big moment every screen shows once
      winnerRewards: WINNER_REWARDS,
      bountyRules: { target: BOUNTY.target, rounds: BOUNTY.rounds, missQty: BOUNTY.missQty, missDrink: BOUNTY.missDrink },
      night: { status: s.night.status, confirmedAt: s.night.confirmedAt, acts: s.night.acts },
      mechanicsCatalog: Object.fromEntries(Object.entries(ACT_MECHANICS).map(([k, m]) => [k, { name: m.name, desc: m.desc }])),
      nextDeadline: this.nextDeadline(),
      penaltiesOwed: s.penalties.filter((x) => !x.appliedRound).map(({ teamId, qty, drinkName, reason }) => ({ teamId, qty, drinkName, reason })),
      feed: s.feed.slice(0, 80),
      announcement: s.announcement,
    };
  }

  // The current round, as one viewer may see it. Picks stay secret until revealed; Reflect until drinks start.
  roundView(viewer) {
    const r = this.round;
    if (!r) return null;
    const isAdmin = viewer === 'admin';
    const mine = viewer && viewer !== 'admin' ? viewer.teamId : null;
    const picks = r.revealedAt || isAdmin ? r.picks : mine && r.picks[mine] ? { [mine]: r.picks[mine] } : {};
    const orderOf = (id) => this.order(id);
    return {
      actName: this.slotOf(r.number).actName,
      actMechanics: (this.actOf(r.number)?.mechanics || []).map((k) => ACT_MECHANICS[k]?.name).filter(Boolean),
      id: r.id, number: r.number, label: r.label || this.slotOf(r.number).label, act: r.act || this.slotOf(r.number).act, final: r.final ?? this.slotOf(r.number).final, gameId: r.gameId, gameName: r.gameName, isGroup: r.isGroup, playersNeeded: r.playersNeeded, phase: r.phase,
      startedAt: r.startedAt, pickDeadline: r.pickDeadline, shopDeadline: r.shopDeadline || null, revealedAt: r.revealedAt, picks, picked: Object.keys(r.picks), pickedBy: isAdmin || r.revealedAt ? r.pickedBy : {},
      placings: r.placings, proposed: isAdmin ? r.proposed || null : null, prizes: r.prizes, winnerTeamId: r.winnerTeamId, drinksStartedAt: r.drinksStartedAt, completedAt: r.completedAt,
      reflectTeamId: isAdmin || r.drinksStartedAt ? r.reflectTeamId : null,
      play: r.play ? this.playView(r.play, isAdmin, mine) : null,
      cooldown: r.isGroup ? [] : [...this.cooldownIds(r)],
      eligible: mine && r.phase === 'game' ? this.eligibleFor(r, mine).map((m) => m.id) : [],
      serves: r.serves.map((s) => ({
        teamId: s.teamId, drinks: s.drinks, servedAt: s.servedAt, timerEndsAt: s.timerEndsAt, finishedAt: s.finishedAt, missed: s.missed, reward: s.reward || 0, streamLost: s.streamLost || 0, failed: !!s.failed, pointsLost: s.pointsLost || 0,
        neat: s.orderIds.map(orderOf).filter((o) => o?.noChaser).reduce((n, o) => n + (o.pourQty ?? o.qty ?? 1), 0),
        // The bar sees what to pour and who sent it.
        ...(isAdmin
          ? {
              awards: s.awards,
              breakdown: s.orderIds.map(orderOf).filter(Boolean).map((o) => ({ emoji: o.emoji, name: o.name, noChaser: !!o.noChaser, qty: o.pourQty ?? o.qty ?? 1, adjust: o.adjust || '', from: o.origin === 'penalty' ? `Penalty: ${o.note}` : o.origin === 'admin' ? 'The hosts' : o.origin === 'mystery' ? `Mystery Box (${this.teamName(o.fromTeamId)})` : o.hidden ? '🕶️ Anonymous' : `${this.teamName(o.fromTeamId)}${o.reflected ? ' (reflected)' : ''}`, note: o.origin ? '' : o.note })),
            }
          : {}),
      })),
    };
  }

  // An app-run game as one viewer may see it: other blocks' secrets stay hidden until the reveal.
  playView(pl, isAdmin, mine) {
    const base = { kind: pl.kind, deadline: pl.deadline, done: !!pl.done };
    if (pl.kind === 'twothirds') {
      const picks = pl.revealed || isAdmin ? pl.picks : Object.fromEntries(Object.entries(pl.picks).map(([id, b]) => [id, id === mine ? b : { locked: true }]));
      return { ...base, revealed: pl.revealed, picks, max: TWO_THIRDS_MAX, average: pl.revealed ? pl.average : null, target: pl.revealed ? pl.target : null, order: pl.revealed ? pl.order : null, missed: pl.revealed ? pl.missed : null, drinks: pl.revealed ? pl.drinks : null };
    }
    if (pl.kind === 'dilemma') {
      const box = pl.choices[pl.n] || {};
      const pair = pl.pairs.find((x) => x.includes(mine));
      return {
        ...base, state: pl.state, n: pl.n, total: pl.total, pairs: pl.pairs, scores: pl.scores, shots: pl.shots,
        partner: pair ? pair.find((id) => id !== mine) : null,
        picked: Object.keys(box), mine: mine && box[mine] ? box[mine].choice : null,
        // Choices stay secret until the turn is revealed (hosts see them live).
        live: isAdmin ? box : null,
        results: pl.results.map((x, i) => (i === pl.n && pl.state === 'open' ? null : x)),
      };
    }
    if (pl.kind === 'coldwar') {
      const bids = pl.revealed || isAdmin ? pl.bids : Object.fromEntries(Object.entries(pl.bids).map(([id, b]) => [id, id === mine ? b : { locked: true }]));
      return { ...base, revealed: pl.revealed, bids, drinks: pl.revealed ? pl.drinks : null, order: pl.revealed ? pl.order : null, max: COLD_WAR_MAX };
    }
    if (pl.kind === 'trivia') {
      const q = pl.questions[pl.qi];
      const shown = pl.state === 'revealed' || pl.done;
      const box = pl.answers[pl.qi] || {};
      return {
        ...base, state: pl.state, qi: pl.qi, count: pl.questions.length, scores: pl.scores,
        question: q ? { q: q.q, options: q.options, answer: shown || isAdmin ? q.answer : null } : null,
        answered: Object.keys(box),
        answers: shown || isAdmin ? box : mine && box[mine] ? { [mine]: box[mine] } : {},
      };
    }
    if (pl.kind === 'anime') {
      const it = pl.items[pl.i];
      const shown = ['won', 'missed'].includes(pl.state) || pl.done;
      return {
        ...base, state: pl.state, i: pl.i, count: pl.items.length, scores: pl.scores, winner: pl.winners[pl.i] || null,
        label: it?.label || null, answer: it && (shown || isAdmin) ? it.answers[0] : null, accepted: isAdmin && it ? it.answers : null,
        myTries: mine ? pl.guesses[pl.i]?.[mine] || 0 : 0, tries: isAdmin ? pl.guesses[pl.i] || {} : null,
      };
    }
    const shown = pl.state === 'revealed' || pl.done;
    const box = pl.votes[pl.n] || {};
    return {
      ...base, state: pl.state, n: pl.n, total: pl.total, scores: pl.scores, truth: shown ? pl.truth[pl.n] : null,
      voted: Object.keys(box), votes: shown || isAdmin ? box : mine && box[mine] ? { [mine]: box[mine] } : {},
    };
  }

  roundsHistory() {
    return this.s.rounds.map((r) => ({ number: r.number, label: r.label || this.slotOf(r.number).label, act: r.act || this.slotOf(r.number).act, gameName: r.gameName, phase: r.phase, winnerTeamId: r.winnerTeamId, placings: r.placings, prizes: r.prizes }));
  }

  viewFor(playerId) {
    const p = this.player(playerId);
    if (!p) return null;
    const v = this.baseView(p);
    v.me = { ...this.publicPlayer(p, p), device: !!p.device, commissions: p.commissions, commissionBonus: p.commissionBonus, sentences: p.sentences.slice(0, 15) };
    v.orders = this.s.orders
      .filter((o) => p.teamId && (o.fromTeamId === p.teamId || o.targetTeamId === p.teamId || o.originalFromTeamId === p.teamId))
      .slice(0, 60)
      .map((o) => (o.hidden && o.fromTeamId !== p.teamId && o.originalFromTeamId !== p.teamId ? { ...o, fromTeamId: null, originalFromTeamId: null, buyerId: null, buyerName: '🕶️ Anonymous' } : o));
    v.round = this.roundView(p);
    const myTeam = p.teamId && this.team(p.teamId);
    v.eyeSpy = myTeam ? this.eyeSpyTable(myTeam) : null;
    v.bounties = myTeam ? this.s.bounties.filter((b) => b.teamId === myTeam.id) : [];
    // Power-ups this block has bought that haven't started yet.
    const now = this.round && this.round.phase !== 'done' ? this.round.number : this.s.rounds.length;
    v.pending = myTeam
      ? [
          ...this.s.reflects.filter((x) => x.teamId === myTeam.id && x.round > now).map((x) => ({ kind: 'reflect', round: x.round, label: this.slotOf(x.round).label })),
          ...(myTeam.eyeSpyFrom > now ? [{ kind: 'eyespy', round: myTeam.eyeSpyFrom, label: this.slotOf(myTeam.eyeSpyFrom).label }] : []),
          ...v.bounties.filter((b) => b.status === 'active' && b.startRound > now).map((b) => ({ kind: 'bounty', round: b.startRound, label: this.slotOf(b.startRound).label })),
          ...v.bounties.filter((b) => b.reward && b.rewardFrom > now).map((b) => ({ kind: b.reward, round: b.rewardFrom, label: this.slotOf(b.rewardFrom).label })),
        ]
      : [];
    v.activeReflect = myTeam && this.s.reflects.some((x) => x.teamId === myTeam.id && x.round === now && this.round?.phase !== 'done');
    v.played = myTeam ? Object.fromEntries(this.members(myTeam.id).map((m) => [m.id, this.gamesPlayed(m.id)])) : {};
    return v;
  }

  // Standard drinks sent so far tonight (game shots and penalties included), for the hosts' pace tracker.
  standardsSent() {
    const byId = new Map(this.s.items.map((i) => [i.id, i]));
    let total = 0;
    for (const o of this.s.orders) {
      if (o.type !== 'drink' || o.status === 'cancelled') continue;
      const it = byId.get(o.itemId) || this.s.items.find((i) => i.type === 'drink' && o.name && o.name.endsWith(i.name));
      total += (o.qty || 1) * (it?.std ?? 1);
    }
    return Math.round(total * 10) / 10;
  }

  adminView(role = 'warden') {
    const v = this.baseView('admin');
    v.standards = { sent: this.standardsSent(), target: this.s.settings.targetStandards, rounds: this.totalRounds(), played: this.s.rounds.filter((r) => r.phase === 'done').length };
    v.hostRole = role;
    v.hosts = HOSTS;
    v.orders = this.s.orders.slice(0, 200);
    v.isAdmin = true;
    v.round = this.roundView('admin');
    v.bounties = this.s.bounties;
    v.reflects = this.s.reflects;
    v.leparty = this.s.leparty;
    v.played = Object.fromEntries(this.s.players.map((p) => [p.id, this.gamesPlayed(p.id)]));
    return v;
  }

  tvView() {
    const v = this.baseView(null);
    v.orders = this.s.orders.filter((o) => o.status === 'incoming').slice(0, 10);
    v.round = this.roundView(null);
    return v;
  }
}

module.exports = { registerMechanic, ACT_MECHANICS, Game, GameError, defaultState, ITEM_TYPES, CHARGES, HOLDING, HOSTS, ACT_SETS, ARCADE_ACTS, LONG_NIGHT_ACTS, AUGMENTS, WARP_PRIZES, VISIONS, COMMISSIONS, adventureRank };
