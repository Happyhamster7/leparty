// Core game state + rules for Shifty Shen Slammer.
// Everything here is plain data manipulation so it can be tested without sockets.
const crypto = require('crypto');

class GameError extends Error {}
const fail = (msg) => {
  throw new GameError(msg);
};
const uid = () => crypto.randomBytes(6).toString('hex');
const secret = () => crypto.randomBytes(18).toString('hex');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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

const ROLES = {
  inmate: {
    name: 'Inmate',
    emoji: '🧡',
    blurb: 'Your block may — or may not — have a snitch. Read every briefing, watch for unexplained withdrawals and anyone playing badly on purpose, and vote the rat off the block. Kick an innocent and your block pays for it.',
  },
  snitch: {
    name: 'Snitch',
    emoji: '🐀',
    blurb: 'You are the snitch in your block. Each game’s briefing hides a secret sabotage in the Classified box — pull it off and you skim credits from your block. At Lights Out, tip off the guards to throw someone into solitary. Survive to the end and you cash in.',
  },
};

const ITEM_TYPES = {
  supply: { label: 'For your block', target: null },
  gift: { label: 'Send a drink', target: 'team' },
  punishment: { label: 'Punishment', target: 'team' },
  bail: { label: 'Bail bond', target: 'holdingPlayer' },
  deflect: { label: 'Deflect card', target: null },
  immunity: { label: 'Vote immunity', target: null },
  intel: { label: 'Intel', target: null },
};

function defaultItems() {
  const items = [
    ['🍋', 'Lime & Soda Water', 'Mixer delivered to your block.', 5, 'supply'],
    ['🥤', 'Red Bull', 'Energy mixer delivered to your block.', 10, 'supply'],
    ['🧃', 'Juice Box Mixer', 'OJ / cran / pineapple for your block.', 8, 'supply'],
    ['🧊', 'Ice Run', 'A fresh bucket of ice for your block.', 4, 'supply'],
    ['🍺', 'Send a Round', 'Buy another block (or the Holding Cell) a round of beers.', 15, 'gift'],
    ['🥃', 'Buy Them a Shot', 'Send another block (or the Holding Cell) a round of shots.', 20, 'gift'],
    ['🥵', 'Shot Penalty', 'Everyone in the target takes a penalty drink.', 25, 'punishment', { drinks: 1 }],
    ['⛓️', 'Chain Gang', 'Target must stay linked arm-in-arm for the next game.', 20, 'punishment'],
    ['💪', 'Yard Drills', '10 push-ups (or squats) for everyone in the target.', 12, 'punishment'],
    ['🔍', 'Shakedown', 'Guards raid the target block: they lose 15 credits.', 20, 'punishment', { drain: 15 }],
    ['🎤', 'Confession Booth', 'Target must sing a chorus of a song of your choice.', 15, 'punishment'],
    ['🔑', 'Bail Bond', 'Spring someone out of the Holding Cell and onto your block.', 30, 'bail'],
    ['🔄', 'Snitch Slip', 'Deflect card: bounce an incoming punishment back to whoever sent it.', 30, 'deflect'],
    ['💵', 'Bribe the Guard', 'Immunity from one block vote for someone in your block.', 35, 'immunity'],
    ['📡', 'Wiretap', 'Find out whether your block has a snitch right now. Not who — just whether.', 40, 'intel'],
  ];
  return items.map(([emoji, name, desc, price, type, extra]) => ({
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
  }));
}


const SABOTAGE_TASKS = [
  'Miss your first turn on purpose — make it look natural.',
  'Talk your block into the worst possible strategy for this game.',
  'Volunteer to go first, then choke.',
  'Give your block a confidently wrong answer at least once.',
  'Start a pointless argument about the rules that wastes your block’s time.',
  'Be the last one on your block to finish, every time.',
  'Convince a blockmate to use their weak hand “for luck”.',
  'Accuse an innocent blockmate of being the snitch — loudly.',
  'Get your block to spend credits on something useless at the commissary.',
  'Distract a teammate at the exact moment they need to focus.',
  '“Accidentally” let the other team see your block’s plan.',
  'Hype up the other team so much your block loses its nerve.',
];

function defaultMafia() {
  return {
    phase: 'off', // off | idle | night | vote | over
    round: 0,
    night: { tips: {}, suspicions: {} },
    vote: { votes: {}, immune: [] },
    winner: null,
    lastResult: null,
  };
}

function defaultSettings() {
  return {
    partyName: 'Shifty Shen Slammer',
    tagline: 'Do the crime, do the time, do the shots.',
    houseRules: 'Every drink can be swapped for a water or a sip — no questions asked. Look after each other.',
    spendMode: 'request', // anyone | request | captain
    requestSeconds: 2,
    startingBudget: 20,
    maxBlockSize: 5,
    holdingDrinks: 1,
    solitaryDrinks: 2,
    holdingRules: 'Drink 1 extra per round. Play every game with your weak hand. Address everyone on a block as "boss".',
    solitaryRules: 'Drink 2 extra per round. No talking unless spoken to. You sit out games unless the Warden says otherwise.',
    snitchChance: 50,
    snitchBounty: 25,
    wrongfulPenalty: 10,
    tipRounds: 1,
    caughtSnitchRounds: 1,
    tasksEnabled: true,
    sabotageSkim: 5,
    snitchRewardDrinks: 3,
    drinksPerSabotage: 1,
    snitchPrize: 'A drink on the birthday inmate + eternal bragging rights.',
    sabotageTasks: SABOTAGE_TASKS,
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
    mafia: defaultMafia(),
    hosts: [], // [{ token, role }]
    claims: [], // task completions waiting on / judged by a host
  };
}

