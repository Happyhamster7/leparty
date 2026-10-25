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
const cleanText = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

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
  inmate: { name: 'Inmate', emoji: '🧡', side: 'inmates', blurb: 'Find the snitches and get them thrown in solitary at the lockdown votes.' },
  snitch: { name: 'Snitch', emoji: '🐀', side: 'snitches', blurb: 'At Lights Out, pick someone to rat out with your fellow snitches. Blend in during the day.' },
  guard: { name: 'Crooked Guard', emoji: '🔦', side: 'inmates', blurb: 'At Lights Out, frisk one player to learn if they are a snitch. Use the intel wisely.' },
  lawyer: { name: 'Jailhouse Lawyer', emoji: '⚖️', side: 'inmates', blurb: 'At Lights Out, pick one player to protect. If the snitches target them, they walk.' },
};

const ITEM_TYPES = {
  supply: { label: 'For your cell', needsTarget: false },
  gift: { label: 'Send to another cell', needsTarget: true },
  punishment: { label: 'Punishment', needsTarget: true },
  deflect: { label: 'Deflect card', needsTarget: false },
  immunity: { label: 'Vote immunity', needsTarget: false },
};

function defaultItems() {
  const items = [
    ['🍋', 'Lime & Soda Water', 'Mixer delivered to your cell.', 5, 'supply'],
    ['🥤', 'Red Bull', 'Energy mixer delivered to your cell.', 10, 'supply'],
    ['🧃', 'Juice Box Mixer', 'OJ / cran / pineapple for your cell.', 8, 'supply'],
    ['🧊', 'Ice Run', 'A fresh bucket of ice for your cell.', 4, 'supply'],
    ['🍺', 'Send a Round', 'Buy another cell a round of beers.', 15, 'gift'],
    ['🥃', 'Buy Them a Shot', 'Send another cell a round of shots.', 20, 'gift'],
    ['⛓️', 'Chain Gang', 'Target cell must stay linked arm-in-arm for the next game.', 20, 'punishment', { drain: 0 }],
    ['🥵', 'Shot Penalty', 'Everyone in the target cell takes a shot.', 25, 'punishment', { drain: 0 }],
    ['💪', 'Yard Drills', '10 push-ups (or squats) for everyone in the target cell.', 12, 'punishment', { drain: 0 }],
    ['🔍', 'Shakedown', 'Guards raid the target cell: they lose 15 credits.', 20, 'punishment', { drain: 15 }],
    ['🎤', 'Confession Booth', 'Target cell must sing a chorus of a song of your choice.', 15, 'punishment', { drain: 0 }],
    ['🔄', 'Snitch Slip', 'Deflect card: bounce an incoming punishment back to whoever sent it.', 30, 'deflect'],
    ['💵', 'Bribe the Guard', 'Immunity from one lockdown vote for someone in your cell.', 35, 'immunity'],
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
  }));
}

function defaultMafia() {
  return {
    phase: 'off', // off | night | day | vote | over
    round: 0,
    night: { kills: {}, frisks: {}, protects: {} },
    vote: { votes: {}, immune: [] },
    frisks: {}, // guardId -> [{ round, targetId, isSnitch }]
    winner: null,
    lastResult: null,
  };
}

function defaultState() {
  return {
    version: 1,
    settings: {
      partyName: 'Shifty Shen Slammer',
      tagline: 'Do the crime, do the time, do the shots.',
      captainOnlySpending: false,
      startingBudget: 20,
    },
    teams: [],
    players: [],
    items: defaultItems(),
    orders: [],
    games: [],
    feed: [],
    announcement: null,
    mafia: defaultMafia(),
    adminTokens: [],
  };
}

