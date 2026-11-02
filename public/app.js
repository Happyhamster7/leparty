/* Shifty Shen Slammer — client. One file, no build step. */
(() => {
  const $app = document.getElementById('app');
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };

  const HOLDING = 'holding';
  const route = location.pathname.replace(/\/+$/, '') || '/';
  const hostRoute = route === '/warden' || route === '/officer';
  let kind = 'connecting'; // connecting | guest | player | admin | tv
  let S = null;
  let guest = {};
  let online = true;
  let offlineReason = '';
  let pendingRender = false;
  const ui = {
    tab: LS.get('sss_tab') || 'yard',
    atab: LS.get('sss_atab') || 'orders',
    sheet: null, // { itemId, targetTeamId, targetPlayerId }
    reveal: false,
    revealTask: false,
    finishing: null,
    renaming: false,
  };
  const drafts = {};
  // Bottom sheets slide in once, not on every state push.
  const opened = new Set();
  const enter = (key) => (opened.has(key) ? '' : (opened.add(key), 'enter'));

  // ---------- helpers ----------
  const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const team = (id) => S?.teams.find((t) => t.id === id) || null;
  const player = (id) => S?.players.find((p) => p.id === id) || null;
  const teamName = (id) => (id === HOLDING ? 'Holding Cell' : team(id)?.name || '—');
  const chip = (t, extra = '') => (t ? `<span class="chip ${extra}" style="--c:${h(t.color)}">${h(t.name)}</span>` : '<span class="chip muted">🕳️ Holding Cell</span>');
  const targetChip = (id) => (id === HOLDING ? '<span class="chip muted">🕳️ Holding Cell</span>' : chip(team(id)));
  const roleOf = (key) => S?.roles?.[key];
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const inHolding = () => S.players.filter((p) => p.status === 'holding');
  const inSolitary = () => S.players.filter((p) => p.status === 'solitary');
  const blockmates = (teamId) => S.players.filter((p) => p.teamId === teamId);
  const statusChip = (p) =>
    p.status === 'solitary'
      ? `<span class="chip red">🔒 Solitary · ${plural(p.solitary.rounds, 'round')}</span>`
      : p.status === 'holding'
        ? chip(null)
        : chip(team(p.teamId));

  // Wanted level, GTA style: Solitary is five stars, Holding three, and owed drinks or open sentences add one each.
  const wantedLevel = (p) =>
    p.status === 'solitary' ? 5 : p.status === 'holding' ? 3 : (p.drinksOwed > 0 ? 1 : 0) + ((p.sentences || []).some((x) => x.status === 'open') ? 1 : 0);
  const wantedStars = (p) => {
    const n = wantedLevel(p);
    return `<div class="wanted${n >= 3 ? ' hot' : ''}" title="Wanted level ${n} of 5" aria-label="Wanted level ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</div>`;
  };

  // The top-corner HUD changes with the act: wanted level, pity counter, streak, or an emergency light.
  function hudExtra(me, myTeam) {
    const id = actId();
    if (id === 'gta') return wantedStars(me);
    if (id === 'genshin' && myTeam) return `<div class="hud-x" title="Pulls since your last 5★">✦ Pity ${myTeam.pity ?? 0}/${S.settings.warpPity}</div>`;
    if (id === 'tft' && myTeam) {
      const st = myTeam.streak || 0;
      return `<div class="hud-x">${myTeam.augment ? `${S.augments[myTeam.augment].emoji} ` : ''}${st > 1 ? `🔥 ${st} win streak` : st < -1 ? `💧 ${-st} loss streak` : 'No streak'}</div>`;
    }
    if (id === 'amongus') return `<div class="hud-x">${S.mafia.phase === 'vote' ? '🚨 Meeting' : '🛰️ On task'}</div>`;
    return '';
  }

  // Price bands double as rarity: 1★ cheap mixers up to 5★ big-ticket items (Genshin rarity, TFT champion cost).
  const tierOf = (price) => (price <= 5 ? 1 : price <= 12 ? 2 : price <= 20 ? 3 : price <= 30 ? 4 : 5);

  // Among Us act: everyone gets a crewmate colour, fixed by booking order.
  const CREW_COLORS = ['#c51111', '#132ed1', '#117f2d', '#ed54ba', '#ef7d0d', '#f5f557', '#3f474e', '#d6e0f0', '#6b2fbb', '#71491e', '#38fedc', '#50ef39'];
  const crewIcon = (p) => {
    const c = CREW_COLORS[Math.max(0, S.players.findIndex((x) => x.id === p.id)) % CREW_COLORS.length];
    return `<svg class="crew" viewBox="-14 -2 78 96" aria-hidden="true"><rect x="-12" y="34" width="16" height="38" rx="6" fill="${c}" stroke="#000" stroke-width="5"/><path d="${CREWMATE}" fill="${c}" stroke="#000" stroke-width="6"/><ellipse cx="40" cy="30" rx="20" ry="12" fill="#9fe7ff" stroke="#000" stroke-width="6"/></svg>`;
  };

  const rankOf = (id) => standings().findIndex((t) => t.id === id) + 1;
  const nick = (t) => (t?.nickname ? ` <span class="nick">“${h(t.nickname)}”</span>` : '');

  // ---------- block helpers ----------
  // Blockmates (other than the asker, and not in solitary) who must second a purchase request.
  const secondsNeeded = (t, requesterId) =>
    Math.min(S.settings.requestSeconds, blockmates(t.id).filter((p) => p.id !== requesterId && p.status !== 'solitary').length);
  const requestsMine = () => (S.me?.status === 'block' ? team(S.me.teamId)?.requests || [] : []);
  const actionableRequests = () => requestsMine().filter((r) => r.by !== S.me.id && (S.me.isCaptain || !r.seconds.includes(S.me.id)));
  const willRequest = () => {
    const t = team(S.me.teamId);
    return !!t && S.settings.spendMode === 'request' && !S.me.isCaptain && secondsNeeded(t, S.me.id) > 0;
  };

  // Where my block stands in the live game's heats.
  function myMatch() {
    const g = S.games.find((x) => x.status === 'live');
    const myId = S.me?.teamId;
    if (!g || !(g.heats || []).length) return null;
    const mine = myId ? g.heats.filter((x) => x.teamIds.includes(myId)) : [];
    return {
      g,
      n: (x) => g.heats.indexOf(x) + 1,
      live: g.heats.find((x) => x.status === 'live'),
      now: mine.find((x) => x.status === 'live'),
      next: mine.find((x) => x.status === 'upcoming'),
      done: mine.find((x) => x.status === 'done'),
    };
  }
  const vsLine = (x, me) => x.teamIds.filter((id) => id !== me).map((id) => chip(team(id))).join(' <b>vs</b> ');

  function matchCard() {
    const m = myMatch();
    if (!m || S.me.status !== 'block') return '';
    const me = S.me.teamId;
    if (m.now) return `<section class="card match now"><div class="eyebrow">🥊 You're up · ${h(m.g.name)} · Heat ${m.n(m.now)}</div><div class="vs">${chip(team(me))} <b>vs</b> ${vsLine(m.now, me)}</div><p class="fine">Get to the table!</p></section>`;
    if (m.next) {
      const before = m.g.heats.filter((x) => x.status !== 'done' && m.g.heats.indexOf(x) < m.g.heats.indexOf(m.next)).length;
      return `<section class="card match"><div class="eyebrow">⏭️ Up ${before ? 'soon' : 'next'} · ${h(m.g.name)} · Heat ${m.n(m.next)}</div><div class="vs">${chip(team(me))} <b>vs</b> ${vsLine(m.next, me)}</div><p class="fine">${before ? `${plural(before, 'heat')} before yours.` : 'You’re on after this heat.'}${m.live ? ` Now playing: ${m.live.teamIds.map((id) => h(teamName(id))).join(' vs ')}.` : ''}</p></section>`;
    }
    if (m.done) {
      const got = m.done.results?.[me] || 0;
      return `<section class="card match"><div class="eyebrow">✅ Your heat is done · ${h(m.g.name)}</div><p>${got ? `Your block earned <b>${got > 0 ? '+' : ''}${got}</b>.` : 'No credits this time.'}</p></section>`;
    }
    return `<section class="card match"><div class="eyebrow">🪑 Sitting this one out · ${h(m.g.name)}</div>${m.live ? `<p class="fine">Now playing: ${m.live.teamIds.map((id) => h(teamName(id))).join(' vs ')}</p>` : ''}</section>`;
  }

  function requestsCard(t) {
    const list = t.requests || [];
    if (!list.length) return '';
    const me = S.me;
    return `<section class="card requests"><h3>🛒 Waiting on the block (${list.length})</h3>
      <ul class="reqs">${list
        .map((r) => {
          const need = secondsNeeded(t, r.by);
          const mine = r.by === me.id;
          const target = r.targetPlayerName ? ` → ${h(r.targetPlayerName)}` : r.targetTeamId ? ` → ${h(teamName(r.targetTeamId))}` : '';
          return `<li>
            <div><span class="mega">${h(r.emoji)}</span> <b>${h(r.name)}</b>${target} <span class="fine">${h(money(r.price))} · asked by ${mine ? 'you' : h(r.byName)}${r.note ? ` · “${h(r.note)}”` : ''}</span></div>
            <div class="row wrap"><span class="tag">${r.seconds.length}/${need} seconds</span>
              ${!mine && !r.seconds.includes(me.id) && me.status === 'block' ? `<button class="btn sm" data-act="second" data-request-id="${r.id}">👍 Second it</button>` : ''}
              ${me.isCaptain ? `<button class="btn sm" data-act="approve" data-request-id="${r.id}">👑 Approve</button>` : ''}
              ${mine || me.isCaptain ? `<button class="btn ghost sm" data-act="drop" data-request-id="${r.id}">${mine ? 'Withdraw' : 'Veto'}</button>` : ''}
            </div></li>`;
        })
        .join('')}</ul>
      <p class="fine">A purchase goes through when ${S.settings.requestSeconds === 1 ? 'a blockmate seconds it' : `${S.settings.requestSeconds} blockmates second it`}, or the Shot Caller 👑 approves it.</p>
    </section>`;
  }

  // Name buttons grouped by block (own block first) so 40 names stay scannable.
  function groupedTargets(list, button) {
    const mine = S.me?.teamId;
    const order = [...S.teams].sort((a, b) => (b.id === mine) - (a.id === mine));
    const groups = order.map((t) => [chip(t), list.filter((p) => p.teamId === t.id)]);
    groups.push([chip(null), list.filter((p) => !p.teamId)]);
    return groups
      .filter(([, ps]) => ps.length)
      .map(([label, ps]) => `<div class="tgroup"><div class="tgroup-h">${label}</div><div class="targets">${ps.map(button).join('')}</div></div>`)
      .join('');
  }

  // Each act's banner art, drawn inline so it needs no image files.
  const PALM_LEAF = 'M0 0C20-14 44-10 64 8C44-2 22-4 0 4Z';
  const palm = (x, y, k, flip) => `<g transform="translate(${x} ${y}) scale(${flip ? -k : k} ${k})">
      <path d="M0 0Q-12 70 10 150" stroke="#0e0818" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${[-40, -8, 24].map((a) => `<path d="${PALM_LEAF}" transform="rotate(${a})"/><path d="${PALM_LEAF}" transform="scale(-1 1) rotate(${a})"/>`).join('')}
      <path d="${PALM_LEAF}" transform="rotate(-78)"/>
    </g>`;
  // Fixed star positions so the sky doesn't reshuffle on every render.
  const STARS = Array.from({ length: 46 }, (_, i) => [(i * 89 + 17) % 400, (i * 53 + 11) % 150, ((i * 7) % 3) * 0.4 + 0.6]);
  const starField = (op = 0.8) => `<g fill="#fff" opacity="${op}">${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const CREWMATE = 'M0 40Q0 0 30 0Q60 0 60 40V80Q60 90 50 90H42V78H18V90H10Q0 90 0 80Z';
  const HERO_ART = {
    gta: () => `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0b35"/><stop offset=".45" stop-color="#6a1f6e"/><stop offset=".75" stop-color="#ff3d8b"/><stop offset="1" stop-color="#ff9b3d"/></linearGradient>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".6" stop-color="#ff9b3d"/><stop offset="1" stop-color="#ff3d8b"/></linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d1552"/><stop offset="1" stop-color="#0e0818"/></linearGradient>
      </defs>
      <rect width="400" height="152" fill="url(#sky)"/>
      <g fill="#fff" opacity=".7"><circle cx="40" cy="22" r="1"/><circle cx="120" cy="12" r="1.2"/><circle cx="300" cy="18" r="1"/><circle cx="360" cy="40" r=".8"/><circle cx="210" cy="30" r=".9"/></g>
      <circle cx="200" cy="138" r="64" fill="url(#sun)"/>
      <g fill="#ff3d8b">${[104, 116, 126, 135, 143].map((y, i) => `<rect x="130" y="${y}" width="140" height="${2 + i}"/>`).join('')}</g>
      <rect y="150" width="400" height="60" fill="url(#sea)"/>
      <g fill="#ff9b3d" opacity=".55">${[156, 163, 171, 180].map((y, i) => `<rect x="${170 - i * 8}" y="${y}" width="${60 + i * 16}" height="1.6" rx=".8"/>`).join('')}</g>
      <g fill="#1fe0d0" opacity=".25"><rect x="20" y="168" width="70" height="1"/><rect x="300" y="174" width="80" height="1"/></g>
      <path d="M0 210V178Q70 160 150 186L250 192Q330 162 400 174V210Z" fill="#0e0818"/>
      <g fill="#0e0818">${palm(52, 62, 1)}${palm(104, 104, 0.62)}${palm(348, 54, 1.08, true)}${palm(300, 108, 0.55, true)}</g>`,
    genshin: () => `
      <defs>
        <linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3a6b"/><stop offset=".55" stop-color="#5b8ec4"/><stop offset=".85" stop-color="#f1d9a7"/><stop offset="1" stop-color="#f6c98a"/></linearGradient>
        <radialGradient id="gsun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff8e0"/><stop offset=".4" stop-color="#ffe7a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="400" height="210" fill="url(#gsky)"/>
      <circle cx="270" cy="128" r="70" fill="url(#gsun)"/>
      <g fill="#fff" opacity=".85">${STARS.slice(0, 18).map(([x, y, r]) => `<circle cx="${x}" cy="${y * 0.4}" r="${r * 0.7}"/>`).join('')}</g>
      <g transform="translate(118 26)"><ellipse cx="0" cy="10" rx="30" ry="6" fill="#e9eef8" opacity=".9"/><path d="M-26 10Q0 34 26 10Z" fill="#9db1cf"/><rect x="-6" y="-8" width="12" height="18" fill="#f4f6fb"/><path d="M-9-8L0-20L9-8Z" fill="#d3bc8e"/></g>
      <g fill="#fff" opacity=".7"><ellipse cx="60" cy="96" rx="44" ry="9"/><ellipse cx="330" cy="70" rx="50" ry="8"/><ellipse cx="200" cy="110" rx="30" ry="6"/></g>
      <path d="M0 210V150L30 112L46 140L70 96L92 138L118 120L140 150L170 128L200 156L230 118L252 146L282 104L300 132L330 92L352 136L376 114L400 140V210Z" fill="#3f5f7f" opacity=".75"/>
      <path d="M0 210V170L40 150L80 168L130 148L180 172L240 150L300 170L350 152L400 166V210Z" fill="#2b4561"/>
      <path d="M0 210V188Q100 176 200 190T400 184V210Z" fill="#1c2b40"/>
      <g transform="translate(330 170)" fill="#1c2b40"><rect x="-3" y="-30" width="6" height="30"/><path d="M-18-30H18L12-38H-12Z"/><path d="M-12-38H12L6-46H-6Z"/></g>
      <g fill="#ffe7a8"><path d="M200 40l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/><path d="M40 52l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" opacity=".8"/></g>`,
    tft: () => `
      <defs>
        <linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03171c"/><stop offset=".7" stop-color="#0b2f38"/><stop offset="1" stop-color="#103c45"/></linearGradient>
        <radialGradient id="tglow" cx=".5" cy=".9" r=".6"><stop offset="0" stop-color="#0ac8b9" stop-opacity=".45"/><stop offset="1" stop-color="#0ac8b9" stop-opacity="0"/></radialGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0e6d2"/><stop offset=".5" stop-color="#c8aa6e"/><stop offset="1" stop-color="#785a28"/></linearGradient>
      </defs>
      <rect width="400" height="210" fill="url(#tsky)"/><rect width="400" height="210" fill="url(#tglow)"/>
      ${starField(0.35)}
      <g transform="translate(200 150) scale(1 .5)" fill="none" stroke="#c8aa6e" stroke-width="1.6">
        ${[-3, -2, -1, 0, 1, 2, 3].flatMap((c) => [-2, -1, 0, 1].map((r) => { const x = c * 52 + (r % 2 ? 26 : 0); const y = r * 46; const near = Math.abs(c) < 2 && Math.abs(r) < 2; return `<polygon points="${hex(x, y, 28)}" opacity="${near ? 0.95 : 0.45}" ${near ? 'fill="#0ac8b922"' : ''}/>`; })).join('')}
      </g>
      <g stroke="url(#gold)" stroke-width="2.5" fill="none" opacity=".9"><path d="M0 24H140L156 10H244L260 24H400"/></g>
      <g fill="url(#gold)">${[[70, 74], [330, 66], [300, 116], [96, 120]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="9"/><circle r="6" fill="#785a28"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="900" fill="#f0e6d2">g</text></g>`).join('')}</g>`,
    amongus: () => `
      <defs>
        <linearGradient id="asky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02030c"/><stop offset="1" stop-color="#101736"/></linearGradient>
        <radialGradient id="mars" cx=".4" cy=".2" r=".9"><stop offset="0" stop-color="#ff8a5c"/><stop offset=".6" stop-color="#c2352b"/><stop offset="1" stop-color="#4a0f14"/></radialGradient>
      </defs>
      <rect width="400" height="210" fill="url(#asky)"/>
      ${starField(1)}
      <circle cx="200" cy="420" r="260" fill="url(#mars)"/>
      <g transform="translate(300 52) rotate(22) scale(.62)">
        <rect x="-12" y="34" width="16" height="38" rx="6" fill="#9b1c22"/>
        <path d="${CREWMATE}" fill="#e3242b" stroke="#000" stroke-width="4"/>
        <ellipse cx="40" cy="30" rx="20" ry="12" fill="#9fe7ff" stroke="#000" stroke-width="4"/>
        <ellipse cx="46" cy="25" rx="8" ry="4" fill="#fff" opacity=".8"/>
      </g>
      <g transform="translate(70 96) rotate(-18) scale(.34)" opacity=".85">
        <rect x="-12" y="34" width="16" height="38" rx="6" fill="#0d6e66"/>
        <path d="${CREWMATE}" fill="#38fedc" stroke="#000" stroke-width="5"/>
        <ellipse cx="40" cy="30" rx="20" ry="12" fill="#9fe7ff" stroke="#000" stroke-width="5"/>
      </g>`,
  };
  const actId = () => (S ? S.acts?.[S.act]?.id : guest.act) || 'gta';
  const curAct = () => S?.acts?.[S.act] || null;
  const hero = (thin) => `<div class="hero${thin ? ' thin' : ''}" aria-hidden="true">
    <svg viewBox="0 0 400 210" preserveAspectRatio="xMidYM${thin ? 'id' : 'ax'} slice">${(HERO_ART[actId()] || HERO_ART.gta)()}</svg>
  </div>`;

  // Money in the current act's currency: $20, ✦20, 🪙20, or 20 cr.
  const money = (n) => {
    const sym = curAct()?.currency.symbol;
    return sym ? `${sym}${n}` : `${n} cr`;
  };
  const priceOf = (it) => {
    const t = team(S.me?.teamId);
    return actId() === 'tft' && t?.augment === 'hustler' ? Math.ceil(it.price * 0.75) : it.price;
  };
  const ordinal = (n) => {
    const v = n % 100;
    return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
  };

  // GTA-style full-screen stamp: MISSION PASSED, BUSTED, WASTED. Tap or wait to clear it.
  function splash(kind, title, sub = '', ms = 2800) {
    document.querySelectorAll('.splash').forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = `splash ${kind}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="splash-t">${h(title)}</div>${sub ? `<div class="splash-s">${h(sub)}</div>` : ''}`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); };
    el.addEventListener('click', close);
    document.body.append(el);
    setTimeout(close, ms);
  }

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    const box = document.getElementById('toasts');
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 3400);
    setTimeout(() => el.remove(), 3900);
  }

  // ---------- server ----------
  // Phones poll for changes (Vercel functions can't hold WebSockets open) and push every change through /api/action.
  const POLL_MS = 2000;
  let version = null;
  let pollTimer = null;

  // Each screen sends only the credential it acts with: hosts on /warden and /officer, players on /, nothing on /tv.
  const creds = () =>
    route === '/tv' ? {} : hostRoute ? { 'x-host-token': LS.get('sss_admin') || '' } : { 'x-player-token': LS.get('sss_token') || '' };

  // Takes a server reply carrying { kind, version, view } and shows it.
  function apply(res) {
    if (!res || res.same || !res.kind) return;
    if (version !== null && res.version < version) return; // an older poll that lost the race
    version = res.version;
    if (res.kind === 'guest') {
      if (res.kicked) {
        LS.del('sss_token');
        if (kind === 'player') toast('A host released you from the system. Book in again to rejoin.', 'error');
      }
      kind = 'guest';
      guest = res;
      S = null;
      render();
      return;
    }
    const prev = kind === res.kind ? S : null;
    kind = res.kind;
    S = res.view;
    if (kind === 'player') notifyChanges(prev, S);
    if (kind !== 'admin') actEvents(prev, S);
    render();
  }

  // Big moments every screen (phones and the TV) shows: a new act, Among Us meetings and ejections.
  function actEvents(prev, next) {
    if (!prev) return;
    const a = next.acts[next.act];
    if (prev.act !== next.act) {
      if (kind === 'player') ui.tab = next.acts[next.act].id === 'tft' ? 'yard' : 'menu';
      splash('act', `Act ${a.numeral}`, `${a.emoji} ${a.name}`, 3600);
      buzz([200, 100, 200, 100, 400]);
      return;
    }
    if (a.id !== 'amongus') return;
    if (prev.mafia.phase !== 'vote' && next.mafia.phase === 'vote') splash('meeting', 'Emergency Meeting', 'Block votes are open', 3200);
    const r = next.mafia.lastResult;
    if (r?.kind === 'vote' && r.ts && r.ts !== prev.mafia.lastResult?.ts) {
      const lines = (r.ejected || []).map((x) => `${x.name} was ${x.snitch ? '' : 'not '}an Impostor.`);
      splash('ejected', lines.length ? lines.join(' ') : 'No one was ejected.', lines.length ? '' : '(Skipped)', 4200);
    }
  }

  function setOnline(on) {
    if (online === on && on) return;
    online = on;
    render();
  }

  async function poll() {
    try {
      const qs = new URLSearchParams();
      if (version !== null) qs.set('v', version);
      if (route === '/tv') qs.set('tv', '1');
      const r = await fetch(`/api/state?${qs}`, { headers: creds(), cache: 'no-store' });
      if (!r.ok) {
        offlineReason = (await r.json().catch(() => ({}))).error || '';
        throw new Error(`HTTP ${r.status}`);
      }
      const res = await r.json();
      offlineReason = '';
      setOnline(true);
      apply(res);
    } catch {
      setOnline(false);
    }
  }

  function schedule() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      if (!document.hidden || route === '/tv') await poll();
      schedule();
    }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });

  async function send(body) {
    let res;
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', ...creds() }, body: JSON.stringify(body) });
      res = await r.json();
      setOnline(true);
    } catch {
      res = { ok: false, error: 'The server is not answering. Check your connection.' };
    }
    if (!res.ok) toast(res.error, 'error');
    else apply(res);
    return res;
  }
  const admin = (type, args = {}) => send({ kind: 'admin', type, args });
  const act = (type, args = {}) => send({ kind: 'act', type, args });

  const buzz = (p) => navigator.vibrate && navigator.vibrate(p);
  function notifyChanges(prev, next) {
    if (!prev || !next.me) return;
    const was = new Set((prev.orders || []).filter(isIncomingFor(prev)).map((o) => o.id + o.bounces));
    for (const o of next.orders.filter(isIncomingFor(next))) {
      if (!was.has(o.id + o.bounces)) {
        toast(`⚠️ ${teamName(o.fromTeamId)} hit your block with ${o.name}!`, 'warn');
        buzz([200, 100, 200]);
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      }
    }
    const a = prev.me;
    const b = next.me;
    const reqs = (v) => v.teams.find((t) => t.id === v.me.teamId)?.requests || [];
    const known = new Set(reqs(prev).map((r) => r.id));
    for (const r of reqs(next)) {
      if (!known.has(r.id) && r.by !== b.id && a.teamId === b.teamId) {
        toast(`🛒 ${r.byName} wants ${r.emoji} ${r.name}. Second it on My Block.`);
        buzz(100);
      }
    }
    if (a.task && b.task && a.task.id === b.task.id && a.task.status === 'claimed') {
      if (b.task.status === 'done') toast('✅ The hosts signed off. Clean getaway.', 'ok');
      if (b.task.status === 'active') toast('❌ The hosts didn’t buy it. Try again.', 'warn');
    }
    if (a.status !== b.status) {
      const words = next.acts[next.act].splash;
      if (b.status === 'solitary') splash('busted', words.solitary, `Solitary · ${plural(b.solitary.rounds, 'round')}`);
      else if (b.status === 'holding' && a.status === 'block') splash('wasted', words.kicked, 'Kicked to the Holding Cell');
    }
    if (b.teamId) {
      // A heat (or a game played without heats) just got scored with this block in it.
      const scored = [];
      let place = 0;
      for (const g of next.games) {
        const old = prev.games.find((x) => x.id === g.id);
        if (!old) continue;
        for (const x of g.heats || []) {
          const was = (old.heats || []).find((y) => y.id === x.id);
          if (x.status === 'done' && was && was.status !== 'done' && x.teamIds.includes(b.teamId)) {
            scored.push(x.results?.[b.teamId] || 0);
            const mine = x.results?.[b.teamId] || 0;
            place = 1 + x.teamIds.filter((id) => (x.results?.[id] || 0) > mine).length;
          }
        }
        if (g.status === 'done' && old.status !== 'done' && !(g.heats || []).length && g.results && b.teamId in g.results) scored.push(g.results[b.teamId] || 0);
      }
      if (scored.length) {
        const n = scored.reduce((x, y) => x + y, 0);
        const words = next.acts[next.act].splash;
        const sub = n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : 'Nothing this time';
        if (next.acts[next.act].id === 'tft' && place) splash(place === 1 ? 'passed' : 'failed', `${ordinal(place)} place`, sub);
        else if (n > 0) splash('passed', words.passed, sub);
        else splash('failed', words.failed, sub);
      }
      // Genshin act: everyone in the party sees the wish land.
      const seen = new Set((prev.orders || []).map((o) => o.id));
      const pull = (next.orders || []).find((o) => o.warp && !seen.has(o.id) && o.fromTeamId === b.teamId);
      if (pull) {
        wishReveal(pull.warps || [pull.warp], pull.buyerName);
        if (pull.warp.stars === 5) buzz([100, 60, 100, 60, 400]);
      }
    }
    if (a.status !== b.status || a.teamId !== b.teamId) {
      if (b.status === 'solitary') toast(`🔒 You’ve been thrown in SOLITARY (${plural(b.solitary.rounds, 'round')}).`, 'warn');
      else if (b.status === 'holding') toast('🕳️ You’re in the Holding Cell. Earn your way onto a block!', 'warn');
      else if (b.teamId) toast(`🔐 You’re on ${teamName(b.teamId)}.`, 'ok');
      buzz(300);
    }
    const ledger = (v) => team(v.me.teamId) && v.teams.find((t) => t.id === v.me.teamId)?.ledger?.[0];
    const la = ledger(prev);
    const lb = ledger(next);
    if (a.teamId === b.teamId && lb && lb.amount < 0 && (!la || la.ts !== lb.ts)) {
      toast(`💸 Unexplained withdrawal: ${lb.amount} credits just vanished from your block. Someone’s dirty…`, 'warn');
      buzz([100, 50, 100]);
    }
    const openIds = (p) => new Set((p.sentences || []).filter((x) => x.status === 'open').map((x) => x.id));
    const wasOpen = openIds(a);
    for (const x of (b.sentences || []).filter((y) => y.status === 'open' && !wasOpen.has(y.id))) {
      toast(`⚖️ ${x.from}: ${x.text}`, 'warn');
      buzz([200, 100, 200]);
    }
    if (b.drinksOwed > a.drinksOwed) {
      toast(`🍺 You owe ${plural(b.drinksOwed - a.drinksOwed, 'more penalty drink')}.`, 'warn');
      buzz(200);
    }
    if (prev.mafia.phase !== next.mafia.phase && ['night', 'vote'].includes(next.mafia.phase)) buzz(300);
  }
  const isIncomingFor = (v) => (o) => o.type === 'punishment' && o.status === 'incoming' && v.me.teamId && o.targetTeamId === v.me.teamId;

  // ---------- rendering ----------
  function render() {
    const active = document.activeElement;
    if (active && active.tagName === 'SELECT' && $app.contains(active)) {
      pendingRender = true; // don't yank an open dropdown out from under someone
      return;
    }
    pendingRender = false;
    const focusId = active && $app.contains(active) ? active.id : null;
    let sel = null;
    try { sel = focusId && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch {}

    document.body.dataset.kind = kind;
    document.body.dataset.era = actId();
    document.body.dataset.phase = S?.mafia?.phase || 'off';
    document.body.dataset.status = S?.me?.status || '';
    $app.innerHTML = page();

    for (const [id, val] of Object.entries(drafts)) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = val;
      else el.value = val;
    }
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel) try { el.setSelectionRange(...sel); } catch {}
      }
    }
    if (S?.settings?.partyName) document.title = hostRoute ? `${S.hosts?.[S.hostRole]?.name || 'Host'} · ${S.settings.partyName}` : S.settings.partyName;
  }

  function page() {
    const offline = online ? '' : `<div class="offline">${h(offlineReason || '📡 Lost signal to the yard… reconnecting')}</div>`;
    if (kind === 'connecting') return `${offline}<div class="boot">Booking you in…</div>`;
    if (kind === 'tv') return offline + (S ? tvPage() : '');
    if (kind === 'admin') return offline + (S ? adminPage() : '');
    if (kind === 'player') return offline + (S ? playerPage() : '<div class="boot">Loading your rap sheet…</div>');
    return offline + (hostRoute ? wardenLogin() : landing());
  }

  // ---------- guest screens ----------
  function landing() {
    return `
      <main class="landing">
        ${hero()}
        <div class="landing-inner">
          <div class="stamp">BOOKING</div>
          <h1 class="logo">${h(guest.partyName || 'Shifty Shen Slammer')}</h1>
          <p class="tagline">${h(guest.tagline || '')}</p>
          <form data-form="join" class="card booking">
            <label for="join_name">Name for the booking sheet</label>
            <input id="join_name" name="name" maxlength="24" autocomplete="nickname" placeholder="e.g. Shen" required />
            <button class="btn big" type="submit">Book me in 🚔</button>
            <p class="fine">You’ll start in the Holding Cell with an inmate number and a charge until a host puts you on a block. Keep this tab open all night — it remembers you.</p>
          </form>
          <p class="fine center"><a href="/warden">Host login</a> · <a href="/tv">TV screen</a></p>
        </div>
      </main>`;
  }

  function wardenLogin() {
    return `
      <main class="landing">
        ${hero()}
        <div class="landing-inner">
          <div class="stamp">RESTRICTED</div>
          <h1 class="logo">${route === '/officer' ? 'Commissary Office' : 'Warden Office'}</h1>
          <form data-form="pin" class="card booking">
            <label for="pin">Host PIN (Warden or Commissary Officer)</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required />
            <button class="btn big" type="submit">Enter the control room</button>
          </form>
          <p class="fine center"><a href="/">← Back to the yard</a></p>
        </div>
      </main>`;
  }

  // ---------- player ----------
  function playerPage() {
    const shell = { genshin: genshinPage, gta: gtaPhone, tft: tftClient, amongus: amongLobby }[actId()];
    if (shell) return shell();
    const me = S.me;
    const myTeam = team(me.teamId);
    const tabs = [
      ['yard', '📌', 'Now'],
      ['cell', me.status === 'block' ? '🔐' : me.status === 'holding' ? '🕳️' : '🔒', me.status === 'block' ? 'My Block' : me.status === 'holding' ? 'Holding' : 'Solitary'],
      ['shop', '🛒', 'Commissary'],
      ['rap', '🗂️', 'Rap Sheet'],
      ['board', '🏆', 'Board'],
    ];
    const body = { yard: yardTab, shop: shopTab, cell: cellTab, rap: rapTab, board: boardTab }[ui.tab] || yardTab;
    if (!['yard', 'shop', 'cell', 'rap', 'board'].includes(ui.tab)) ui.tab = 'yard';
    return `
      <header class="top" ${myTeam && me.status === 'block' ? `style="border-bottom-color:${h(myTeam.color)}"` : ''}>
        <div class="top-row">
          <div class="who">
            <div class="who-name">${h(me.name)} ${me.isCaptain ? '<span title="Shot Caller">👑</span>' : ''}</div>
            <div class="who-sub">#${h(me.inmateNo)} · ${statusChip(me)}</div>
          </div>
          <div class="hud">
            ${hudExtra(me, myTeam)}
            ${myTeam ? `<div class="credits" title="${h(myTeam.name)} credits"><div class="credits-n">${h(money(myTeam.budget))}</div><div class="credits-l">block ${h(curAct().currency.name)}</div></div>` : ''}
          </div>
        </div>
      </header>
      ${phaseBanner()}
      ${announcement()}
      ${drinkCard()}
      ${dealerCard()}
      ${incomingAlerts()}
      <main class="content">${body()}</main>
      ${ui.sheet ? buySheet() : ''}
      ${actUnseen() ? actModal() : briefingUnseen() ? briefingModal() : ''}
      <nav class="tabs">
        ${tabs.map(([k, icon, label]) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}"><i class="ti">${icon}</i><span>${label}</span>${k === 'rap' && needsMafiaAction() ? '<i class="dot"></i>' : ''}${k === 'yard' && ui.tab !== 'yard' && todoItems().length ? '<i class="dot"></i>' : ''}${k === 'cell' && (myIncoming().length || actionableRequests().length) ? '<i class="dot"></i>' : ''}</button>`).join('')}
      </nav>`;
  }

  // ---------- Act II: Genshin Impact, played in landscape ----------
  const PRIMO = '<svg class="gi-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#f4ecd6" stroke="#b5925a" stroke-width="1"/><path d="M12 6l1.6 4.4L18 12l-4.4 1.6L12 18l-1.6-4.4L6 12l4.4-1.6z" fill="#9fd3f5"/></svg>';
  const FATE = '<svg class="gi-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#c98ad8" stroke="#f6e7b4" stroke-width="1.5"/><path d="M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z" fill="#fff6dc"/></svg>';
  const tabDot = (k) =>
    (k === 'rap' && needsMafiaAction()) || (k === 'yard' && ui.tab !== 'yard' && todoItems().length) || (k === 'cell' && (myIncoming().length || actionableRequests().length)) ? '<i class="dot"></i>' : '';

  const VISION_GLYPH = { Pyro: '🔥', Hydro: '💧', Anemo: '🌀', Electro: '⚡', Dendro: '🌿', Cryo: '❄️', Geo: '🪨' };
  const arOf = (p) => Math.min(60, 1 + Math.floor((p.adventureExp || 0) / 200));
  const visionColor = (p) => S.visions?.[p.vision]?.color || '#d3bc8e';
  const avatar = (p, cls = '') =>
    `<span class="gi-avatar ${cls}" style="--vc:${visionColor(p)}">${h((p.name || '?').trim()[0].toUpperCase())}<i title="${h(p.vision)}">${VISION_GLYPH[p.vision] || '✦'}</i></span>`;
  // Elemental Resonance: two or more of one Vision among a block's active members.
  const resonanceOf = (teamId) => {
    const counts = {};
    for (const m of blockmates(teamId)) if (m.status !== 'solitary') counts[m.vision] = (counts[m.vision] || 0) + 1;
    return Object.keys(counts).filter((v) => counts[v] >= 2);
  };

  // The Genshin act's screens, in Paimon Menu order.
  function giScreens() {
    const me = S.me;
    return [
      ['yard', '📜', 'Adventurer Handbook', handbookTab],
      ['wish', '✨', 'Wish', wishTab],
      ['shop', '🛍️', 'Paimon’s Bargains', shopTab],
      ['cell', me.status === 'block' ? '👥' : me.status === 'holding' ? '🕳️' : '🔒', me.status === 'block' ? 'Party Setup' : me.status === 'holding' ? 'Holding Cell' : 'Solitary', cellTab],
      ['events', '🎪', 'Events', eventsTab],
      ['rap', '📖', 'Archive', rapTab],
      ['board', '🏆', 'Leaderboard', boardTab],
      ['mail', '✉️', 'Mail', mailTab],
    ];
  }

  function giPills(myTeam) {
    return `<div class="gi-cur">
      ${myTeam ? `<span class="gi-pill" title="Wishes until a guaranteed 5★">${FATE}<b>${S.settings.warpPity - (myTeam.pity || 0)}</b><small>to 5★</small></span>` : ''}
      ${myTeam ? `<span class="gi-pill" title="${h(myTeam.name)} Primogems">${PRIMO}<b>${myTeam.budget}</b><i>+</i></span>` : ''}
    </div>`;
  }

  // Home is the Paimon Menu: your profile in the corner, every screen one tap away.
  function genshinPage() {
    const me = S.me;
    const myTeam = team(me.teamId);
    const screens = giScreens();
    const cur = screens.find((x) => x[0] === ui.tab);
    const ar = arOf(me);
    const into = (me.adventureExp || 0) % 200;
    const shell = (inner) => `<div class="gi landscape ${cur ? 'gi-screen' : 'gi-home'}">
      <div class="gi-bg">${hero()}</div>
      ${rotatePrompt()}
      ${inner}
      ${ui.sheet ? buySheet() : ''}
      ${actUnseen() ? actModal() : briefingUnseen() ? briefingModal() : ''}
    </div>`;
    if (cur) {
      return shell(`<header class="gi-top">
          <div class="gi-title"><span class="gi-ico">${cur[1]}</span><div><b>${h(cur[2])}</b><small>${h(me.name)} · AR ${ar} · ${statusChip(me)}</small></div></div>
          <div class="row">${giPills(myTeam)}<button class="gi-x" data-act="tab" data-tab="menu" aria-label="Back to the Paimon Menu">✕</button></div>
        </header>
        <main class="gi-main">${phaseBanner()}${announcement()}${incomingAlerts()}${dealerCard()}${cur[0] === 'yard' ? '' : drinkCard()}${cur[3]()}</main>`);
    }
    const signature = myTeam?.motto || (myTeam ? `Adventurer of ${myTeam.name}${myTeam.nickname ? ` “${myTeam.nickname}”` : ''}` : me.status === 'holding' ? 'Waiting in the Holding Cell…' : 'Doing time in Solitary.');
    return shell(`<section class="gi-profile" style="--vc:${visionColor(me)}">
        <div class="gi-namecard">
          ${avatar(me, 'big')}
          <div class="gi-who"><b>${h(me.name)}${me.isCaptain ? ' 👑' : ''}</b><small>${h(signature)}</small></div>
        </div>
        <div class="gi-stats">
          <div class="gi-ar"><span>Adventure Rank</span><b>${ar}</b></div>
          <div class="gi-exp"><i style="width:${ar >= 60 ? 100 : (into / 200) * 100}%"></i><small>${ar >= 60 ? 'MAX' : `${into}/200`}</small></div>
          <div class="gi-row"><span>World Level</span><b>${Math.min(8, Math.floor(ar / 5))}</b></div>
          <div class="gi-row"><span>Vision</span><b>${VISION_GLYPH[me.vision] || ''} ${h(me.vision || '')}</b></div>
          <div class="gi-row"><span>Party</span><b>${myTeam ? chip(myTeam) : statusChip(me)}</b></div>
        </div>
        <div class="gi-uid">UID: 8${h(me.inmateNo)}26</div>
      </section>
      <section class="gi-menu">
        <div class="gi-menu-top"><span class="gi-paimon">✦ Paimon Menu</span>${giPills(myTeam)}</div>
        <div class="gi-notices">${phaseBanner()}${announcement()}${incomingAlerts()}${dealerCard()}</div>
        <div class="gi-grid">${screens.map(([k, icon, label]) => `<button class="gi-app" data-act="tab" data-tab="${k}"><span class="gi-app-i">${icon}${giDot(k)}</span><span>${h(label)}</span></button>`).join('')}</div>
      </section>`);
  }

  // Landscape acts show this to phones held upright.
  const rotatePrompt = () => `<div class="rot" role="alert"><div class="rot-phone"></div><b>Rotate your device</b><small>Act ${curAct().numeral} · ${h(curAct().name)} is played in landscape, like the game.</small></div>`;
  const sheetsAndModals = () => `${ui.sheet ? buySheet() : ''}${actUnseen() ? actModal() : briefingUnseen() ? briefingModal() : ''}`;
  const alerts = (withDrinks = true) => `${phaseBanner()}${announcement()}${incomingAlerts()}${dealerCard()}${withDrinks ? drinkCard() : ''}`;
  const dotFor = (k) => {
    const me = S.me;
    return tabDot(k) || (k === 'yard' && todoItems().length) || (k === 'events' && !!liveGame() && briefingUnseen()) || (k === 'rap' && S.mafia.phase === 'vote' && me.status === 'block' && !S.mafia.myVote);
  };
  const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---------- Act I: GTA, played on the in-game smartphone ----------
  function bankApp() {
    const t = team(S.me.teamId);
    if (!t) return '<section class="card"><h3>Maze Bank</h3><p class="empty">No account. Get bailed onto a block to open one.</p></section>';
    return `<section class="card ph-bank"><div class="eyebrow">${h(t.name)} · Checking</div><div class="ph-balance">${h(money(t.budget))}</div><p class="fine">Earned tonight: ${h(money(t.earned))}</p></section>
      <section class="card"><h3>Account activity</h3>${(t.ledger || []).length ? `<ul class="roster ledger">${t.ledger.map((l) => `<li><span class="${l.amount < 0 ? 'red-t' : 'green-t'}">${l.amount > 0 ? '+' : ''}${l.amount}</span> <span>${h(l.text)}</span> <span class="fine">${time(l.ts)}</span></li>`).join('')}</ul>` : '<p class="empty">No transactions yet.</p>'}</section>`;
  }

  function gtaApps() {
    return [
      ['yard', '💬', 'Texts', '#30a64a', () => `${todoCard()}${matchCard()}`],
      ['events', '📋', 'Job List', '#3d7bd9', eventsTab],
      ['shop', '🌐', 'Internet', '#2f6fd1', shopTab],
      ['cell', '👥', 'Contacts', '#e08a1e', cellTab],
      ['bank', '🏦', 'Maze Bank', '#c62f3b', bankApp],
      ['rap', '🚓', 'LSPD', '#24418f', rapTab],
      ['board', '📊', 'Stats', '#7b4bb3', boardTab],
      ['mail', '🐦', 'Bleeter', '#1d9bf0', mailTab],
      ['brief', '🎬', 'Snapmatic', '#e2245c', briefingTab],
    ];
  }

  function briefingTab() {
    return `${briefingCard()}${lockupRules(S.me.status, liveGame())}`;
  }

  function gtaPhone() {
    const me = S.me;
    const t = team(me.teamId);
    const apps = gtaApps();
    const cur = apps.find((a) => a[0] === ui.tab);
    const status = `<div class="ph-status"><span class="ph-clock">${clock()}</span><span class="ph-carrier">Vice City · iFruit</span><span>▂▄▆█ 5G 🔋</span></div>`;
    if (cur) {
      return `<div class="ph" style="--ac:${cur[3]}">${status}
        <header class="ph-head"><button class="ph-back" data-act="tab" data-tab="menu" aria-label="Back to the home screen">‹</button><b>${h(cur[2])}</b><span class="ph-hcash">${t ? h(money(t.budget)) : ''}</span></header>
        <main class="ph-body">${alerts(cur[0] !== 'yard')}${cur[4]()}</main>
        <button class="ph-homebar" data-act="tab" data-tab="menu" aria-label="Home"></button>
        ${sheetsAndModals()}</div>`;
    }
    const n = wantedLevel(me);
    return `<div class="ph ph-home">${status}
      <div class="ph-wall">${hero()}</div>
      <section class="ph-card">
        <span class="ph-rank" title="Rank">${arOf(me)}</span>
        <div class="ph-id"><b>${h(me.name)}${me.isCaptain ? ' 👑' : ''}</b><small>${t ? `Crew: ${h(t.name)}${t.nickname ? ` “${h(t.nickname)}”` : ''}` : statusChip(me)}</small>${wantedStars(me)}</div>
        <div class="ph-money">${t ? `<b>${h(money(t.budget))}</b><small>Bank ${h(money(t.earned))}</small>` : ''}</div>
      </section>
      <div class="ph-notices">${alerts()}</div>
      <div class="ph-grid">${apps.map(([k, icon, label, color]) => `<button class="ph-app" data-act="tab" data-tab="${k}" style="--ac:${color}"><span class="ph-icon">${icon}${dotFor(k) ? '<i class="dot"></i>' : ''}</span><span>${h(label)}</span></button>`).join('')}</div>
      <p class="ph-hint">${n >= 3 ? '★ Lose the cops: serve your time.' : 'Tap an app.'}</p>
      ${sheetsAndModals()}</div>`;
  }

  // ---------- Act III: TFT, played in the League client ----------
  const RANKS = ['Challenger', 'Grandmaster', 'Master', 'Diamond', 'Emerald', 'Platinum', 'Gold', 'Silver', 'Bronze', 'Iron'];
  const rankName = (t) => (t ? RANKS[Math.min(RANKS.length - 1, Math.round(((rankOf(t.id) - 1) / Math.max(1, S.teams.length - 1)) * 6))] : 'Unranked');
  function socialStatus(p) {
    if (p.status === 'solitary') return ['busy', 'In Solitary'];
    if (p.status === 'holding') return ['away', 'In Queue (Holding)'];
    const g = liveGame();
    const heat = g?.heats?.find((x) => x.status === 'live');
    if (g && (!heat || heat.teamIds.includes(p.teamId))) return ['game', `In Game: ${g.name}`];
    return ['online', 'In Lobby'];
  }
  function tftClient() {
    const me = S.me;
    const t = team(me.teamId);
    const tabs = [
      ['yard', 'Home', yardTab],
      ['rap', 'Profile', rapTab],
      ['cell', 'Collection', cellTab],
      ['shop', 'Store', shopTab],
      ['board', 'Ranked', boardTab],
    ];
    const play = ['events', 'Play', eventsTab];
    const cur = ui.tab === 'events' ? play : tabs.find((x) => x[0] === ui.tab) || tabs[0];
    const icon = (p, big) => `<span class="lc-icon ${big ? 'big' : ''}" style="--tc:${h(team(p.teamId)?.color || '#785a28')}">${h(p.name.trim()[0].toUpperCase())}${big ? `<i>${arOf(p)}</i>` : ''}</span>`;
    const row = (p) => {
      const [cls, text] = socialStatus(p);
      return `<li class="lc-friend ${cls}">${icon(p)}<span><b>${h(p.name)}${p.isCaptain ? ' 👑' : ''}</b><small>${h(text)}</small></span></li>`;
    };
    const mates = t ? blockmates(t.id).filter((p) => p.id !== me.id) : [];
    const others = S.teams.filter((x) => x.id !== t?.id);
    const [mcls, mtext] = socialStatus(me);
    return `<div class="lc landscape">${rotatePrompt()}
      <header class="lc-top">
        <button class="lc-play ${ui.tab === 'events' ? 'on' : ''}" data-act="tab" data-tab="events">PLAY${dotFor('events') ? '<i class="dot"></i>' : ''}</button>
        <nav class="lc-nav">${tabs.map(([k, label]) => `<button data-act="tab" data-tab="${k}" class="${cur[0] === k ? 'on' : ''}">${label}${dotFor(k) ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
        <div class="lc-cur">${t ? `<span class="lc-streak">${t.augment ? `${S.augments[t.augment].emoji} ` : ''}${t.streak > 1 ? `🔥${t.streak}` : t.streak < -1 ? `💧${-t.streak}` : ''}</span><span class="lc-gold">🪙 ${t.budget}</span>` : ''}</div>
      </header>
      <main class="lc-main">${alerts()}${cur[2]()}</main>
      <aside class="lc-social">
        <div class="lc-me ${mcls}">${icon(me, true)}<span><b>${h(me.name)}</b><small>${h(mtext)}</small><em>${h(rankName(t))} · ${t ? h(t.name) : 'No party'}</em></span></div>
        <div class="lc-group">${t ? `${h(t.name)}${t.nickname ? ` “${h(t.nickname)}”` : ''} (${mates.length + 1})` : 'Holding Cell'}</div>
        <ul class="lc-friends">${(t ? mates : inHolding().filter((p) => p.id !== me.id)).map(row).join('') || '<li class="lc-empty">Nobody else here</li>'}</ul>
        ${others.map((o) => `<div class="lc-group">${h(o.name)} (${blockmates(o.id).length})</div><ul class="lc-friends">${blockmates(o.id).map(row).join('')}</ul>`).join('')}
        ${t && inHolding().length ? `<div class="lc-group">Holding Cell (${inHolding().length})</div><ul class="lc-friends">${inHolding().map(row).join('')}</ul>` : ''}
      </aside>
      ${sheetsAndModals()}</div>`;
  }

  // ---------- Act IV: Among Us, played from the lobby ----------
  function amongLobby() {
    const me = S.me;
    const t = team(me.teamId);
    const screens = [
      ['yard', '📋', 'Tasks'],
      ['events', '🛸', 'Schedule'],
      ['shop', '🛒', 'Shop'],
      ['cell', '👥', 'Crew'],
      ['rap', '🚨', S.mafia.phase === 'vote' ? 'Meeting' : 'Role'],
      ['board', '🏆', 'Stats'],
      ['mail', '💬', 'Chat'],
    ];
    const bodies = { yard: yardTab, events: eventsTab, shop: shopTab, cell: cellTab, rap: rapTab, board: boardTab, mail: mailTab };
    const cur = screens.find((x) => x[0] === ui.tab);
    const crowd = t ? blockmates(t.id) : inHolding();
    const lvl = arOf(me);
    if (cur) {
      return `<div class="au landscape">${rotatePrompt()}
        <div class="au-tablet"><header><button class="au-x" data-act="tab" data-tab="menu" aria-label="Back to the lobby">✕</button><b>${cur[1]} ${h(cur[2])}</b><span class="au-money">${t ? h(money(t.budget)) : ''}</span></header>
        <main>${alerts()}${bodies[cur[0]]()}</main></div>
        ${sheetsAndModals()}</div>`;
    }
    return `<div class="au au-lobby landscape">${rotatePrompt()}
      <header class="au-top">
        <div class="au-me">${crewIcon(me)}<span><b>${h(me.name)}</b><small>Lvl ${lvl}</small></span></div>
        <div class="au-code"><small>${t ? 'Lobby' : 'Waiting room'}</small><b>${t ? h(t.name.toUpperCase()) : 'HOLDING'}</b><small>${crowd.length}/${t ? S.settings.maxBlockSize : '∞'} players</small></div>
        <div class="au-money">${t ? h(money(t.budget)) : ''}</div>
      </header>
      <div class="au-notices">${alerts(false)}</div>
      <div class="au-floor">${crowd.map((p) => `<div class="au-crew ${p.id === me.id ? 'me' : ''} ${p.status === 'solitary' ? 'out' : ''}"><span class="au-name">${h(p.name)}</span>${crewIcon(p)}</div>`).join('')}</div>
      <nav class="au-btns">${screens.map(([k, icon, label]) => `<button data-act="tab" data-tab="${k}"><span class="au-bi">${icon}${dotFor(k) ? '<i class="dot"></i>' : ''}</span><span>${h(label)}</span></button>`).join('')}</nav>
      ${sheetsAndModals()}</div>`;
  }

  // Red dots on the menu, like the game's notification badges.
  function giDot(k) {
    const me = S.me;
    const open = (me.commissions || []).some((c) => !c.done);
    const show =
      tabDot(k) ||
      (k === 'yard' && (open || todoItems().length)) ||
      (k === 'events' && !!liveGame() && briefingUnseen());
    return show ? '<i class="dot"></i>' : '';
  }

  // Adventurer Handbook: Daily Commissions first, then everything else owed.
  function handbookTab() {
    const me = S.me;
    const list = me.commissions || [];
    const done = list.filter((c) => c.done).length;
    const rw = S.commissionReward;
    const myTeam = team(me.teamId);
    const res = myTeam ? resonanceOf(myTeam.id) : [];
    return `<section class="card gi-comms-card">
        <h3>Daily Commissions <span class="gi-count">${done}/${list.length || 4}</span></h3>
        ${list.length ? `<div class="gi-comms">${list
          .map((c) => `<div class="gi-comm ${c.done ? 'done' : ''}">
            <span class="gi-comm-i">${c.done ? '✔' : '!'}</span>
            <div><b>${h(c.text)}</b><small>Rewards: ${PRIMO}${rw.primos}${res.length ? `+${res.length}` : ''} · ${rw.exp} Adventure EXP</small></div>
            ${c.done ? '<span class="gi-claimed">Completed</span>' : `<button class="btn sm" data-act="commission" data-commission-id="${c.id}" data-confirm="Turn in: “${h(c.text)}”? Honour system, adventurer.">Complete</button>`}
          </div>`)
          .join('')}</div>` : '<p class="empty">The Adventurers’ Guild has no commissions for you yet.</p>'}
        <p class="gi-guild">${me.commissionBonus ? '📜 Bonus claimed from the Adventurers’ Guild. Ad astra abyssosque!' : `📜 Finish all four for a Guild bonus: ${PRIMO}${rw.bonus.primos} · ${rw.bonus.exp} Adventure EXP${myTeam ? '' : ' (Primogems only go to adventurers in a party)'}.`}</p>
      </section>
      ${todoCard()}
      ${matchCard()}`;
  }

  function eventsTab() {
    const live = liveGame();
    return `${lockupRules(S.me.status, live)}${matchCard()}${live ? liveGameCard(live) : '<section class="card"><h3>Current Event</h3><p class="empty">No event running. The hosts will start the next one soon.</p></section>'}
      ${S.games.length ? `<section class="card"><h3>Event Schedule</h3><ol class="schedule">${S.games.map((g) => `<li class="g-${g.status}"><span>${h(g.name)}</span><span class="tag">${g.status === 'live' ? 'LIVE' : g.status === 'done' ? 'DONE' : 'UP NEXT'}</span></li>`).join('')}</ol></section>` : ''}`;
  }

  function mailTab() {
    return `<section class="card"><h3>Mail</h3>${feedList()}</section>`;
  }

  // Party Setup: your blockmates as a lineup of characters, plus any Elemental Resonance.
  function partyLineup(t) {
    const mates = blockmates(t.id);
    const res = resonanceOf(t.id);
    return `<section class="card gi-party">
      <h3>Party Setup</h3>
      <div class="gi-lineup">${mates
        .map((p, i) => `<div class="gi-char ${p.id === S.me.id ? 'me' : ''} ${p.status === 'solitary' ? 'out' : ''}" style="--vc:${visionColor(p)}">
          <span class="gi-slot">${i + 1}</span>${avatar(p)}<b>${h(p.name)}${p.isCaptain ? ' 👑' : ''}</b><small>AR ${arOf(p)} · ${h(p.vision)}${p.status === 'solitary' ? ' · 🔒' : ''}</small></div>`)
        .join('')}</div>
      <p class="gi-res">${res.length ? `Elemental Resonance: ${res.map((v) => `<b>${VISION_GLYPH[v]} ${h(S.visions[v].resonance)}</b>`).join(', ')}. Each commission pays ${PRIMO}+${res.length} extra.` : 'No Elemental Resonance. Two party members with the same Vision unlock one (and extra Primogems per commission).'}</p>
    </section>`;
  }

  // The event wish banner: Wish ×1 / ×10, rates, pity, and the party's history.
  function wishTab() {
    const me = S.me;
    const t = team(me.teamId);
    const st = S.settings;
    const fate = S.items.find((i) => i.type === 'warp');
    if (!fate) return '<section class="card"><h3>Wish</h3><p class="empty">No banner is running right now.</p></section>';
    const left = t ? st.warpPity - (t.pity || 0) : st.warpPity;
    const one = priceOf(fate);
    const blocked = !t ? 'Only adventurers in a party can wish. Get bailed onto a block first.' : me.status === 'solitary' ? 'No wishing from Solitary.' : '';
    const ask = !blocked && willRequest();
    const wishBtn = (n) => `<button class="gi-wish" data-act="wish" data-count="${n}" ${blocked || t.budget < one * n ? 'disabled' : ''}>
        <small>${ask ? 'Ask the party: ' : ''}Wish ×${n}</small><span>${FATE} × ${n} <em>(${PRIMO}${one * n})</em></span></button>`;
    const history = (S.orders || []).filter((o) => o.warp && o.fromTeamId === t?.id).slice(0, 12);
    const panel =
      ui.wishPanel === 'details'
        ? `<section class="card gi-panel"><h3>Details</h3><p class="fine">Base rates: 5★ ${st.warp5}% · 4★ ${st.warp4}% · 3★ ${Math.max(0, 100 - st.warp5 - st.warp4)}%. Every ${st.warpPity}th wish without a 5★ is a guaranteed 5★. Prizes go to the whole party; drinks and sips go to whoever wished.</p>
            ${[5, 4, 3].map((r) => `<div class="gi-rate r${r}"><b>${'★'.repeat(r)}</b>${S.warpPrizes[r].map((x) => `<span>${h(x.emoji)} ${h(x.name)}: ${h(x.text)}</span>`).join('')}</div>`).join('')}</section>`
        : ui.wishPanel === 'history'
          ? `<section class="card gi-panel"><h3>Wish History</h3>${history.length ? `<ul class="roster">${history.flatMap((o) => (o.warps || [o.warp]).map((w) => `<li class="r${w.stars}"><b>${'★'.repeat(w.stars)}</b> ${h(w.emoji)} ${h(w.name)} <span class="fine">${h(o.buyerName)} · ${time(o.ts)}</span></li>`)).join('')}</ul>` : '<p class="empty">No wishes yet.</p>'}</section>`
          : '';
    return `<section class="gi-banner">
        <div class="gi-banner-art"><span class="gi-feat">${h(t ? t.name : 'The Slammer')}</span><span class="gi-sub">Featured party</span></div>
        <div class="gi-banner-info">
          <div class="gi-tag">Event Wish</div>
          <h2>Ballad in Shot Glasses</h2>
          <p>Wish for your party with ${h(curAct().currency.name)}. Probability boosted for 5★ prizes!</p>
          <p class="gi-pity">${FATE} Guaranteed 5★ within <b>${left}</b> wish${left === 1 ? '' : 'es'}.</p>
          ${blocked ? `<p class="gi-warn">${h(blocked)}</p>` : ''}
        </div>
      </section>
      <div class="gi-wishbar">
        <div class="row"><button class="btn ghost sm" data-act="wish-panel" data-panel="details">Details</button><button class="btn ghost sm" data-act="wish-panel" data-panel="history">History</button></div>
        <div class="gi-wishes">${wishBtn(1)}${wishBtn(10)}</div>
      </div>
      ${panel}`;
  }

  // The game's wish animation: a shooting star in the best rarity's colour, then the results.
  function wishReveal(warps, by) {
    document.querySelectorAll('.wish-fx').forEach((x) => x.remove());
    const best = Math.max(...warps.map((w) => w.stars));
    const el = document.createElement('div');
    el.className = `wish-fx r${best}`;
    el.setAttribute('role', 'status');
    const card = (w) => `<div class="wish-card r${w.stars}"><span class="wc-e">${h(w.emoji)}</span><b>${h(w.name)}</b><span class="wc-s">${'★'.repeat(w.stars)}</span>${warps.length === 1 ? `<small>${h(w.text)}</small>` : ''}</div>`;
    el.innerHTML = `<div class="meteor"></div><div class="wish-res ${warps.length > 1 ? 'ten' : 'one'}">${warps.map(card).join('')}</div><div class="wish-by">${by ? `${h(by)} wished · ` : ''}tap to close</div>`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    el.addEventListener('click', close);
    document.body.append(el);
    setTimeout(close, warps.length > 1 ? 9000 : 6000);
  }

  // Every phone gets the same briefing when a game goes live (or its rules change).
  const liveGame = () => S.games.find((g) => g.status === 'live') || null;
  const briefKey = (g) => `${g.id}:${g.rulesVersion || 1}`;
  const seenBriefs = new Set((LS.get('sss_brief') || '').split(',').filter(Boolean));
  const briefingUnseen = () => {
    const g = liveGame();
    return !!g && !seenBriefs.has(briefKey(g));
  };
  function markBriefSeen() {
    const g = liveGame();
    if (!g) return;
    seenBriefs.add(briefKey(g));
    LS.set('sss_brief', [...seenBriefs].slice(-40).join(','));
  }

  // A new act gets its own briefing on every phone.
  const actUnseen = () => S && LS.get('sss_act') !== actId() && kind === 'player';
  function actModal() {
    const a = curAct();
    return `<div class="sheet-bg"></div>
      <div class="sheet briefing act-brief ${enter(`act:${a.id}`)}" role="dialog" aria-label="New act">
        <div class="eyebrow">🎬 Act ${a.numeral} · ${h(a.game)}</div>
        <h2>${a.emoji} ${h(a.name)}</h2>
        <p class="tagline">${h(a.tagline)}</p>
        <ul class="act-rules">${a.rules.map((r) => `<li>${h(r)}</li>`).join('')}</ul>
        <p class="fine">Money is now ${h(a.currency.name)}${a.currency.symbol ? ` (${h(a.currency.symbol)})` : ''}. Same balance, new name.</p>
        <button class="btn big" data-act="act-ok">Let’s go</button>
      </div>`;
  }

  // TFT act: the block picks one augment from three.
  function augmentCard() {
    if (actId() !== 'tft' || S.me.status !== 'block') return '';
    const t = team(S.me.teamId);
    if (!t) return '';
    if (t.augment) return '';
    if (!t.augmentOffer?.length) return '';
    const hasCaptain = blockmates(t.id).some((p) => p.isCaptain);
    const canPick = !hasCaptain || S.me.isCaptain;
    return `<section class="card augments">
      <div class="eyebrow">♟️ Pick your block's augment</div>
      <div class="aug-list">${t.augmentOffer
        .map((k) => {
          const a = S.augments[k];
          return `<button class="aug" data-act="augment" data-augment-id="${k}" ${canPick ? '' : 'disabled'} ${canPick ? `data-confirm="Lock in ${h(a.name)} for ${h(t.name)}? You can’t change it."` : ''}><span class="mega">${a.emoji}</span><b>${h(a.name)}</b><span class="fine">${h(a.desc)}</span></button>`;
        })
        .join('')}</div>
      <p class="fine">${canPick ? 'One pick for the whole block, and it lasts the act.' : 'Your Shot Caller 👑 makes the pick. Lobby them.'}</p>
    </section>`;
  }

  function needsMafiaAction() {
    const m = S.mafia;
    const me = S.me;
    if (briefingUnseen() || me.dealerDrinks) return true;
    if (me.status === 'solitary') return false;
    if (m.phase === 'vote') return me.status === 'block' && !m.myVote;
    if (m.phase === 'night') return !m.myNight;
    return false;
  }

  const myIncoming = () => (S.orders || []).filter(isIncomingFor(S));

  function phaseBanner() {
    const m = S.mafia;
    if (m.phase === 'night') return `<div class="phase night">🌙 LIGHTS OUT — Night ${m.round}${kind === 'player' ? ' · everyone pick a name on your Rap Sheet' : ''}</div>`;
    if (m.phase === 'vote') return `<div class="phase vote">${actId() === 'amongus' ? '🚨 EMERGENCY MEETING' : '🗳️ BLOCK VOTES OPEN'} · ${plural(m.votesCast, 'vote')} cast</div>`;
    if (m.phase === 'over') return `<div class="phase over">${m.winner === 'snitches' ? '🐀 Snitches got away with it!' : '🎉 Every snitch was caught!'}</div>`;
    return '';
  }

  function announcement() {
    if (!S.announcement) return '';
    return `<div class="announce"><span class="mega">📣</span><div><div class="announce-t">${h(S.announcement.text)}</div><div class="fine">from ${h(S.announcement.byName || 'the Warden')} · ${time(S.announcement.ts)}</div></div></div>`;
  }

  // A surviving snitch's payout: hand out penalty drinks to anyone.
  function dealerCard() {
    const me = S.me;
    if (!me.dealerDrinks) return '';
    const targets = S.players.filter((p) => p.id !== me.id);
    return `<div class="dealercard">
      ${me.role === 'snitch' && me.revealed ? `<div class="drink-n">🐀 You got away with it!</div>
      <p>Hand out <b>${plural(me.dealerDrinks, 'drink')}</b> to anyone you like.${S.settings.snitchPrize ? ` Plus: <b>${h(S.settings.snitchPrize)}</b>` : ''}</p>` : `<div class="drink-n">🥃 Drinks to hand out</div>
      <p>You’ve got <b>${plural(me.dealerDrinks, 'drink')}</b> to give to anyone you like.</p>`}
      <div class="targets">${targets.map((p) => `<button class="target" data-act="dealDrink" data-target-id="${p.id}">🥃 ${h(p.name)}${p.drinksOwed ? ` <small>(${p.drinksOwed})</small>` : ''}</button>`).join('')}</div>
    </div>`;
  }

  function drinkCard() {
    const me = S.me;
    if (!me.drinksOwed || ui.tab === 'yard') return '';
    return `<div class="drinkcard">
      <div><div class="drink-n">🍺 ×${me.drinksOwed}</div><div class="fine">${plural(me.drinksOwed, 'penalty drink')} owed. ${h(S.settings.houseRules)}</div></div>
      <button class="btn" data-act="drank">Drank one ✅</button>
    </div>`;
  }

  function incomingAlerts() {
    const list = myIncoming();
    if (!list.length) return '';
    const deflects = team(S.me.teamId)?.inventory?.deflect || 0;
    return list
      .map(
        (o) => `
        <div class="incoming">
          <div class="incoming-h">⚠️ INCOMING PUNISHMENT</div>
          <div class="incoming-b"><span class="mega">${h(o.emoji)}</span><div><b>${h(o.name)}</b> from ${chip(team(o.fromTeamId))}${o.bounces ? ` <span class="chip yellow">bounced ×${o.bounces}</span>` : ''}
            ${o.drain || o.drinks ? `<div class="fine">${[o.drain && `Costs your block ${o.drain} credits`, o.drinks && `${plural(o.drinks, 'penalty drink')} each`].filter(Boolean).join(' · ')}</div>` : ''}${o.note ? `<div class="note">“${h(o.note)}”</div>` : ''}</div></div>
          <div class="row">
            <button class="btn ghost" data-act="respond" data-order-id="${o.id}" data-choice="accept">Take it 😤</button>
            <button class="btn" data-act="respond" data-order-id="${o.id}" data-choice="deflect" ${deflects ? '' : 'disabled'}>🔄 Deflect (${deflects})</button>
          </div>
        </div>`,
      )
      .join('');
  }

  function feedList(limit = 40) {
    if (!S.feed.length) return '<p class="empty">Quiet in the yard… for now.</p>';
    return `<ul class="feed">${S.feed
      .slice(0, limit)
      .map((f) => `<li class="k-${h(f.kind)}"><span class="f-e">${h(f.emoji)}</span><span class="f-t">${h(f.text)}</span><span class="f-ts">${time(f.ts)}</span></li>`)
      .join('')}</ul>`;
  }

  // Standing + per-game rules for whoever is in holding / solitary.
  function lockupRules(status, live) {
    const st = S.settings;
    if (status === 'holding') {
      return `<section class="card lockup holding">
        <div class="eyebrow">🕳️ You’re in the Holding Cell</div>
        <p><b>${h(st.holdingRules)}</b></p>
        ${live?.holdingRule ? `<p class="rule">This game: ${h(live.holdingRule)}</p>` : ''}
        <p class="fine">Get out by getting bailed 🔑 by a block (they buy it at the commissary) or by impressing the hosts. ${st.holdingDrinks ? `+${plural(st.holdingDrinks, 'drink')} every round you’re in here.` : ''}</p>
      </section>`;
    }
    if (status === 'solitary') {
      const s = S.me.solitary;
      return `<section class="card lockup solitary">
        <div class="eyebrow">🔒 Solitary confinement · ${plural(s.rounds, 'round')} left</div>
        <p class="fine">Sentenced for ${h(s.reason)}.</p>
        <p><b>${h(st.solitaryRules)}</b></p>
        ${live?.solitaryRule ? `<p class="rule">This game: ${h(live.solitaryRule)}</p>` : ''}
        <p class="fine">${st.solitaryDrinks ? `+${plural(st.solitaryDrinks, 'drink')} every round. ` : ''}When you’re out you go back to ${S.me.teamId ? h(teamName(S.me.teamId)) : 'the Holding Cell'}.</p>
      </section>`;
    }
    return '';
  }

  function liveGameCard(live) {
    return `<section class="card live"><div class="eyebrow">🏁 Now in the yard</div><h2>${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}
      ${live.rules ? `<div class="rules">${h(live.rules)}</div>` : ''}
      ${live.holdingRule ? `<p class="rule">🕳️ Holding Cell: ${h(live.holdingRule)}</p>` : ''}
      ${live.solitaryRule ? `<p class="rule">🔒 Solitary: ${h(live.solitaryRule)}</p>` : ''}
      ${heatList(live)}</section>`;
  }

  function heatList(g) {
    if (!(g.heats || []).length) return '';
    const tag = { live: 'NOW', done: 'DONE', upcoming: 'UP NEXT', skipped: 'SKIPPED' };
    return `<ol class="heats">${g.heats
      .map((x, i) => `<li class="h-${x.status}"><span>Heat ${i + 1}: ${x.teamIds.map((id) => chip(team(id), id === S.me?.teamId ? 'mine' : '')).join(' vs ')}</span><span class="tag">${tag[x.status]}</span>${x.results && Object.keys(x.results).length ? `<div class="fine">${Object.entries(x.results).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ')}</div>` : ''}</li>`)
      .join('')}</ol>`;
  }

  // Everything this inmate owes or has to act on, in one list.
  const goItem = (emoji, title, sub, tab) =>
    `<li class="todo"><span class="mega">${emoji}</span><div><b>${h(title)}</b>${sub ? `<div class="fine">${h(sub)}</div>` : ''}</div>${tab ? `<button class="btn ghost sm" data-act="tab" data-tab="${tab}">Go →</button>` : ''}</li>`;

  function todoItems() {
    const me = S.me;
    const m = S.mafia;
    const items = [];
    if (me.drinksOwed) {
      items.push(`<li class="todo drink"><span class="mega">🍺</span><div><b>${plural(me.drinksOwed, 'penalty drink')}</b><div class="fine">${h(S.settings.houseRules)}</div></div><button class="btn sm" data-act="drank">Drank one ✅</button></li>`);
    }
    for (const x of (me.sentences || []).filter((y) => y.status === 'open')) {
      items.push(`<li class="todo sentence"><span class="mega">⚖️</span><div><b>${h(x.text)}</b><div class="fine">from ${h(x.from)}${x.reason ? ` · ${h(x.reason)}` : ''} · ${time(x.ts)}</div></div><button class="btn sm" data-act="sentence-done" data-sentence-id="${x.id}">Done ✅</button></li>`);
    }
    for (const o of myIncoming()) items.push(goItem('⚠️', `${o.name} incoming from ${teamName(o.fromTeamId)}`, 'Take it or deflect it in the alert at the top.'));
    if (me.dealerDrinks) items.push(goItem('🥃', `Hand out ${plural(me.dealerDrinks, 'drink')}`, 'Pick who drinks at the top of the screen.'));
    if (m.phase === 'night' && me.status !== 'solitary' && !m.myNight) items.push(goItem('🌙', 'Lights Out: pick a name', 'Everyone picks, so nobody can tell who the snitch is.', 'rap'));
    if (m.phase === 'vote' && me.status === 'block' && !m.myVote) items.push(goItem('🗳️', 'Vote in your block vote', 'Majority kicks someone off the block.', 'rap'));
    const reqs = actionableRequests();
    if (reqs.length) items.push(goItem('🛒', `${plural(reqs.length, 'purchase request')} waiting on you`, reqs.map((r) => `${r.emoji} ${r.name} (${r.byName})`).join(', '), 'cell'));
    return items;
  }

  function todoCard() {
    const items = todoItems();
    const done = (S.me.sentences || []).filter((x) => x.status === 'done').slice(0, 3);
    if (actId() === 'amongus') return taskList(items);
    return `<section class="card todo-card">
      <h3>📌 Your to-do</h3>
      ${items.length ? `<ul class="todos">${items.join('')}</ul>` : '<p class="empty">Nothing owed, nothing pending. Enjoy it while it lasts.</p>'}
      ${done.length ? `<p class="fine">Done: ${done.map((x) => h(x.text)).join(' · ')}${S.me.drinksDone ? ` · ${plural(S.me.drinksDone, 'drink')} served` : ''}</p>` : ''}
    </section>`;
  }

  // Among Us act: the to-do list becomes the crewmate task list, with the total-tasks bar.
  function taskList(items) {
    const me = S.me;
    const done = (me.sentences || []).filter((x) => x.status === 'done').length + (me.drinksDone || 0);
    const total = done + (me.sentences || []).filter((x) => x.status === 'open').length + (me.drinksOwed || 0);
    const pct = total ? Math.round((done / total) * 100) : 100;
    return `<section class="card todo-card task-list">
      <div class="task-bar"><b>TOTAL TASKS COMPLETED</b><i style="width:${pct}%"></i></div>
      <h3>Tasks</h3>
      ${items.length ? `<ul class="todos">${items.join('')}</ul>` : '<p class="empty">All tasks done. Act natural.</p>'}
    </section>`;
  }

  function yardTab() {
    const live = S.games.find((g) => g.status === 'live');
    return `
      ${augmentCard()}
      ${todoCard()}
      ${lockupRules(S.me.status, live)}
      ${matchCard()}
      ${live ? liveGameCard(live) : ''}
      ${S.games.length ? `
        <section class="card">
          <h3>Tonight's Schedule</h3>
          <ol class="schedule">
            ${S.games.map((g) => `<li class="g-${g.status}"><span>${h(g.name)}</span><span class="tag">${g.status === 'live' ? 'LIVE' : g.status === 'done' ? 'DONE' : 'UP NEXT'}</span>${g.results ? `<div class="fine">${Object.entries(g.results).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ')}</div>` : ''}</li>`).join('')}
          </ol>
        </section>` : ''}
      <section class="card">
        <h3>Yard Gossip</h3>
        ${feedList()}
      </section>`;
  }

  function shopTab() {
    const me = S.me;
    const myTeam = team(me.teamId);
    const blocked =
      me.status === 'solitary'
        ? 'No commissary privileges in solitary. Window shop and weep.'
        : !myTeam
          ? 'Holding Cell inmates don’t get a commissary account. Get a block to bail you out 🔑'
          : S.settings.spendMode === 'captain' && !me.isCaptain
            ? 'Only your Shot Caller 👑 can spend tonight. Lobby them.'
            : '';
    // This act's specials go first, then the regular shelf by type.
    const a = curAct();
    const groups = [
      ['act', { label: `${a.emoji} ${a.name} specials` }, S.items.filter((i) => i.act === a.id)],
      ...Object.entries(S.itemTypes).map(([type, info]) => [type, info, S.items.filter((i) => i.type === type && !i.act)]),
    ].filter(([, , list]) => list.length);
    return `
      <section class="card shop-head">
        <div><div class="eyebrow">Commissary · ${h(curAct().name)}</div><h2>${myTeam ? h(money(myTeam.budget)) : 'No account'}</h2>${myTeam && actId() === 'genshin' ? `<p class="pity">✦ Pity ${myTeam.pity}/${S.settings.warpPity}: a 5★ is guaranteed within ${S.settings.warpPity - myTeam.pity} wish${S.settings.warpPity - myTeam.pity === 1 ? '' : 'es'}.</p>` : ''}${myTeam && actId() === 'tft' && myTeam.augment === 'hustler' ? '<p class="pity">🏷️ Hustler: 25% off everything.</p>' : ''}<p class="fine">${myTeam && willRequest() ? `Spending is a block decision: your picks go to your block, and need the Shot Caller 👑 or ${plural(S.settings.requestSeconds, 'blockmate')} to second them.` : 'Spending comes out of your whole block’s budget.'}</p></div>
        ${myTeam ? `<div class="inv-mini"><span title="Deflect cards">🔄 ${myTeam.inventory?.deflect || 0}</span><span title="Bribes">💵 ${myTeam.inventory?.immunity || 0}</span></div>` : ''}
      </section>
      ${blocked ? `<p class="warnbox">${h(blocked)}</p>` : ''}
      ${groups
        .map(
          ([, info, list]) => `
        <h3 class="section-h">${h(info.label)}</h3>
        <div class="items">
          ${list
            .map((it) => {
              const soldOut = it.stock !== null && it.stock <= 0;
              const broke = myTeam && myTeam.budget < priceOf(it);
              const disabled = blocked || soldOut || broke;
              const tier = it.type === 'warp' ? 5 : tierOf(it.price);
              return `<button class="item t-${h(it.type)} tier-${tier}" data-act="buy-open" data-item-id="${it.id}" ${disabled ? 'disabled' : ''}>
                <span class="item-e">${h(it.emoji)}</span>
                <span class="item-r" aria-label="${tier} star">${'★'.repeat(tier)}</span>
                <span class="item-n">${h(it.name)}</span>
                <span class="item-d">${h(it.desc)}</span>
                <span class="item-p">${soldOut ? 'SOLD OUT' : h(money(priceOf(it)))}${it.stock !== null && !soldOut ? ` · ${it.stock} left` : ''}${it.drinks ? ` · 🍺×${it.drinks}` : ''}</span>
              </button>`;
            })
            .join('')}
        </div>`,
        )
        .join('')}`;
  }

  function buySheet() {
    const it = S.items.find((i) => i.id === ui.sheet.itemId);
    if (!it) return '';
    const target = S.itemTypes[it.type].target;
    const myTeam = team(S.me.teamId);
    const holding = inHolding();
    let picker = '';
    let ready = true;
    if (target === 'team') {
      const options = S.teams.filter((t) => t.id !== S.me.teamId).map((t) => ({ id: t.id, name: t.name, color: t.color }));
      if (holding.length) options.push({ id: HOLDING, name: `🕳️ Holding Cell (${holding.length})`, color: '#888888' });
      picker = `<label>Target</label><div class="targets">${options.map((t) => `<button class="target ${ui.sheet.targetTeamId === t.id ? 'on' : ''}" style="--c:${h(t.color)}" data-act="pick-target" data-team-id="${t.id}">${h(t.name)}</button>`).join('') || '<p class="fine">No one to target.</p>'}</div>
        ${ui.sheet.targetTeamId === HOLDING && it.type === 'punishment' ? '<p class="fine">The Holding Cell can’t deflect. It lands immediately. 😈</p>' : ''}`;
      ready = !!ui.sheet.targetTeamId;
    }
    if (target === 'holdingPlayer') {
      picker = `<label>Who are you bailing out?</label><div class="targets">${holding.map((p) => `<button class="target ${ui.sheet.targetPlayerId === p.id ? 'on' : ''}" data-act="pick-player" data-player-id="${p.id}">${h(p.name)}</button>`).join('') || '<p class="fine">The Holding Cell is empty.</p>'}</div>
        <p class="fine">Blocks max out at ${S.settings.maxBlockSize} inmates.</p>`;
      ready = !!ui.sheet.targetPlayerId;
    }
    return `
      <div class="sheet-bg" data-act="sheet-close"></div>
      <div class="sheet ${enter(`buy:${it.id}`)}" role="dialog" aria-label="Buy ${h(it.name)}">
        <div class="sheet-h"><span class="mega">${h(it.emoji)}</span><div><h2>${h(it.name)}</h2><p class="fine">${h(it.desc)}</p></div></div>
        ${picker}
        ${['supply', 'gift', 'punishment'].includes(it.type) ? `
          <label for="buy_note">${it.type === 'punishment' ? 'Trash talk (optional)' : 'Note for the bartender (optional)'}</label>
          <input id="buy_note" maxlength="120" placeholder="${it.type === 'punishment' ? 'Enjoy, losers' : 'e.g. vodka soda, extra lime'}" />` : ''}
        <div class="row sheet-actions">
          <button class="btn ghost" data-act="sheet-close">Cancel</button>
          <button class="btn" data-act="buy-confirm" ${ready ? '' : 'disabled'}>${willRequest() ? 'Ask the block' : it.type === 'warp' ? 'Warp' : 'Buy'} for ${h(money(priceOf(it)))}</button>
        </div>
        ${willRequest() ? `<p class="fine center">Goes to your block. It goes through when the Shot Caller approves it or ${plural(secondsNeeded(myTeam, S.me.id), 'blockmate')} second it.</p>` : ''}
        <p class="fine center">${myTeam ? `${h(myTeam.name)} has ${h(money(myTeam.budget))}.` : ''}</p>
      </div>`;
  }

  const ORDER_STATUS = { incoming: 'awaiting response', pending: 'with the hosts', done: 'done', cancelled: 'cancelled' };

  function cellTab() {
    const me = S.me;
    if (me.status === 'holding') return holdingView();
    if (me.status === 'solitary' && !me.teamId) return `${lockupRules('solitary')}${holdingRoster()}`;
    const myTeam = team(me.teamId);
    const members = blockmates(myTeam.id);
    const inv = myTeam.inventory || {};
    const voteOpen = S.mafia.phase === 'vote';
    const immune = new Set(S.mafia.immune);
    return `
      ${me.status === 'solitary' ? lockupRules('solitary') : ''}
      ${actId() === 'genshin' ? partyLineup(myTeam) : ''}
      ${augmentCard()}
      <section class="card cell-head block-banner" style="--c:${h(myTeam.color)}">
        <div class="eyebrow">Your block · #${rankOf(myTeam.id)} of ${S.teams.length}</div>
        <h2>${h(myTeam.name)}${nick(myTeam)}</h2>
        ${myTeam.motto ? `<p class="motto">${h(myTeam.motto)}</p>` : ''}
        ${actId() === 'tft' && myTeam.augment ? `<p class="aug-chip">${S.augments[myTeam.augment].emoji} <b>${h(S.augments[myTeam.augment].name)}</b> · ${h(S.augments[myTeam.augment].desc)}</p>` : ''}
        <div class="stats"><div><b>${h(money(myTeam.budget))}</b><span>${h(curAct().currency.name)}</span></div><div><b>${myTeam.earned}</b><span>earned tonight</span></div><div><b>${members.length}/${S.settings.maxBlockSize}</b><span>inmates</span></div></div>
        ${renameControls(myTeam, members)}
      </section>
      ${matchCard()}
      ${requestsCard(myTeam)}
      <section class="card">
        <h3>Contraband stash</h3>
        <div class="stash">
          <div class="stash-i"><span class="mega">🔄</span><b>${inv.deflect || 0}</b><span>Snitch Slips<br/><small>bounce a punishment back</small></span></div>
          <div class="stash-i"><span class="mega">💵</span><b>${inv.immunity || 0}</b><span>Bribes<br/><small>block-vote immunity</small></span></div>
        </div>
        ${voteOpen && inv.immunity && me.status === 'block' ? `
          <p class="fine">Block vote is open — bribe a guard to protect someone on your block:</p>
          <div class="targets">${members.filter((p) => p.status === 'block').map((p) => `<button class="target" style="--c:${h(myTeam.color)}" data-act="immunity" data-target-id="${p.id}" ${immune.has(p.id) ? 'disabled' : ''}>${immune.has(p.id) ? '🛡️ ' : ''}${h(p.name)}</button>`).join('')}</div>` : ''}
        ${(myTeam.ledger || []).length ? `<h3 class="section-h">🧾 Account activity</h3><ul class="roster ledger">${myTeam.ledger.map((l) => `<li><span class="${l.amount < 0 ? 'red-t' : 'green-t'}">${l.amount > 0 ? '+' : ''}${l.amount}</span> ${h(l.text)} <span class="fine">${time(l.ts)}</span></li>`).join('')}</ul><p class="fine">Unexplained withdrawals happen when a snitch pulls off a sabotage. Who finished a “task” right before it?</p>` : ''}
        ${(myTeam.intel || []).length ? `<h3 class="section-h">📡 Wiretap results</h3><ul class="roster">${myTeam.intel.map((i) => `<li>${time(i.ts)} — ${i.hasSnitch ? '<b class="red-t">🐀 There IS a snitch on this block.</b>' : '✅ No snitch on this block (at the time).'} <span class="fine">bought by ${h(i.by)}</span></li>`).join('')}</ul>` : ''}
      </section>
      <section class="card">
        <h3>Blockmates</h3>
        <ul class="roster">${members.map((p) => `<li>${p.isCaptain ? '👑' : '🧡'} ${h(p.name)} <span class="fine">#${h(p.inmateNo)}</span>${p.status === 'solitary' ? ' <span class="chip red">solitary</span>' : ''}${immune.has(p.id) ? ' 🛡️' : ''}${p.drinksOwed ? ` <span class="fine">🍺×${p.drinksOwed}</span>` : ''}</li>`).join('')}</ul>
      </section>
      ${holdingRoster(true)}
      <section class="card">
        <h3>Block orders</h3>
        ${S.orders.length ? `<ul class="orders">${S.orders
          .map((o) => {
            const dir = o.type === 'bail' ? `bailed ${h(o.targetPlayerName)}` : o.type === 'supply' ? 'for us' : o.targetTeamId === me.teamId ? `from ${h(teamName(o.fromTeamId))}` : `→ ${h(teamName(o.targetTeamId))}`;
            return `<li class="s-${o.status}"><span>${h(o.emoji)} <b>${h(o.name)}</b> <span class="fine">${dir}${o.originalFromTeamId === me.teamId ? ` · by ${h(o.buyerName)}` : ''}</span></span><span class="tag">${ORDER_STATUS[o.status] || o.status}</span></li>`;
          })
          .join('')}</ul>` : '<p class="empty">Nothing ordered yet. Hit the commissary.</p>'}
      </section>`;
  }

  function renameControls(t, members) {
    const me = S.me;
    const allowed = me.status === 'block' && (me.isCaptain || !members.some((p) => p.isCaptain));
    if (!allowed) return '';
    if (!ui.renaming) return `<button class="btn ghost sm" data-act="rename-open">🏷️ ${t.nickname ? 'Rename the block' : 'Name your block'}</button>`;
    return `<form data-form="rename" class="grid2 rename">
      <label>Block nickname<input id="rn_nick" name="nickname" maxlength="32" value="${h(t.nickname)}" placeholder="The Shawshank Redeemers" /></label>
      <label>Motto<input id="rn_motto" name="motto" maxlength="80" value="${h(t.motto)}" placeholder="Get busy drinking" /></label>
      <div class="row span2"><button type="button" class="btn ghost sm" data-act="rename-close">Cancel</button><button class="btn sm">Save</button></div>
    </form>`;
  }

  function holdingRoster(forBlock = false) {
    const list = inHolding();
    if (forBlock && !list.length) return '';
    return `<section class="card">
      <h3>🕳️ Holding Cell (${list.length})</h3>
      ${list.length ? `<ul class="roster">${list.map((p) => `<li>${h(p.name)} <span class="fine">#${h(p.inmateNo)}${p.role ? ` · was ${h(roleOf(p.role)?.name)}` : ''}</span>${p.drinksOwed ? ` <span class="fine">🍺×${p.drinksOwed}</span>` : ''}</li>`).join('')}</ul>` : '<p class="empty">Empty.</p>'}
      ${forBlock ? '<p class="fine">Room on your block? Buy a 🔑 Bail Bond to recruit one of them. Or punish them. They can’t deflect. 😈</p>' : ''}
    </section>`;
  }

  function holdingView() {
    return `
      ${lockupRules('holding', S.games.find((g) => g.status === 'live'))}
      ${holdingRoster()}
      <section class="card">
        <h3>The blocks</h3>
        ${S.teams.map((t) => `<div class="roster-team"><div>${chip(t)} <span class="fine">${blockmates(t.id).length}/${S.settings.maxBlockSize}</span></div><div class="fine">${blockmates(t.id).map((p) => h(p.name)).join(', ') || 'empty'}</div></div>`).join('') || '<p class="empty">No blocks yet.</p>'}
        <p class="fine">Blocks with room can bail you out. Make your case. Bribes in the form of compliments are encouraged.</p>
      </section>`;
  }

  function rapTab() {
    const me = S.me;
    const role = roleOf(me.role);
    const m = S.mafia;
    return `
      <section class="mugshot">
        <div class="mug-lines"></div>
        <div class="mug-card">
          <div class="mug-dept">${h(S.settings.partyName)} · Dept. of Corrections</div>
          <div class="mug-no">#${h(me.inmateNo)}</div>
          <div class="mug-name">${h(me.name)}</div>
          <div class="mug-charge">CHARGE: ${h(me.charge)}</div>
          <div class="mug-team">${statusChip(me)}</div>
          ${me.drinksDone ? `<div class="mug-dept">Penalty drinks served: ${me.drinksDone}</div>` : ''}
        </div>
      </section>
      ${m.phase !== 'off' ? `
        <section class="card role-card ${ui.reveal ? 'shown' : ''}" data-act="reveal">
          ${ui.reveal
            ? `<div class="mega">${role.emoji}</div><h2>${h(role.name)}</h2><p>${h(role.blurb)}</p>${me.role === 'snitch' ? `<p class="fine">Sabotages pulled off: <b>${me.dirt}</b> · credits skimmed: <b>${me.skimmed}</b>. Survive the reveal to cash in ${plural(S.settings.snitchRewardDrinks + me.dirt * S.settings.drinksPerSabotage, 'drink')}.</p>` : ''}${me.revealed ? '<p class="fine">You’ve been exposed. Your powers are gone.</p>' : ''}<p class="fine">Tap to hide</p>`
            : `<div class="mega">🗂️</div><h2>Secret role</h2><p class="fine">Tap to reveal. Shield your screen!</p>`}
        </section>` : ''}
      ${briefingCard()}
      ${mafiaPanel()}`;
  }

  // Every briefing has the same "Classified" box. It's empty for inmates and holds the sabotage
  // for a snitch, so a glance at someone's phone gives nothing away.
  function classifiedBox() {
    const t = S.me.task;
    if (!ui.revealTask) return `<div class="classified" data-act="reveal-task">🗂️ <b>Classified</b> <span class="fine">Tap to open. Shield your screen!</span></div>`;
    if (!t) {
      return `<div class="classified open" data-act="reveal-task">🗂️ <b>Classified</b>
        <p class="task-text">No orders for you this round. Play it straight — and keep an eye on your blockmates.</p>
        <p class="fine">Tap to close.</p></div>`;
    }
    const active = t.status === 'active';
    const label = {
      claimed: '⏳ Claimed — waiting for the Warden or the Commissary Officer to sign off',
      done: '✅ The hosts signed off',
      skipped: 'Skipped',
      expired: 'Expired',
      revoked: '❌ Voided by the hosts',
    }[t.status];
    return `<div class="classified open">
      <div data-act="reveal-task">🗂️ <b>Classified</b> <span class="fine">· ${h(t.gameName)}</span></div>
      <p class="task-text" data-act="reveal-task">${h(t.text)}</p>
      ${active
        ? `<div class="row"><button class="btn ghost sm" data-act="task" data-result="skip">Skip</button>${t.rerolled ? '' : '<button class="btn ghost sm" data-act="reroll">🎲 Reroll</button>'}<button class="btn sm" data-act="task" data-result="done">Done ✅</button></div>
           <p class="fine">${t.rejected ? '❌ The hosts didn’t buy it last time. ' : ''}Pull it off without anyone noticing, then tap Done. A host has to sign off before it counts. Tap the orders to close.</p>`
        : `<p class="fine">${label}. Tap the orders to close.</p>`}
    </div>`;
  }

  function briefingBody(g) {
    return `<h2>${h(g.name)}</h2>${g.desc ? `<p>${h(g.desc)}</p>` : ''}
      ${g.rules ? `<div class="rules">${h(g.rules)}</div>` : '<p class="fine">No written rules — the hosts will explain.</p>'}
      ${g.holdingRule ? `<p class="rule">🕳️ Holding Cell: ${h(g.holdingRule)}</p>` : ''}
      ${g.solitaryRule ? `<p class="rule">🔒 Solitary: ${h(g.solitaryRule)}</p>` : ''}
      ${S.me.status !== 'block' ? lockupReminder() : ''}
      ${classifiedBox()}`;
  }

  function lockupReminder() {
    const st = S.settings;
    return S.me.status === 'holding'
      ? `<p class="fine">You’re in the Holding Cell: ${h(st.holdingRules)}</p>`
      : `<p class="fine">You’re in Solitary: ${h(st.solitaryRules)}</p>`;
  }

  function briefingModal() {
    const g = liveGame();
    return `<div class="sheet-bg"></div>
      <div class="sheet briefing ${enter(`brief:${briefKey(g)}`)}" role="dialog" aria-label="Game briefing">
        <div class="eyebrow">📋 New briefing from the hosts</div>
        ${briefingBody(g)}
        <button class="btn big" data-act="brief-ok">Got it ✅</button>
      </div>`;
  }

  // Same card on every Rap Sheet, live game or not.
  function briefingCard() {
    const g = liveGame();
    if (g) return `<section class="card brief-card"><div class="eyebrow">📋 Briefing · now in the yard</div>${briefingBody(g)}</section>`;
    const next = S.games.find((x) => x.status === 'upcoming');
    return `<section class="card brief-card"><div class="eyebrow">📋 Briefing</div><p class="fine">No game running.${next ? ` Up next: <b>${h(next.name)}</b>.` : ''}</p>${classifiedBox()}</section>`;
  }

  function mafiaPanel() {
    const m = S.mafia;
    const me = S.me;
    if (m.phase === 'off') return '<section class="card"><h3>🐀 The Snitch Game</h3><p class="fine">Snitches haven’t been planted yet. When they are, half the blocks (maybe) get one. Your role shows up here.</p></section>';
    if (m.phase === 'over') return `<section class="card center"><div class="mega">${m.winner === 'snitches' ? '🐀' : '🎉'}</div><h2>${m.winner === 'snitches' ? 'Snitches got away with it' : 'Every snitch was caught'}</h2>${m.lastResult ? `<p>${h(m.lastResult.text)}</p>` : ''}</section>`;
    if (me.status === 'solitary') return `<section class="card center"><div class="mega">🔒</div><h2>Lights are always out in solitary</h2><p class="fine">No votes, no night moves. Sit tight.</p></section>`;

    if (m.phase === 'night') {
      const isSnitch = me.role === 'snitch' && !me.revealed;
      const targets = S.players.filter((p) => p.id !== me.id && p.status !== 'solitary');
      return `<section class="card night-card">
        <h3>${isSnitch ? '🐀 Who are you tipping off to the guards?' : '🗣️ Who do you suspect? (anonymous)'}</h3>
        ${groupedTargets(targets, (p) => `<button class="target ${m.myNight === p.id ? 'on' : ''}" data-act="night" data-target-id="${p.id}">${h(p.name)}</button>`)}
        <p class="fine">${isSnitch ? `Your target gets ${plural(S.settings.tipRounds, 'round')} in solitary at Lights On. Nobody will know it was you.` : 'Everyone picks a name so the snitches can’t be spotted by who’s on their phone. Top suspects get whispered in the feed.'} You can change your pick until Lights On.</p>
      </section>`;
    }

    if (m.phase === 'vote') {
      if (me.status !== 'block') return '<section class="card center"><div class="mega">🗳️</div><h2>Block votes are on</h2><p class="fine">Only inmates on a block vote. Enjoy the drama from the Holding Cell.</p></section>';
      const tally = m.tallies?.[me.teamId] || {};
      const mates = blockmates(me.teamId).filter((p) => p.status === 'block');
      const max = Math.max(1, ...Object.values(tally));
      const immune = new Set(m.immune);
      return `<section class="card">
        <h3>🗳️ ${h(teamName(me.teamId))} vote: kick someone out?</h3>
        <div class="votes">${mates
          .map((p) => `<button class="vote ${m.myVote === p.id ? 'on' : ''}" data-act="vote" data-target-id="${p.id}" ${p.id === me.id ? 'disabled' : ''}>
            <span class="bar" style="width:${((tally[p.id] || 0) / max) * 100}%"></span>
            <span class="v-n">${actId() === 'amongus' ? crewIcon(p) : ''}${h(p.name)}${p.id === me.id ? ' (you)' : ''} ${immune.has(p.id) ? '🛡️' : ''}</span><span class="v-c">${tally[p.id] || 0}</span></button>`)
          .join('')}
          <button class="vote skip ${m.myVote === 'skip' ? 'on' : ''}" data-act="vote" data-target-id="skip"><span class="bar" style="width:${((tally.skip || 0) / max) * 100}%"></span><span class="v-n">Keep everyone</span><span class="v-c">${tally.skip || 0}</span></button>
        </div>
        <p class="fine">Needs a majority of the block. Catch the ${actId() === 'amongus' ? 'Impostor' : 'snitch'}: +${S.settings.snitchBounty * (actId() === 'amongus' ? 2 : 1)} credits and they go to solitary. Kick an innocent: −${S.settings.wrongfulPenalty} credits and they go to the Holding Cell. 🛡️ = bribed.</p>
      </section>`;
    }
    return `<section class="card"><h3>☀️ Daytime in the yard</h3>${m.lastResult ? `<p>${h(m.lastResult.text)}</p>` : ''}${m.lastResult?.whispers?.length ? `<p class="fine">Most suspected: ${h(m.lastResult.whispers.join(', '))}</p>` : ''}<p class="fine">Watch your blockmates. Who’s acting shifty? The hosts will call the next Lights Out or Block Vote.</p></section>`;
  }

  function standings() {
    return [...S.teams].sort((a, b) => b.earned - a.earned || b.budget - a.budget);
  }

  function drinkTab(limit = 50) {
    const owing = S.players.filter((p) => p.drinksOwed > 0).sort((a, b) => b.drinksOwed - a.drinksOwed).slice(0, limit);
    return owing.length ? `<ul class="roster">${owing.map((p) => `<li>${h(p.name)} <span class="fine">${statusChip(p)}</span> <b class="drink-owed">🍺×${p.drinksOwed}</b></li>`).join('')}</ul>` : '<p class="empty">Everyone’s paid up. For now.</p>';
  }

  // TFT act: a block's augment and streak, shown next to its name.
  const streakBits = (t) =>
    actId() !== 'tft' ? [] : [t.augment && S.augments[t.augment].emoji, t.streak > 1 ? `🔥${t.streak}` : t.streak < -1 ? `💧${-t.streak}` : ''].filter(Boolean);
  const streakTag = (t) => streakBits(t).map((x) => ` · ${x}`).join('');

  function boardTab() {
    const rows = standings();
    const adventurers = actId() === 'genshin' ? [...S.players].sort((a, b) => (b.adventureExp || 0) - (a.adventureExp || 0)).slice(0, 10) : [];
    return `
      ${adventurers.length ? `<section class="card"><h3>Top Adventurers</h3><ol class="gi-ranks">${adventurers.map((p, i) => `<li class="${p.id === S.me?.id ? 'mine' : ''}"><span class="rank">${i + 1}</span>${avatar(p)}<span class="b-n">${h(p.name)}<small>${h(teamName(p.teamId))}</small></span><b>AR ${arOf(p)}</b></li>`).join('')}</ol></section>` : ''}
      <section class="card">
        <h3>🏆 Block Standings</h3>
        ${rows.length ? `<ol class="board">${rows
          .map((t, i) => `<li style="--c:${h(t.color)}" class="${t.id === S.me?.teamId ? 'mine' : ''}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}${nick(t)}<small>${t.motto ? `${h(t.motto)} · ` : ''}${plural(blockmates(t.id).length, 'inmate')}</small></span><span class="b-s"><b>${t.earned}</b><small>earned · ${h(money(t.budget))} left${streakTag(t)}</small></span></li>`)
          .join('')}</ol>` : '<p class="empty">No blocks yet.</p>'}
      </section>
      <section class="card">
        <h3>Roster</h3>
        ${S.teams.map((t) => `<div class="roster-team"><div>${chip(t)}</div><div class="fine">${blockmates(t.id).map((p) => `${p.isCaptain ? '👑' : ''}${h(p.name)}${p.status === 'solitary' ? ' 🔒' : ''}`).join(', ') || 'empty'}</div></div>`).join('')}
        <div class="roster-team"><div>${chip(null)}</div><div class="fine">${inHolding().map((p) => `${h(p.name)}${p.role ? ` (${h(roleOf(p.role)?.name)})` : ''}`).join(', ') || 'empty'}</div></div>
        ${inSolitary().length ? `<div class="roster-team"><div><span class="chip red">🔒 Solitary</span></div><div class="fine">${inSolitary().map((p) => `${h(p.name)} (${plural(p.solitary.rounds, 'round')})`).join(', ')}</div></div>` : ''}
      </section>
      <section class="card"><h3>🍺 Drink tab</h3>${drinkTab()}</section>`;
  }

  // ---------- admin ----------
  function adminPage() {
    const pending = S.orders.filter((o) => o.status === 'pending').length;
    const incoming = S.orders.filter((o) => o.status === 'incoming').length;
    const lockup = inHolding().length + inSolitary().length;
    const pendingClaims = S.claims.filter((c) => c.status === 'pending').length;
    const tabs = [
      ['orders', `🧾 Orders${pending + incoming ? ` <b class="badge">${pending + incoming}</b>` : ''}`],
      ['money', '💰 Payouts'],
      ['games', '🏁 Games'],
      ['blocks', '🔐 Blocks'],
      ['lockup', `⚖️ Punish / Lockup${lockup ? ` <b class="badge grey">${lockup}</b>` : ''}`],
      ['shop', '🛒 Commissary'],
      ['tasks', `🕵️ Sabotage${pendingClaims ? ` <b class="badge">${pendingClaims}</b>` : ''}`],
      ['mafia', '🐀 Snitches'],
      ['settings', '⚙️ Settings'],
    ];
    const body = { orders: aOrders, money: aMoney, games: aGames, blocks: aBlocks, lockup: aLockup, tasks: aTasks, shop: aShop, mafia: aMafia, settings: aSettings }[ui.atab] || aOrders;
    return `
      <header class="top admin-top">
        <div class="top-row">
          <div class="who"><div class="who-name">${S.hostRole === 'officer' ? '🧾 Commissary Office' : '🔑 Warden Control Room'}</div><div class="who-sub">${h(S.settings.partyName)} · ${plural(S.players.length, 'inmate')} · ${plural(S.teams.length, 'block')}</div></div>
          <div class="row"><a class="btn ghost sm" href="/tv" target="_blank">📺 TV</a><button class="btn ghost sm" data-act="logout">Log out</button></div>
        </div>
        ${actSwitcher()}
        <nav class="atabs">${tabs.map(([k, l]) => `<button data-act="atab" data-tab="${k}" class="${ui.atab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      </header>
      ${phaseBanner()}
      <main class="content admin">${body()}</main>`;
  }

  // Hosts flip the whole party from one act to the next.
  function actSwitcher() {
    const i = S.act;
    const a = S.acts[i];
    const nextA = S.acts[i + 1];
    return `<div class="act-switch">
      <div class="act-now"><span class="mega">${a.emoji}</span><div><div class="eyebrow">Act ${a.numeral} of ${S.acts.length} · ${h(a.game)}</div><b>${h(a.name)}</b></div></div>
      <div class="row">
        ${i > 0 ? btn('◀', 'setAct', { index: i - 1 }, 'ghost sm', `Go back to Act ${S.acts[i - 1].numeral}: ${S.acts[i - 1].name}?`) : ''}
        ${nextA ? btn(`Next: ${nextA.emoji} ${h(nextA.name)} ▶`, 'setAct', { index: i + 1 }, 'sm', `Start Act ${nextA.numeral}: ${nextA.name} (${nextA.game})? Every phone and the TV switch over now.`) : '<span class="fine">Final act</span>'}
      </div>
    </div>`;
  }

  const btn = (label, type, args = {}, cls = '', confirm = '') =>
    `<button type="button" class="btn ${cls}" data-act="admin" data-type="${type}" ${Object.entries(args).map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${h(v)}"`).join(' ')} ${confirm ? `data-confirm="${h(confirm)}"` : ''}>${label}</button>`;

  function orderRow(o) {
    const from = team(o.originalFromTeamId || o.fromTeamId);
    const route = o.type === 'supply' ? targetChip(o.targetTeamId) : o.type === 'bail' ? `${chip(from)} 🔑 ${h(o.targetPlayerName)}` : `${targetChip(o.fromTeamId)} → ${targetChip(o.targetTeamId)}`;
    return `<li class="order s-${o.status}">
      <div class="o-main"><span class="mega">${h(o.emoji)}</span><div><b>${h(o.name)}</b> <span class="fine">${o.price} cr · ${time(o.ts)}${o.bounces ? ` · bounced ×${o.bounces}` : ''}${o.drained ? ` · drained ${o.drained}` : ''}${o.drinks ? ` · 🍺×${o.drinks} each` : ''}</span>
        <div>${route}</div>
        <div class="fine">bought by ${h(o.buyerName)}${from && o.type !== 'supply' ? ` (${h(from.name)})` : ''}</div>
        ${o.note ? `<div class="note">“${h(o.note)}”</div>` : ''}</div></div>
      <div class="row">
        ${o.status === 'incoming' ? btn('Force it ⚖️', 'resolveOrder', { orderId: o.id, action: 'enforce' }, 'sm') : ''}
        ${o.status === 'pending' ? btn(o.type === 'punishment' ? 'Enforced ✅' : 'Delivered ✅', 'resolveOrder', { orderId: o.id, action: 'done' }, 'sm') : ''}
        ${['pending', 'incoming'].includes(o.status) ? btn('Refund', 'resolveOrder', { orderId: o.id, action: 'cancel' }, 'ghost sm', `Cancel ${o.name} and refund ${o.price} credits?`) : ''}
      </div>
    </li>`;
  }

  function aOrders() {
    const by = (st) => S.orders.filter((o) => o.status === st);
    const pending = by('pending');
    const incoming = by('incoming');
    const closed = S.orders.filter((o) => ['done', 'cancelled'].includes(o.status)).slice(0, 25);
    return `
      <section class="card"><h3>🍹 To deliver / enforce (${pending.length})</h3>${pending.length ? `<ul class="olist">${pending.map(orderRow).join('')}</ul>` : '<p class="empty">Queue is clear. Go get a drink.</p>'}</section>
      <section class="card"><h3>⏳ Punishments waiting on the target (${incoming.length})</h3><p class="fine">The target block can take it or play a deflect card. Force it if they’re stalling.</p>${incoming.length ? `<ul class="olist">${incoming.map(orderRow).join('')}</ul>` : '<p class="empty">None.</p>'}</section>
      <section class="card"><h3>Recent</h3>${closed.length ? `<ul class="olist compact">${closed.map(orderRow).join('')}</ul>` : '<p class="empty">Nothing yet.</p>'}</section>`;
  }

  function aMoney() {
    if (!S.teams.length) return '<section class="card"><p>Build blocks in the 🔐 Blocks tab first.</p></section>';
    return `
      <section class="card">
        <h3>Quick payouts</h3>
        <div class="money">${standings()
          .map((t) => `<div class="money-t" style="--c:${h(t.color)}">
            <div class="money-h"><b>${h(t.name)}</b><span><b>${t.budget}</b> cr · ${t.earned} earned</span></div>
            <div class="row wrap">${[1, 5, 10, 25].map((n) => btn(`+${n}`, 'adjustBudget', { teamId: t.id, amount: n }, 'sm')).join('')}${[-5, -10].map((n) => btn(`${n}`, 'adjustBudget', { teamId: t.id, amount: n }, 'ghost sm')).join('')}</div>
          </div>`)
          .join('')}</div>
      </section>
      <section class="card">
        <h3>Custom payout / fine</h3>
        <form data-admin="adjustBudget" class="grid2">
          <label>Block<select id="pay_team" name="teamId">${S.teams.map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join('')}</select></label>
          <label>Amount (negative = fine)<input id="pay_amt" name="amount" type="number" required placeholder="15" /></label>
          <label class="span2">Reason (shows in the feed)<input id="pay_reason" name="reason" maxlength="80" placeholder="winning flip cup" /></label>
          <button class="btn span2">Send it</button>
        </form>
      </section>`;
  }

  function aGames() {
    return `
      <section class="card">
        <h3>Add a game / round</h3>
        <form data-admin="addGame" class="grid2">
          <label>Name<input id="g_name" name="name" maxlength="60" required placeholder="Flip Cup Prison Riot" /></label>
          <label>Description<input id="g_desc" name="desc" maxlength="200" placeholder="Best of 3. Winner +30." /></label>
          <label class="span2">📋 How to play (shown on every phone when the game goes live)<textarea id="g_rules" name="rules" rows="5" maxlength="1200" placeholder="Each block lines up on one side of the table.&#10;Drink, then flip your cup from the edge.&#10;Next person goes when the cup lands upside down.&#10;First block to finish wins."></textarea></label>
          <label>🕳️ Extra rule for Holding Cell<input id="g_hold" name="holdingRule" maxlength="160" placeholder="Must flip with your off hand" /></label>
          <label>🔒 Extra rule for Solitary<input id="g_sol" name="solitaryRule" maxlength="160" placeholder="Drink a full cup every flip" /></label>
          <label class="span2">🐀 Snitch sabotage for this game (optional — blank = random from the list)<input id="g_sab" name="sabotage" maxlength="160" placeholder="Miss your first two flips" /></label>
          <button class="btn span2">Add to schedule</button>
        </form>
      </section>
      <section class="card">
        <h3>Schedule</h3>
        <p class="fine">Finishing a game pays out credits and counts as a round: Holding Cell and Solitary owe their penalty drinks, and solitary sentences tick down.</p>
        ${S.games.length ? `<ul class="glist">${S.games
          .map((g) => `<li class="g-${g.status}">
            <div class="g-h"><b>${h(g.name)}</b> <span class="tag">${g.status.toUpperCase()}</span></div>
            ${g.desc ? `<div class="fine">${h(g.desc)}</div>` : ''}
            ${g.rules ? `<div class="rules small">${h(g.rules)}</div>` : '<div class="fine">⚠️ No how-to-play rules yet.</div>'}
            ${g.holdingRule ? `<div class="fine">🕳️ ${h(g.holdingRule)}</div>` : ''}${g.solitaryRule ? `<div class="fine">🔒 ${h(g.solitaryRule)}</div>` : ''}${g.sabotage ? `<div class="fine">🐀 ${h(g.sabotage)}</div>` : ''}
            ${g.results ? `<div class="fine">Paid: ${Object.entries(g.results).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ') || 'nothing'}</div>` : ''}
            <div class="row wrap">
              ${g.status !== 'live' ? btn('▶ Go live', 'setGameStatus', { gameId: g.id, status: 'live' }, 'sm') : btn('⏸ Back to upcoming', 'setGameStatus', { gameId: g.id, status: 'upcoming' }, 'ghost sm')}
              ${g.status !== 'done' ? `<button class="btn sm" data-act="finish-open" data-game-id="${g.id}">🏆 Finish & pay out</button>` : btn('Reopen', 'setGameStatus', { gameId: g.id, status: 'upcoming' }, 'ghost sm')}
              ${btn('↑', 'moveGame', { gameId: g.id, dir: -1 }, 'ghost sm')}${btn('↓', 'moveGame', { gameId: g.id, dir: 1 }, 'ghost sm')}
              ${btn('🗑', 'removeGame', { gameId: g.id }, 'ghost sm', `Delete ${g.name}?`)}
            </div>
            ${ui.finishing === g.id ? finishForm(g) : ''}
            ${heatAdmin(g)}
            <details>
              <summary class="fine">✏️ Edit game & rules${g.status === 'live' ? ' (saving pops the new briefing up on every phone)' : ''}</summary>
              <form data-admin="updateGame" class="grid2">
                <input type="hidden" name="gameId" value="${g.id}" />
                <label>Name<input id="ge_${g.id}_name" name="name" value="${h(g.name)}" maxlength="60" /></label>
                <label>Description<input id="ge_${g.id}_desc" name="desc" value="${h(g.desc)}" maxlength="200" /></label>
                <label class="span2">📋 How to play<textarea id="ge_${g.id}_rules" name="rules" rows="5" maxlength="1200">${h(g.rules)}</textarea></label>
                <label>🕳️ Holding Cell rule<input id="ge_${g.id}_hold" name="holdingRule" value="${h(g.holdingRule)}" maxlength="160" /></label>
                <label>🔒 Solitary rule<input id="ge_${g.id}_sol" name="solitaryRule" value="${h(g.solitaryRule)}" maxlength="160" /></label>
                <label class="span2">🐀 Snitch sabotage (blank = random)<input id="ge_${g.id}_sab" name="sabotage" value="${h(g.sabotage)}" maxlength="160" /></label>
                <button class="btn sm span2">Save</button>
              </form>
            </details>
          </li>`)
          .join('')}</ul>` : '<p class="empty">No games yet.</p>'}
      </section>`;
  }

  function heatAdmin(g) {
    if (g.status === 'done' && !(g.heats || []).length) return '';
    const heats = g.heats || [];
    const tag = { live: 'NOW', done: 'DONE', upcoming: 'UP NEXT', skipped: 'SKIPPED' };
    return `<div class="heat-admin">
      <div class="fine"><b>🥊 Matchups</b> — run the game as heats so every block gets a turn. ${heats.length ? '' : 'Without heats, everyone plays at once.'}</div>
      ${g.status !== 'done' && !heats.some((x) => x.status !== 'upcoming') ? `<div class="row wrap">
        ${btn('Pairs', 'makeHeats', { gameId: g.id, size: 2 }, 'ghost sm')}${btn('Threes', 'makeHeats', { gameId: g.id, size: 3 }, 'ghost sm')}${btn('Fours', 'makeHeats', { gameId: g.id, size: 4 }, 'ghost sm')}${btn('All blocks, one heat', 'makeHeats', { gameId: g.id, size: 'all' }, 'ghost sm')}
        ${heats.length ? btn('Clear', 'clearHeats', { gameId: g.id }, 'ghost sm') : ''}
      </div>` : ''}
      ${heats.length ? `<ol class="heats admin-heats">${heats
        .map((x, i) => `<li class="h-${x.status}">
          <span>Heat ${i + 1}: ${x.teamIds.map((id) => chip(team(id))).join(' vs ')}</span> <span class="tag">${tag[x.status]}</span>
          ${x.results && Object.keys(x.results).length ? `<div class="fine">${Object.entries(x.results).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ')}</div>` : ''}
          <div class="row wrap">
            ${x.status === 'upcoming' ? btn('▶ Start heat', 'startHeat', { gameId: g.id, heatId: x.id }, 'sm') : ''}
            ${['live', 'upcoming'].includes(x.status) ? `<button class="btn sm ${x.status === 'live' ? '' : 'ghost'}" data-act="finish-open" data-game-id="${g.id}" data-heat-id="${x.id}">🏁 Score heat</button>` : ''}
            ${x.status !== 'done' ? btn('🗑', 'removeHeat', { gameId: g.id, heatId: x.id }, 'ghost sm') : ''}
          </div>
          ${ui.finishing === `${g.id}:${x.id}` ? heatFinishForm(g, x) : ''}
        </li>`)
        .join('')}</ol>` : ''}
      ${g.status !== 'done' ? `<details><summary class="fine">+ Custom heat (e.g. a final between the winners)</summary>
        <form data-form="heat" data-game-id="${g.id}" class="row wrap">${S.teams.map((t) => `<label class="check"><input type="checkbox" id="ch_${g.id}_${t.id}" name="t_${t.id}" /> ${chip(t)}</label>`).join('')}<button class="btn sm">Add heat</button></form>
      </details>` : ''}
    </div>`;
  }

  function heatFinishForm(g, x) {
    return `<form data-form="finish-heat" data-game-id="${g.id}" data-heat-id="${x.id}" class="finish">
      <p class="fine">Credits for each block in this heat (blank = 0, negative to fine):</p>
      <div class="grid2">${x.teamIds.map((id) => `<label>${chip(team(id))}<input id="fh_${x.id}_${id}" name="pts_${id}" type="number" inputmode="numeric" placeholder="0" /></label>`).join('')}</div>
      <div class="row"><button type="button" class="btn ghost sm" data-act="finish-close">Cancel</button><button class="btn sm">Pay out heat</button></div>
    </form>`;
  }

  function finishForm(g) {
    return `<form data-form="finish" data-game-id="${g.id}" class="finish">
      <p class="fine">${(g.heats || []).length ? 'Heats already paid out as they finished. Add any bonus credits here (blank = 0):' : 'Credits for each block (leave blank for 0, negative to fine):'}</p>
      <div class="grid2">${S.teams.map((t) => `<label>${chip(t)}<input id="fin_${g.id}_${t.id}" name="pts_${t.id}" type="number" inputmode="numeric" placeholder="0" /></label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="fin_${g.id}_pen" name="penalties" checked /> Apply round penalties (Holding +${S.settings.holdingDrinks} 🍺, Solitary +${S.settings.solitaryDrinks} 🍺, sentences −1)</label>
      <div class="row"><button type="button" class="btn ghost sm" data-act="finish-close">Cancel</button><button class="btn sm">Pay out & close game</button></div>
    </form>`;
  }

  // Players sorted block by block (Holding last), so 40 rows read as teams.
  const byBlock = (list) => {
    const order = Object.fromEntries(S.teams.map((t, i) => [t.id, i]));
    return [...list].sort((a, b) => (order[a.teamId] ?? 999) - (order[b.teamId] ?? 999) || a.name.localeCompare(b.name));
  };

  function playerRow(p, extra = '', selectable = false) {
    return `<div class="prow ${p.status}">
      <div class="p-n">${selectable ? `<input type="checkbox" class="pick" id="sel_${p.id}" name="sel_${p.id}" aria-label="Select ${h(p.name)}" /> ` : ''}<b>${h(p.name)}</b> <span class="fine">#${h(p.inmateNo)} · ${h(roleOf(p.role)?.emoji)}${p.revealed ? ' (exposed)' : ''}${p.drinksOwed ? ` · 🍺×${p.drinksOwed}` : ''}</span> ${p.status === 'solitary' ? `<span class="chip red">🔒 ${plural(p.solitary.rounds, 'rd')}</span>` : ''}</div>
      <select id="pt_${p.id}" data-change="updatePlayer" data-player-id="${p.id}" name="teamId">
        <option value="">🕳️ Holding Cell</option>${S.teams.map((t) => `<option value="${t.id}" ${p.teamId === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('')}
      </select>
      <div class="row wrap">${extra}</div>
    </div>`;
  }

  function aBlocks() {
    const waiting = inHolding().length;
    return `
      <section class="card">
        <h3>Build blocks</h3>
        <p class="fine">Splits everyone waiting in the Holding Cell into blocks of up to ${S.settings.maxBlockSize} (Block A, B, C…), filling the smallest blocks first and creating new ones as needed. Late arrivals land in Holding — run it again or parole them individually.</p>
        <div class="row wrap">
          ${btn(`🔐 Build blocks from Holding (${waiting})`, 'buildBlocks')}
          ${btn('+ Add empty block', 'addTeam', {}, 'ghost sm')}
        </div>
      </section>
      <section class="card">
        <h3>Blocks (${S.teams.length})</h3>
        <ul class="tlist">${S.teams
          .map((t) => `<li style="--c:${h(t.color)}">
            <form data-admin="updateTeam" class="row wrap">
              <input type="hidden" name="teamId" value="${t.id}" />
              <input type="color" id="tc_${t.id}" name="color" value="${h(t.color)}" />
              <input id="tn_${t.id}" name="name" value="${h(t.name)}" maxlength="30" />
              <input id="tk_${t.id}" name="nickname" value="${h(t.nickname)}" maxlength="32" placeholder="Nickname" />
              <input id="tm_${t.id}" name="motto" value="${h(t.motto)}" maxlength="80" placeholder="Motto" />
              <button class="btn sm">Save</button>
              ${btn('🗑', 'removeTeam', { teamId: t.id }, 'ghost sm', `Delete ${t.name}? Its inmates go to the Holding Cell.`)}
            </form>
            <div class="row wrap fine">
              ${blockmates(t.id).length}/${S.settings.maxBlockSize} inmates · ${t.budget} cr ·
              🔄 ${t.inventory.deflect} ${btn('+', 'setInventory', { teamId: t.id, kind: 'deflect', count: t.inventory.deflect + 1 }, 'ghost xs')}${btn('−', 'setInventory', { teamId: t.id, kind: 'deflect', count: t.inventory.deflect - 1 }, 'ghost xs')}
              · 💵 ${t.inventory.immunity} ${btn('+', 'setInventory', { teamId: t.id, kind: 'immunity', count: t.inventory.immunity + 1 }, 'ghost xs')}${btn('−', 'setInventory', { teamId: t.id, kind: 'immunity', count: t.inventory.immunity - 1 }, 'ghost xs')}
            </div>
          </li>`)
          .join('')}</ul>
      </section>
      <section class="card">
        <h3>All inmates (${S.players.length})</h3>
        ${S.players.length ? `<form data-form="remove-players">
          <div class="row wrap"><button type="button" class="btn ghost sm" data-act="select-all">Select all</button><button class="btn sm danger">🗑 Remove selected</button></div>
          <div class="ptable">${byBlock(S.players)
          .map((p) => playerRow(p, `
              ${p.teamId ? btn(p.isCaptain ? '👑 Captain' : 'Make 👑', 'updatePlayer', { playerId: p.id, isCaptain: !p.isCaptain }, p.isCaptain ? 'sm' : 'ghost sm') : ''}
              ${btn('🗑', 'removePlayer', { playerId: p.id }, 'ghost sm', `Remove ${p.name} for good? Their phone gets logged out.`)}`, true))
          .join('')}</div></form>` : `<p class="empty">Nobody booked yet. Put the TV screen up so people can scan the QR code.</p>`}
      </section>`;
  }

  function punishCard() {
    const withOpen = byBlock(S.players).filter((p) => (p.sentences || []).some((x) => x.status === 'open'));
    return `<section class="card">
      <h3>⚖️ Hand out a punishment</h3>
      <form data-admin="assignPunishment" class="grid2">
        <label class="span2">Who<select id="pun_target" name="target">
          <option value="all">Everyone (${S.players.length})</option>
          <option value="holding">🕳️ The Holding Cell (${inHolding().length})</option>
          <option value="solitary">🔒 Everyone in Solitary (${inSolitary().length})</option>
          <optgroup label="Blocks">${S.teams.map((t) => `<option value="team:${t.id}">${h(t.name)}${t.nickname ? ` “${h(t.nickname)}”` : ''} (${blockmates(t.id).length})</option>`).join('')}</optgroup>
          <optgroup label="One inmate">${byBlock(S.players).map((p) => `<option value="player:${p.id}">${h(p.name)} · ${h(p.teamId ? teamName(p.teamId) : 'Holding')}</option>`).join('')}</optgroup>
        </select></label>
        <label>Drinks each<input id="pun_drinks" name="drinks" type="number" min="0" max="10" value="1" /></label>
        <label>Punishment (optional)<input id="pun_text" name="text" maxlength="120" list="pun_presets" placeholder="10 push-ups" /></label>
        <datalist id="pun_presets">
          ${['Take a shot', 'Waterfall until the Warden says stop', '10 push-ups', 'Sing a chorus of a song the hosts pick', 'Wear the jumpsuit for the next game', 'Hold your drink in your weak hand until the next game', 'Compliment every member of another block', 'Speak only in a prison-movie accent for 10 minutes'].map((x) => `<option value="${h(x)}"></option>`).join('')}
        </datalist>
        <label class="span2">Reason (shows in the feed)<input id="pun_reason" name="reason" maxlength="80" placeholder="cheating at flip cup" /></label>
        <button class="btn span2">⚖️ Sentence them</button>
      </form>
      <p class="fine">Drinks go on their drink tab; the punishment shows on their Now tab until they tap Done.</p>
      ${withOpen.length ? `<h3 class="section-h">Open punishments</h3><div class="ptable">${withOpen
        .map((p) => (p.sentences || []).filter((x) => x.status === 'open').map((x) => `<div class="prow"><div class="p-n"><b>${h(p.name)}</b> ${statusChip(p)}</div><div class="fine">${h(x.text)} · from ${h(x.from)}${x.reason ? ` · ${h(x.reason)}` : ''}</div><div class="row">${btn('Clear', 'clearSentence', { playerId: p.id, sentenceId: x.id }, 'ghost sm')}</div></div>`).join(''))
        .join('')}</div>` : ''}
    </section>`;
  }

  function aLockup() {
    const st = S.settings;
    const holding = inHolding();
    const solitary = inSolitary();
    return `
      ${punishCard()}
      <section class="card">
        <h3>🕳️ Holding Cell (${holding.length})</h3>
        <p class="fine">Late arrivals and anyone kicked off a block. Parole them onto a block with the dropdown, or let blocks buy a 🔑 Bail Bond.</p>
        ${holding.length ? `<div class="ptable">${holding.map((p) => playerRow(p, `${btn('🔒 Solitary', 'sendToSolitary', { playerId: p.id, rounds: 1, reason: 'host’s orders' }, 'ghost sm')}${drinkBtns(p)}`)).join('')}</div>` : '<p class="empty">Empty.</p>'}
      </section>
      <section class="card">
        <h3>🔒 Solitary (${solitary.length})</h3>
        ${solitary.length ? `<div class="ptable">${solitary.map((p) => `<div class="prow solitary">
            <div class="p-n"><b>${h(p.name)}</b> <span class="fine">${plural(p.solitary.rounds, 'round')} left · ${h(p.solitary.reason)} · returns to ${h(p.teamId ? teamName(p.teamId) : 'Holding')}${p.drinksOwed ? ` · 🍺×${p.drinksOwed}` : ''}</span></div>
            <div class="row wrap">${btn('+1 round', 'sendToSolitary', { playerId: p.id, rounds: 1, reason: p.solitary.reason }, 'ghost sm')}${btn('🔓 Release', 'releaseSolitary', { playerId: p.id }, 'sm')}${drinkBtns(p)}</div>
          </div>`).join('')}</div>` : '<p class="empty">Nobody in solitary.</p>'}
        <form data-admin="sendToSolitary" class="grid2">
          <label>Send to solitary<select id="sol_p" name="playerId">${S.players.filter((p) => p.status !== 'solitary').map((p) => `<option value="${p.id}">${h(p.name)} (${h(teamName(p.teamId || HOLDING))})</option>`).join('')}</select></label>
          <label>Rounds<input id="sol_r" name="rounds" type="number" min="1" value="1" /></label>
          <label class="span2">For (shows in the feed)<input id="sol_why" name="reason" maxlength="80" placeholder="cheating at flip cup" /></label>
          <button class="btn span2">🔒 Lock them up</button>
        </form>
      </section>
      <section class="card">
        <h3>🍺 Drink tab</h3>
        <div class="row wrap">${btn(`⏱️ End round now (Holding +${st.holdingDrinks}, Solitary +${st.solitaryDrinks}, sentences −1)`, 'tickRound', {}, 'ghost sm', 'Apply round penalties now? (Finishing a game already does this.)')}</div>
        ${S.players.some((p) => p.drinksOwed) ? `<div class="ptable">${S.players.filter((p) => p.drinksOwed).sort((a, b) => b.drinksOwed - a.drinksOwed).map((p) => `<div class="prow"><div class="p-n"><b>${h(p.name)}</b> ${statusChip(p)}</div><b class="drink-owed">🍺×${p.drinksOwed}</b><div class="row">${drinkBtns(p)}</div></div>`).join('')}</div>` : '<p class="empty">Nobody owes anything.</p>'}
      </section>
      <section class="card">
        <h3>Lockup rules</h3>
        <form data-admin="updateSettings" class="grid2">
          <label class="span2">🕳️ Holding Cell standing rules<input id="lk_hr" name="holdingRules" value="${h(st.holdingRules)}" maxlength="240" /></label>
          <label class="span2">🔒 Solitary standing rules<input id="lk_sr" name="solitaryRules" value="${h(st.solitaryRules)}" maxlength="240" /></label>
          <label>Holding drinks per round<input id="lk_hd" name="holdingDrinks" type="number" min="0" max="5" value="${st.holdingDrinks}" /></label>
          <label>Solitary drinks per round<input id="lk_sd" name="solitaryDrinks" type="number" min="0" max="5" value="${st.solitaryDrinks}" /></label>
          <label class="span2">House rules (shown with every drink owed)<input id="lk_house" name="houseRules" value="${h(st.houseRules)}" maxlength="200" /></label>
          <button class="btn span2">Save rules</button>
        </form>
      </section>`;
  }
  const drinkBtns = (p) => `${btn('🍺+1', 'adjustDrinks', { playerId: p.id, amount: 1 }, 'ghost xs')}${p.drinksOwed ? btn('🍺−1', 'adjustDrinks', { playerId: p.id, amount: -1 }, 'ghost xs') : ''}`;

  function itemFields(prefix, it = {}) {
    const types = Object.entries(S.itemTypes).map(([k, v]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${h(v.label)}</option>`).join('');
    return `
      <label class="xs-col">Emoji<input id="${prefix}_emoji" name="emoji" value="${h(it.emoji ?? '')}" maxlength="4" placeholder="🍹" /></label>
      <label>Name<input id="${prefix}_name" name="name" value="${h(it.name ?? '')}" maxlength="40" required /></label>
      <label class="span2">Description<input id="${prefix}_desc" name="desc" value="${h(it.desc ?? '')}" maxlength="160" /></label>
      <label>Price<input id="${prefix}_price" name="price" type="number" min="0" value="${h(it.price ?? 10)}" /></label>
      <label>Type<select id="${prefix}_type" name="type">${types}</select></label>
      <label>Stock (blank = ∞)<input id="${prefix}_stock" name="stock" type="number" min="0" value="${it.stock ?? ''}" /></label>
      <label>Penalty drinks each (punishments)<input id="${prefix}_drinks" name="drinks" type="number" min="0" max="5" value="${h(it.drinks ?? 0)}" /></label>
      <label>Credit drain (punishments)<input id="${prefix}_drain" name="drain" type="number" min="0" value="${h(it.drain ?? 0)}" /></label>
      <label>Drained credits go to the buyer<select id="${prefix}_steal" name="steal"><option value="false">No, they vanish</option><option value="true" ${it.steal ? 'selected' : ''}>Yes, it's a robbery</option></select></label>
      <label>On the shelf during<select id="${prefix}_act" name="act"><option value="">Every act</option>${S.acts.map((a) => `<option value="${a.id}" ${it.act === a.id ? 'selected' : ''}>Act ${a.numeral} only: ${h(a.name)}</option>`).join('')}</select></label>`;
  }

  function aShop() {
    return `
      <section class="card">
        <h3>Add commissary item</h3>
        <form data-admin="addItem" class="grid2">${itemFields('ni')}<button class="btn span2">Stock the shelf</button></form>
        <p class="fine"><b>Types:</b> For your block = mixer delivered to the buyer · Send a drink = gift to another block or the Holding Cell · Punishment = target block can take it or deflect (the Holding Cell can’t deflect); penalty drinks land on the drink tab automatically · Bail bond = pull someone out of Holding onto your block · Deflect / Vote immunity = go into the stash · Intel = learn if your block has a snitch.</p>
      </section>
      <section class="card">
        <h3>Shelf (${S.items.length})</h3>
        <ul class="ilist">${S.items
          .map((it) => `<li class="${it.active ? '' : 'inactive'}">
            <details>
              <summary><span class="mega">${h(it.emoji)}</span> <b>${h(it.name)}</b> <span class="fine">${it.price} cr · ${h(S.itemTypes[it.type]?.label)}${it.act ? ` · Act ${S.acts.find((a) => a.id === it.act)?.numeral} only` : ''}${it.drinks ? ` · 🍺×${it.drinks}` : ''}${it.stock !== null ? ` · ${it.stock} left` : ''}${it.active ? '' : ' · HIDDEN'}</span></summary>
              <form data-admin="updateItem" class="grid2"><input type="hidden" name="itemId" value="${it.id}" />${itemFields(`it_${it.id}`, it)}
                <div class="row span2">${btn(it.active ? 'Hide' : 'Show', 'updateItem', { itemId: it.id, active: !it.active }, 'ghost sm')}${btn('🗑 Delete', 'removeItem', { itemId: it.id }, 'ghost sm', `Delete ${it.name}?`)}<button class="btn sm">Save</button></div>
              </form>
            </details>
          </li>`)
          .join('')}</ul>
      </section>`;
  }

  function aMafia() {
    const m = S.mafia;
    const st = S.settings;
    const name = (id) => (id === 'skip' ? 'Keep everyone' : h(player(id)?.name || '?'));
    const night = m.night || { tips: {}, suspicions: {} };
    const dealt = m.phase !== 'off';
    const snitches = S.players.filter((p) => p.role === 'snitch');
    return `
      <section class="card">
        <h3>How it works</h3>
        <p class="fine">Each block gets a hidden snitch with the chance below (so with 50%, about half the blocks have one — nobody knows which). At <b>Lights Out</b> everyone picks a name on their phone: snitches’ picks get tipped into solitary, everyone else’s become anonymous “most suspected” whispers. At a <b>Block Vote</b> each block votes on its own members; a majority kicks someone. Catch the snitch → bounty, snitch to solitary. Kick an innocent → fine, innocent to the Holding Cell. At the end of the night, <b>Reveal</b> unmasks any snitch who got away with it.</p>
        <form data-admin="dealSnitches" class="row wrap">
          <label class="xs-col">Chance per block %<input id="sn_ch" name="chance" type="number" min="0" max="100" value="${st.snitchChance}" /></label>
          <label class="check"><input type="checkbox" id="sn_one" name="atLeastOne" checked /> At least one snitch overall</label>
          <button class="btn sm" ${dealt ? 'data-confirm="Re-plant snitches? Current roles are wiped."' : ''}>🐀 Plant snitches</button>
          ${dealt ? btn('Reset', 'resetMafia', {}, 'ghost sm', 'Reset the snitch game and clear all roles?') : ''}
        </form>
        <form data-admin="updateSettings" class="row wrap">
          <label class="xs-col">Bounty for catching<input id="sn_b" name="snitchBounty" type="number" min="0" value="${st.snitchBounty}" /></label>
          <label class="xs-col">Fine for wrong kick<input id="sn_w" name="wrongfulPenalty" type="number" min="0" value="${st.wrongfulPenalty}" /></label>
          <label class="xs-col">Tip → solitary rounds<input id="sn_t" name="tipRounds" type="number" min="1" value="${st.tipRounds}" /></label>
          <label class="xs-col">Caught snitch solitary rounds<input id="sn_c" name="caughtSnitchRounds" type="number" min="0" value="${st.caughtSnitchRounds}" /></label>
          <button class="btn ghost sm">Save</button>
        </form>
      </section>
      ${dealt ? `
      <section class="card">
        <h3>Phase: ${h(m.phase.toUpperCase())}${m.round ? ` · Night ${m.round}` : ''}</h3>
        <div class="row wrap">
          ${m.phase === 'night' ? btn('☀️ Lights On', 'endNight') : m.phase === 'idle' ? btn('🌙 Lights Out', 'startNight') : ''}
          ${m.phase === 'vote' ? btn('🔨 Close block votes', 'closeVote') : m.phase === 'idle' ? btn('🗳️ Open Block Votes', 'openVote', {}, 'ghost') : ''}
          ${m.phase !== 'over' ? btn('🎭 Reveal all snitches (end)', 'revealSnitches', {}, 'ghost', 'Unmask every snitch and end the snitch game?') : ''}
        </div>
        ${m.lastResult ? `<p class="fine">Last: ${h(m.lastResult.text)}</p>` : ''}
        ${m.phase === 'night' ? `
          <div class="grid2">
            <div><b>🐀 Tips</b>${Object.entries(night.tips).map(([s, t]) => `<div class="fine">${name(s)} → ${name(t)}</div>`).join('') || '<div class="fine">none yet</div>'}</div>
            <div><b>🗣️ Suspicions</b> <span class="fine">(${Object.keys(night.suspicions).length})</span>${Object.entries(night.suspicions).map(([s, t]) => `<div class="fine">${name(s)} → ${name(t)}</div>`).join('') || '<div class="fine">none yet</div>'}</div>
          </div>` : ''}
        ${m.phase === 'vote' ? `
          <div class="grid2">${S.teams.map((t) => {
            const tally = m.tallies?.[t.id] || {};
            const voters = blockmates(t.id).filter((p) => p.status === 'block');
            return `<div><b>${h(t.name)}</b> <span class="fine">${voters.filter((p) => m.votes[p.id]).length}/${voters.length} voted · majority = ${Math.floor(voters.length / 2) + 1}</span>
              ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<div class="fine">${name(id)} — ${n}${m.immune.includes(id) ? ' 🛡️' : ''}</div>`).join('') || '<div class="fine">no votes</div>'}</div>`;
          }).join('')}</div>` : ''}
      </section>` : ''}
      <section class="card">
        <h3>Secret roles (hosts’ eyes only)</h3>
        ${dealt ? `<p class="fine">${snitches.length ? `Snitches: ${snitches.map((p) => `<b>${h(p.name)}</b> (${h(teamName(p.teamId || HOLDING))}${p.revealed ? ', exposed' : ''})`).join(', ')}` : 'No snitches this game. 👀'} · Clean blocks: ${S.teams.filter((t) => !snitches.some((p) => p.teamId === t.id && !p.revealed)).map((t) => h(t.name)).join(', ') || 'none'}</p>` : ''}
        <div class="ptable">${S.players
          .map((p) => `<div class="prow ${p.status}">
            <div class="p-n"><b>${h(p.name)}</b> <span class="fine">${statusChip(p)}</span></div>
            <select id="pr_${p.id}" data-change="updatePlayer" data-player-id="${p.id}" name="role">${Object.entries(S.roles).map(([k, r]) => `<option value="${k}" ${p.role === k ? 'selected' : ''}>${r.emoji} ${h(r.name)}</option>`).join('')}</select>
            <span></span>
          </div>`)
          .join('')}</div>
      </section>`;
  }

  function aTasks() {
    const st = S.settings;
    const withTasks = S.players.filter((p) => p.task && p.role === 'snitch');
    const pending = S.claims.filter((c) => c.status === 'pending');
    const judged = S.claims.filter((c) => c.status !== 'pending').slice(0, 30);
    const who = (c) => {
      const p = player(c.playerId);
      return p ? `<b>${h(p.name)}</b> ${statusChip(p)}` : '<b>(removed)</b>';
    };
    const effect = (c) => (c.effect === 'sabotage' ? `skimmed ${c.amount}` : 'no effect (snitch was caught)');
    return `<section class="card">
      <h3>⏳ Sabotage claims to judge (${pending.length})</h3>
      <p class="fine">A snitch taps Done when they think they pulled off their sabotage. Nothing happens until a host approves — judge whether they really did it, and whether anyone noticed. Approving skims their block (only that block sees an “unexplained withdrawal”). Rejecting hands the orders back so they can try again.</p>
      ${pending.length ? `<div class="ptable">${pending
        .map((c) => `<div class="prow claim k-${c.kind}">
          <div class="p-n">${who(c)} <span class="fine">${h(c.gameName)} · ${time(c.ts)}</span></div>
          <div class="task-line">${h(c.text)}</div>
          <div class="row">${btn('Reject', 'rejectTask', { claimId: c.id }, 'ghost sm')}${btn('Approve ✅', 'approveTask', { claimId: c.id }, 'sm')}</div>
        </div>`)
        .join('')}</div>` : '<p class="empty">Nothing waiting.</p>'}
      ${judged.length ? `<h3 class="section-h">Recently judged</h3><div class="ptable">${judged
        .map((c) => `<div class="prow ${c.status === 'approved' ? '' : 'solitary'}">
          <div class="p-n">${who(c)} <span class="fine">${c.status} by ${h(S.hosts[c.by]?.name || 'host')}${c.status === 'approved' ? ` · ${effect(c)}` : ''}</span></div>
          <div class="fine">${h(c.text)}</div>
          <div class="row">${c.status === 'approved' ? btn('Void', 'revokeTask', { claimId: c.id }, 'ghost sm', 'Void this task and undo its effect?') : ''}</div>
        </div>`)
        .join('')}</div>` : ''}
    </section>
    <section class="card">
      <h3>🕵️ Snitch sabotage (Among Us style)</h3>
      <p class="fine">When a game goes ▶ live, every phone pops up the game’s briefing (how to play + lockup rules). Each briefing has a “Classified” box: empty for inmates, and a secret sabotage for each hidden snitch. Approved sabotage skims <b>−${st.sabotageSkim}</b> from the snitch’s block. Surviving snitches cash in <b>${st.snitchRewardDrinks} + ${st.drinksPerSabotage}/sabotage</b> drinks to hand out at the reveal; caught snitches give back what they skimmed.</p>
      <div class="row wrap">${btn('🐀 Deal new sabotage now', 'dealTasks', {}, 'sm', 'Give every hidden snitch fresh orders? Unfinished ones expire.')}</div>
      ${withTasks.length ? `<div class="ptable">${withTasks
        .map((p) => `<div class="prow">
          <div class="p-n"><b>${h(p.name)}</b> ${statusChip(p)} <span class="fine">${h(p.task.status)} · ${plural(p.dirt, 'sabotage')}, ${p.skimmed} cr skimmed</span></div>
          <div class="fine">${h(p.task.text)}</div>
          <span></span>
        </div>`)
        .join('')}</div>` : ''}
      <form data-admin="updateSettings" class="grid2">
        <label class="check span2"><input type="checkbox" id="tk_on" name="tasksEnabled" ${st.tasksEnabled ? 'checked' : ''} /> Deal sabotage automatically when a game goes live</label>
        <label>Credits skimmed per sabotage<input id="tk_s" name="sabotageSkim" type="number" min="0" value="${st.sabotageSkim}" /></label>
        <label>Survivor reward: base drinks to hand out<input id="tk_d" name="snitchRewardDrinks" type="number" min="0" value="${st.snitchRewardDrinks}" /></label>
        <label>+ drinks per sabotage<input id="tk_dp" name="drinksPerSabotage" type="number" min="0" value="${st.drinksPerSabotage}" /></label>
        <label class="span2">Survivor prize (shown at the reveal)<input id="tk_prize" name="snitchPrize" value="${h(st.snitchPrize)}" maxlength="160" /></label>
        <label class="span2">🐀 Sabotage tasks (one per line)<textarea id="tk_sab" name="sabotageTasks" rows="6">${h(st.sabotageTasks.join('\n'))}</textarea></label>
        <button class="btn span2">Save sabotage settings</button>
      </form>
    </section>`;
  }

  function aSettings() {
    const st = S.settings;
    return `
      <section class="card">
        <h3>📣 PA announcement</h3>
        <form data-admin="announce" class="row wrap"><input id="ann" name="text" maxlength="200" placeholder="Everyone to the yard for Flip Cup!" required /><button class="btn sm">Broadcast</button></form>
        ${S.announcement ? `<p class="fine">Showing: “${h(S.announcement.text)}” ${btn('Clear', 'clearAnnouncement', {}, 'ghost xs')}</p>` : ''}
      </section>
      <section class="card">
        <h3>Party settings</h3>
        <form data-admin="updateSettings" class="grid2">
          <label>Party name<input id="s_name" name="partyName" value="${h(st.partyName)}" maxlength="40" /></label>
          <label>Tagline<input id="s_tag" name="tagline" value="${h(st.tagline)}" maxlength="80" /></label>
          <label>Starting credits for new blocks<input id="s_start" name="startingBudget" type="number" min="0" value="${st.startingBudget}" /></label>
          <label>Max inmates per block<input id="s_max" name="maxBlockSize" type="number" min="2" max="12" value="${st.maxBlockSize}" /></label>
          <label>Who can spend a block's credits<select id="s_spend" name="spendMode">
            <option value="request" ${st.spendMode === 'request' ? 'selected' : ''}>Block decides: Shot Caller approves or blockmates second</option>
            <option value="captain" ${st.spendMode === 'captain' ? 'selected' : ''}>Only the Shot Caller 👑</option>
            <option value="anyone" ${st.spendMode === 'anyone' ? 'selected' : ''}>Anyone on the block, instantly</option>
          </select></label>
          <label>Seconds needed (block decides)<input id="s_sec" name="requestSeconds" type="number" min="1" max="5" value="${st.requestSeconds}" /></label>
          <label>🌠 Warp: 5★ chance %<input id="s_w5" name="warp5" type="number" min="0" max="100" value="${st.warp5}" /></label>
          <label>🌠 Warp: 4★ chance %<input id="s_w4" name="warp4" type="number" min="0" max="100" value="${st.warp4}" /></label>
          <label>🌠 Warp: guaranteed 5★ every N pulls<input id="s_wp" name="warpPity" type="number" min="1" max="50" value="${st.warpPity}" /></label>
          <button class="btn span2">Save settings</button>
        </form>
      </section>
      <section class="card danger-zone">
        <h3>🧨 Fresh start</h3>
        <p class="fine">Removes every inmate, block, order, punishment, sabotage claim and feed line, and resets every game to upcoming. Keeps your games and their rules, the commissary shelf, settings and host logins. Use it to clear out test data before the party.</p>
        <form data-admin="freshStart" class="row wrap"><input id="fs_confirm" name="confirm" placeholder="Type RESET" autocomplete="off" /><button class="btn danger" data-confirm="Wipe every inmate, block and order and start fresh? This can't be undone.">Wipe it</button></form>
      </section>
      <section class="card">
        <h3>Links</h3>
        <p>Players join at <b>${h(location.origin)}/</b><br/>TV / projector: <b>${h(location.origin)}/tv</b><br/>Warden: <b>${h(location.origin)}/warden</b></p>
        <img class="qr" src="/qr.svg?url=${encodeURIComponent(`${location.origin}/`)}" alt="QR code to join" />
      </section>`;
  }

  // ---------- TV ----------
  function tvPage() {
    const live = S.games.find((g) => g.status === 'live');
    const next = S.games.find((g) => g.status === 'upcoming');
    const m = S.mafia;
    const rows = standings();
    const max = Math.max(1, ...rows.map((t) => t.earned));
    const holding = inHolding();
    const solitary = inSolitary();
    return `
      <div class="tv">
        <header class="tv-h">${hero(true)}<div class="act-tag">${curAct().emoji} Act ${curAct().numeral} · ${h(curAct().name)}</div><h1 class="logo">${h(S.settings.partyName)}</h1><div class="tagline">${h(curAct().tagline)}</div></header>
        ${phaseBanner()}
        ${S.announcement ? `<div class="announce tv-ann"><span class="mega">📣</span><div class="announce-t">${h(S.announcement.text)}</div></div>` : ''}
        <div class="tv-grid">
          <section class="card">
            <h2>🏆 Standings</h2>
            <ol class="tv-board">${rows.map((t, i) => `<li style="--c:${h(t.color)}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}${t.nickname || streakBits(t).length ? `<small>${[t.nickname && h(t.nickname), ...streakBits(t)].filter(Boolean).join(' · ')}</small>` : ''}</span><span class="tv-bar"><i style="width:${(t.earned / max) * 100}%"></i></span><b>${t.earned}</b></li>`).join('') || '<p class="empty">No blocks yet</p>'}</ol>
            ${m.phase === 'vote' ? `<h3 class="section-h">🗳️ Block votes</h3>${S.teams.map((t) => {
              const tally = m.tallies?.[t.id] || {};
              const top = Object.entries(tally).filter(([id]) => id !== 'skip').sort((a, b) => b[1] - a[1])[0];
              return `<div class="fine">${chip(t)} ${Object.values(tally).reduce((a, b) => a + b, 0)} votes${top ? ` · leading: <b>${h(player(top[0])?.name)}</b> (${top[1]})` : ''}</div>`;
            }).join('')}` : ''}
          </section>
          <section class="card">
            ${live ? `<div class="eyebrow">🏁 Now in the yard</div><h2 class="tv-live">${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}${tvHeat(live)}${live.rules ? `<div class="rules tv-rules">${h(live.rules)}</div>` : ''}${live.holdingRule ? `<p class="rule">🕳️ Holding: ${h(live.holdingRule)}</p>` : ''}${live.solitaryRule ? `<p class="rule">🔒 Solitary: ${h(live.solitaryRule)}</p>` : ''}` : next ? `<div class="eyebrow">Up next</div><h2 class="tv-live">${h(next.name)}</h2>` : `<div class="eyebrow">Yard</div><h2>Free time 🍻</h2>`}
            ${m.phase === 'night' ? '<div class="tv-night">🌙<br/>LIGHTS OUT<br/><small>Everyone pick a name on your phone.</small></div>' : ''}
            ${S.orders.length ? `<h3>⚠️ Incoming punishments</h3><ul class="feed">${S.orders.map((o) => `<li><span class="f-e">${h(o.emoji)}</span><span class="f-t">${h(o.name)}: ${h(teamName(o.fromTeamId))} → <b>${h(teamName(o.targetTeamId))}</b> (deciding…)</span></li>`).join('')}</ul>` : ''}
          </section>
          <section class="card tv-feed"><h2>Yard Gossip</h2>${feedList(12)}</section>
          <section class="card tv-lockup">
            <div><h3>🕳️ Holding Cell</h3><div class="tv-names">${holding.map((p) => `<span>${h(p.name)}${p.drinksOwed ? ` <b>🍺${p.drinksOwed}</b>` : ''}</span>`).join('') || '<span class="fine">empty</span>'}</div><div class="fine">${h(S.settings.holdingRules)}</div></div>
            <div><h3>🔒 Solitary</h3><div class="tv-names">${solitary.map((p) => `<span>${h(p.name)} <small>${p.solitary.rounds}r</small>${p.drinksOwed ? ` <b>🍺${p.drinksOwed}</b>` : ''}</span>`).join('') || '<span class="fine">empty</span>'}</div><div class="fine">${h(S.settings.solitaryRules)}</div></div>
          </section>
          <section class="card tv-qr"><img class="qr" src="/qr.svg?url=${encodeURIComponent(`${location.origin}/`)}" alt="QR code to join" /><div><b>Scan to get booked</b><div class="fine">${h(location.host)}</div><div class="fine">${plural(S.players.length, 'inmate')} booked</div></div></section>
        </div>
      </div>`;
  }

  function tvHeat(g) {
    const heats = g.heats || [];
    if (!heats.length) return '';
    const now = heats.find((x) => x.status === 'live');
    const next = heats.filter((x) => x.status === 'upcoming').slice(0, 3);
    const label = (x) => x.teamIds.map((id) => chip(team(id))).join(' <b>vs</b> ');
    return `${now ? `<div class="tv-heat"><div class="eyebrow">🥊 Heat ${heats.indexOf(now) + 1} of ${heats.length}</div><div class="vs">${label(now)}</div></div>` : ''}
      ${next.length ? `<div class="fine">Up next: ${next.map((x) => `Heat ${heats.indexOf(x) + 1} — ${x.teamIds.map((id) => h(teamName(id))).join(' vs ')}`).join(' · ')}</div>` : ''}`;
  }

  // ---------- events ----------
  const ACTIONS = {
    tab: (d) => { ui.tab = d.tab; ui.reveal = false; ui.revealTask = false; LS.set('sss_tab', d.tab); window.scrollTo(0, 0); render(); },
    atab: (d) => { ui.atab = d.tab; LS.set('sss_atab', d.tab); render(); },
    reveal: () => { ui.reveal = !ui.reveal; render(); },
    'reveal-task': () => {
      ui.revealTask = !ui.revealTask;
      render();
    },
    commission: async (d) => {
      if (d.confirm && !confirm(d.confirm)) return;
      const res = await act('commission', { commissionId: d.commissionId });
      if (!res.ok) return;
      const r = res.result || {};
      if (r.all) splash('passed', 'Commissions completed', `The Adventurers’ Guild pays out · AR ${r.rank}`, 3200);
      else toast(`📜 Commission complete!${r.primos ? ` +${r.primos} Primogems for your party.` : ''}`, 'ok');
    },
    wish: async (d) => {
      const fate = S.items.find((i) => i.type === 'warp');
      const res = await act('buy', { itemId: fate.id, count: Number(d.count) });
      if (res.ok && res.result?.status === 'requested') toast(`✨ Wish ×${d.count} sent to your party. Get it seconded (or ask the Shot Caller).`, 'ok');
    },
    'wish-panel': (d) => {
      ui.wishPanel = ui.wishPanel === d.panel ? null : d.panel;
      render();
    },
    'act-ok': () => {
      LS.set('sss_act', actId());
      render();
    },
    augment: async (d) => {
      if (d.confirm && !confirm(d.confirm)) return;
      const res = await act('augment', { augmentId: d.augmentId });
      if (res.ok) toast(`${S.augments[d.augmentId].emoji} ${S.augments[d.augmentId].name} locked in.`, 'ok');
    },
    'brief-ok': () => {
      markBriefSeen();
      ui.revealTask = false;
      render();
    },
    task: async (d) => {
      const res = await act('task', { result: d.result });
      if (res.ok) toast(d.result === 'done' ? '⏳ Sent to the hosts. Act natural.' : 'Skipped.', 'ok');
    },
    reroll: async () => {
      const res = await act('reroll');
      if (res.ok) toast('🎲 New orders.', 'ok');
    },
    dealDrink: async (d) => {
      const res = await act('dealDrink', { targetId: d.targetId });
      if (res.ok) toast(`🥃 ${player(d.targetId)?.name} drinks!`, 'ok');
    },
    'buy-open': (d) => { ui.sheet = { itemId: d.itemId, targetTeamId: null, targetPlayerId: null }; delete drafts.buy_note; render(); },
    'sheet-close': () => {
      if (ui.sheet) opened.delete(`buy:${ui.sheet.itemId}`);
      ui.sheet = null;
      render();
    },
    'pick-target': (d) => { ui.sheet.targetTeamId = d.teamId; render(); },
    'pick-player': (d) => { ui.sheet.targetPlayerId = d.playerId; render(); },
    'buy-confirm': async () => {
      const noteEl = document.getElementById('buy_note');
      const { itemId, targetTeamId, targetPlayerId } = ui.sheet;
      const res = await act('buy', { itemId, targetTeamId, targetPlayerId, note: noteEl ? noteEl.value : '' });
      if (!res.ok) return;
      const it = S.items.find((i) => i.id === itemId);
      const r = res.result || {};
      if (r.status === 'requested') toast('🛒 Sent to your block. Get them to second it (or ask the Shot Caller).', 'ok');
      else if (r.status === 'intel') toast(r.hasSnitch ? '📡 Wiretap says: there IS a snitch on your block. 🐀' : '📡 Wiretap says: your block is clean. For now.', r.hasSnitch ? 'warn' : 'ok');
      else if (r.warp) { /* the pull splash says it all */ }
      else if (r.status === 'stashed') toast(`${it?.emoji || ''} Stashed on your block. Shhh.`, 'ok');
      else if (it?.type === 'bail') toast('🔑 Bail posted. Welcome your new blockmate.', 'ok');
      else toast(`${it?.emoji || ''} Ordered! The hosts are on it.`, 'ok');
      opened.delete(`buy:${itemId}`);
      ui.sheet = null;
      delete drafts.buy_note;
      render();
    },
    respond: async (d) => {
      const res = await act('respond', { orderId: d.orderId, choice: d.choice });
      if (res.ok) toast(d.choice === 'deflect' ? '🔄 Deflected! Right back at ’em.' : '😤 Taken like a champ.', 'ok');
    },
    immunity: async (d) => {
      const res = await act('immunity', { targetId: d.targetId });
      if (res.ok) toast('💵 Guard bribed.', 'ok');
    },
    night: async (d) => {
      const res = await act('night', { targetId: d.targetId });
      if (res.ok) toast('Locked in. 🤫', 'ok');
    },
    vote: async (d) => {
      const res = await act('vote', { targetId: d.targetId });
      if (res.ok) toast('Vote cast 🗳️', 'ok');
    },
    drank: async () => {
      const res = await act('drank');
      if (res.ok) toast('🍻 Debt to society: reduced.', 'ok');
    },
    'finish-open': (d) => { ui.finishing = d.heatId ? `${d.gameId}:${d.heatId}` : d.gameId; render(); },
    'rename-open': () => { ui.renaming = true; render(); },
    'select-all': () => {
      const ids = S.players.map((p) => `sel_${p.id}`);
      const all = ids.every((id) => drafts[id]);
      for (const id of ids) drafts[id] = !all;
      render();
    },
    'sentence-done': async (d) => {
      const res = await act('sentenceDone', { sentenceId: d.sentenceId });
      if (res.ok) toast('✅ Served your time.', 'ok');
    },
    'rename-close': () => { ui.renaming = false; render(); },
    second: async (d) => {
      const res = await act('second', { requestId: d.requestId });
      if (res.ok) toast(res.result?.status === 'seconded' ? '👍 Seconded.' : '✅ That’s enough votes: bought!', 'ok');
    },
    approve: async (d) => {
      const res = await act('approve', { requestId: d.requestId });
      if (res.ok) toast('👑 Approved and bought.', 'ok');
    },
    drop: async (d) => {
      const res = await act('drop', { requestId: d.requestId });
      if (res.ok) toast('Request dropped.', 'ok');
    },
    'finish-close': () => { ui.finishing = null; render(); },
    logout: () => { LS.del('sss_admin'); kind = 'guest'; S = null; version = null; render(); poll(); },
    admin: async (d) => {
      if (d.confirm && !confirm(d.confirm)) return;
      const { act: _a, type, confirm: _c, ...args } = d;
      await admin(type, args);
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.tagName === 'A') return;
    e.preventDefault();
    ACTIONS[el.dataset.act]?.({ ...el.dataset }, el);
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.id || !$app.contains(el)) return;
    drafts[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id && $app.contains(el)) drafts[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.change) {
      const { change, ...args } = el.dataset;
      delete drafts[el.id];
      admin(change, { ...args, [el.name]: el.value });
    }
    if (el.tagName === 'SELECT') setTimeout(() => pendingRender && render(), 0);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.tagName === 'SELECT') setTimeout(() => pendingRender && render(), 0);
  });

  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return out;
  }
  function clearDrafts(form) {
    for (const el of form.elements) if (el.id) delete drafts[el.id];
  }

  const FORMS = {
    join: async (data, form) => {
      const res = await send({ kind: 'join', name: data.name });
      if (res.ok) {
        LS.set('sss_token', res.result.token);
        kind = 'player';
        ui.tab = 'yard';
        clearDrafts(form);
        toast('Welcome to the Slammer. 🔒', 'ok');
        render();
      }
    },
    pin: async (data, form) => {
      const res = await send({ kind: 'login', pin: data.pin });
      if (res.ok) {
        LS.set('sss_admin', res.result.adminToken);
        kind = 'admin';
        clearDrafts(form);
        render();
      }
    },
    'remove-players': async (data, form) => {
      const playerIds = Object.entries(data).filter(([k, v]) => k.startsWith('sel_') && v).map(([k]) => k.slice(4));
      if (!playerIds.length) return toast('Tick the inmates to remove first.', 'error');
      if (!confirm(`Remove ${playerIds.length === 1 ? '1 inmate' : `${playerIds.length} inmates`} for good? Their phones get logged out.`)) return;
      const res = await admin('removePlayers', { playerIds });
      if (res.ok) {
        clearDrafts(form);
        render();
        toast(`🗑 Removed ${playerIds.length}.`, 'ok');
      }
    },
    rename: async (data, form) => {
      const res = await act('rename', { nickname: data.nickname, motto: data.motto });
      if (res.ok) {
        ui.renaming = false;
        clearDrafts(form);
        render();
        toast('🏷️ Block renamed.', 'ok');
      }
    },
    heat: async (data, form) => {
      const teamIds = Object.entries(data).filter(([k, v]) => k.startsWith('t_') && v).map(([k]) => k.slice(2));
      const res = await admin('addHeat', { gameId: form.dataset.gameId, teamIds });
      if (res.ok) {
        clearDrafts(form);
        form.reset();
        toast('🥊 Heat added.', 'ok');
      }
    },
    'finish-heat': async (data, form) => {
      const results = {};
      for (const [k, v] of Object.entries(data)) if (k.startsWith('pts_') && v !== '') results[k.slice(4)] = Number(v);
      const res = await admin('finishHeat', { gameId: form.dataset.gameId, heatId: form.dataset.heatId, results });
      if (res.ok) {
        ui.finishing = null;
        clearDrafts(form);
        render();
        toast('🏁 Heat paid out.', 'ok');
      }
    },
    finish: async (data, form) => {
      const results = {};
      for (const [k, v] of Object.entries(data)) if (k.startsWith('pts_') && v !== '') results[k.slice(4)] = Number(v);
      const res = await admin('finishGame', { gameId: form.dataset.gameId, results, penalties: data.penalties });
      if (res.ok) {
        ui.finishing = null;
        clearDrafts(form);
        render();
        toast('Paid out 💰', 'ok');
      }
    },
  };

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    e.preventDefault();
    const data = formData(form);
    if (form.dataset.form) return FORMS[form.dataset.form]?.(data, form);
    if (form.dataset.admin) {
      const submitter = form.querySelector('button:not([type=button])[data-confirm]');
      if (submitter && !confirm(submitter.dataset.confirm)) return;
      const res = await admin(form.dataset.admin, data);
      if (res.ok) {
        clearDrafts(form);
        if (['addGame', 'addTeam', 'addItem', 'announce', 'adjustBudget', 'sendToSolitary', 'assignPunishment', 'freshStart'].includes(form.dataset.admin)) form.reset();
        render();
        toast('Done ✔', 'ok');
      }
    }
  });

  render();
  poll().then(schedule);
  // Keep the phone's clock honest without re-rendering the page.
  setInterval(() => document.querySelectorAll('.ph-clock').forEach((el) => (el.textContent = clock())), 20000);
})();