function normalizePlayer(p) {
  return {
    teamId: null,
    isCaptain: false,
    role: 'inmate',
    revealed: false,
    solitary: null,
    drinksOwed: 0,
    drinksDone: 0,
    task: null,
    tasksDone: 0,
    dirt: 0,
    skimmed: 0,
    dealerDrinks: 0,
    sentences: [],
    ...p,
    role: ROLES[p.role] ? p.role : 'inmate',
    solitary: p.solitary && typeof p.solitary === 'object' ? p.solitary : null,
  };
}

class Game {
  constructor(state) {
    this.s = state || defaultState();
    // Fill in anything added in later versions of the schema.
    const d = defaultState();
    for (const k of Object.keys(d)) if (this.s[k] === undefined) this.s[k] = d[k];
    const stored = this.s.settings || {};
    this.s.settings = { ...defaultSettings(), ...stored };
    if (stored.spendMode === undefined && stored.captainOnlySpending) this.s.settings.spendMode = 'captain';
    delete this.s.settings.captainOnlySpending;
    this.s.mafia = { ...defaultMafia(), ...this.s.mafia };
    if (!this.s.mafia.night?.tips) this.s.mafia.night = { tips: {}, suspicions: {} };
    this.s.players = this.s.players.map(normalizePlayer);
    if (Array.isArray(this.s.adminTokens)) {
      this.s.hosts.push(...this.s.adminTokens.map((token) => ({ token, role: 'warden' })));
      delete this.s.adminTokens;
    }
    for (const t of this.s.teams) {
      t.inventory = { deflect: 0, immunity: 0, ...t.inventory };
      t.intel ||= [];
      t.ledger ||= [];
      t.requests ||= [];
      t.nickname ??= '';
      t.motto ??= '';
    }
    for (const g of this.s.games) {
      g.rules ??= '';
      g.rulesVersion ??= 1;
      g.heats ??= [];
    }
    for (const i of this.s.items) {
      i.drinks ??= 0;
      i.drain ??= 0;
    }
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

  // A player is in exactly one place: solitary beats holding beats a block.
  status(p) {
    if (p.solitary) return 'solitary';
    return p.teamId ? 'block' : 'holding';
  }
  members(teamId) {
    return this.s.players.filter((p) => p.teamId === teamId);
  }
  holding() {
    return this.s.players.filter((p) => this.status(p) === 'holding');
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
    const text = { partyName: 40, tagline: 80, houseRules: 200, holdingRules: 240, solitaryRules: 240, snitchPrize: 160 };
    for (const [k, max] of Object.entries(text)) {
      if (input[k] === undefined) continue;
      const v = cleanText(input[k], max);
      if (v || k !== 'partyName') st[k] = v;
    }
    if (input.spendMode !== undefined) {
      if (!['anyone', 'request', 'captain'].includes(input.spendMode)) fail('Unknown spending mode.');
      st.spendMode = input.spendMode;
    }
    if (input.tasksEnabled !== undefined) st.tasksEnabled = toBool(input.tasksEnabled);
    for (const k of ['sabotageTasks']) {
      if (input[k] === undefined) continue;
      const lines = (Array.isArray(input[k]) ? input[k] : String(input[k]).split('\n')).map((l) => cleanText(l, 160)).filter(Boolean);
      if (!lines.length) fail('Keep at least one sabotage in the list.');
      st[k] = lines.slice(0, 100);
    }
    const nums = {
      startingBudget: [0, 1000],
      maxBlockSize: [2, 12],
      holdingDrinks: [0, 5],
      solitaryDrinks: [0, 5],
      snitchChance: [0, 100],
      snitchBounty: [0, 1000],
      wrongfulPenalty: [0, 1000],
      tipRounds: [1, 10],
      caughtSnitchRounds: [0, 10],
      sabotageSkim: [0, 100],
      snitchRewardDrinks: [0, 20],
      drinksPerSabotage: [0, 5],
      requestSeconds: [1, 5],
    };
    for (const [k, [lo, hi]] of Object.entries(nums)) {
      if (input[k] === undefined || input[k] === '') continue;
      st[k] = Math.min(hi, Math.max(lo, toInt(input[k], st[k])));
    }
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
      inventory: { deflect: 0, immunity: 0 },
      intel: [],
      ledger: [],
      requests: [],
      nickname: '',
      motto: '',
    };
    this.s.teams.push(team);
    return team;
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
    if (!p.teamId || p.solitary) fail('You need to be on a block to rename it.');
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
    if (amt > 0) this.log(`${hostTitle(by)} paid ${t.name} ${amt} credits${why ? ` for ${why}` : ''}.`, 'money', '💰');
    else this.log(`${hostTitle(by)} docked ${t.name} ${before - t.budget} credits${why ? ` for ${why}` : ''}.`, 'money', '💸');
  }

  setInventory({ teamId, kind, count }) {
    const t = this.mustTeam(teamId);
    if (!['deflect', 'immunity'].includes(kind)) fail('Unknown inventory type.');
    t.inventory[kind] = Math.max(0, toInt(count));
  }

  // ---------- players ----------
  updatePlayer({ playerId, name, teamId, isCaptain, role }) {
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
    if (role !== undefined) {
      if (!ROLES[role]) fail('Unknown role.');
      p.role = role;
      p.revealed = false;
    }
  }