class Game {
  constructor(state) {
    this.s = state || defaultState();
    // Fill in anything added in later versions of the schema.
    const d = defaultState();
    for (const k of Object.keys(d)) if (this.s[k] === undefined) this.s[k] = d[k];
    this.s.settings = { ...d.settings, ...this.s.settings };
    this.s.mafia = { ...defaultMafia(), ...this.s.mafia };
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
  isAdminToken(token) {
    return !!token && this.s.adminTokens.includes(token);
  }
  mustTeam(id) {
    return this.team(id) || fail('That cell block no longer exists.');
  }
  mustPlayer(id) {
    return this.player(id) || fail('That inmate is not in the system.');
  }
  teamName(id) {
    return this.team(id)?.name || 'the void';
  }

  log(text, kind = 'info', emoji = '📢') {
    this.s.feed.unshift({ id: uid(), ts: Date.now(), kind, text, emoji });
    if (this.s.feed.length > 250) this.s.feed.length = 250;
  }

  // ---------- auth ----------
  newAdminToken() {
    const t = secret();
    this.s.adminTokens.push(t);
    if (this.s.adminTokens.length > 20) this.s.adminTokens.shift();
    return t;
  }

  join(rawName) {
    const name = cleanText(rawName, 24);
    if (!name) fail('Give the booking officer a name.');
    if (this.s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      fail('Someone is already booked under that name. Add a last initial, or ask the Warden to reset you.');
    }
    const used = new Set(this.s.players.map((p) => p.inmateNo));
    let inmateNo;
    do inmateNo = String(10000 + Math.floor(Math.random() * 90000));
    while (used.has(inmateNo));
    const player = {
      id: uid(),
      token: secret(),
      name,
      inmateNo,
      charge: pick(CHARGES),
      teamId: null,
      isCaptain: false,
      role: 'inmate',
      status: 'gen_pop', // gen_pop | solitary
      joinedAt: Date.now(),
    };
    this.s.players.push(player);
    this.log(`${name} was booked. Inmate #${inmateNo}, charged with ${player.charge}.`, 'join', '🚔');
    return player;
  }

  // ---------- settings / broadcast ----------
  updateSettings({ partyName, tagline, captainOnlySpending, startingBudget }) {
    const st = this.s.settings;
    if (partyName !== undefined) st.partyName = cleanText(partyName, 40) || st.partyName;
    if (tagline !== undefined) st.tagline = cleanText(tagline, 80);
    if (captainOnlySpending !== undefined) st.captainOnlySpending = captainOnlySpending === true || captainOnlySpending === 'true' || captainOnlySpending === 'on';
    if (startingBudget !== undefined) st.startingBudget = Math.max(0, toInt(startingBudget, st.startingBudget));
  }

  announce({ text }) {
    const t = cleanText(text, 200);
    if (!t) fail('Announcement is empty.');
    this.s.announcement = { text: t, ts: Date.now() };
    this.log(t, 'announce', '📣');
  }

  clearAnnouncement() {
    this.s.announcement = null;
  }

  // ---------- teams ----------
  addTeam({ name, color }) {
    const n = cleanText(name, 30) || `Cell Block ${String.fromCharCode(65 + this.s.teams.length)}`;
    const team = {
      id: uid(),
      name: n,
      color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : TEAM_COLORS[this.s.teams.length % TEAM_COLORS.length],
      budget: this.s.settings.startingBudget,
      earned: 0,
      inventory: { deflect: 0, immunity: 0 },
    };
    this.s.teams.push(team);
    return team;
  }

  seedTeams({ count }) {
    const n = Math.min(8, Math.max(1, toInt(count, 4)));
    for (let i = 0; i < n; i++) this.addTeam({ name: `Cell Block ${String.fromCharCode(65 + this.s.teams.length)}` });
  }

  updateTeam({ teamId, name, color }) {
    const t = this.mustTeam(teamId);
    if (name !== undefined && cleanText(name, 30)) t.name = cleanText(name, 30);
    if (color && /^#[0-9a-f]{6}$/i.test(color)) t.color = color;
  }

  removeTeam({ teamId }) {
    this.mustTeam(teamId);
    this.s.teams = this.s.teams.filter((t) => t.id !== teamId);
    for (const p of this.s.players) if (p.teamId === teamId) {
      p.teamId = null;
      p.isCaptain = false;
    }
  }

  adjustBudget({ teamId, amount, reason }) {
    const t = this.mustTeam(teamId);
    const amt = toInt(amount);
    if (!amt) fail('Amount must be a non-zero number.');
    const before = t.budget;
    t.budget = Math.max(0, t.budget + amt);
    if (amt > 0) t.earned += amt;
    const why = cleanText(reason, 80);
    if (amt > 0) this.log(`${t.name} got ${amt} credits${why ? ` for ${why}` : ''}.`, 'money', '💰');
    else this.log(`${t.name} was docked ${before - t.budget} credits${why ? ` for ${why}` : ''}.`, 'money', '💸');
  }

  setInventory({ teamId, kind, count }) {
    const t = this.mustTeam(teamId);
    if (!['deflect', 'immunity'].includes(kind)) fail('Unknown inventory type.');
    t.inventory[kind] = Math.max(0, toInt(count));
  }

  // ---------- players ----------
  updatePlayer({ playerId, name, teamId, isCaptain, status, role }) {
    const p = this.mustPlayer(playerId);
    if (name !== undefined && cleanText(name, 24)) p.name = cleanText(name, 24);
    if (teamId !== undefined) {
      p.teamId = teamId ? this.mustTeam(teamId).id : null;
      if (!p.teamId) p.isCaptain = false;
    }
    if (isCaptain !== undefined) {
      const on = isCaptain === true || isCaptain === 'true';
      if (on) {
        if (!p.teamId) fail('Put them in a cell block first.');
        for (const o of this.s.players) if (o.teamId === p.teamId) o.isCaptain = false;
      }
      p.isCaptain = on;
      if (on) this.log(`${p.name} is now Shot Caller of ${this.teamName(p.teamId)}.`, 'team', '👑');
    }
    if (status !== undefined) {
      if (!['gen_pop', 'solitary'].includes(status)) fail('Unknown status.');
      if (p.status !== status) {
        p.status = status;
        this.log(status === 'solitary' ? `${p.name} was hauled off to solitary by the Warden.` : `${p.name} was released back into General Population.`, 'mafia', status === 'solitary' ? '🔒' : '🕊️');
      }
    }
    if (role !== undefined) {
      if (!ROLES[role]) fail('Unknown role.');
      p.role = role;
    }
  }

  removePlayer({ playerId }) {
    this.mustPlayer(playerId);
    this.s.players = this.s.players.filter((p) => p.id !== playerId);
  }

  shuffleTeams({ onlyUnassigned }) {
    if (!this.s.teams.length) fail('Create some cell blocks first.');
    const only = onlyUnassigned === true || onlyUnassigned === 'true';
    const pool = shuffle(this.s.players.filter((p) => !only || !p.teamId));
    const counts = Object.fromEntries(this.s.teams.map((t) => [t.id, 0]));
    if (only) for (const p of this.s.players) if (p.teamId && counts[p.teamId] !== undefined) counts[p.teamId]++;
    for (const p of pool) {
      if (!only) p.isCaptain = false;
      const smallest = shuffle(this.s.teams).sort((a, b) => counts[a.id] - counts[b.id])[0];
      p.teamId = smallest.id;
      counts[smallest.id]++;
    }
    this.log(only ? 'New arrivals have been assigned to cell blocks.' : 'Cell assignments have been shuffled! Check your cell.', 'team', '🎲');
  }

  // ---------- games / rounds ----------
  addGame({ name, desc }) {
    const n = cleanText(name, 60);
    if (!n) fail('Game needs a name.');
    const g = { id: uid(), name: n, desc: cleanText(desc, 200), status: 'upcoming', results: null, createdAt: Date.now() };
    this.s.games.push(g);
    return g;
  }

  updateGame({ gameId, name, desc }) {
    const g = this.game(gameId) || fail('Game not found.');
    if (name !== undefined && cleanText(name, 60)) g.name = cleanText(name, 60);
    if (desc !== undefined) g.desc = cleanText(desc, 200);
  }

  setGameStatus({ gameId, status }) {
    const g = this.game(gameId) || fail('Game not found.');
    if (!['upcoming', 'live', 'done'].includes(status)) fail('Unknown status.');
    if (status === 'live') {
      for (const o of this.s.games) if (o.status === 'live' && o.id !== g.id) o.status = 'upcoming';
      this.log(`NOW IN THE YARD: ${g.name}${g.desc ? ` — ${g.desc}` : ''}`, 'game', '🏁');
    }
    g.status = status;
  }

  moveGame({ gameId, dir }) {
    const i = this.s.games.findIndex((g) => g.id === gameId);
    if (i < 0) fail('Game not found.');
    const j = i + (toInt(dir) < 0 ? -1 : 1);
    if (j < 0 || j >= this.s.games.length) return;
    [this.s.games[i], this.s.games[j]] = [this.s.games[j], this.s.games[i]];
  }

  finishGame({ gameId, results }) {
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
    g.status = 'done';
    g.results = clean;
    const summary = Object.entries(clean)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${this.teamName(id)} ${n > 0 ? '+' : ''}${n}`)
      .join(', ');
    this.log(`${g.name} is over! ${summary || 'No credits paid out.'}`, 'game', '🏆');
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
    if (input.active !== undefined) out.active = input.active === true || input.active === 'true' || input.active === 'on';
    if (!out.name) fail('Item needs a name.');
    return out;
  }

  addItem(input) {
    const item = this.sanitizeItem({ emoji: '📦', price: 10, type: 'supply', stock: null, drain: 0, active: true, desc: '', ...input });
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
  buy(playerId, { itemId, targetTeamId, note }) {
    const p = this.mustPlayer(playerId);
    const item = this.item(itemId);
    if (!item || !item.active) fail('That item is off the shelf.');
    if (!p.teamId) fail('You need to be assigned to a cell block before you can shop.');
    const team = this.mustTeam(p.teamId);
    if (this.s.settings.captainOnlySpending && !p.isCaptain) fail('Only your Shot Caller can spend the cell budget tonight.');
    if (item.stock !== null && item.stock <= 0) fail('Sold out. The commissary is waiting on a shipment.');
    if (team.budget < item.price) fail(`Not enough credits. ${team.name} has ${team.budget}, this costs ${item.price}.`);

    const type = ITEM_TYPES[item.type];
    let target = null;
    if (type.needsTarget) {
      target = this.mustTeam(targetTeamId);
      if (target.id === team.id) fail('Pick a different cell block.');
    }

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
      buyerId: p.id,
      buyerName: p.name,
      fromTeamId: team.id,
      note: cleanText(note, 120),
      bounces: 0,
      history: [],
    };

    if (item.type === 'deflect' || item.type === 'immunity') {
      team.inventory[item.type] = (team.inventory[item.type] || 0) + 1;
      this.log(`${team.name} made a suspicious purchase at the commissary…`, 'shop', '🤫');
      return { ...base, status: 'stashed' };
    }

    const order = {
      ...base,
      originalFromTeamId: team.id,
      targetTeamId: target ? target.id : team.id,
      status: item.type === 'punishment' ? 'incoming' : 'pending',
    };
    this.s.orders.unshift(order);
    if (item.type === 'supply') this.log(`${team.name} bought ${item.emoji} ${item.name}.`, 'shop', '🛒');
    if (item.type === 'gift') this.log(`${team.name} sent ${item.emoji} ${item.name} to ${target.name}! 🥂`, 'shop', '🎁');
    if (item.type === 'punishment') this.log(`${team.name} ordered ${item.emoji} ${item.name} on ${target.name}! Will they deflect?`, 'punish', '⚠️');
    return order;
  }

  respondPunishment(playerId, { orderId, choice }) {
    const p = this.mustPlayer(playerId);
    const o = this.order(orderId);
    if (!o || o.type !== 'punishment' || o.status !== 'incoming') fail('That punishment is already settled.');
    if (p.teamId !== o.targetTeamId) fail('That punishment is not aimed at your cell.');
    const team = this.mustTeam(o.targetTeamId);
    if (choice === 'deflect') {
      if ((team.inventory.deflect || 0) < 1) fail('Your cell has no deflect cards. Take it like a champ.');
      if (!this.team(o.fromTeamId)) fail('The sender’s cell no longer exists. Nowhere to bounce it.');
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

  enforce(o) {
    const team = this.team(o.targetTeamId);
    o.status = 'pending';
    let drained = 0;
    if (team && o.drain) {
      drained = Math.min(team.budget, o.drain);
      team.budget -= drained;
    }
    o.drained = drained;
    this.log(
      `${this.teamName(o.targetTeamId)} is serving ${o.emoji} ${o.name}${drained ? ` and lost ${drained} credits` : ''}. Warden, enforce it!`,
      'punish',
      '⚖️',
    );
  }

  resolveOrder({ orderId, action }) {
    const o = this.order(orderId) || fail('Order not found.');
    if (action === 'enforce') {
      if (o.status !== 'incoming') fail('Only incoming punishments can be forced.');
      o.history.push({ ts: Date.now(), by: 'Warden', action: 'forced' });
      this.enforce(o);
    } else if (action === 'done') {
      if (!['pending', 'incoming'].includes(o.status)) fail('Order already closed.');
      o.status = 'done';
      o.doneAt = Date.now();
    } else if (action === 'cancel') {
      if (!['pending', 'incoming'].includes(o.status)) fail('Order already closed.');
      const payer = this.team(o.originalFromTeamId || o.fromTeamId);
      if (payer) payer.budget += o.price;
      o.status = 'cancelled';
      this.log(`The Warden cancelled ${o.emoji} ${o.name}. ${payer ? `${payer.name} was refunded.` : ''}`, 'shop', '🚫');
    } else fail('Unknown action.');
  }

  // ---------- mafia: roles ----------
  assignRoles({ snitch, guard, lawyer }) {
    const pool = shuffle(this.s.players);
    const counts = { snitch: toInt(snitch, 1), guard: toInt(guard, 1), lawyer: toInt(lawyer, 1) };
    const special = counts.snitch + counts.guard + counts.lawyer;
    if (counts.snitch < 1) fail('You need at least one snitch.');
    if (pool.length < special + 1) fail(`Need at least ${special + 1} inmates for those roles.`);
    for (const p of pool) {
      p.role = 'inmate';
      p.status = 'gen_pop';
    }
    let i = 0;
    for (const role of ['snitch', 'guard', 'lawyer']) for (let k = 0; k < counts[role]; k++) pool[i++].role = role;
    const m = this.s.mafia;
    Object.assign(m, defaultMafia(), { phase: 'day' });
    this.log(`Secret roles have been dealt. There ${counts.snitch === 1 ? 'is 1 snitch' : `are ${counts.snitch} snitches`} among you. Check your Rap Sheet — privately.`, 'mafia', '🐀');
  }

  resetMafia() {
    for (const p of this.s.players) {
      p.role = 'inmate';
      p.status = 'gen_pop';
    }
    this.s.mafia = defaultMafia();
    this.log('The snitch game has been reset. Everyone is back in General Population.', 'mafia', '🔁');
  }

  alive() {
    return this.s.players.filter((p) => p.status === 'gen_pop');
  }

  startNight() {
    const m = this.s.mafia;
    if (!this.s.players.some((p) => p.role === 'snitch')) fail('Deal roles first.');
    if (m.phase === 'over') fail('The game is over. Reset or re-deal roles to play again.');
    if (m.phase === 'vote') fail('Close the lockdown vote first.');
    m.round++;
    m.phase = 'night';
    m.night = { kills: {}, frisks: {}, protects: {} };
    this.log(`LIGHTS OUT — Night ${m.round}. Snitches, guards and lawyers: check your phones. Everyone else, keep your eyes shut!`, 'mafia', '🌙');
  }

  nightAction(playerId, { targetId }) {
    const m = this.s.mafia;
    const p = this.mustPlayer(playerId);
    if (m.phase !== 'night') fail('It is not Lights Out.');
    if (p.status !== 'gen_pop') fail('You are in solitary. No moves for you.');
    const t = this.mustPlayer(targetId);
    if (t.status !== 'gen_pop') fail('They are already in solitary.');
    if (p.role === 'snitch') {
      if (t.role === 'snitch') fail('Snitches don’t snitch on snitches.');
      m.night.kills[p.id] = t.id;
      return { ok: true };
    }
    if (p.role === 'guard') {
      if (t.id === p.id) fail('Frisk someone else.');
      if (m.night.frisks[p.id]) fail('You already frisked someone tonight.');
      m.night.frisks[p.id] = t.id;
      const result = { round: m.round, targetId: t.id, isSnitch: t.role === 'snitch' };
      (m.frisks[p.id] ||= []).push(result);
      return result;
    }
    if (p.role === 'lawyer') {
      m.night.protects[p.id] = t.id;
      return { ok: true };
    }
    fail('Inmates sleep at night. Shut your eyes!');
  }

  endNight() {
    const m = this.s.mafia;
    if (m.phase !== 'night') fail('It is not Lights Out.');
    const tally = {};
    for (const [snitchId, targetId] of Object.entries(m.night.kills)) {
      const s = this.player(snitchId);
      if (s && s.status === 'gen_pop' && s.role === 'snitch') tally[targetId] = (tally[targetId] || 0) + 1;
    }
    const top = Math.max(0, ...Object.values(tally));
    const victimId = top ? pick(Object.keys(tally).filter((k) => tally[k] === top)) : null;
    const protectedIds = new Set(Object.values(m.night.protects));
    m.phase = 'day';
    const victim = victimId && this.player(victimId);
    if (!victim) {
      m.lastResult = { kind: 'night', round: m.round, text: 'Quiet night. Nobody got ratted out.' };
      this.log(`LIGHTS ON — Quiet night on the block. Nobody got ratted out.`, 'mafia', '☀️');
    } else if (protectedIds.has(victim.id)) {
      m.lastResult = { kind: 'night', round: m.round, text: 'The snitches struck, but a lawyer got their target off on a technicality.' };
      this.log(`LIGHTS ON — The snitches ratted someone out, but a Jailhouse Lawyer got them off on a technicality!`, 'mafia', '⚖️');
    } else {
      victim.status = 'solitary';
      m.lastResult = { kind: 'night', round: m.round, playerId: victim.id, text: `${victim.name} was ratted out and thrown in solitary. They were a ${ROLES[victim.role].name}.` };
      this.log(`LIGHTS ON — ${victim.name} was ratted out and thrown in SOLITARY! They were ${ROLES[victim.role].emoji} ${ROLES[victim.role].name}.`, 'mafia', '🚨');
    }
    this.checkWin();
  }

  openVote() {
    const m = this.s.mafia;
    if (!this.s.players.some((p) => p.role === 'snitch')) fail('Deal roles first.');
    if (m.phase === 'night') fail('End Lights Out first.');
    if (m.phase === 'over') fail('The game is over.');
    m.phase = 'vote';
    m.vote = { votes: {}, immune: [] };
    this.log('LOCKDOWN VOTE is open! Vote for who you think is a snitch. Bribes accepted.', 'mafia', '🗳️');
  }

  castVote(playerId, { targetId }) {
    const m = this.s.mafia;
    const p = this.mustPlayer(playerId);
    if (m.phase !== 'vote') fail('No vote is open.');
    if (p.status !== 'gen_pop') fail('Inmates in solitary don’t get a vote.');
    if (targetId === 'skip') {
      m.vote.votes[p.id] = 'skip';
      return;
    }
    const t = this.mustPlayer(targetId);
    if (t.status !== 'gen_pop') fail('They are already in solitary.');
    m.vote.votes[p.id] = t.id;
  }

  useImmunity(playerId, { targetId }) {
    const m = this.s.mafia;
    const p = this.mustPlayer(playerId);
    if (m.phase !== 'vote') fail('Bribes only work while a lockdown vote is open.');
    if (!p.teamId) fail('You are not in a cell block.');
    const team = this.mustTeam(p.teamId);
    const t = this.mustPlayer(targetId);
    if (t.teamId !== team.id) fail('You can only bribe for someone in your own cell.');
    if (t.status !== 'gen_pop') fail('They are already in solitary.');
    if (m.vote.immune.includes(t.id)) fail('They are already protected.');
    if ((team.inventory.immunity || 0) < 1) fail('Your cell has no bribes left. Buy one at the commissary.');
    team.inventory.immunity--;
    m.vote.immune.push(t.id);
    this.log(`A guard has been bribed 💵 — ${t.name} is IMMUNE from this lockdown vote.`, 'mafia', '💵');
  }

  voteTally() {
    const m = this.s.mafia;
    const tally = {};
    for (const [voterId, targetId] of Object.entries(m.vote.votes)) {
      const v = this.player(voterId);
      if (!v || v.status !== 'gen_pop') continue;
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
    return tally;
  }

  closeVote() {
    const m = this.s.mafia;
    if (m.phase !== 'vote') fail('No vote is open.');
    const tally = this.voteTally();
    const immune = new Set(m.vote.immune);
    const counts = Object.entries(tally).filter(([id]) => id !== 'skip' && !immune.has(id));
    const top = Math.max(0, ...counts.map(([, n]) => n));
    const leaders = counts.filter(([, n]) => n === top).map(([id]) => id);
    m.phase = 'day';
    const breakdown = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id === 'skip' ? 'Skip' : this.player(id)?.name || '?'} ${n}`)
      .join(', ');
    if (!top || leaders.length !== 1 || (tally.skip || 0) >= top) {
      m.lastResult = { kind: 'vote', round: m.round, text: `Hung jury. Nobody goes to solitary. (${breakdown || 'no votes'})` };
      this.log(`Lockdown vote closed: HUNG JURY. Nobody goes to solitary. (${breakdown || 'no votes'})`, 'mafia', '🤷');
    } else {
      const out = this.player(leaders[0]);
      out.status = 'solitary';
      const role = ROLES[out.role];
      m.lastResult = { kind: 'vote', round: m.round, playerId: out.id, text: `${out.name} was voted into solitary. They were a ${role.name}.` };
      this.log(`Lockdown vote closed: ${out.name} is going to SOLITARY! They were ${role.emoji} ${role.name}. (${breakdown})`, 'mafia', '🔒');
    }
    this.checkWin();
  }

  checkWin() {
    const m = this.s.mafia;
    const alive = this.alive();
    const snitches = alive.filter((p) => p.role === 'snitch').length;
    const others = alive.length - snitches;
    if (snitches === 0) {
      m.winner = 'inmates';
      m.phase = 'over';
      this.log('ALL SNITCHES ARE IN SOLITARY! General Population wins! 🎉', 'mafia', '🏆');
    } else if (snitches >= others) {
      m.winner = 'snitches';
      m.phase = 'over';
      const names = this.s.players.filter((p) => p.role === 'snitch').map((p) => p.name).join(', ');
      this.log(`THE SNITCHES RUN THE BLOCK! ${names} win! 🐀`, 'mafia', '🐀');
    }
  }

  // ---------- views ----------
  publicPlayer(p, viewer) {
    const revealRole =
      p.status === 'solitary' ||
      this.s.mafia.phase === 'over' ||
      (viewer && viewer.id === p.id) ||
      (viewer && viewer.role === 'snitch' && p.role === 'snitch');
    return {
      id: p.id,
      name: p.name,
      inmateNo: p.inmateNo,
      charge: p.charge,
      teamId: p.teamId,
      isCaptain: p.isCaptain,
      status: p.status,
      role: revealRole ? p.role : null,
    };
  }

  baseView(viewer) {
    const s = this.s;
    const m = s.mafia;
    const showTally = m.phase === 'vote';
    return {
      settings: { ...s.settings },
      roles: ROLES,
      itemTypes: ITEM_TYPES,
      teams: s.teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        budget: t.budget,
        earned: t.earned,
        inventory: viewer === 'admin' || (viewer && viewer.teamId === t.id) ? { ...t.inventory } : null,
      })),
      players: s.players.map((p) => (viewer === 'admin' ? { ...p, token: undefined } : this.publicPlayer(p, viewer))),
      items: s.items.filter((i) => viewer === 'admin' || i.active),
      games: s.games,
      feed: s.feed.slice(0, 80),
      announcement: s.announcement,
      mafia: {
        phase: m.phase,
        round: m.round,
        winner: m.winner,
        lastResult: m.lastResult,
        hasRoles: s.players.some((p) => p.role === 'snitch'),
        tally: showTally ? this.voteTally() : null,
        votesCast: showTally ? Object.keys(m.vote.votes).length : 0,
        immune: m.phase === 'vote' ? [...m.vote.immune] : [],
      },
    };
  }

  viewFor(playerId) {
    const p = this.player(playerId);
    if (!p) return null;
    const v = this.baseView(p);
    const m = this.s.mafia;
    v.me = { ...this.publicPlayer(p, p), role: p.role };
    v.orders = this.s.orders.filter(
      (o) => p.teamId && (o.fromTeamId === p.teamId || o.targetTeamId === p.teamId || o.originalFromTeamId === p.teamId),
    ).slice(0, 60);
    v.mafia.myVote = m.phase === 'vote' ? m.vote.votes[p.id] || null : null;
    const night = m.night || {};
    v.mafia.myNight = null;
    if (m.phase === 'night') {
      if (p.role === 'snitch') v.mafia.myNight = night.kills[p.id] || null;
      if (p.role === 'guard') v.mafia.myNight = night.frisks[p.id] || null;
      if (p.role === 'lawyer') v.mafia.myNight = night.protects[p.id] || null;
    }
    if (p.role === 'snitch') v.mafia.snitchPicks = m.phase === 'night' ? { ...night.kills } : {};
    if (p.role === 'guard') v.mafia.frisks = m.frisks[p.id] || [];
    return v;
  }

  adminView() {
    const v = this.baseView('admin');
    const m = this.s.mafia;
    v.orders = this.s.orders.slice(0, 200);
    v.mafia = {
      ...v.mafia,
      tally: m.phase === 'vote' ? this.voteTally() : null,
      votes: m.phase === 'vote' ? { ...m.vote.votes } : {},
      night: m.night,
      frisks: m.frisks,
    };
    v.isAdmin = true;
    return v;
  }

  tvView() {
    const v = this.baseView(null);
    v.orders = this.s.orders.filter((o) => o.status === 'incoming').slice(0, 10);
    return v;
  }
}

module.exports = { Game, GameError, defaultState, ROLES, ITEM_TYPES, CHARGES };