  removePlayer({ playerId }) {
    this.mustPlayer(playerId);
    this.s.players = this.s.players.filter((p) => p.id !== playerId);
  }

  // ---------- solitary / holding / drinks ----------
  sendToSolitary({ playerId, rounds, reason }) {
    const p = this.mustPlayer(playerId);
    const n = Math.max(1, toInt(rounds, 1));
    const why = cleanText(reason, 80) || 'breaking the rules';
    this.lockUp(p, n, why);
    this.log(`${p.name} was thrown into SOLITARY for ${plural(n, 'round')} for ${why}.`, 'lockup', '🔒');
  }

  lockUp(p, rounds, reason) {
    if (p.solitary) p.solitary.rounds += rounds;
    else p.solitary = { rounds, reason, since: Date.now() };
  }

  releaseSolitary({ playerId }) {
    const p = this.mustPlayer(playerId);
    if (!p.solitary) fail('They are not in solitary.');
    p.solitary = null;
    this.log(`${p.name} was released from solitary back to ${p.teamId ? this.teamName(p.teamId) : 'the Holding Cell'}.`, 'lockup', '🔓');
  }

  // End-of-round bookkeeping: penalty drinks for Holding/Solitary, then solitary sentences tick down.
  tickRound() {
    const st = this.s.settings;
    const inHolding = this.holding();
    const inSolitary = this.s.players.filter((p) => p.solitary);
    for (const p of inHolding) p.drinksOwed += st.holdingDrinks;
    for (const p of inSolitary) p.drinksOwed += st.solitaryDrinks;
    const parts = [];
    if (inHolding.length && st.holdingDrinks) parts.push(`Holding Cell (${inHolding.length}) drinks ${st.holdingDrinks}`);
    if (inSolitary.length && st.solitaryDrinks) parts.push(`Solitary (${inSolitary.length}) drinks ${st.solitaryDrinks}`);
    if (parts.length) this.log(`Round penalties: ${parts.join(' · ')} each. Pay up!`, 'lockup', '🍺');
    for (const p of inSolitary) {
      p.solitary.rounds--;
      if (p.solitary.rounds <= 0) {
        p.solitary = null;
        this.log(`${p.name} served their time and walks out of solitary to ${p.teamId ? this.teamName(p.teamId) : 'the Holding Cell'}.`, 'lockup', '🔓');
      }
    }
  }

  drank(playerId) {
    const p = this.mustPlayer(playerId);
    if (p.drinksOwed < 1) fail('You’re all paid up. Nice.');
    p.drinksOwed--;
    p.drinksDone++;
  }

  // ---------- punishments handed to people ----------
  // A host target: 'all', 'holding', 'solitary', 'team:<id>' or 'player:<id>'.
  resolveTarget(target) {
    const [kind, id] = String(target || '').split(':');
    if (kind === 'all') return { label: 'everyone', victims: [...this.s.players] };
    if (kind === 'holding') return { label: 'the Holding Cell', victims: this.holding() };
    if (kind === 'solitary') return { label: 'everyone in Solitary', victims: this.s.players.filter((p) => p.solitary) };
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
  addGame({ name, desc, rules, holdingRule, solitaryRule, sabotage }) {
    const n = cleanText(name, 60);
    if (!n) fail('Game needs a name.');
    const g = {
      id: uid(),
      name: n,
      desc: cleanText(desc, 200),
      rules: cleanRules(rules),
      rulesVersion: 1,
      holdingRule: cleanText(holdingRule, 160),
      solitaryRule: cleanText(solitaryRule, 160),
      sabotage: cleanText(sabotage, 160),
      heats: [],
      status: 'upcoming',
      results: null,
      createdAt: Date.now(),
    };
    this.s.games.push(g);
    return g;
  }

  updateGame({ gameId, name, desc, rules, holdingRule, solitaryRule, sabotage }) {
    const g = this.game(gameId) || fail('Game not found.');
    const before = JSON.stringify([g.name, g.desc, g.rules, g.holdingRule, g.solitaryRule]);
    if (name !== undefined && cleanText(name, 60)) g.name = cleanText(name, 60);
    if (desc !== undefined) g.desc = cleanText(desc, 200);
    if (rules !== undefined) g.rules = cleanRules(rules);
    if (holdingRule !== undefined) g.holdingRule = cleanText(holdingRule, 160);
    if (solitaryRule !== undefined) g.solitaryRule = cleanText(solitaryRule, 160);
    // A changed briefing pops up on every phone again.
    if (JSON.stringify([g.name, g.desc, g.rules, g.holdingRule, g.solitaryRule]) !== before) {
      g.rulesVersion = (g.rulesVersion || 1) + 1;
      if (g.status === 'live') this.log(`Rules updated for ${g.name}. Check the briefing on your phone.`, 'game', '📋');
    }
    if (sabotage !== undefined) g.sabotage = cleanText(sabotage, 160);
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
    if (status === 'live' && !wasLive && this.s.settings.tasksEnabled && this.s.players.length) this.dealTasks({ gameId: g.id });
  }

  // ---------- snitch sabotage (Among Us style) ----------
  // Only hidden snitches get a task: a sabotage against their own block. Everyone else gets the
  // same game briefing with an empty "classified" section, so phones look alike.
  canSabotage(p) {
    return p.role === 'snitch' && !p.revealed && !!p.teamId && !p.solitary && !['off', 'over'].includes(this.s.mafia.phase);
  }

  pickTask(avoid, g) {
    if (g?.sabotage) return g.sabotage;
    const pool = this.s.settings.sabotageTasks;
    const fresh = pool.filter((t) => !avoid.has(t));
    return pick(fresh.length ? fresh : pool);
  }

  dealTasks({ gameId } = {}) {
    const g = (gameId && this.game(gameId)) || this.s.games.find((x) => x.status === 'live') || null;
    const used = new Set();
    for (const p of this.s.players) {
      if (p.task?.status === 'active') p.task.status = 'expired';
      if (!this.canSabotage(p)) continue;
      const text = this.pickTask(new Set([...used, p.task?.text]), g);
      used.add(text);
      p.task = { id: uid(), gameId: g?.id || null, gameName: g?.name || 'this round', kind: 'sabotage', text, status: 'active', rerolled: false, ts: Date.now() };
    }
  }

  rerollTask(playerId) {
    const p = this.mustPlayer(playerId);
    const t = p.task;
    if (!t || t.status !== 'active') fail('You don’t have an active task.');
    if (t.rerolled) fail('One reroll per game. Get to work, rat.');
    t.text = this.pickTask(new Set([t.text]), null);
    t.rerolled = true;
  }

  // Players only *claim* a task; nothing happens to credits until a host approves it.
  reportTask(playerId, { result }) {
    const p = this.mustPlayer(playerId);
    const t = p.task;
    if (!t || t.status !== 'active') fail('You don’t have an active task.');
    if (p.solitary) fail('No tasks from solitary.');
    if (result === 'skip') {
      t.status = 'skipped';
      return;
    }
    if (result !== 'done') fail('Done or skip?');
    t.status = 'claimed';
    this.s.claims.unshift({
      id: uid(),
      ts: Date.now(),
      playerId: p.id,
      taskId: t.id,
      kind: t.kind,
      text: t.text,
      gameName: t.gameName,
      status: 'pending',
    });
    if (this.s.claims.length > 300) this.s.claims.length = 300;
  }

  claim(id) {
    return this.s.claims.find((c) => c.id === id) || fail('That claim is gone.');
  }

  approveTask({ claimId, by }) {
    const c = this.claim(claimId);
    if (c.status !== 'pending') fail('That claim was already judged.');
    const p = this.mustPlayer(c.playerId);
    const team = this.team(p.teamId);
    c.status = 'approved';
    c.by = by || 'warden';
    c.judgedAt = Date.now();
    if (p.task?.id === c.taskId) p.task.status = 'done';
    // A snitch caught (or moved off their block) since claiming gets no skim.
    if (p.role !== 'snitch' || p.revealed || !team) {
      c.effect = 'none';
      return;
    }
    const skim = Math.min(team.budget, this.s.settings.sabotageSkim);
    team.budget -= skim;
    c.effect = 'sabotage';
    c.amount = skim;
    p.skimmed += skim;
    p.dirt++;
    p.tasksDone++;
    // No feed line: the only trace is in the victim block's own account activity.
    team.ledger.unshift({ ts: Date.now(), amount: -skim, text: 'Unexplained withdrawal' });
    if (team.ledger.length > 30) team.ledger.length = 30;
  }

  rejectTask({ claimId, by }) {
    const c = this.claim(claimId);
    if (c.status !== 'pending') fail('That claim was already judged.');
    c.status = 'rejected';
    c.by = by || 'warden';
    c.judgedAt = Date.now();
    const p = this.player(c.playerId);
    // Hand the task back so they can have another go.
    if (p?.task?.id === c.taskId && p.task.status === 'claimed') {
      p.task.status = 'active';
      p.task.rejected = (p.task.rejected || 0) + 1;
    }
  }

  // Undo an approved claim and its effect.
  revokeTask({ claimId, by }) {
    const c = this.claim(claimId);
    if (c.status !== 'approved') fail('Only approved claims can be voided.');
    const p = this.player(c.playerId);
    const team = p && this.team(p.teamId);
    if (p) {
      if (c.effect === 'sabotage') {
        p.dirt = Math.max(0, p.dirt - 1);
        p.skimmed = Math.max(0, p.skimmed - (c.amount || 0));
        p.tasksDone = Math.max(0, p.tasksDone - 1);
        if (team) {
          team.budget += c.amount || 0;
          team.ledger.unshift({ ts: Date.now(), amount: c.amount || 0, text: 'Withdrawal reversed' });
        }
      }
      if (p.task?.id === c.taskId) p.task.status = 'revoked';
    }
    c.status = 'voided';
    c.by = by || 'warden';
  }

  // A surviving snitch's reward: penalty drinks to hand out to anyone.
  dealDrink(playerId, { targetId }) {
    const p = this.mustPlayer(playerId);
    if (p.dealerDrinks < 1) fail('You have no drinks to hand out.');
    const t = this.mustPlayer(targetId);
    if (t.id === p.id) fail('Hand them to someone else, rat.');
    t.drinksOwed++;
    p.dealerDrinks--;
    this.log(`🐀 ${p.name} cashed in a snitch reward: ${t.name} drinks!`, 'mafia', '🥃');
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
    const summary = Object.entries(clean)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${this.teamName(id)} ${n > 0 ? '+' : ''}${n}`)
      .join(', ');
    const left = g.heats.filter((x) => x.status !== 'done').length;
    this.log(`${g.name} Heat ${g.heats.indexOf(h) + 1} is done. ${summary || 'No credits paid out.'}${left ? '' : ' That was the last heat.'}`, 'game', '🏁');
  }

  removeGame({ gameId }) {
    this.s.games = this.s.games.filter((g) => g.id !== gameId);
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
    if (input.active !== undefined) out.active = toBool(input.active);
    if (!out.name) fail('Item needs a name.');
    return out;
  }

  addItem(input) {
    const item = this.sanitizeItem({ emoji: '📦', price: 10, type: 'supply', stock: null, drain: 0, drinks: 0, active: true, desc: '', ...input });
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
  checkPurchase(team, { itemId, targetTeamId, targetPlayerId }) {
    const item = this.item(itemId);
    if (!item || !item.active) fail('That item is off the shelf.');
    if (item.stock !== null && item.stock <= 0) fail('Sold out. The commissary is waiting on a shipment.');
    if (team.budget < item.price) fail(`Not enough credits. ${team.name} has ${team.budget}, this costs ${item.price}.`);
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
    return { item, targetId, bailee };
  }

  // How many blockmates must second a request before it goes through without the Shot Caller.
  secondsNeeded(team, requesterId) {
    const others = this.members(team.id).filter((m) => m.id !== requesterId && !m.solitary).length;
    return Math.min(this.s.settings.requestSeconds, others);
  }

  buy(playerId, input) {
    const p = this.mustPlayer(playerId);
    if (p.solitary) fail('No commissary privileges in solitary.');
    if (!p.teamId) fail('Holding Cell inmates don’t get a commissary account. Get yourself bailed onto a block!');
    const team = this.mustTeam(p.teamId);
    const mode = this.s.settings.spendMode;
    if (mode === 'captain' && !p.isCaptain) fail('Only your Shot Caller can spend the block budget tonight.');
    if (mode === 'request' && !p.isCaptain && this.secondsNeeded(team, p.id) > 0) return this.requestPurchase(p, team, input);
    return this.purchase(p, team, input);
  }

  purchase(p, team, { itemId, targetTeamId, targetPlayerId, note }) {
    const { item, targetId, bailee } = this.checkPurchase(team, { itemId, targetTeamId, targetPlayerId });
    team.budget -= item.price;
    if (item.stock !== null) item.stock--;
    const base = {
      id: uid(),
      ts: Date.now(),
      itemId: item.id,
      name: item.name,
      emoji: item.emoji,
      type: item.type,
      price: item.price,
      drain: item.drain || 0,
      drinks: item.drinks || 0,
      desc: item.desc || '',
      buyerId: p.id,
      buyerName: p.name,
      fromTeamId: team.id,
      originalFromTeamId: team.id,
      note: cleanText(note, 120),
      bounces: 0,
      history: [],
    };

    if (item.type === 'deflect' || item.type === 'immunity') {
      team.inventory[item.type] = (team.inventory[item.type] || 0) + 1;
      this.log(`${team.name} made a suspicious purchase at the commissary…`, 'shop', '🤫');
      return { ...base, status: 'stashed' };
    }

    if (item.type === 'intel') {
      const hasSnitch = this.members(team.id).some((m) => m.role === 'snitch' && !m.revealed);
      team.intel.unshift({ ts: Date.now(), hasSnitch, by: p.name });
      this.log(`${team.name} bought a wiretap… they know something now.`, 'shop', '📡');
      return { ...base, status: 'intel', hasSnitch };
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
    };
    this.s.orders.unshift(order);
    if (item.type === 'supply') this.log(`${team.name} bought ${item.emoji} ${item.name}.`, 'shop', '🛒');
    if (item.type === 'gift') this.log(`${team.name} sent ${item.emoji} ${item.name} to ${this.teamName(targetId)}! 🥂`, 'shop', '🎁');
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

  // ---------- block purchase requests ----------
  // In "request" mode a blockmate proposes a purchase; it goes through when the Shot Caller
  // approves it or enough blockmates second it. Requests are only visible inside the block.
  requestPurchase(p, team, input) {
    const { item, targetId, bailee } = this.checkPurchase(team, input);
    if (team.requests.length >= 12) fail('Your block has too many open requests. Settle some first.');
    const req = {
      id: uid(),
      ts: Date.now(),
      by: p.id,
      byName: p.name,
      itemId: item.id,
      name: item.name,
      emoji: item.emoji,
      price: item.price,
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
    if (!p.teamId || p.solitary) fail('You need to be on a block for that.');
    const team = this.mustTeam(p.teamId);
    const req = team.requests.find((r) => r.id === requestId) || fail('That request is gone.');
    return { team, req };
  }

  fulfillRequest(team, req, approver) {
    const requester = this.player(req.by);
    const buyer = requester && requester.teamId === team.id ? requester : approver;
    const out = this.purchase(buyer, team, { itemId: req.itemId, targetTeamId: req.targetTeamId, targetPlayerId: req.targetPlayerId, note: req.note });
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
      this.log(`🔄 ${team.name} played a Snitch Slip! ${o.emoji} ${o.name} bounces back to ${this.teamName(from)}!`, 'punish', '🔄');
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
      o.targetTeamId === HOLDING ? this.holding() : this.members(o.targetTeamId).filter((m) => !m.solitary);
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
    const extras = [drained && `lost ${drained} credits`, o.drinks && `owes ${plural(o.drinks, 'drink')} each`].filter(Boolean);
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
      o.status = 'done';
      o.doneAt = Date.now();
      o.resolvedBy = by || 'warden';
    } else if (action === 'cancel') {
      if (!['pending', 'incoming'].includes(o.status)) fail('Order already closed.');
      const payer = this.team(o.originalFromTeamId || o.fromTeamId);
      if (payer) payer.budget += o.price;
      o.status = 'cancelled';
      o.resolvedBy = by || 'warden';
      this.log(`${hostTitle(by)} cancelled ${o.emoji} ${o.name}. ${payer ? `${payer.name} was refunded.` : ''}`, 'shop', '🚫');
    } else fail('Unknown action.');
  }

  // ---------- snitches ----------
  // Each block independently gets one hidden snitch with probability snitchChance%.
  dealSnitches({ chance, atLeastOne } = {}) {
    const st = this.s.settings;
    if (chance !== undefined && chance !== '') st.snitchChance = Math.min(100, Math.max(0, toInt(chance, st.snitchChance)));
    const eligible = this.s.teams.filter((t) => this.members(t.id).length >= 2);
    if (!eligible.length) fail('Build some blocks (2+ inmates each) first.');
    for (const p of this.s.players) this.clearRole(p);
    const withSnitch = eligible.filter(() => Math.random() * 100 < st.snitchChance);
    if (!withSnitch.length && toBool(atLeastOne ?? true)) withSnitch.push(pick(eligible));
    for (const t of withSnitch) pick(this.members(t.id)).role = 'snitch';
    this.s.mafia = { ...defaultMafia(), phase: 'idle' };
    this.log('Snitches have been planted. Some blocks have one. Some don’t. Check your Rap Sheet — privately — and trust no one.', 'mafia', '🐀');
  }

  clearRole(p) {
    p.role = 'inmate';
    p.revealed = false;
    p.dirt = 0;
    p.skimmed = 0;
    p.dealerDrinks = 0;
    if (p.task?.status === 'active' && p.task.kind === 'sabotage') p.task.status = 'expired';
  }

  resetMafia() {
    for (const p of this.s.players) this.clearRole(p);
    this.s.mafia = defaultMafia();
    this.log('The snitch game has been reset.', 'mafia', '🔁');
  }

  hiddenSnitches() {
    return this.s.players.filter((p) => p.role === 'snitch' && !p.revealed);
  }

  mustBeDealt() {
    const m = this.s.mafia;
    if (m.phase === 'off') fail('Plant the snitches first.');
    if (m.phase === 'over') fail('The snitch game is over. Re-deal to play again.');
  }

  startNight() {
    const m = this.s.mafia;
    this.mustBeDealt();
    if (m.phase === 'vote') fail('Close the block votes first.');
    if (m.phase === 'night') fail('It’s already Lights Out.');
    m.round++;
    m.phase = 'night';
    m.night = { tips: {}, suspicions: {} };
    this.log(`LIGHTS OUT — Night ${m.round}. EVERYONE pick a name on your Rap Sheet, so nobody can tell who the snitches are.`, 'mafia', '🌙');
  }

  // Snitches tip off the guards; everyone else anonymously names a suspect (which doubles as cover).
  nightPick(playerId, { targetId }) {
    const m = this.s.mafia;
    const p = this.mustPlayer(playerId);
    if (m.phase !== 'night') fail('It is not Lights Out.');
    if (p.solitary) fail('You’re in solitary. Lights are always out in there.');
    const t = this.mustPlayer(targetId);
    if (t.id === p.id) fail('Pick someone else.');
    if (t.solitary) fail('They are already in solitary.');
    if (p.role === 'snitch' && !p.revealed) m.night.tips[p.id] = t.id;
    else m.night.suspicions[p.id] = t.id;
  }

  endNight() {
    const m = this.s.mafia;
    if (m.phase !== 'night') fail('It is not Lights Out.');
    m.phase = 'idle';
    const rounds = this.s.settings.tipRounds;
    const tipped = [...new Set(Object.entries(m.night.tips).filter(([sid]) => this.player(sid)).map(([, tid]) => tid))]
      .map((id) => this.player(id))
      .filter((p) => p && !p.solitary);
    for (const p of tipped) {
      this.lockUp(p, rounds, 'an anonymous tip');
      this.log(`LIGHTS ON — An anonymous tip sent ${p.name} to SOLITARY for ${plural(rounds, 'round')}! Who ratted?`, 'mafia', '🚨');
    }
    if (!tipped.length) this.log('LIGHTS ON — Quiet night on the block. No tips came in.', 'mafia', '☀️');

    const counts = {};
    for (const tid of Object.values(m.night.suspicions)) counts[tid] = (counts[tid] || 0) + 1;
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `${this.player(id)?.name || '?'} (${n})`);
    if (top.length) this.log(`Yard whispers — most suspected tonight: ${top.join(', ')}.`, 'mafia', '🗣️');
    m.lastResult = {
      kind: 'night',
      round: m.round,
      text: tipped.length ? `Tipped into solitary: ${tipped.map((p) => p.name).join(', ')}.` : 'Quiet night. No tips.',
      whispers: top,
    };
  }

  openVote() {
    const m = this.s.mafia;
    this.mustBeDealt();
    if (m.phase === 'night') fail('Call Lights On first.');
    m.phase = 'vote';
    m.vote = { votes: {}, immune: [] };
    this.log('BLOCK VOTES are open! Every block votes on whether to kick someone out. Majority rules. Bribes accepted.', 'mafia', '🗳️');
  }

  castVote(playerId, { targetId }) {
    const m = this.s.mafia;
    const p = this.mustPlayer(playerId);
    if (m.phase !== 'vote') fail('No vote is open.');
    if (p.solitary) fail('Inmates in solitary don’t get a vote.');
    if (!p.teamId) fail('Only inmates on a block get a vote.');
    if (targetId === 'skip') {
      m.vote.votes[p.id] = 'skip';
      return;
    }
    const t = this.mustPlayer(targetId);
    if (t.teamId !== p.teamId) fail('You can only vote on your own blockmates.');
    if (t.id === p.id) fail('You can’t vote yourself out. Nice try.');
    if (t.solitary) fail('They are in solitary right now.');
    m.vote.votes[p.id] = t.id;
  }

  useImmunity(playerId, { targetId }) {
    const m = this.s.mafia;
    const p = this.mustPlayer(playerId);
    if (m.phase !== 'vote') fail('Bribes only work while block votes are open.');
    if (!p.teamId || p.solitary) fail('You need to be on a block to bribe a guard.');
    const team = this.mustTeam(p.teamId);
    const t = this.mustPlayer(targetId);
    if (t.teamId !== team.id) fail('You can only bribe for someone in your own block.');
    if (m.vote.immune.includes(t.id)) fail('They are already protected.');
    if ((team.inventory.immunity || 0) < 1) fail('Your block has no bribes left. Buy one at the commissary.');
    team.inventory.immunity--;
    m.vote.immune.push(t.id);
    this.log(`A guard has been bribed 💵 — ${t.name} is IMMUNE from ${team.name}’s vote.`, 'mafia', '💵');
  }

  // { teamId: { targetId|'skip': count } }, counting only voters still eligible.
  voteTallies() {
    const out = {};
    for (const [voterId, targetId] of Object.entries(this.s.mafia.vote.votes)) {
      const v = this.player(voterId);
      if (!v || !v.teamId || v.solitary) continue;
      if (targetId !== 'skip' && this.player(targetId)?.teamId !== v.teamId) continue;
      (out[v.teamId] ||= {})[targetId] = (out[v.teamId][targetId] || 0) + 1;
    }
    return out;
  }

  closeVote() {
    const m = this.s.mafia;
    if (m.phase !== 'vote') fail('No vote is open.');
    const tallies = this.voteTallies();
    const immune = new Set(m.vote.immune);
    const results = [];
    for (const team of this.s.teams) {
      const voters = this.members(team.id).filter((p) => !p.solitary).length;
      const tally = tallies[team.id] || {};
      const counts = Object.entries(tally).filter(([id]) => id !== 'skip' && !immune.has(id));
      const top = Math.max(0, ...counts.map(([, n]) => n));
      const leaders = counts.filter(([, n]) => n === top);
      if (!voters || !top || leaders.length !== 1 || top <= voters / 2) {
        if (Object.keys(tally).length) this.log(`${team.name}: no majority — everybody stays.`, 'mafia', '🤷');
        continue;
      }
      results.push(this.kick(this.player(leaders[0][0]), team));
    }
    m.phase = 'idle';
    m.lastResult = { kind: 'vote', round: m.round, text: results.length ? results.join(' ') : 'Every block kept its people.' };
    if (!results.length) this.log('Block votes closed. Nobody got kicked out.', 'mafia', '🤷');
    if (results.length && this.s.players.some((p) => p.role === 'snitch') && !this.hiddenSnitches().length) {
      m.phase = 'over';
      m.winner = 'inmates';
      this.log('EVERY SNITCH HAS BEEN CAUGHT! The blocks win! 🎉', 'mafia', '🏆');
    }
  }

  kick(p, team) {
    const st = this.s.settings;
    p.teamId = null;
    p.isCaptain = false;
    p.revealed = true;
    if (p.task?.status === 'active') p.task.status = 'expired';
    if (p.role === 'snitch') {
      const recovered = p.skimmed;
      team.budget += st.snitchBounty + recovered;
      team.earned += st.snitchBounty;
      if (recovered) team.ledger.unshift({ ts: Date.now(), amount: recovered, text: `Recovered from ${p.name}` });
      p.skimmed = 0;
      if (st.caughtSnitchRounds) this.lockUp(p, st.caughtSnitchRounds, 'snitching');
      this.log(
        `🐀 ${team.name} caught their SNITCH! ${p.name} pulled off ${plural(p.dirt, 'sabotage')}. They're off the block${st.caughtSnitchRounds ? ', into solitary, then the Holding Cell' : ' and into the Holding Cell'}. ${team.name} +${st.snitchBounty}${recovered ? ` and recovers ${recovered} stolen credits` : ''}.`,
        'mafia',
        '🐀',
      );
      return `${team.name} caught snitch ${p.name}.`;
    }
    const lost = Math.min(team.budget, st.wrongfulPenalty);
    team.budget -= lost;
    this.log(`😬 ${team.name} kicked out ${p.name} — but they were INNOCENT! ${p.name} goes to the Holding Cell.${lost ? ` ${team.name} −${lost}.` : ''}`, 'mafia', '😬');
    return `${team.name} wrongly kicked ${p.name}.`;
  }

  // End of the night: unmask every snitch who was never caught.
  revealSnitches() {
    const m = this.s.mafia;
    this.mustBeDealt();
    const hidden = this.hiddenSnitches();
    for (const p of this.s.players) if (p.role === 'snitch') p.revealed = true;
    m.phase = 'over';
    m.winner = hidden.length ? 'snitches' : 'inmates';
    if (hidden.length) {
      const st = this.s.settings;
      for (const p of hidden) {
        if (p.task?.status === 'active') p.task.status = 'expired';
        p.dealerDrinks += st.snitchRewardDrinks + p.dirt * st.drinksPerSabotage;
        this.log(
          `🐀 UNMASKED: ${p.name} was the snitch in ${this.teamName(p.teamId)} all night — ${plural(p.dirt, 'sabotage')}, ${p.skimmed} credits skimmed — and never got caught! They get to hand out ${plural(p.dealerDrinks, 'drink')}.${st.snitchPrize ? ` Prize: ${st.snitchPrize}` : ''}`,
          'mafia',
          '🐀',
        );
      }
    } else {
      this.log('The files are open: every snitch was caught. The blocks win! 🎉', 'mafia', '🏆');
    }
    m.lastResult = {
      kind: 'reveal',
      text: hidden.length ? `Uncaught snitches: ${hidden.map((p) => `${p.name} (${plural(p.dirt, 'sabotage')})`).join(', ')}.` : 'Every snitch was caught.',
      survivors: hidden.map((p) => p.id),
    };
  }

  // ---------- views ----------
  publicPlayer(p, viewer) {
    const revealRole = p.revealed || this.s.mafia.phase === 'over' || (viewer && viewer.id === p.id);
    return {
      id: p.id,
      name: p.name,
      inmateNo: p.inmateNo,
      charge: p.charge,
      teamId: p.teamId,
      isCaptain: p.isCaptain,
      status: this.status(p),
      solitary: p.solitary,
      drinksOwed: p.drinksOwed,
      sentencesOpen: p.sentences.filter((x) => x.status === 'open').length,
      drinksDone: p.drinksDone,
      dealerDrinks: p.dealerDrinks,
      dirt: revealRole && p.role === 'snitch' ? p.dirt : undefined,
      role: revealRole ? p.role : null,
    };
  }

  baseView(viewer) {
    const s = this.s;
    const m = s.mafia;
    const isAdmin = viewer === 'admin';
    const tallies = m.phase === 'vote' ? this.voteTallies() : null;
    const { sabotageTasks, ...publicSettings } = s.settings;
    return {
      settings: isAdmin ? { ...s.settings } : publicSettings,
      roles: ROLES,
      itemTypes: ITEM_TYPES,
      teams: s.teams.map((t) => {
        const own = isAdmin || (viewer && viewer.teamId === t.id);
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          budget: t.budget,
          earned: t.earned,
          inventory: own ? { ...t.inventory } : null,
          intel: own ? t.intel : null,
          ledger: own ? t.ledger.slice(0, 15) : null,
          requests: own ? t.requests : null,
          nickname: t.nickname,
          motto: t.motto,
        };
      }),
      players: s.players.map((p) =>
        isAdmin ? { ...this.publicPlayer(p, null), role: p.role, revealed: p.revealed, task: p.task, dirt: p.dirt, skimmed: p.skimmed, tasksDone: p.tasksDone, sentences: p.sentences } : this.publicPlayer(p, viewer),
      ),
      items: s.items.filter((i) => isAdmin || i.active),
      games: s.games,
      feed: s.feed.slice(0, 80),
      announcement: s.announcement,
      mafia: {
        phase: m.phase,
        round: m.round,
        winner: m.winner,
        lastResult: m.lastResult,
        tallies,
        votesCast: tallies ? Object.values(tallies).reduce((a, t) => a + Object.values(t).reduce((x, y) => x + y, 0), 0) : 0,
        immune: m.phase === 'vote' ? [...m.vote.immune] : [],
      },
    };
  }

  viewFor(playerId) {
    const p = this.player(playerId);
    if (!p) return null;
    const v = this.baseView(p);
    const m = this.s.mafia;
    // The task kind stays server-side: a snitch's phone must look exactly like everyone else's.
    v.me = { ...this.publicPlayer(p, p), sentences: p.sentences.slice(0, 15), role: p.role, revealed: p.revealed, dirt: p.dirt, skimmed: p.skimmed, task: p.task && { ...p.task, kind: undefined, effect: undefined, amount: undefined } };
    v.orders = this.s.orders
      .filter((o) => p.teamId && (o.fromTeamId === p.teamId || o.targetTeamId === p.teamId || o.originalFromTeamId === p.teamId))
      .slice(0, 60);
    v.mafia.myVote = m.phase === 'vote' ? m.vote.votes[p.id] || null : null;
    v.mafia.myNight = m.phase === 'night' ? m.night.tips[p.id] || m.night.suspicions[p.id] || null : null;
    return v;
  }

  adminView(role = 'warden') {
    const v = this.baseView('admin');
    v.hostRole = role;
    v.hosts = HOSTS;
    v.claims = this.s.claims.slice(0, 120);
    const m = this.s.mafia;
    v.orders = this.s.orders.slice(0, 200);
    v.mafia = { ...v.mafia, votes: m.phase === 'vote' ? { ...m.vote.votes } : {}, night: m.night };
    v.isAdmin = true;
    return v;
  }

  tvView() {
    const v = this.baseView(null);
    v.orders = this.s.orders.filter((o) => o.status === 'incoming').slice(0, 10);
    return v;
  }
}

module.exports = { Game, GameError, defaultState, ROLES, ITEM_TYPES, CHARGES, HOLDING, HOSTS };
