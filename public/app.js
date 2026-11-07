/* Shifty Shen's Slammer — client. One file, no build step. */
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
    atab: LS.get('sss_atab') || '', // empty: Setup while the night is a draft, Round after
    sheet: null, // { itemId, targetTeamId, targetPlayerId }
    reveal: false,
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
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const inHolding = () => S.players.filter((p) => p.status === 'holding');
  const blockmates = (teamId) => S.players.filter((p) => p.teamId === teamId);
  const statusChip = (p) => (p.status === 'holding' ? chip(null) : chip(team(p.teamId)));

  // Wanted level, GTA style: Holding is three stars, and owed drinks or open sentences add one each.
  const wantedLevel = (p) =>
    p.status === 'holding' ? 3 : (p.drinksOwed > 0 ? 1 : 0) + ((p.sentences || []).some((x) => x.status === 'open') ? 1 : 0);
  const wantedStars = (p) => {
    const n = wantedLevel(p);
    return `<div class="wanted${n >= 3 ? ' hot' : ''}" title="${h(W('wanted', 'Wanted level'))} ${n} of 5" aria-label="${h(W('wanted', 'Wanted level'))} ${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</div>`;
  };

  // The top-corner HUD changes with the act: wanted level, pity counter, streak, or an emergency light.
  function hudExtra(me, myTeam) {
    const id = eng();
    if (id === 'gta') return wantedStars(me);
    if (id === 'pixel' && myTeam) return `<div class="hud-x px-pts" title="${h(myTeam.name)} points"><i class="px-ico px-ico--star"></i>${plural(myTeam.points || 0, 'pt')}</div>`;
    if (id === 'genshin' && myTeam) return `<div class="hud-x" title="Pulls since your last 5★">✦ Pity ${myTeam.pity ?? 0}/${S.settings.warpPity}</div>`;
    if (id === 'tft' && myTeam) {
      const st = myTeam.streak || 0;
      return `<div class="hud-x">${myTeam.augment ? `${S.augments[myTeam.augment].emoji} ` : ''}${st > 1 ? `🔥 ${st} win streak` : st < -1 ? `💧 ${-st} loss streak` : 'No streak'}</div>`;
    }
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
  // Blockmates (other than the asker) who must second a purchase request.
  const secondsNeeded = (t, requesterId) =>
    Math.min(S.settings.requestSeconds, blockmates(t.id).filter((p) => p.id !== requesterId).length);
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
  const palm = (x, y, k, flip, color = '#0e0818') => `<g transform="translate(${x} ${y}) scale(${flip ? -k : k} ${k})" fill="${color}">
      <path d="M0 0Q-12 70 10 150" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${[-52, -28, -6, 16, 36].map((a) => `<path d="${PALM_LEAF}" transform="rotate(${a})"/><path d="${PALM_LEAF}" transform="scale(-1 1) rotate(${a})"/>`).join('')}
      <path d="${PALM_LEAF}" transform="rotate(-78)"/>
    </g>`;
  // GTA VI key art: an Art Deco hotel on Ocean Drive, pastel and lit by the sunset.
  const decoHotel = (x, y, w, h, wall, shade, glass) => `<g transform="translate(${x} ${y})">
      <rect x="${w * 0.3}" y="-22" width="${w * 0.4}" height="24" fill="${wall}"/><rect x="${w * 0.4}" y="-34" width="${w * 0.2}" height="14" fill="${wall}"/><rect x="${w * 0.47}" y="-46" width="${w * 0.06}" height="14" fill="${shade}"/>
      <rect width="${w}" height="${h}" fill="${wall}"/><rect width="${w * 0.22}" height="${h}" fill="${shade}"/>
      ${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${w * 0.32 + c * w * 0.22}" y="${10 + r * 16}" width="${w * 0.14}" height="9" rx="1" fill="${glass}"/>`).join('')).join('')}
      ${[0, 1, 2, 3].map((r) => `<circle cx="${w * 0.11}" cy="${14 + r * 16}" r="3.4" fill="${glass}"/>`).join('')}
      <rect y="${h - 14}" width="${w}" height="5" fill="#f28fb8"/>
    </g>`;
  // Fixed star positions so the sky doesn't reshuffle on every render.
  const STARS = Array.from({ length: 46 }, (_, i) => [(i * 89 + 17) % 400, (i * 53 + 11) % 150, ((i * 7) % 3) * 0.4 + 0.6]);
  const starField = (op = 0.8) => `<g fill="#fff" opacity="${op}">${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
  const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const CREWMATE = 'M0 40Q0 0 30 0Q60 0 60 40V80Q60 90 50 90H42V78H18V90H10Q0 90 0 80Z';
  const HERO_ART = {
    gta: () => `
      <defs>
        <linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c57a8"/><stop offset=".3" stop-color="#9563b5"/><stop offset=".55" stop-color="#e57aa7"/><stop offset=".78" stop-color="#f7a073"/><stop offset="1" stop-color="#fcc98a"/></linearGradient>
        <radialGradient id="vglow" cx=".62" cy=".78" r=".45"><stop offset="0" stop-color="#ffe1a6" stop-opacity=".95"/><stop offset="1" stop-color="#ffe1a6" stop-opacity="0"/></radialGradient>
        <linearGradient id="vroad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a83c4"/><stop offset="1" stop-color="#5a4888"/></linearGradient>
      </defs>
      <rect width="400" height="210" fill="url(#vsky)"/>
      <rect width="400" height="210" fill="url(#vglow)"/>
      <g fill="#fff" opacity=".18"><ellipse cx="90" cy="46" rx="70" ry="7"/><ellipse cx="300" cy="30" rx="60" ry="5"/><ellipse cx="220" cy="70" rx="44" ry="4"/></g>
      <g opacity=".55">${palm(150, 96, 0.5, false, '#b779a6')}${palm(196, 104, 0.42, true, '#b779a6')}</g>
      ${decoHotel(238, 104, 86, 72, '#e7d3f2', '#c3aee6', '#9f92d8')}${decoHotel(326, 118, 66, 58, '#f6d0df', '#e6b3cc', '#b29ad8')}
      <rect y="176" width="400" height="34" fill="url(#vroad)"/><rect y="174" width="400" height="4" fill="#c7b3e3"/>
      <g fill="#fff" opacity=".45">${[30, 110, 190, 270, 350].map((x) => `<rect x="${x}" y="194" width="34" height="2" rx="1"/>`).join('')}</g>
      ${palm(40, 54, 1.05, false, '#7a4a86')}${palm(98, 96, 0.68, false, '#8a5592')}${palm(372, 40, 1.12, true, '#7a4a86')}`,
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
        <linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07112b"/><stop offset=".38" stop-color="#1f2c5c"/><stop offset=".66" stop-color="#4b3a78"/><stop offset=".86" stop-color="#1d6a78"/><stop offset="1" stop-color="#0b2a33"/></linearGradient>
        <radialGradient id="tportal" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9fffb"/><stop offset=".35" stop-color="#5ff0e0" stop-opacity=".85"/><stop offset=".7" stop-color="#7a5cff" stop-opacity=".35"/><stop offset="1" stop-color="#7a5cff" stop-opacity="0"/></radialGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0e6d2"/><stop offset=".5" stop-color="#c8aa6e"/><stop offset="1" stop-color="#785a28"/></linearGradient>
        <linearGradient id="trock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f5a"/><stop offset="1" stop-color="#0d0a1a"/></linearGradient>
        <filter id="tblur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <rect width="400" height="210" fill="url(#tsky)"/>
      <g filter="url(#tblur)" fill="none" stroke-linecap="round">
        <path d="M-20 70C60 30 120 110 200 70S330 20 420 60" stroke="#ff7ac8" stroke-width="14" opacity=".45"/>
        <path d="M-20 100C80 70 140 140 230 96S350 60 420 92" stroke="#5ff0e0" stroke-width="10" opacity=".4"/>
      </g>
      ${starField(0.6)}
      <circle cx="200" cy="74" r="58" fill="url(#tportal)"/>
      <circle cx="200" cy="74" r="34" fill="none" stroke="url(#gold)" stroke-width="2.5"/>
      <circle cx="200" cy="74" r="40" fill="none" stroke="#c8aa6e" stroke-width="1" stroke-dasharray="2 6" opacity=".8"/>
      <path d="M70 150Q200 128 330 150L300 178Q200 196 100 178Z" fill="url(#trock)"/>
      <path d="M70 150Q200 128 330 150" fill="none" stroke="#5ff0e0" stroke-width="2" opacity=".8"/>
      <path d="M118 178L140 204M200 192L198 210M280 178L262 206" stroke="#0d0a1a" stroke-width="10" stroke-linecap="round"/>
      <g transform="translate(200 146) scale(1 .42)" fill="none" stroke="#c8aa6e" stroke-width="1.6">
        ${[-2, -1, 0, 1, 2].flatMap((c) => [-1, 0].map((r) => { const x = c * 46 + (r % 2 ? 23 : 0); const y = r * 40; return `<polygon points="${hex(x, y, 24)}" fill="#5ff0e01a" opacity="${Math.abs(c) < 2 ? 1 : 0.6}"/>`; })).join('')}
      </g>
      <g fill="#fff6d8">${[[60, 40], [340, 30], [300, 110], [120, 116], [250, 18]].map(([x, y]) => `<path transform="translate(${x} ${y})" d="M0-5L1.2-1.2 5 0 1.2 1.2 0 5-1.2 1.2-5 0-1.2-1.2Z"/>`).join('')}</g>
      <g stroke="url(#gold)" stroke-width="2.5" fill="none" opacity=".95"><path d="M0 14H150L162 4H238L250 14H400"/><path d="M196 4L200 0L204 4L200 8Z" fill="#c8aa6e"/></g>`,
    // ---- The Long Night ----
    booking: () => `
      <defs>
        <linearGradient id="bsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3440"/><stop offset=".6" stop-color="#5a6470"/><stop offset="1" stop-color="#c9b79c"/></linearGradient>
        <linearGradient id="bwall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9488"/><stop offset="1" stop-color="#6f6a61"/></linearGradient>
        <linearGradient id="bbeam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="400" height="210" fill="url(#bsky)"/>
      <path d="M78 52L330 20L330 44Z" fill="url(#bbeam)"/>
      <g fill="#3b3f45"><rect x="62" y="40" width="22" height="110"/><rect x="56" y="34" width="34" height="12"/><rect x="316" y="48" width="22" height="102"/><rect x="310" y="42" width="34" height="12"/></g>
      <circle cx="78" cy="44" r="4" fill="#fff6c8"/>
      <rect y="112" width="400" height="98" fill="url(#bwall)"/>
      <g stroke="#5c574f" stroke-width="1" opacity=".55">${Array.from({ length: 6 }, (_, r) => `<line x1="0" y1="${120 + r * 15}" x2="400" y2="${120 + r * 15}"/>`).join('')}${Array.from({ length: 22 }, (_, c) => `<line x1="${c * 19 + (c % 2) * 9}" y1="112" x2="${c * 19 + (c % 2) * 9}" y2="210"/>`).join('')}</g>
      <g fill="none" stroke="#2a2d31" stroke-width="1.4">${Array.from({ length: 20 }, (_, i) => `<path d="M${i * 21} 108l5 -6 5 6 5 -6 5 6"/>`).join('')}<line x1="0" y1="108" x2="400" y2="108"/></g>
      <g transform="translate(150 132)"><rect width="100" height="78" fill="#3a352f"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${6 + i * 10.5}" y="0" width="3.5" height="78" fill="#1c1a17"/>`).join('')}</g>
      <rect x="152" y="118" width="96" height="14" fill="#c8642a"/><text x="200" y="128.5" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" letter-spacing="2">SLAMMER STATE PEN</text>
      <g fill="#e2742f" opacity=".95">${[[40, 190], [92, 196], [300, 188], [352, 194]].map(([x, y]) => `<rect x="${x}" y="${y - 22}" width="10" height="22" rx="4"/><circle cx="${x + 5}" cy="${y - 27}" r="5" fill="#d9b48f"/>`).join('')}</g>`,
    arkham: () => `
      <defs>
        <linearGradient id="ksky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0712"/><stop offset=".55" stop-color="#2a1640"/><stop offset="1" stop-color="#14301c"/></linearGradient>
        <radialGradient id="kmoon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e8f7d0"/><stop offset=".55" stop-color="#9fd18a" stop-opacity=".6"/><stop offset="1" stop-color="#9fd18a" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="400" height="210" fill="url(#ksky)"/>
      <circle cx="300" cy="50" r="46" fill="url(#kmoon)"/><circle cx="300" cy="50" r="20" fill="#eaf7d8"/>
      <path d="M120 0L108 40L122 44L96 96" fill="none" stroke="#b6ff7a" stroke-width="2.5" opacity=".85"/>
      <g fill="#0b0810">${[[240, 30], [262, 42], [218, 52], [340, 28]].map(([x, y]) => `<path transform="translate(${x} ${y})" d="M0 0q-6-6-12 0q4-1 6 3q2-4 6-3z M0 0q6-6 12 0q-4-1-6 3q-2-4-6-3z"/>`).join('')}</g>
      <path d="M0 210V170Q100 130 200 150T400 160V210Z" fill="#0d1a10"/>
      <g fill="#120c1c">
        <rect x="120" y="96" width="160" height="70"/><path d="M110 98L200 58L290 98Z"/>
        <rect x="186" y="34" width="28" height="40"/><path d="M182 36L200 14L218 36Z"/>
        <rect x="92" y="110" width="30" height="56"/><path d="M88 112L107 88L126 112Z"/><rect x="278" y="110" width="30" height="56"/><path d="M274 112L293 88L312 112Z"/>
      </g>
      <g fill="#b6ff7a" opacity=".9">${[[140, 110], [164, 110], [228, 110], [252, 110], [140, 132], [252, 132], [196, 48]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="12" rx="4"/>`).join('')}</g>
      <rect x="190" y="132" width="20" height="34" rx="10" fill="#2a1640"/>
      <text x="200" y="128" text-anchor="middle" font-size="8" font-weight="900" fill="#c084fc" letter-spacing="2">ARKHAM</text>
      <g fill="#1a2b14">${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 14}" y="${178 + (i % 3) * 3}" width="3" height="${32 - (i % 3) * 3}"/>`).join('')}</g>`,
    heist: () => `
      <defs>
        <linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0606"/><stop offset=".7" stop-color="#4a0d0d"/><stop offset="1" stop-color="#7a1414"/></linearGradient>
        <linearGradient id="hgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d27a"/><stop offset="1" stop-color="#9c6b1c"/></linearGradient>
      </defs>
      <rect width="400" height="210" fill="url(#hsky)"/>
      <g fill="#e9e1d2" opacity=".95"><rect x="70" y="70" width="260" height="100"/><path d="M60 72L200 30L340 72Z"/><rect x="60" y="166" width="280" height="10"/></g>
      <g fill="#c9bfae">${[90, 130, 170, 210, 250, 290].map((x) => `<rect x="${x}" y="78" width="14" height="88"/>`).join('')}</g>
      <text x="200" y="64" text-anchor="middle" font-size="9" font-weight="900" fill="#7a1414" letter-spacing="2">FÁBRICA NACIONAL DE MONEDA</text>
      ${[[96, 74], [304, 74]].map(([x, y]) => `<rect x="${x - 7}" y="${y}" width="14" height="60" fill="#b3121b"/>`).join('')}
      <g transform="translate(200 132)"><circle r="30" fill="url(#hgold)" stroke="#5a3a0c" stroke-width="3"/><circle r="20" fill="none" stroke="#5a3a0c" stroke-width="2"/>${[0, 60, 120, 180, 240, 300].map((a) => `<line x1="0" y1="0" x2="${(Math.cos((a * Math.PI) / 180) * 18).toFixed(1)}" y2="${(Math.sin((a * Math.PI) / 180) * 18).toFixed(1)}" stroke="#5a3a0c" stroke-width="3"/>`).join('')}<circle r="5" fill="#5a3a0c"/></g>
      <g fill="#7ec46b" opacity=".9">${Array.from({ length: 22 }, (_, i) => `<rect transform="rotate(${(i * 37) % 60 - 30} ${(i * 53) % 400} ${(i * 29) % 70})" x="${(i * 53) % 400}" y="${(i * 29) % 70}" width="14" height="7" rx="1"/>`).join('')}</g>
      <g transform="translate(40 150) scale(.7)"><path d="M0 0Q30 -40 60 0Q60 40 30 50Q0 40 0 0Z" fill="#f4efe6" stroke="#222" stroke-width="2"/><path d="M14 8q8 -6 14 0M34 8q8 -6 14 0" stroke="#222" stroke-width="3" fill="none"/><path d="M14 26q16 10 32 0q-4 -8 -16 -6q-12 -2 -16 6z" fill="#222"/><path d="M30 14v10" stroke="#222" stroke-width="2"/></g>
      <g transform="translate(320 150) scale(.7)"><path d="M0 0Q30 -40 60 0Q60 40 30 50Q0 40 0 0Z" fill="#f4efe6" stroke="#222" stroke-width="2"/><path d="M14 8q8 -6 14 0M34 8q8 -6 14 0" stroke="#222" stroke-width="3" fill="none"/><path d="M14 26q16 10 32 0q-4 -8 -16 -6q-12 -2 -16 6z" fill="#222"/></g>`,
    escape: () => `
      <defs>
        <linearGradient id="esky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030712"/><stop offset="1" stop-color="#14213d"/></linearGradient>
        <linearGradient id="ebeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8c4" stop-opacity=".6"/><stop offset="1" stop-color="#fff8c4" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="400" height="210" fill="url(#esky)"/>
      ${starField(0.6)}
      <circle cx="70" cy="40" r="16" fill="#f4f1de"/><circle cx="64" cy="36" r="16" fill="#030712" opacity=".9"/>
      <path d="M300 40L190 210L260 210Z" fill="url(#ebeam)"/><path d="M110 50L60 210L120 210Z" fill="url(#ebeam)" opacity=".6"/>
      <g fill="#0a0f1c"><rect x="292" y="34" width="18" height="100"/><rect x="284" y="28" width="34" height="12"/><rect x="104" y="44" width="14" height="90"/><rect x="98" y="38" width="26" height="10"/></g>
      <rect y="126" width="400" height="84" fill="#1c2333"/>
      <g stroke="#3a4560" stroke-width="1" opacity=".7">${Array.from({ length: 5 }, (_, r) => `<line x1="0" y1="${136 + r * 16}" x2="400" y2="${136 + r * 16}"/>`).join('')}</g>
      <g fill="none" stroke="#7a869e" stroke-width="1.2">${Array.from({ length: 26 }, (_, i) => `<circle cx="${i * 16}" cy="120" r="6"/>`).join('')}</g>
      <path d="M208 126v84" stroke="#0a0f1c" stroke-width="2"/>
      <g fill="#e2742f"><rect x="226" y="98" width="9" height="26" rx="4" transform="rotate(-12 230 110)"/><circle cx="229" cy="94" r="5" fill="#d9b48f"/></g>
      <path d="M232 92L238 60" stroke="#c9b28a" stroke-width="2"/><g fill="#c9b28a">${[0, 1, 2, 3, 4].map((i) => `<rect x="${234 + i * 0.8}" y="${86 - i * 7}" width="6" height="1.5"/>`).join('')}</g>`,
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
  const actId = () => (S ? S.acts?.[S.act]?.id : guest.act) || 'booking';
  const curAct = () => S?.acts?.[S.act] || null;
  // One-look lineup: no act changes, so nothing should talk about acts.
  const oneAct = () => (S?.acts?.length || 0) <= 1;
  // Mechanics follow the act's engine (gta, genshin, tft or amongus); looks follow the act itself.
  const eng = () => curAct()?.engine || actId();
  // The current act's word for something, e.g. W('rank', 'Adventure Rank').
  const W = (key, fallback) => curAct()?.words?.[key] ?? fallback;
  const hero = (thin) => `<div class="hero${thin ? ' thin' : ''}" aria-hidden="true">
    <svg viewBox="0 0 400 210" preserveAspectRatio="xMidYM${thin ? 'id' : 'ax'} slice">${(HERO_ART[actId()] || HERO_ART.booking)()}</svg>
  </div>`;

  // Money in the current act's currency: $20, ✦20, 🪙20, or 20 cr.
  const money = (n) => {
    const c = curAct()?.currency || {};
    return c.symbol ? `${c.symbol}${n}` : `${n} ${c.short || 'cr'}`;
  };
  const priceOf = (it) => {
    const t = team(S.me?.teamId);
    return eng() === 'tft' && t?.augment === 'hustler' ? Math.ceil(it.price * 0.75) : it.price;
  };
  // Cost and points of sending qty of a drink: a matching bundle, or straight per-drink rates (same as the server).
  const drinkQuote = (it, qty) => {
    const bundle = (it.bundles || []).find((b) => b.qty === qty);
    const cost = bundle ? bundle.cost : it.price * qty;
    return { cost: priceOf({ price: cost }), points: bundle ? bundle.points : (it.points || 0) * qty, bundle };
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
    while (box.children.length > 2) box.lastChild.remove();
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
        if (kind === 'player') toast(S?.me?.device ? 'Your block was taken over by another phone. Scan your card again to take it back.' : 'A host released you from the system. Book in again to rejoin.', 'error');
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
    if (kind === 'tv' && prev && S.introAt && S.introAt !== prev.introAt) playIntro();
    if (kind !== 'admin') actEvents(prev, S);
    render();
  }

  // ---------- Shot Cam: film your block's shots for the TV ----------
  // The camera lives outside the page so polling re-renders never interrupt a recording.
  const CLIP_SECONDS = 12;
  const CLIP_MAX = 60 * 1024 * 1024;
  const CLIP_UPLOAD_SECONDS = 30; // longest video you can pick from your camera roll
  const canFilm = () => !!(S?.settings?.clipsEnabled && S.me?.status === 'block');
  const cam = { el: null, stream: null, rec: null, chunks: [], blob: null, type: '', facing: 'environment', timers: [], url: null };
  const recType = () =>
    ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';

  function openCam() {
    closeCam();
    const mine = (S.clips || []).filter((c) => c.teamId === S.me.teamId);
    const el = document.createElement('div');
    el.className = 'cam';
    el.innerHTML = `<header class="cam-top"><button class="cam-x" data-cam="close" aria-label="Close">✕</button><b>🎥 Shot Cam</b><span>${h(teamName(S.me.teamId))} → the TV</span></header>
      <div class="cam-view"><video class="cam-live" muted playsinline autoplay></video><video class="cam-play" playsinline controls loop hidden></video><div class="cam-count" hidden></div><div class="cam-bar" hidden><i></i></div><p class="cam-msg" role="status"></p></div>
      <div class="cam-ctl">
        <div class="cam-shoot"><label class="cam-side">📁<span>Upload</span><input type="file" accept="video/*" hidden /></label><button class="cam-rec" data-cam="rec" aria-label="Record"></button><button class="cam-side" data-cam="flip">🔄<span>Flip</span></button></div>
        <div class="cam-send" hidden><input class="cam-cap" maxlength="80" placeholder="Caption for the TV (optional)" /><div class="row"><button class="btn ghost" data-cam="retake">Retake</button><button class="btn" data-cam="send">Send to the TV</button></div></div>
        <p class="cam-note">Up to ${CLIP_SECONDS} seconds. Get the whole block in shot.${mine.length ? ` Your block has ${plural(mine.filter((c) => c.status === 'live').length, 'clip')} on the TV${mine.some((c) => c.status === 'pending') ? ', more waiting for a host' : ''}.` : ''}</p>
      </div>`;
    document.body.append(el);
    cam.el = el;
    el.addEventListener('click', onCam);
    el.querySelector('input[type=file]').addEventListener('change', (e) => pickClip(e.target.files[0]));
    startPreview();
    checkCanClip();
  }

  // Ask the server up front, so nobody films a clip that can't be sent.
  async function checkCanClip() {
    try {
      const r = await fetch('/api/clip-token', { method: 'POST', headers: { ...creds(), 'content-type': 'application/json' }, body: '{"type":"check"}' });
      const res = await r.json();
      if (!cam.el) return;
      cam.mode = res.uploads;
      if (res.ok === false || res.uploads === 'off') {
        cam.el.classList.add('blocked');
        camMsg(res.error || 'Shot Cam isn’t set up yet: a host needs to connect a Vercel Blob store to the site.');
      }
    } catch {}
  }

  // Loads the Vercel Blob uploader the first time someone sends a clip.
  let blobLib = null;
  const loadBlobLib = () =>
    (blobLib ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/blob-upload.js';
      s.onload = () => resolve(window.BlobUpload);
      s.onerror = () => {
        blobLib = null;
        reject(new Error('load'));
      };
      document.head.append(s);
    }));
  const extOf = (type) => ({ 'video/quicktime': 'mov', 'video/webm': 'webm' })[type.split(';')[0]] || 'mp4';

  const camMsg = (text) => cam.el && (cam.el.querySelector('.cam-msg').textContent = text);
  const stopStream = () => {
    cam.stream?.getTracks().forEach((t) => t.stop());
    cam.stream = null;
  };

  async function startPreview() {
    stopStream();
    camMsg('');
    const video = { facingMode: cam.facing, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30, max: 30 } };
    try {
      cam.stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }).catch(() => navigator.mediaDevices.getUserMedia({ video }));
      if (!cam.el) return stopStream();
      cam.el.querySelector('.cam-live').srcObject = cam.stream;
    } catch {
      camMsg('No camera access. Allow the camera in your browser, or tap Upload to send a video you already took.');
    }
  }

  function startRecording() {
    if (!cam.stream || cam.rec) return;
    if (!window.MediaRecorder) return camMsg('This browser can’t record video. Tap Upload instead.');
    const count = cam.el.querySelector('.cam-count');
    count.hidden = false;
    [3, 2, 1].forEach((n, i) => cam.timers.push(setTimeout(() => (count.textContent = n), i * 700)));
    cam.timers.push(
      setTimeout(() => {
        count.hidden = true;
        cam.type = recType();
        cam.chunks = [];
        try {
          cam.rec = new MediaRecorder(cam.stream, { ...(cam.type && { mimeType: cam.type }), videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 64_000 });
        } catch {
          return camMsg('Recording failed to start. Tap Upload instead.');
        }
        cam.rec.ondataavailable = (e) => e.data.size && cam.chunks.push(e.data);
        cam.rec.onstop = () => review(new Blob(cam.chunks, { type: (cam.rec.mimeType || cam.type || 'video/webm').split(';')[0] }));
        cam.rec.start(250);
        cam.el.classList.add('recording');
        const bar = cam.el.querySelector('.cam-bar');
        bar.hidden = false;
        bar.firstChild.style.animationDuration = `${CLIP_SECONDS}s`;
        cam.timers.push(setTimeout(stopRecording, CLIP_SECONDS * 1000));
      }, 2100),
    );
  }

  function stopRecording() {
    if (cam.rec?.state === 'recording') cam.rec.stop();
    cam.el?.classList.remove('recording');
  }

  function review(blob) {
    if (!cam.el) return;
    cam.rec = null;
    cam.blob = blob;
    cam.el.querySelector('.cam-bar').hidden = true;
    if (blob.size > CLIP_MAX) return camMsg('That clip is too big. Try a shorter one.');
    stopStream();
    if (cam.url) URL.revokeObjectURL(cam.url);
    cam.url = URL.createObjectURL(blob);
    const play = cam.el.querySelector('.cam-play');
    play.src = cam.url;
    play.hidden = false;
    play.play().catch(() => {});
    cam.el.querySelector('.cam-live').hidden = true;
    cam.el.querySelector('.cam-shoot').hidden = true;
    cam.el.querySelector('.cam-send').hidden = false;
    camMsg('');
  }

  function pickClip(file) {
    if (!file) return;
    if (!/^video\//.test(file.type)) return camMsg('That isn’t a video.');
    if (file.size > CLIP_MAX) return camMsg('That video is too big (over 60 MB). Pick a shorter one, or record it here.');
    // Check the length before uploading anything.
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(probe.src);
      if (probe.duration > CLIP_UPLOAD_SECONDS + 1) return camMsg(`That video is ${Math.round(probe.duration)} seconds. Keep it under ${CLIP_UPLOAD_SECONDS}.`);
      review(file);
    };
    probe.onerror = () => review(file);
    probe.src = URL.createObjectURL(file);
  }

  async function sendClip() {
    if (!cam.blob) return;
    const btnEl = cam.el.querySelector('[data-cam=send]');
    const busy = (text) => {
      btnEl.disabled = !!text;
      btnEl.textContent = text || 'Send to the TV';
    };
    const caption = cam.el.querySelector('.cam-cap').value.trim();
    const type = (cam.blob.type || 'video/mp4').split(';')[0];
    busy('Sending…');
    let res;
    try {
      if (cam.mode === 'blob' || S.uploads === 'blob') {
        // Straight to Vercel Blob, then tell the game where it landed.
        const lib = await loadBlobLib();
        const out = await lib.upload(`clips/${S.me.id}.${extOf(type)}`, cam.blob, {
          access: 'public',
          handleUploadUrl: '/api/clip-token',
          clientPayload: JSON.stringify({ player: LS.get('sss_token') || '' }),
          contentType: type,
          multipart: cam.blob.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => cam.el && busy(`Sending… ${Math.round(percentage)}%`),
        });
        res = await act('clip', { url: out.url, type, caption });
        if (!res.ok) return busy(), camMsg(res.error);
      } else {
        const r = await fetch('/api/clip', {
          method: 'POST',
          headers: { ...creds(), 'content-type': type, 'x-clip-caption': encodeURIComponent(caption) },
          body: cam.blob,
        });
        res = await r.json().catch(() => ({ ok: false, error: r.status === 413 ? 'That video is too big. Keep it short.' : `The server said no (${r.status}). Try again.` }));
      }
    } catch (err) {
      console.error(err);
      res = { ok: false, error: err?.message === 'load' ? 'Couldn’t load the uploader. Check your signal and try again.' : 'The upload didn’t make it. Check your signal and try again.' };
    }
    if (!res.ok) {
      busy();
      return camMsg(res.error);
    }
    toast(res.result?.status === 'pending' ? '🎥 Sent! A host will okay it for the TV.' : '🎥 You’re on the TV!', 'ok');
    closeCam();
    poll();
  }

  function closeCam() {
    cam.timers.forEach(clearTimeout);
    cam.timers = [];
    if (cam.rec?.state === 'recording') {
      cam.rec.onstop = null;
      cam.rec.stop();
    }
    cam.rec = null;
    stopStream();
    if (cam.url) URL.revokeObjectURL(cam.url);
    cam.url = null;
    cam.blob = null;
    cam.el?.remove();
    cam.el = null;
  }

  function onCam(e) {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const what = b.dataset.cam;
    if (what === 'close') closeCam();
    if (what === 'rec') (cam.rec ? stopRecording() : startRecording());
    if (what === 'flip') {
      cam.facing = cam.facing === 'user' ? 'environment' : 'user';
      startPreview();
    }
    if (what === 'retake') {
      cam.el.querySelector('.cam-play').hidden = true;
      cam.el.querySelector('.cam-live').hidden = false;
      cam.el.querySelector('.cam-shoot').hidden = false;
      cam.el.querySelector('.cam-send').hidden = true;
      cam.blob = null;
      startPreview();
    }
    if (what === 'send') sendClip();
  }

  // ---------- TV: the Shot Cam reel ----------
  // One video element kept across re-renders and moved into each new slot, so playback never restarts.
  const reel = { el: null, cur: null, seen: new Set(), timer: null, primed: false };
  function syncReel() {
    const slot = document.getElementById('reel-slot');
    const clips = S?.clips || [];
    if (!slot || !clips.length) {
      if (reel.el) {
        reel.el.querySelector('video').pause();
        reel.el.remove();
      }
      reel.cur = null;
      return;
    }
    if (!reel.el) {
      reel.el = document.createElement('div');
      reel.el.className = 'reel';
      reel.el.innerHTML = '<video muted playsinline></video><span class="reel-new">NEW</span><div class="reel-cap"></div><div class="reel-dots"></div>';
      const v = reel.el.querySelector('video');
      v.addEventListener('ended', nextClip);
      v.addEventListener('error', () => setTimeout(nextClip, 1500));
    }
    if (reel.el.parentNode !== slot) slot.append(reel.el);
    const fresh = reel.primed ? clips.find((c) => !reel.seen.has(c.id)) : null;
    clips.forEach((c) => reel.seen.add(c.id));
    reel.primed = true;
    if (fresh) playClip(fresh, true);
    else if (!clips.some((c) => c.id === reel.cur)) playClip(clips[0]);
    reel.el.querySelector('.reel-dots').innerHTML = clips.slice(0, 20).map((c) => `<i class="${c.id === reel.cur ? 'on' : ''}"></i>`).join('');
  }
  function playClip(c, isNew = false) {
    const v = reel.el.querySelector('video');
    reel.cur = c.id;
    v.loop = (S.clips || []).length === 1;
    v.src = c.url;
    v.play().catch(() => {});
    const t = team(c.teamId);
    reel.el.querySelector('.reel-cap').innerHTML = `${t ? chip(t) : ''}<b>${h(c.caption || `${t ? t.name : 'Someone'} takes their shots`)}</b><small>filmed by ${h(c.playerName)} · ${time(c.ts)}</small>`;
    reel.el.classList.toggle('is-new', isNew);
    reel.el.querySelectorAll('.reel-dots i').forEach((d, i) => d.classList.toggle('on', S.clips[i]?.id === c.id));
    clearTimeout(reel.timer);
    if (!v.loop) reel.timer = setTimeout(nextClip, 30000); // a clip that never ends still moves on
  }
  function nextClip() {
    const clips = S?.clips || [];
    if (!reel.el || !clips.length) return;
    const i = clips.findIndex((c) => c.id === reel.cur);
    playClip(clips[(i + 1) % clips.length]);
  }

  // ---------- TV act intros: a short trailer between acts ----------
  // Browsers only allow sound after someone has clicked the page, so the TV asks once.
  let audio = null;
  const unlockAudio = () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
    } catch {}
  };
  function tone(freq, at, dur, type = 'sine', vol = 0.18, slideTo) {
    if (!audio || audio.state !== 'running') return;
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function hush(at, dur, vol = 0.25) {
    if (!audio || audio.state !== 'running') return;
    const len = Math.floor(audio.sampleRate * dur);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const f = audio.createBiquadFilter();
    const g = audio.createGain();
    f.type = 'highpass';
    f.frequency.value = 2500;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(audio.destination);
    src.start(audio.currentTime + at);
  }
  // A sound per scene type, voiced for each game.
  function sting(act, cue) {
    const boom = () => tone(90, 0, 0.9, 'sine', 0.5, 32);
    if (cue === 'title') {
      boom();
      const chord = { gta: [220, 277, 330, 440], genshin: [523, 659, 784, 1047], tft: [196, 247, 294, 392], amongus: [262, 311, 392], booking: [196, 233, 294], arkham: [220, 262, 311, 370], heist: [147, 175, 220, 262], escape: [110, 131, 165] }[act] || [220, 277, 330];
      chord.forEach((f, i) => tone(f, 0.05 + i * 0.04, 2.4, ['genshin', 'arkham'].includes(act) ? 'sine' : act === 'tft' ? 'square' : 'sawtooth', act === 'tft' ? 0.05 : 0.08));
      return;
    }
    if (cue === 'shh') return hush(0, 1.6, 0.3);
    if (cue === 'alarm') return [0, 0.45, 0.9].forEach((at) => tone(880, at, 0.35, 'square', 0.12, 660));
    if (act === 'genshin') return [784, 988, 1175].forEach((f, i) => tone(f, i * 0.09, 0.9, 'sine', 0.12));
    if (act === 'arkham') return [523, 494, 466].forEach((f, i) => tone(f, i * 0.12, 0.5, 'triangle', 0.12));
    if (act === 'tft') {
      tone(147, 0, 0.5, 'square', 0.08);
      return boom();
    }
    if (act === 'amongus' || act === 'escape') return tone(330, 0, 0.25, 'triangle', 0.15, 220);
    boom();
    tone(110, 0, 0.35, 'sawtooth', 0.12);
  }

  // Each act's trailer, built from its own art, words and tonight's blocks.
  function introScenes(a) {
    const top = standings().slice(0, 4).map((t) => t.name);
    const party = S.settings.partyName;
    const starring = (label = 'Starring') => ({ ms: 2600, cls: 'i-starring', html: `<small>${label}</small>${(top.length ? top : ['Every inmate in the building']).map((n) => `<b>${h(n)}</b>`).join('')}` });
    const words = (list, cls = '') => list.map((w) => ({ ms: 1150, cls: `i-word ${cls}`, cue: 'hit', html: `<b>${h(w)}</b>` }));
    const features = (list) => ({ ms: 4200, cls: 'i-features', cue: 'hit', html: list.map(([icon, title, sub], i) => `<div style="--d:${i * 0.45}s"><span>${icon}</span><b>${h(title)}</b><small>${h(sub)}</small></div>`).join('') });
    const art = (cap) => ({ ms: 3400, cls: 'i-art', cue: 'hit', html: `${hero()}<div class="i-cap">${h(cap)}</div>` });
    const title = (extra) => ({
      ms: 4200, cls: 'i-title', cue: 'title',
      html: `${oneAct() ? '' : `<span class="i-act">Act ${a.numeral}</span>`}<h1 class="i-logo">${h(a.name)}</h1><p class="i-party">${h(party)}</p><p class="i-cta">${h(extra)}</p>`,
    });
    const rating = (descriptors) => ({
      ms: 3000, cls: 'i-rating',
      html: `<div class="i-box"><b>D</b><small>Drinking</small></div><div class="i-desc"><b>Rated D for Drinking</b>${descriptors.map((d) => `<span>${h(d)}</span>`).join('')}<em>Every drink can be swapped for water. Look after each other.</em></div>`,
    });
    const pre = (text) => ({ ms: 2200, cls: 'i-pre', html: `<span>${h(text)}</span>` });
    const scenes = {
      booking: [
        pre('Slammer State Penitentiary presents'),
        art('Day one. Lights out at 11.'),
        ...words(['Strip.', 'Squat.', 'Smile.']),
        features([['🍜', 'Soups are money', 'Ramen buys everything in here'], ['🧼', 'Cell Toss', 'Raid a block, pocket their soups'], ['🗂️', 'Rap sheet', 'Owe drinks? Your stars go up']]),
        starring('Now booking'),
        title('Check your inmate tablet'),
        rating(['Alcohol Reference', 'Prison Food', 'Use of Snitches']),
      ],
      arkham: [
        { ms: 2400, cls: 'i-glitch', cue: 'title', html: '<b>HA. HA. HA.</b>' },
        art('Arkham Asylum. Visiting hours are over.'),
        ...words(['Draw.', 'Riddle.', 'Gang up.']),
        features([['🃏', 'Joker’s Wild', 'Royal flush on pity'], ['❓', 'Riddler’s Riddles', 'Four each, tokens for your gang'], ['🦇', 'Patron villains', 'Same villain, gang bonus']]),
        starring('Most dangerous gangs'),
        title('The inmates are running the asylum'),
        rating(['Clown Violence (Comic)', 'Riddles', 'Questionable Sanity']),
      ],
      heist: [
        pre('The Professor has a plan'),
        art('The Royal Mint. Day one of the heist.'),
        ...words(['No guns.', 'No victims.', 'All the money.']),
        features([['🎭', 'Heist roles', 'Berlin, Nairobi, Tokyo…'], ['🖨️', 'The printing press', '+1 € per 10 you save'], ['🔥', 'Heist streaks', 'Win in a row, get paid']]),
        starring('The crew'),
        title('Bella ciao'),
        rating(['Masks', 'Printing Money', 'Elaborate Plans']),
      ],
      escape: [
        { ms: 2600, cls: 'i-search', cue: 'shh', html: '<b>LIGHTS OUT</b>' },
        { ms: 3200, cls: 'i-space', html: `<div class="i-type">There’s a <em>rat</em> in every block</div>` },
        { ms: 1900, cls: 'i-meeting', cue: 'alarm', html: '<b>Lockdown</b>' },
        features([['🐀', 'Double the rats', 'Sabotage skims twice as much'], ['💰', 'Double bounty', 'Catch one, get paid twice'], ['🧱', 'Over the wall', 'The top block escapes']]),
        starring('Escape crews'),
        title('Trust no one'),
        rating(['Tunnelling', 'Betrayal', 'Spoons']),
      ],
      gta: [
        pre('Slammer Games presents'),
        art('Vice City, USA.'),
        ...words([`${S.teams.length || 'Every'} blocks.`, 'One night.', 'Zero rules.']),
        features([['🔫', 'Stick-Ups', 'Rob another block blind'], ['★', 'Wanted levels', 'Owe drinks? The heat is on'], ['✅', 'Mission Passed', 'Win a heat, get paid']]),
        starring(),
        title('Now playing on your phone'),
        rating(['Alcohol Reference', 'Strong Language', 'Use of Snitches']),
      ],
      genshin: [
        pre('Ad astra abyssosque'),
        art('A new journey begins, Traveler.'),
        ...words(['Wish.', 'Explore.', 'Resonate.']),
        features([['✨', 'Wish ×10', 'Guaranteed 5★ on pity'], ['📜', 'Daily Commissions', 'Primogems for your party'], ['🔥', 'Elemental Resonance', 'Find your Vision twin']]),
        starring('Featured parties'),
        title('Turn your phone sideways'),
        rating(['Gacha Mechanics', 'Losing the 50/50', 'Fantasy Violence (Mild)']),
      ],
      tft: [
        pre('The Convergence awaits'),
        art('Every board tells a story.'),
        ...words(['Econ.', 'Streak.', 'Augment.']),
        features([['🎁', 'Augments', 'One pick per block'], ['🪙', 'Interest', '+1 per 10 gold saved'], ['🔥', 'Streaks', 'Win or lose in a row, get paid']]),
        starring('Top of the ladder'),
        title('Top four or bust · turn your phone sideways'),
        rating(['Hextech Violence', 'In-Game Purchases', 'Rolling Down at Level 4']),
      ],
      amongus: [
        { ms: 2400, cls: 'i-shh', cue: 'shh', html: `${crewIcon({ id: S.players[0]?.id })}<b>SHHHHHHH!</b>` },
        { ms: 3200, cls: 'i-space', html: `<div class="i-type">There may be <em>Impostors</em> among us</div>` },
        { ms: 1900, cls: 'i-meeting', cue: 'alarm', html: '<b>Emergency Meeting</b>' },
        features([['🔪', 'Double sabotage', 'Impostors skim twice as much'], ['💰', 'Double bounty', 'Catch one, get paid twice'], ['🚀', 'Ejections', '... was not an Impostor']]),
        starring('Crewmates'),
        title('Turn your phone sideways · trust no one'),
        rating(['Suspicious Behaviour', 'Venting', 'Sus']),
      ],
    };
    return scenes[a.id] || [];
  }

  // Plays the current act's intro on the TV: the host's own video if one is set, otherwise the trailer.
  function playIntro() {
    document.querySelectorAll('.intro').forEach((x) => x.remove());
    const a = curAct();
    if (!a) return;
    const el = document.createElement('div');
    el.className = 'intro';
    el.innerHTML = '<div class="i-bar i-top"></div><div class="i-stage"></div><div class="i-bar i-bottom"></div><button class="i-skip">Skip ›</button>';
    document.body.append(el);
    const timers = [];
    const end = () => {
      timers.forEach(clearTimeout);
      el.classList.add('out');
      setTimeout(() => el.remove(), 700);
    };
    el.querySelector('.i-skip').addEventListener('click', end);
    const stage = el.querySelector('.i-stage');
    const link = S.settings.introVideos?.[a.id];
    if (link) {
      const yt = link.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
      if (yt) {
        stage.innerHTML = `<iframe class="i-video" src="https://www.youtube.com/embed/${yt[1]}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1" allow="autoplay; encrypted-media; fullscreen" title="Act intro"></iframe>`;
        timers.push(setTimeout(end, 120000));
      } else {
        const v = document.createElement('video');
        v.className = 'i-video';
        Object.assign(v, { src: link, autoplay: true, playsInline: true });
        v.addEventListener('ended', end);
        v.addEventListener('error', end);
        stage.append(v);
        v.play().catch(() => { v.muted = true; v.play().catch(end); });
        timers.push(setTimeout(end, 180000));
      }
      return;
    }
    let at = 0;
    for (const sc of introScenes(a)) {
      timers.push(setTimeout(() => {
        stage.innerHTML = `<div class="i-scene ${sc.cls}">${sc.html}</div>`;
        if (sc.cue) sting(a.id, sc.cue);
      }, at));
      at += sc.ms;
    }
    timers.push(setTimeout(end, at));
  }

  // Big moments every screen (phones and the TV) shows: a new act, Among Us meetings and ejections.
  function actEvents(prev, next) {
    if (!prev) return;
    const a = next.acts[next.act];
    if (prev.acts?.[prev.act]?.id !== a.id) {
      if (kind === 'player') ui.tab = a.engine === 'tft' && !a.words ? 'yard' : 'menu';
      if (kind === 'tv') return; // the TV plays the act's intro instead
      splash('act', `Act ${a.numeral}`, `${a.emoji} ${a.name}`, 3600);
      buzz([200, 100, 200, 100, 400]);
      return;
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
    const r = next.round;
    const pr = prev.round;
    if (r && next.me.teamId) {
      if (r.phase === 'game' && (!pr || pr.number !== r.number) && !r.isGroup && next.me.status === 'block') {
        toast(`🎲 ${r.label}: ${r.gameName}. Pick your players!`, 'warn');
        buzz([150, 80, 150]);
      }
      if (r.phase === 'spending' && pr?.phase !== 'spending') toast('🛒 The shop is open. Send some drinks.', 'ok');
      const mine = r.serves?.find((s) => s.teamId === next.me.teamId);
      const was = pr?.serves?.find((s) => s.teamId === next.me.teamId);
      if (mine?.servedAt && !was?.servedAt) {
        toast('🍻 Your block is up at the bar!', 'warn');
        buzz([300, 100, 300, 100, 300]);
      }
    }
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
    if (a.status !== b.status) {
      const words = next.acts[next.act].splash;
      if (b.status === 'holding' && a.status === 'block') splash('wasted', words.kicked, 'Kicked to the Holding Cell');
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
        if (next.acts[next.act].engine === 'tft' && place) splash(place === 1 ? 'passed' : 'failed', `${ordinal(place)} place`, sub);
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
      if (b.status === 'holding') toast('🕳️ You’re in the Holding Cell. Earn your way onto a block!', 'warn');
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
    document.body.dataset.engine = eng();
    document.body.dataset.status = S?.me?.status || '';
    $app.innerHTML = page();

    if (kind === 'tv') syncReel();
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
          <h1 class="logo">${h(guest.partyName || 'Shifty Shen\'s Slammer')}</h1>
          <p class="tagline">${h(guest.tagline || '')}</p>
          ${guest.phoneMode === 'team' ? `<form data-form="claim" class="card booking">
            <label for="claim_code">Your block’s code</label>
            <input id="claim_code" name="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. KX7P" required />
            <button class="btn big" type="submit">Play for my block 📱</button>
            <p class="fine">One phone plays for each block. Scan the QR on your block’s card, or type the code printed on it. If someone else on your block already has it, this phone takes over.</p>
          </form>` : `<form data-form="join" class="card booking">
            <label for="join_name">Name for the booking sheet</label>
            <input id="join_name" name="name" maxlength="24" autocomplete="nickname" placeholder="e.g. Shen" required />
            <button class="btn big" type="submit">Book me in 🚔</button>
            <p class="fine">You’ll start in the Holding Cell with an inmate number and a charge until a host puts you on a block. Keep this tab open all night — it remembers you.</p>
          </form>`}
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
    const shell = TABLET_APPS[actId()] ? gtaPhone : { genshin: genshinPage, gta: gtaPhone, tft: tftClient, amongus: amongLobby }[eng()];
    if (shell) return shell();
    const me = S.me;
    const myTeam = team(me.teamId);
    return `
      <header class="top slim" ${myTeam && me.status === 'block' ? `style="border-bottom-color:${h(myTeam.color)}"` : ''}>
        <div class="top-row">
          <div class="who">
            ${me.device
              ? `<span class="who-name">${h(myTeam?.name || 'Your block')}</span><span class="chip">📱 Block phone</span>`
              : `<span class="who-name">${h(me.name)}${me.isCaptain ? ' <span title="Shot Caller">👑</span>' : ''}</span>${statusChip(me)}`}
          </div>
          <div class="hud pills">
            ${myTeam ? `<span class="pill pts" title="${h(myTeam.name)} points">★ ${myTeam.points || 0}</span><span class="pill cr" title="${h(myTeam.name)} credits">${h(money(myTeam.budget))}</span>` : ''}
            <button class="pill board-btn" data-act="board-open" aria-label="Leaderboard">🏆</button>
          </div>
        </div>
      </header>
      ${phaseBanner()}
      ${announcement()}
      <main class="content flat">${phoneScreen()}</main>
      ${ui.sheet ? buySheet() : ui.board ? boardSheet() : ''}
      ${actUnseen() ? actModal() : briefingUnseen() ? briefingModal() : ''}`;
  }

  // ---------- the phone: one screen, only what this inmate needs right now ----------
  const flat = () => eng() === 'pixel';

  function phoneScreen() {
    const me = S.me;
    const myTeam = team(me.teamId);
    const r = S.round;
    const live = S.games.find((g) => g.status === 'live');
    const onBlock = me.status === 'block' && myTeam;
    // Only when it's time to buy: the round's Spending phase, or between rounds if a host opens it.
    const shopTime = S.settings.shopOpen !== false && onBlock && !!r && ['spending', 'done'].includes(r.phase);
    const between = !r || r.phase === 'done';
    const todos = me.device ? [] : todoItems();
    return `
      ${S.winner ? winnerCard() : ''}
      ${me.device ? blockOwedCard(myTeam) : ''}
      ${me.status !== 'block' ? lockupRules(me.status, live) : ''}
      ${incomingAlerts()}
      ${rewardPicker()}
      ${myTeam && !me.device ? requestsCard(myTeam) : ''}
      ${todos.length ? `<section class="card todo-card"><h3>📌 To do</h3><ul class="todos">${todos.join('')}</ul></section>` : ''}
      ${roundCard()}
      ${matchCard()}
      ${shopTime ? `<h3 class="section-h">🛒 The shop is open</h3>${shopTab()}` : ''}
      ${onBlock && (shopTime || between) ? blockExtras(myTeam) : ''}
      ${onBlock && between ? blockSummary(myTeam) : ''}
      ${me.status === 'holding' ? holdingRoster() : ''}
      ${!r && !shopTime && !todos.length ? '<section class="card center"><div class="mega">⏳</div><h2>Waiting for the first round</h2><p class="fine">Keep this page open. It changes by itself when it’s your turn to do something.</p></section>' : ''}`;
  }

  // A block phone: who on the block owes penalty drinks or a dare (hosts tick them off).
  function blockOwedCard(myTeam) {
    if (!myTeam) return '';
    const rows = blockmates(myTeam.id)
      .map((p) => {
        const dares = (p.sentences || []).filter((x) => x.status === 'open').length;
        return p.drinksOwed || dares ? `<li><b>${h(p.name)}</b> ${p.drinksOwed ? `🍺×${p.drinksOwed}` : ''}${dares ? ` ⚖️ ${plural(dares, 'dare')}` : ''}</li>` : '';
      })
      .join('');
    return rows ? `<section class="card todo-card"><h3>📌 Owed by your block</h3><ul class="roster">${rows}</ul><p class="fine">${h(S.settings.houseRules)} The hosts tick these off.</p></section>` : '';
  }

  // Between rounds: your block at a glance.
  function blockSummary(myTeam) {
    const members = blockmates(myTeam.id);
    return `<section class="card cell-head block-banner" style="--c:${h(myTeam.color)}">
      <div class="eyebrow">Your block · ${ordinal(rankOf(myTeam.id))} of ${S.teams.length}</div>
      <h2>${h(myTeam.name)}${nick(myTeam)}</h2>
      ${myTeam.motto ? `<p class="motto">${h(myTeam.motto)}</p>` : ''}
      <div class="stats"><div><b>${h(money(myTeam.budget))}</b><span>credits</span></div><div><b>★${myTeam.points || 0}</b><span>points</span></div><div><b>🔥${myTeam.drinkStreak || 0}</b><span>streak</span></div></div>
      <p class="fine">Streak = drinks finished in time in a row: each time you finish at the bar you get ${h(money(S.settings.streakCredits || 5))} × your streak.</p>
      <p class="mates">${members.map((p) => `${p.isCaptain ? '👑' : ''}${h(p.name)}${p.id === S.me.id ? ' (you)' : ''}`).join(' · ')}</p>
      ${renameControls(myTeam, members)}
    </section>`;
  }

  function boardSheet() {
    return `<div class="sheet-bg" data-act="board-close"></div>
      <div class="sheet board-sheet ${enter('board')}" role="dialog" aria-label="Leaderboard">
        <div class="row"><h2 class="grow">🏆 Leaderboard</h2><button class="btn ghost sm" data-act="board-close">Close</button></div>
        ${boardTab()}
      </div>`;
  }

  // ---------- Act II: Genshin Impact, played in landscape ----------
  const PRIMO = '<svg class="gi-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#f4ecd6" stroke="#b5925a" stroke-width="1"/><path d="M12 6l1.6 4.4L18 12l-4.4 1.6L12 18l-1.6-4.4L6 12l4.4-1.6z" fill="#9fd3f5"/></svg>';
  const FATE = '<svg class="gi-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#c98ad8" stroke="#f6e7b4" stroke-width="1.5"/><path d="M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z" fill="#fff6dc"/></svg>';
  const tabDot = (k) =>
    (k === 'rap' && needsBriefing()) || (k === 'yard' && ui.tab !== 'yard' && todoItems().length) || (k === 'cell' && (myIncoming().length || actionableRequests().length)) ? '<i class="dot"></i>' : '';

  const VISION_GLYPH = { Pyro: '🔥', Hydro: '💧', Anemo: '🌀', Electro: '⚡', Dendro: '🌿', Cryo: '❄️', Geo: '🪨' };
  const arOf = (p) => Math.min(60, 1 + Math.floor((p.adventureExp || 0) / 200));
  const visionColor = (p) => S.visions?.[p.vision]?.color || '#d3bc8e';
  const visionGlyph = (v) => S.visions?.[v]?.emoji || VISION_GLYPH[v] || '✦';
  const visionLabel = (v) => S.visions?.[v]?.label || v || '';
  const avatar = (p, cls = '') =>
    `<span class="gi-avatar ${cls}" style="--vc:${visionColor(p)}">${h((p.name || '?').trim()[0].toUpperCase())}<i title="${h(visionLabel(p.vision))}">${visionGlyph(p.vision)}</i></span>`;
  // Elemental Resonance: two or more of one Vision among a block's active members.
  const resonanceOf = (teamId) => {
    const counts = {};
    for (const m of blockmates(teamId)) counts[m.vision] = (counts[m.vision] || 0) + 1;
    return Object.keys(counts).filter((v) => counts[v] >= 2);
  };

  // The Genshin act's screens, in Paimon Menu order.
  function giScreens() {
    const me = S.me;
    return [
      ['yard', '📜', 'Adventurer Handbook', handbookTab],
      ['wish', '✨', 'Wish', wishTab],
      ['shop', '🛍️', 'Paimon’s Bargains', shopTab],
      ['cell', me.status === 'block' ? '👥' : '🕳️', me.status === 'block' ? 'Party Setup' : 'Holding Cell', cellTab],
      ['events', '🎪', 'Events', eventsTab],
      ['rap', '📖', 'Archive', rapTab],
      ['board', '🏆', 'Leaderboard', boardTab],
      ['mail', '✉️', 'Mail', mailTab],
      ['cam', '📷', 'Camera', null],
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
        <main class="gi-main">${phaseBanner()}${announcement()}${incomingAlerts()}${cur[0] === 'yard' ? '' : drinkCard()}${cur[3]()}</main>`);
    }
    const signature = myTeam?.motto || (myTeam ? `Adventurer of ${myTeam.name}${myTeam.nickname ? ` “${myTeam.nickname}”` : ''}` : 'Waiting in the Holding Cell…');
    return shell(`<section class="gi-profile" style="--vc:${visionColor(me)}">
        <div class="gi-namecard">
          ${avatar(me, 'big')}
          <div class="gi-who"><b>${h(me.name)}${me.isCaptain ? ' 👑' : ''}</b><small>${h(signature)}</small></div>
        </div>
        <div class="gi-stats">
          <div class="gi-ar"><span>${h(W('rank', 'Adventure Rank'))}</span><b>${ar}</b></div>
          <div class="gi-exp"><i style="width:${ar >= 60 ? 100 : (into / 200) * 100}%"></i><small>${ar >= 60 ? 'MAX' : `${into}/200`}</small></div>
          <div class="gi-row"><span>World Level</span><b>${Math.min(8, Math.floor(ar / 5))}</b></div>
          <div class="gi-row"><span>${h(W('vision', 'Vision'))}</span><b>${visionGlyph(me.vision)} ${h(visionLabel(me.vision))}</b></div>
          <div class="gi-row"><span>Party</span><b>${myTeam ? chip(myTeam) : statusChip(me)}</b></div>
        </div>
        <div class="gi-uid">UID: 8${h(me.inmateNo)}26</div>
      </section>
      <section class="gi-menu">
        <div class="gi-menu-top"><span class="gi-paimon">✦ Paimon Menu</span>${giPills(myTeam)}</div>
        <div class="gi-notices">${phaseBanner()}${announcement()}${incomingAlerts()}</div>
        <div class="gi-grid">${screens.map(([k, icon, label]) => `<button class="gi-app" data-act="${k === 'cam' ? 'shotcam' : 'tab'}" data-tab="${k}"><span class="gi-app-i">${icon}${giDot(k)}</span><span>${h(label)}</span></button>`).join('')}</div>
      </section>`);
  }

  // Landscape acts show this to phones held upright.
  const rotatePrompt = () => `<div class="rot" role="alert"><div class="rot-phone"></div><b>Rotate your device</b><small>Act ${curAct().numeral} · ${h(curAct().name)} is played in landscape, like the game.</small></div>`;
  const sheetsAndModals = () => `${ui.sheet ? buySheet() : ''}${actUnseen() ? actModal() : briefingUnseen() ? briefingModal() : ''}`;
  const alerts = (withDrinks = true) => `${phaseBanner()}${announcement()}${incomingAlerts()}${withDrinks ? drinkCard() : ''}`;
  const dotFor = (k) => {
    const me = S.me;
    return tabDot(k) || (k === 'yard' && (todoItems().length || (eng() === 'genshin' && (me.commissions || []).some((c) => !c.done)))) || (k === 'events' && !!liveGame() && briefingUnseen());
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
      ['cam', '📸', 'Snapmatic', '#e2245c', null],
    ];
  }

  // The Long Night: one inmate tablet all night, re-skinned and re-stocked with apps each act.
  const ledgerApp = () => bankApp();
  const TABLET_APPS = {
    booking: {
      carrier: 'Slammer Pen · Inmate Tablet', crew: 'Block', bank: 'Trust fund', hint: 'Lights out at 11. Behave.',
      apps: () => [
        ['yard', '📨', 'Messages', '#c8642a', () => `${todoCard()}${matchCard()}`],
        ['events', '📋', 'Yard Schedule', '#5b6b7c', eventsTab],
        ['shop', '🛒', 'Commissary', '#d48a1d', shopTab],
        ['cell', '🔐', 'My Block', '#8a5a3c', cellTab],
        ['bank', '🍜', 'Trust Account', '#7a8f3a', ledgerApp],
        ['rap', '🗂️', 'Rap Sheet', '#a8322d', rapTab],
        ['board', '📊', 'Standings', '#3d5a80', boardTab],
        ['mail', '📢', 'Yard Talk', '#6b4f8a', mailTab],
        ['cam', '📸', 'Visitation Cam', '#2f7f7a', null],
      ],
    },
    arkham: {
      carrier: 'Arkham Asylum · Patient Terminal', crew: 'Gang', bank: 'Stash', hint: 'Ha. Ha. Ha.',
      apps: () => [
        ['yard', '📁', W('menu', 'Patient File'), '#3e7a3a', handbookTab],
        ['wish', '🃏', 'Joker’s Wild', '#7b2fbf', wishTab],
        ['shop', '🛒', 'Commissary', '#4f5d73', shopTab],
        ['cell', '🦇', W('party', 'Your Gang'), '#2d6a4f', cellTab],
        ['events', '🩺', 'Ward Rounds', '#5b7a8c', eventsTab],
        ['rap', '🗂️', 'Case Notes', '#8a2c4b', rapTab],
        ['board', '☠️', 'Threat Board', '#3a3a5c', boardTab],
        ['mail', '📻', 'Intercom', '#6b5a2f', mailTab],
        ['cam', '📹', 'Security Cam', '#1f6f6a', null],
      ],
    },
    heist: {
      carrier: 'The Professor · Burner', crew: 'Crew', bank: 'The Vault', hint: 'Nobody gets hurt.',
      apps: () => [
        ['yard', '🗺️', 'The Plan', '#b3121b', () => `${augmentCard()}${todoCard()}${matchCard()}`],
        ['events', '⏱️', 'Heist Schedule', '#3a3a3a', eventsTab],
        ['shop', '💼', 'Black Market', '#7a1016', shopTab],
        ['cell', '🎭', 'The Crew', '#8c1c13', cellTab],
        ['bank', '🏦', 'The Vault', '#a37a1c', ledgerApp],
        ['rap', '📂', 'Dossier', '#4a4a4a', rapTab],
        ['board', '💶', 'Most Wanted', '#5c1010', boardTab],
        ['mail', '📻', 'Radio', '#2f3f4f', mailTab],
        ['cam', '🎥', 'Inside Cam', '#1d1d1d', null],
      ],
    },
    escape: {
      carrier: 'Smuggled phone · no signal', crew: 'Cell', bank: 'Stash', hint: 'Keep your head down.',
      apps: () => [
        ['yard', '🗺️', W('task', 'Escape plan'), '#c9a227', () => `${todoCard()}${matchCard()}`],
        ['events', '🕰️', 'Guard Rota', '#3b4a6b', eventsTab],
        ['shop', '📦', 'Contraband', '#6b4a2b', shopTab],
        ['cell', '⛓️', 'Cellmates', '#4a4f5c', cellTab],
        ['rap', '🐀', 'Rap Sheet', '#8a1c1c', rapTab],
        ['board', '🏁', 'Escape Board', '#2d4f3a', boardTab],
        ['mail', '🤫', 'Whispers', '#3a3a5a', mailTab],
        ['cam', '📹', 'Guard Cams', '#1f2f3f', null],
        ['bank', '🪙', 'Stash', '#7a6a2b', ledgerApp],
      ],
    },
  };

  function gtaPhone() {
    const me = S.me;
    const t = team(me.teamId);
    const tablet = TABLET_APPS[actId()];
    const apps = tablet ? tablet.apps() : gtaApps();
    const cur = apps.find((a) => a[0] === ui.tab);
    const status = `<div class="ph-status"><span class="ph-clock">${clock()}</span><span class="ph-carrier">${h(tablet?.carrier || 'Vice City · iFruit')}</span><span>▂▄▆█ 5G 🔋</span></div>`;
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
        <span class="ph-rank" title="${h(tablet ? 'Inmate number' : 'Rank')}">${tablet ? `<small>#</small>${h(String(me.inmateNo).slice(-3))}` : arOf(me)}</span>
        <div class="ph-id"><b>${h(me.name)}${me.isCaptain ? ' 👑' : ''}</b><small>${t ? `${h(tablet?.crew || 'Crew')}: ${h(t.name)}${t.nickname ? ` “${h(t.nickname)}”` : ''}` : statusChip(me)}</small>${eng() === 'gta' ? wantedStars(me) : hudExtra(me, t)}</div>
        <div class="ph-money">${t ? `<b>${h(money(t.budget))}</b><small>${h(tablet?.bank || 'Bank')} ${h(money(t.earned))}</small>` : ''}</div>
      </section>
      <div class="ph-notices">${alerts()}</div>
      <div class="ph-grid">${apps.map(([k, icon, label, color]) => `<button class="ph-app" data-act="${k === 'cam' ? 'shotcam' : 'tab'}" data-tab="${k}" style="--ac:${color}"><span class="ph-icon">${icon}${dotFor(k) ? '<i class="dot"></i>' : ''}</span><span>${h(label)}</span></button>`).join('')}</div>
      <p class="ph-hint">${n >= 3 && eng() === 'gta' ? '★ Lose the heat: serve your time.' : h(tablet?.hint || 'Tap an app.')}</p>
      ${sheetsAndModals()}</div>`;
  }

  // ---------- Act III: TFT, played in the League client ----------
  const RANKS = ['Challenger', 'Grandmaster', 'Master', 'Diamond', 'Emerald', 'Platinum', 'Gold', 'Silver', 'Bronze', 'Iron'];
  const rankName = (t) => (t ? RANKS[Math.min(RANKS.length - 1, Math.round(((rankOf(t.id) - 1) / Math.max(1, S.teams.length - 1)) * 6))] : 'Unranked');
  function socialStatus(p) {
    if (p.status === 'holding') return ['away', 'In Queue (Holding)'];
    const g = liveGame();
    const heat = g?.heats?.find((x) => x.status === 'live');
    if (g && (!heat || heat.teamIds.includes(p.teamId))) return ['game', `In Game: ${g.name}`];
    return ['online', 'In Lobby'];
  }
  // The client's featured-set banner on Home.
  function tftBanner(t) {
    const live = liveGame();
    return `<section class="lc-banner">
      ${hero(true)}
      <div class="lc-banner-copy">
        <span class="lc-eyebrow">Teamfight Tactics · Set: The Slammer</span>
        <h2>Convergence</h2>
        <p>${live ? `Now playing: ${h(live.name)}.` : 'Econ, streak, augment. Top four or bust.'}${t ? ` ${h(t.name)} is ${h(rankName(t))}.` : ''}</p>
        <button class="btn" data-act="tab" data-tab="events">${live ? 'Join game' : 'View schedule'}</button>
      </div>
    </section>`;
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
        <span class="lc-crest" aria-hidden="true">♟</span>
        <button class="lc-play ${ui.tab === 'events' ? 'on' : ''}" data-act="tab" data-tab="events">PLAY${dotFor('events') ? '<i class="dot"></i>' : ''}</button>
        <nav class="lc-nav">${tabs.map(([k, label]) => `<button data-act="tab" data-tab="${k}" class="${cur[0] === k ? 'on' : ''}">${label}${dotFor(k) ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
        <div class="lc-cur">${canFilm() ? '<button class="lc-cam" data-act="shotcam">🎥 Clip</button>' : ''}${t ? `<span class="lc-streak">${t.augment ? `${S.augments[t.augment].emoji} ` : ''}${t.streak > 1 ? `🔥${t.streak}` : t.streak < -1 ? `💧${-t.streak}` : ''}</span><span class="lc-gold">🪙 ${t.budget}</span>` : ''}</div>
      </header>
      <main class="lc-main">${alerts()}${cur[0] === 'yard' ? tftBanner(t) : ''}${cur[2]()}</main>
      <aside class="lc-social">
        <div class="lc-me ${mcls}">${icon(me, true)}<span><b>${h(me.name)}<i class="lc-tag">#${h(t ? t.name.replace(/^Block\s*/i, '').slice(0, 5) || 'TFT' : 'HOLD')}</i></b><small>${h(mtext)}</small><em>${h(rankName(t))} · ${t ? h(t.name) : 'No party'}</em></span></div>
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
      ['rap', '🚨', 'Role'],
      ['board', '🏆', 'Stats'],
      ['mail', '💬', 'Chat'],
      ['cam', '📹', 'Cams'],
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
      <div class="au-floor">${crowd.map((p) => `<div class="au-crew ${p.id === me.id ? 'me' : ''}"><span class="au-name">${h(p.name)}</span>${crewIcon(p)}</div>`).join('')}</div>
      <nav class="au-btns">${screens.map(([k, icon, label]) => `<button data-act="${k === 'cam' ? 'shotcam' : 'tab'}" data-tab="${k}"><span class="au-bi">${icon}${dotFor(k) ? '<i class="dot"></i>' : ''}</span><span>${h(label)}</span></button>`).join('')}</nav>
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
        <h3>${h(W('commissions', 'Daily Commissions'))} <span class="gi-count">${done}/${list.length || 4}</span></h3>
        ${list.length ? `<div class="gi-comms">${list
          .map((c) => `<div class="gi-comm ${c.done ? 'done' : ''}">
            <span class="gi-comm-i">${c.done ? '✔' : '!'}</span>
            <div><b>${h(c.text)}</b><small>Rewards: ${currencyIcon()}${rw.primos}${res.length ? `+${res.length}` : ''} · ${rw.exp} EXP</small></div>
            ${c.done ? `<span class="gi-claimed">${h(W('complete', 'Completed'))}</span>` : `<button class="btn sm" data-act="commission" data-commission-id="${c.id}" data-confirm="Turn in: “${h(c.text)}”? Honour system.">${h(W('completeBtn', 'Complete'))}</button>`}
          </div>`)
          .join('')}</div>` : `<p class="empty">Nothing from ${h(W('guild', 'the Adventurers’ Guild'))} for you yet.</p>`}
        <p class="gi-guild">${me.commissionBonus ? `📜 Bonus claimed from ${h(W('guild', 'the Adventurers’ Guild'))}.` : `📜 Finish all four for a bonus from ${h(W('guild', 'the Adventurers’ Guild'))}: ${currencyIcon()}${rw.bonus.primos} · ${rw.bonus.exp} EXP${myTeam ? '' : ' (Primogems only go to adventurers in a party)'}.`}</p>
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
      <h3>${h(W('party', 'Party Setup'))}</h3>
      <div class="gi-lineup">${mates
        .map((p, i) => `<div class="gi-char ${p.id === S.me.id ? 'me' : ''}" style="--vc:${visionColor(p)}">
          <span class="gi-slot">${i + 1}</span>${avatar(p)}<b>${h(p.name)}${p.isCaptain ? ' 👑' : ''}</b><small>${W('rank') ? 'Lv' : 'AR'} ${arOf(p)} · ${h(visionLabel(p.vision))}</small></div>`)
        .join('')}</div>
      <p class="gi-res">${res.length ? `${h(W('resonance', 'Elemental Resonance'))}: ${res.map((v) => `<b>${visionGlyph(v)} ${h(S.visions[v].resonance)}</b>`).join(', ')}. Each commission pays ${PRIMO}+${res.length} extra.` : 'No Elemental Resonance. Two party members with the same Vision unlock one (and extra Primogems per commission).'}</p>
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
    const blocked = !t ? 'Only adventurers in a party can wish. Get bailed onto a block first.' : '';
    const ask = !blocked && willRequest();
    const wishBtn = (n) => `<button class="gi-wish" data-act="wish" data-count="${n}" ${blocked || t.budget < one * n ? 'disabled' : ''}>
        <small>${ask ? 'Ask the block: ' : ''}${h(W('draw', 'Wish'))} ×${n}</small><span>${drawIcon()} × ${n} <em>(${currencyIcon()}${one * n})</em></span></button>`;
    const history = (S.orders || []).filter((o) => o.warp && o.fromTeamId === t?.id).slice(0, 12);
    const panel =
      ui.wishPanel === 'details'
        ? `<section class="card gi-panel"><h3>Details</h3><p class="fine">Base rates: 5★ ${st.warp5}% · 4★ ${st.warp4}% · 3★ ${Math.max(0, 100 - st.warp5 - st.warp4)}%. Every ${st.warpPity}th wish without a 5★ is a guaranteed 5★. Prizes go to the whole party; drinks and sips go to whoever wished.</p>
            ${[5, 4, 3].map((r) => `<div class="gi-rate r${r}"><b>${'★'.repeat(r)}</b>${S.warpPrizes[r].map((x) => `<span>${h(x.emoji)} ${h(x.name)}: ${h(x.text)}</span>`).join('')}</div>`).join('')}</section>`
        : ui.wishPanel === 'history'
          ? `<section class="card gi-panel"><h3>Wish History</h3>${history.length ? `<ul class="roster">${history.flatMap((o) => (o.warps || [o.warp]).map((w) => `<li class="r${w.stars}"><b>${'★'.repeat(w.stars)}</b> ${h(w.emoji)} ${h(w.name)} <span class="fine">${h(o.buyerName)} · ${time(o.ts)}</span></li>`)).join('')}</ul>` : '<p class="empty">No wishes yet.</p>'}</section>`
          : '';
    return `<section class="gi-banner">
        <div class="gi-banner-art"><span class="gi-feat">${h(t ? t.name : 'The Slammer')}</span><span class="gi-sub">${h(W('bannerSub', 'Featured party'))}</span></div>
        <div class="gi-banner-info">
          <div class="gi-tag">${h(W('bannerTag', 'Event Wish'))}</div>
          <h2>${h(W('banner', 'Ballad in Shot Glasses'))}</h2>
          <p>${h(W('bannerCopy', `Wish for your party with ${curAct().currency.name}. Probability boosted for 5★ prizes!`))}</p>
          <p class="gi-pity">${drawIcon()} ${h(W('pity', 'Guaranteed 5★ within'))} <b>${left}</b> ${left === 1 ? h(W('draw', 'wish').toLowerCase()) : `${h(W('draw', 'wish').toLowerCase())}${W('draw') ? 's' : 'es'}`}.</p>
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
    el.innerHTML = `<div class="meteor"></div><div class="wish-res ${warps.length > 1 ? 'ten' : 'one'}">${warps.map(card).join('')}</div><div class="wish-by">${by ? `${h(by)} ${h(W('drew', 'wished'))} · ` : ''}tap to close</div>`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    el.addEventListener('click', close);
    document.body.append(el);
    setTimeout(close, warps.length > 1 ? 9000 : 6000);
  }

  // Currency and draw icons: Genshin's own artwork in Game Night, the act's emoji otherwise.
  const currencyIcon = () => (actId() === 'genshin' ? PRIMO : `<span class="cur-i">${h(curAct()?.currency.symbol || '◆')}</span>`);
  const drawIcon = () => (actId() === 'genshin' ? FATE : `<span class="cur-i">${h(curAct()?.itemSkin?.emoji || '✦')}</span>`);

  // Every phone gets the same briefing when a game goes live (or its rules change).
  const liveGame = () => S.games.find((g) => g.status === 'live') || null;
  const briefKey = (g) => `${g.id}:${g.rulesVersion || 1}`;
  const seenBriefs = new Set((LS.get('sss_brief') || '').split(',').filter(Boolean));
  const briefingUnseen = () => {
    const g = liveGame();
    if (needsPick()) return false; // don't eat the pick clock; the rules are in the round card
    if (S?.round?.phase === 'game' && S.round.play && !S.round.play.done) return false; // nor an app-run game's clock
    return !!g && !seenBriefs.has(briefKey(g));
  };
  // This phone's block still has to lock in players for the current round.
  const needsPick = () => {
    const r = S?.round;
    return !!(r && r.phase === 'game' && !r.revealedAt && !r.isGroup && S.me?.status === 'block' && !r.picks?.[S.me.teamId]);
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
        <div class="eyebrow">${oneAct() ? '🗂️ Tonight’s house rules' : `🎬 Act ${a.numeral} · ${h(a.game)}`}</div>
        <h2>${a.emoji} ${h(a.name)}</h2>
        <p class="tagline">${h(a.tagline)}</p>
        <ul class="act-rules">${a.rules.map((r) => `<li>${h(r)}</li>`).join('')}</ul>
        <p class="fine">${oneAct() ? `Your block’s money is ${h(a.currency.name)}${a.currency.symbol ? ` (${h(a.currency.symbol)})` : ''}. Send drinks to other blocks to score points.` : `Money is now ${h(a.currency.name)}${a.currency.symbol ? ` (${h(a.currency.symbol)})` : ''}. Same balance, new name.`}</p>
        <button class="btn big" data-act="act-ok">Let’s go</button>
      </div>`;
  }

  // TFT act: the block picks one augment from three.
  function augmentCard() {
    if (eng() !== 'tft' || S.me.status !== 'block') return '';
    const t = team(S.me.teamId);
    if (!t) return '';
    if (t.augment) return '';
    if (!t.augmentOffer?.length) return '';
    const hasCaptain = blockmates(t.id).some((p) => p.isCaptain);
    const canPick = !hasCaptain || S.me.isCaptain;
    return `<section class="card augments">
      <div class="eyebrow">♟️ ${h(W('augmentPick', 'Pick your block’s augment'))}</div>
      <div class="aug-list">${t.augmentOffer
        .map((k) => {
          const a = S.augments[k];
          return `<button class="aug" data-act="augment" data-augment-id="${k}" ${canPick ? '' : 'disabled'} ${canPick ? `data-confirm="Lock in ${h(a.name)} for ${h(t.name)}? You can’t change it."` : ''}><span class="mega">${a.emoji}</span><b>${h(a.name)}</b><span class="fine">${h(a.desc)}</span></button>`;
        })
        .join('')}</div>
      <p class="fine">${canPick ? 'One pick for the whole block, and it lasts the act.' : 'Your Shot Caller 👑 makes the pick. Lobby them.'}</p>
    </section>`;
  }

  const needsBriefing = () => briefingUnseen();

  const myIncoming = () => (S.orders || []).filter(isIncomingFor(S));

  function phaseBanner() {
    const shut = S.settings.shopOpen === false && !((kind === 'player' || kind === 'tv') && S.round) ? '<div class="phase shop-shut">🔒 COMMISSARY CLOSED</div>' : '';
    return shut;
  }

  function announcement() {
    if (!S.announcement) return '';
    return `<div class="announce"><span class="mega">📣</span><div><div class="announce-t">${h(S.announcement.text)}</div><div class="fine">from ${h(S.announcement.byName || 'the Warden')} · ${time(S.announcement.ts)}</div></div></div>`;
  }

  function drinkCard() {
    const me = S.me;
    if (!me.drinksOwed || ui.tab === 'yard') return '';
    return `<div class="drinkcard">
      <div><div class="drink-n">🍺 ×${me.drinksOwed}</div><div class="fine">${plural(me.drinksOwed, 'penalty drink')} owed. ${h(S.settings.houseRules)}</div></div>
      <div class="row"><button class="btn" data-act="drank">Drank one ✅</button>${canFilm() ? '<button class="btn ghost" data-act="shotcam">🎥 Film it</button>' : ''}</div>
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

  // Standing + per-game rules for whoever is in the Holding Cell.
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
    return '';
  }

  function liveGameCard(live) {
    return `<section class="card live"><div class="eyebrow">🏁 Now in the yard</div><h2>${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}
      ${live.rules ? `<div class="rules">${h(live.rules)}</div>` : ''}
      ${live.holdingRule ? `<p class="rule">🕳️ Holding Cell: ${h(live.holdingRule)}</p>` : ''}
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
    const items = [];
    if (me.drinksOwed) {
      items.push(`<li class="todo drink"><span class="mega">🍺</span><div><b>${plural(me.drinksOwed, 'penalty drink')}</b><div class="fine">${h(S.settings.houseRules)}</div></div><div class="row"><button class="btn sm" data-act="drank">Drank one ✅</button>${canFilm() ? '<button class="btn ghost sm" data-act="shotcam" aria-label="Film it for the TV">🎥</button>' : ''}</div></li>`);
    }
    for (const x of (me.sentences || []).filter((y) => y.status === 'open')) {
      items.push(`<li class="todo sentence"><span class="mega">⚖️</span><div><b>${h(x.text)}</b><div class="fine">from ${h(x.from)}${x.reason ? ` · ${h(x.reason)}` : ''} · ${time(x.ts)}</div></div><button class="btn sm" data-act="sentence-done" data-sentence-id="${x.id}">Done ✅</button></li>`);
    }
    if (flat()) return items; // requests show as their own cards
    const reqs = actionableRequests();
    if (reqs.length) items.push(goItem('🛒', `${plural(reqs.length, 'purchase request')} waiting on you`, reqs.map((r) => `${r.emoji} ${r.name} (${r.byName})`).join(', '), 'cell'));
    return items;
  }

  function todoCard() {
    const items = todoItems();
    const done = (S.me.sentences || []).filter((x) => x.status === 'done').slice(0, 3);
    if (eng() === 'amongus') return taskList(items);
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

  // ---------- rounds (LeParty's game loop) ----------
  const PHASES = [['game', 'Game'], ['results', 'Results'], ['spending', 'Spending'], ['drinks', 'Drinks']];
  const fmtLeft = (ts) => {
    const s = Math.max(0, Math.ceil((ts - Date.now()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const until = (ts, cls = '') => `<b class="cd ${cls}" data-until="${ts}">${fmtLeft(ts)}</b>`;
  const names = (ids) => (ids || []).map((id) => h(player(id)?.name || '?')).join(', ');
  const placeName = (n) => ordinal(n);
  const roundTeams = () => S.teams.filter((t) => S.players.some((p) => p.teamId === t.id));

  // The four phases as a progress strip, current one lit.
  function phaseStrip(r) {
    const i = PHASES.findIndex(([k]) => k === r.phase);
    return `<ol class="phases">${PHASES.map(([k, label], n) => `<li class="${k === r.phase ? 'on' : n < i || r.phase === 'done' ? 'past' : ''}">${label}</li>`).join('')}</ol>`;
  }

  // Where a block stands at the bar this round.
  function serveOf(r, teamId) {
    const s = r?.serves?.find((x) => x.teamId === teamId);
    if (!s) return { state: 'safe' };
    if (s.finishedAt) return { state: s.missed ? 'missed' : 'done', s };
    if (s.servedAt) return { state: 'serving', s };
    const line = r.serves.filter((x) => !x.servedAt);
    return { state: 'queued', s, pos: line.indexOf(s) + 1 };
  }
  const SERVE_LABEL = { safe: 'Safe this round', queued: 'In line', serving: 'At the bar', done: 'Done', missed: 'Out of time' };

  // ---------- app-run games: Cold War, Trivia, Is Jason lying? ----------
  const APP_RUN = { coldwar: '🧊 Cold War', trivia: '❓ Trivia', lying: '🤥 Is Jason lying?', anime: '🎵 Anime openings' };
  const LETTERS = 'ABCD';
  const scoreList = (pl) => `<ol class="placings">${roundTeams()
    .map((t) => [t, pl.scores?.[t.id] || 0])
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<li style="--c:${h(t.color)}"><span class="rank">${n}</span><span class="b-n">${h(t.name)}</span><b>${plural(n, 'pt')}</b></li>`)
    .join('')}</ol>`;
  const lockedList = (ids, verb) => `<ul class="picks">${roundTeams().map((t) => `<li style="--c:${h(t.color)}">${chip(t)} <span>${ids.includes(t.id) ? `✅ ${verb}` : '…'}</span></li>`).join('')}</ul>`;

  function coldWarResult(pl, mine) {
    return `<ol class="placings cw">${pl.order
      .map((id) => `<li style="--c:${h(team(id)?.color || '#888')}" class="${id === mine ? 'mine' : ''}"><span class="rank">${pl.bids[id].n}${pl.bids[id].auto ? '*' : ''}</span><span class="b-n">${h(teamName(id))}</span><b>${pl.drinks[id] ? `drinks ${pl.drinks[id]}` : 'safe'}</b></li>`)
      .join('')}</ol>${Object.values(pl.bids).some((b) => b.auto) ? '<p class="fine">* didn’t pick in time, counted as 1.</p>' : ''}<p class="fine">The two lowest drink their own shots plus the two highest blocks’ shots. The shots join this round’s bar queue.</p>`;
  }

  function phonePlay(r, myTeam) {
    const pl = r.play;
    const mine = myTeam.id;
    if (pl.kind === 'coldwar') {
      if (pl.revealed) return `<p class="serve">${pl.drinks[mine] ? `🧊 Your block drinks <b>${pl.drinks[mine]}</b> at the bar.` : '🧊 Your block drinks nothing. Cold.'}</p>${coldWarResult(pl, mine)}`;
      const bid = pl.bids[mine];
      if (bid?.n) return `<p>Locked in: <b>${plural(bid.n, 'shot')}</b>. Waiting for the other blocks: ${until(pl.deadline)}.</p>`;
      return `<p><b>How many shots will your block take?</b> Pick in secret. The two lowest drink their own plus the two highest blocks’ shots. ${until(pl.deadline)} left.</p>
        <div class="num-grid">${Array.from({ length: pl.max }, (_, i) => i + 1).map((n) => `<button class="target" data-act="answer" data-value="${n}" data-confirm="Lock in ${n} shot${n === 1 ? '' : 's'}?">${n}</button>`).join('')}</div>`;
    }
    if (pl.kind === 'anime') {
      const head = `<p class="fine">Opening ${Math.max(1, pl.i + 1)} of ${pl.count} · your block has ${plural(pl.scores?.[mine] || 0, 'point')}</p>`;
      if (pl.state === 'ready') return `${head}<p class="serve">🎵 Get ready: the first opening is coming. Listen, then type the anime here.</p>`;
      if (pl.state === 'open') {
        return `${head}<p class="q">🎵 ${h(pl.label || `Opening ${pl.i + 1}`)}: what anime is it?</p>
          <form data-form="guess" class="guess"><input id="guess_box" name="guess" maxlength="80" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Type the anime" required /><button class="btn big">Guess</button></form>
          <p class="fine">${until(pl.deadline)} left. Only the first block to get it right scores. Guess as often as you like${pl.myTries ? ` (${`${pl.myTries} ${pl.myTries === 1 ? 'try' : 'tries'}`} so far)` : ''}.</p>`;
      }
      if (pl.state === 'won') return `${head}<p class="serve">${pl.winner === mine ? '✅ Your block got it first!' : `${h(teamName(pl.winner))} got it first.`} It was <b>${h(pl.answer)}</b>.</p>`;
      return `${head}<p class="serve">Nobody got it. It was <b>${h(pl.answer)}</b>.</p>`;
    }
    if (pl.kind === 'trivia') {
      const q = pl.question;
      const mineA = pl.answers?.[mine];
      const head = `<p class="fine">Question ${Math.max(1, pl.qi + 1)} of ${pl.count} · your block has ${plural(pl.scores?.[mine] || 0, 'point')}</p>`;
      if (!q || pl.state === 'ready') return `${head}<p class="serve">❓ Get ready: the first question is coming.</p>`;
      const opts = q.options
        .map((o, i) => {
          const right = q.answer === i;
          const cls = q.answer !== null ? (right ? 'right' : mineA?.choice === i ? 'wrong' : '') : mineA?.choice === i ? 'on' : '';
          return `<button class="answer ${cls}" ${pl.state !== 'asking' || mineA ? 'disabled' : ''} data-act="answer" data-value="${i}"><b>${LETTERS[i]}</b> ${h(o)}</button>`;
        })
        .join('');
      return `${head}<p class="q">${h(q.q)}</p><div class="answers">${opts}</div>
        ${pl.state === 'asking' ? (mineA ? `<p class="fine">Answer locked. ${until(pl.deadline)} left for the others.</p>` : `<p class="fine">${until(pl.deadline)} left. First tap counts.</p>`) : `<p class="serve">${mineA && mineA.choice === q.answer ? '✅ Right!' : mineA ? '❌ Wrong.' : '⏰ No answer.'} Next question soon.</p>`}`;
    }
    const v = pl.votes?.[mine];
    const head = `<p class="fine">Story ${Math.max(1, pl.n)} of ${pl.total} · your block has ${plural(pl.scores?.[mine] || 0, 'point')}</p>`;
    if (pl.state === 'ready') return `${head}<p class="serve">🤥 Listen to the story, then vote here.</p>`;
    if (pl.state === 'voting' && !v) return `${head}<p><b>Truth or lie?</b> ${until(pl.deadline)} left.</p><div class="answers two"><button class="answer" data-act="answer" data-value="truth">✅ Truth</button><button class="answer" data-act="answer" data-value="lie">🤥 Lie</button></div>`;
    if (pl.state === 'voting' || pl.state === 'closed') return `${head}<p class="serve">${v ? `You voted <b>${v.choice === 'truth' ? 'Truth' : 'Lie'}</b>.` : 'Voting’s closed.'} Waiting for the truth…</p>`;
    return `${head}<p class="serve">It was <b>${pl.truth === 'truth' ? 'the truth' : 'a lie'}</b>. ${v ? (v.choice === pl.truth ? '✅ You called it!' : '❌ Fooled you.') : '⏰ You didn’t vote.'}</p>`;
  }

  function tvPlay(r) {
    const pl = r.play;
    if (pl.kind === 'coldwar') {
      if (pl.revealed) return `<p class="tv-big">🧊 The numbers are in</p>${coldWarResult(pl)}`;
      return `<p class="tv-big">🧊 Every block picks its shots in secret: ${until(pl.deadline)}</p>${lockedList(Object.keys(pl.bids), 'locked in')}`;
    }
    if (pl.kind === 'anime') {
      if (pl.state === 'ready') return `<p class="tv-big">🎵 ${plural(pl.count, 'opening')}. Type the anime on your block’s phone: first right answer wins.</p>${scoreList(pl)}`;
      if (pl.state === 'open') return `<p class="tv-q">🎵 ${h(pl.label || `Opening ${pl.i + 1}`)}</p><p class="tv-big">Type the anime on your phone: ${until(pl.deadline)}</p>`;
      return `<p class="tv-q">🎵 ${pl.state === 'won' ? `${h(teamName(pl.winner))} got it!` : 'Nobody got it!'}</p><p class="tv-big">It was ${h(pl.answer)}</p>${scoreList(pl)}`;
    }
    if (pl.kind === 'trivia') {
      const q = pl.question;
      if (!q || pl.state === 'ready') return `<p class="tv-big">❓ ${plural(pl.count, 'question')}. Answer on your block’s phone.</p>${scoreList(pl)}`;
      return `<p class="fine">Question ${pl.qi + 1} of ${pl.count}${pl.state === 'asking' ? ` · ${until(pl.deadline)}` : ''}</p><p class="tv-q">${h(q.q)}</p>
        <div class="answers tv">${q.options.map((o, i) => `<div class="answer ${q.answer === i ? 'right' : ''}"><b>${LETTERS[i]}</b> ${h(o)}</div>`).join('')}</div>
        ${pl.state === 'asking' ? `<p class="fine">${plural(pl.answered.length, 'block')} answered</p>` : `<p class="fine">Got it: ${roundTeams().filter((t) => pl.answers[t.id]?.choice === q.answer).map((t) => h(t.name)).join(', ') || 'nobody'}</p>${scoreList(pl)}`}`;
    }
    if (pl.state === 'ready') return `<p class="tv-big">🤥 ${`${pl.total} ${pl.total === 1 ? 'story' : 'stories'}`}. Truth or lie? Vote on your block’s phone.</p>${scoreList(pl)}`;
    if (pl.state === 'voting') return `<p class="tv-big">🤥 Story ${pl.n}: truth or lie? ${until(pl.deadline)}</p>${lockedList(pl.voted, 'voted')}`;
    if (pl.state === 'closed') return `<p class="tv-big">🤥 Story ${pl.n}: the votes are in…</p>${lockedList(pl.voted, 'voted')}`;
    return `<p class="tv-big">🤥 Story ${pl.n}: it was ${pl.truth === 'truth' ? 'the TRUTH' : 'a LIE'}!</p><p class="fine">Called it: ${roundTeams().filter((t) => pl.votes[t.id]?.choice === pl.truth).map((t) => h(t.name)).join(', ') || 'nobody'}</p>${scoreList(pl)}`;
  }

  function hostPlay(r) {
    const pl = r.play;
    const teams = roundTeams();
    const byHand = btn('Enter results by hand instead', 'toResults', {}, 'ghost sm', 'Stop the app game and enter placings yourself?');
    const finish = btn('🏁 Finish: place the blocks and pay prizes', 'playFinish', {}, 'big', 'Finish this game, place the blocks by score and pay the prize money?');
    if (pl.kind === 'coldwar') {
      return `<section class="card"><h3>🧊 Cold War drinking</h3>
        ${pl.revealed ? `${coldWarResult(pl)}${finish}` : `<p>Blocks are picking 1–${pl.max} shots in secret: ${until(pl.deadline)} left.</p>
          <ul class="picks">${teams.map((t) => `<li style="--c:${h(t.color)}">${chip(t)} <span>${pl.bids[t.id] ? `✅ ${pl.bids[t.id].n}` : '…'}</span></li>`).join('')}</ul>
          <div class="row wrap">${btn('Reveal now', 'playReveal', {}, '', 'Reveal now? Blocks that haven’t picked count as 1.')}</div>`}
        <p class="fine">${byHand}</p></section>`;
    }
    if (pl.kind === 'anime') {
      const more = pl.i + 1 < pl.count;
      return `<section class="card"><h3>🎵 ${h(r.gameName)} · ${pl.i < 0 ? `${plural(pl.count, 'opening')} ready` : `opening ${pl.i + 1} of ${pl.count}`}</h3>
        ${pl.i >= 0 ? `<p class="q">${h(pl.label || `Opening ${pl.i + 1}`)}: <b>${h(pl.answer || '')}</b></p><p class="fine">Accepted: ${(pl.accepted || []).map(h).join(' · ')} (case, punctuation and small typos are forgiven)</p>` : ''}
        ${pl.state === 'open'
          ? `<p>Play it now. ${until(pl.deadline)} left · guesses so far: ${teams.map((t) => `${h(t.name)} ${pl.tries?.[t.id] || 0}`).join(' · ')}</p>
            <div class="row wrap">${btn('Nobody got it', 'playReveal', {}, 'ghost', 'Close this opening with no winner?')}${teams.map((t) => btn(`Give it to ${h(t.name)}`, 'playReveal', { teamId: t.id }, 'ghost sm', `Give opening ${pl.i + 1} to ${t.name}?`)).join('')}</div>`
          : `${pl.i >= 0 ? `<p class="serve">${pl.state === 'won' ? `✅ ${h(teamName(pl.winner))} got it first.` : '❌ Nobody got it.'}</p>` : ''}<div class="row wrap">${more ? btn(pl.i < 0 ? '▶ Play the first opening' : `▶ Play opening ${pl.i + 2}`, 'playNext', {}, 'big') : ''}${pl.i >= 0 ? finish : ''}</div>`}
        ${pl.i >= 0 ? scoreList(pl) : ''}
        <p class="fine">${byHand}</p></section>`;
    }
    if (pl.kind === 'trivia') {
      const q = pl.question;
      const more = pl.qi + 1 < pl.count;
      return `<section class="card"><h3>❓ ${h(r.gameName)} · ${pl.qi < 0 ? `${plural(pl.count, 'question')} ready` : `question ${pl.qi + 1} of ${pl.count}`}</h3>
        ${q ? `<p class="q">${h(q.q)}</p><ol class="opts">${q.options.map((o, i) => `<li class="${q.answer === i ? 'right' : ''}">${LETTERS[i]}. ${h(o)}${q.answer === i ? ' ✓' : ''}</li>`).join('')}</ol>` : ''}
        ${pl.state === 'asking' ? `<p>${plural(pl.answered.length, 'block')} of ${teams.length} answered · ${until(pl.deadline)} left</p>${btn('Reveal the answer now', 'playReveal', {}, '')}` : `<div class="row wrap">${more ? btn(pl.qi < 0 ? '▶ Ask the first question' : '▶ Next question', 'playNext', {}, 'big') : ''}${pl.qi >= 0 ? finish : ''}</div>`}
        ${pl.qi >= 0 ? scoreList(pl) : ''}
        <p class="fine">${byHand}</p></section>`;
    }
    const more = pl.n < pl.total;
    return `<section class="card"><h3>🤥 Is Jason lying? · ${pl.n ? `story ${pl.n} of ${pl.total}` : `${`${pl.total} ${pl.total === 1 ? 'story' : 'stories'}`}`}</h3>
      ${['voting', 'closed'].includes(pl.state) ? `<p>${pl.state === 'voting' ? `Voting: ${until(pl.deadline)} left · ` : 'Voting closed · '}${plural(pl.voted.length, 'block')} of ${teams.length} voted</p>
        <div class="row wrap">${btn('✅ It was the TRUTH', 'playReveal', { truth: 'truth' }, 'big')}${btn('🤥 It was a LIE', 'playReveal', { truth: 'lie' }, 'big')}</div>`
        : `<div class="row wrap">${more ? btn(pl.n ? `▶ Open the vote on story ${pl.n + 1}` : '▶ Open the vote on story 1', 'playNext', {}, 'big') : ''}${pl.n ? finish : ''}</div>`}
      ${pl.n ? scoreList(pl) : ''}
      <p class="fine">${byHand}</p></section>`;
  }

  // ---------- phone: the round card on Now ----------
  function roundCard() {
    const r = S.round;
    if (!r) return '';
    const me = S.me;
    const myTeam = team(me.teamId);
    const head = `<div class="eyebrow">${h(r.label)}${r.phase === 'done' ? ' · over' : ''}</div><h2>${h(r.gameName)}</h2>${r.actMechanics?.length ? `<p class="act-mech">⚙️ ${h(r.actName)}: ${r.actMechanics.map(h).join(', ')}</p>` : ''}${r.phase === 'done' ? '' : phaseStrip(r)}`;
    let body = '';
    if (r.phase === 'game' && r.play) {
      body = myTeam && me.status === 'block' ? phonePlay(r, myTeam) : '<p>The blocks are playing on their phones.</p>';
    } else if (r.phase === 'game') {
      if (r.isGroup) body = '<p>Group game: everyone on every block plays.</p>';
      else if (r.revealedAt) body = `<p>Playing for ${myTeam ? h(myTeam.name) : 'each block'}: <b>${names(r.picks[me.teamId])}</b></p>${pickedList(r)}`;
      else if (!myTeam || me.status !== 'block') body = `<p>Blocks are picking ${plural(r.playersNeeded, 'player')} each. ${until(r.pickDeadline)} left.</p>`;
      else body = pickForm(r, myTeam);
    } else if (r.phase === 'results') {
      body = `<p>Playing: <b>${names(r.picks[me.teamId]) || 'nobody from your block'}</b></p><p class="fine">The hosts are entering the results.</p>`;
    } else if (r.phase === 'spending') {
      const place = r.placings[me.teamId];
      body = `${place ? `<p>Your block came <b>${placeName(place)}</b> and won <b>${h(money(r.prizes[me.teamId] || 0))}</b>.</p>` : ''}
        ${r.winnerTeamId && r.winnerTeamId === me.teamId ? '<p class="win-note">🏅 You won this game: the Winner’s Bounty is unlocked in the shop.</p>' : ''}
        <p><b>The shop is open${flat() ? ' below' : ''}.</b> Send drinks to other blocks to score points. Power-ups you buy now start next round.</p>
        ${flat() ? '' : '<button class="btn big" data-act="tab" data-tab="shop">🛒 Go to the Commissary</button>'}`;
    } else if (r.phase === 'drinks') {
      const st = myTeam ? serveOf(r, myTeam.id) : { state: 'safe' };
      if (st.state === 'safe') body = '<p class="serve safe">Safe this round. Nobody sent your block anything.</p>';
      else if (st.state === 'queued') body = `<p class="serve">Your block owes <b>${plural(st.s.drinks, 'drink')}</b>. You’re <b>${placeName(st.pos)}</b> in line for the bar.</p><p class="fine">${streakNote(myTeam)}.</p>`;
      else if (st.state === 'serving') body = `<div class="serve now"><div>🍻 Your block is at the bar: <b>${plural(st.s.drinks, 'drink')}</b></div><div class="big-cd">${until(st.s.timerEndsAt)}</div><p class="fine">Finish in time for <b>${h(money((S.settings.streakCredits || 5) * ((myTeam.drinkStreak || 0) + st.s.drinks)))}</b> (streak ${(myTeam.drinkStreak || 0) + st.s.drinks}). Run out and it’s an extra shot next round, and your streak resets. Film it for the TV.</p>${canFilm() ? '<button class="btn big" data-act="shotcam">🎥 Film it</button>' : ''}</div>`;
      else body = `<p class="serve ${st.state}">${st.state === 'missed' ? `⏰ Out of time: an extra shot next round${st.s.streakLost ? `, and your ${plural(st.s.streakLost, 'drink')} streak is gone` : ''}.` : `✅ Done in time: <b>+${h(money(st.s.reward))}</b>. Streak: ${plural(st.s.streak, 'drink')}.`}</p>`;
      const line = r.serves.filter((s) => !s.finishedAt).map((s) => `${h(teamName(s.teamId))}${s.servedAt ? ' 🍻' : ''}`);
      if (line.length) body += `<p class="fine">At the bar: ${line.join(' → ')}</p>`;
    } else {
      body = '<p class="fine">Waiting for the hosts to start the next round.</p>';
    }
    const g = S.games.find((x) => x.id === r.gameId);
    const rules = g?.rules && ['game', 'results'].includes(r.phase) ? `<details class="howto" ${needsPick() ? '' : 'open'}><summary>📋 How to play</summary><div class="rules">${h(g.rules)}</div>${me.status === 'holding' && g.holdingRule ? `<p class="rule">🕳️ ${h(g.holdingRule)}</p>` : ''}</details>` : '';
    return `<section class="card round-card">${head}${body}${rules}</section>`;
  }

  function pickedList(r) {
    return `<ul class="picks">${roundTeams().map((t) => `<li style="--c:${h(t.color)}">${chip(t)} <span>${names(r.picks[t.id]) || '—'}</span>${r.pickedBy[t.id] === 'auto' ? ' <small class="fine">auto</small>' : ''}</li>`).join('')}</ul>`;
  }

  function pickForm(r, myTeam) {
    const mates = blockmates(myTeam.id);
    const chosen = new Set(ui.picks?.round === r.number ? ui.picks.ids : r.picks[myTeam.id] || []);
    const eligible = new Set(r.eligible);
    const need = Math.min(r.playersNeeded, eligible.size);
    return `<p>Pick <b>${plural(need, 'player')}</b> for ${h(myTeam.name)}. ${until(r.pickDeadline)} left, then the app picks for you.</p>
      <form data-form="pick" class="pick-list">
        ${mates
          .map((p) => {
            const ok = eligible.has(p.id);
            const why = r.cooldown.includes(p.id) ? 'Played recently' : '';
            return `<label class="pick ${ok ? '' : 'off'} ${chosen.has(p.id) ? 'on' : ''}"><input type="checkbox" name="p:${p.id}" ${chosen.has(p.id) ? 'checked' : ''} ${ok ? '' : 'disabled'} data-pick="${p.id}" /><span class="pick-n">${h(p.name)}${p.id === S.me.id ? ' (you)' : ''}</span><small>${why || `${plural(S.played?.[p.id] || 0, 'game')} played`}</small></label>`;
          })
          .join('')}
        <button class="btn big" ${chosen.size === need ? '' : 'disabled'}>${r.picks[myTeam.id] ? 'Change picks' : 'Lock in'} (${chosen.size}/${need})</button>
      </form>
      ${r.picks[myTeam.id] ? `<p class="fine">Locked in: ${names(r.picks[myTeam.id])}. Waiting for ${plural(roundTeams().length - r.picked.length, 'block')}.</p>` : ''}`;
  }

  // A Winner's Bounty that's been hit waits for the block to choose its reward.
  function rewardPicker() {
    const b = (S.bounties || []).find((x) => x.kind === 'winner' && x.status === 'hit' && !x.reward);
    if (!b || S.me?.status !== 'block') return '';
    return `<section class="card reward-pick"><div class="eyebrow">🏅 Winner’s Bounty hit</div><h3>Pick your reward</h3><p class="fine">It starts next round and lasts the rest of the night. Anyone on your block can choose.</p>
      <div class="rewards">${Object.entries(S.winnerRewards || {})
        .map(([k, r]) => `<button class="reward" data-act="bounty-reward" data-bounty-id="${b.id}" data-reward="${k}" data-confirm="Take ${h(r.name)} for the rest of the night?"><span class="mega">${r.emoji}</span><b>${h(r.name)}</b><span class="fine">${h(r.desc)}</span></button>`)
        .join('')}</div></section>`;
  }

  // Power-ups bought or picked this round start the round after.
  const PENDING = { reflect: '🪞 Reflect', eyespy: '👁️ Eye Spy', bounty: '🎯 Bounty starts counting', bonus: '🎁 Bonus drinks', fewer: '🛡️ Fewer drinks', points: '⭐ +1 point per drink' };
  function pendingCard() {
    const list = S.pending || [];
    const live = S.activeReflect ? '<p>🪞 <b>Your Reflect is on this round.</b> Drinks aimed at you bounce back to their senders.</p>' : '';
    if (!list.length && !live) return '';
    return `<section class="card pending"><h3>⏳ Power-ups</h3>${live}${list.length ? `<ul class="roster">${list.map((x) => `<li>${PENDING[x.kind] || h(x.kind)} <span class="fine">starts ${h(x.label)}</span></li>`).join('')}</ul><p class="fine">Everything you buy or pick starts the round after.</p>` : ''}</section>`;
  }

  const streakNote = (t) => (t?.drinkStreak ? `🔥 Streak: ${plural(t.drinkStreak, 'drink')} finished in time` : 'No streak yet');

  // ---------- phone: Eye Spy, bounties and penalties on My Block ----------
  function blockExtras(myTeam) {
    const parts = [rewardPicker(), pendingCard()];
    const now = S.round && S.round.phase !== 'done' ? S.round.number : (S.rounds || []).length;
    const perk = (k, base) => base + (S.bounties || []).filter((b) => b.reward === k && b.rewardFrom <= now).length;
    const [bonus, fewer, pts] = [perk('bonus', myTeam.bonusDrinks || 0), perk('fewer', myTeam.fewerDrinks || 0), perk('points', myTeam.bonusPerDrink || 0)];
    const perks = [
      bonus && `🎁 Every order you send lands with <b>+${bonus}</b> free drink${bonus === 1 ? '' : 's'}.`,
      fewer && `🛡️ Every order sent to you lands with <b>${fewer}</b> fewer drink${fewer === 1 ? '' : 's'}.`,
      pts && `⭐ Every drink you send scores <b>+${pts}</b> extra point${pts === 1 ? '' : 's'}.`,
    ].filter(Boolean);
    if (perks.length) parts.push(`<section class="card"><h3>🏅 Your rewards</h3>${perks.map((x) => `<p>${x}</p>`).join('')}</section>`);
    const active = (S.bounties || []).find((b) => b.status === 'active');
    const done = (S.bounties || []).filter((b) => b.status !== 'active').slice(-2);
    if (active || done.length) {
      parts.push(`<section class="card"><h3>🎯 Bounties</h3>
        ${active ? `<p><b>${active.kind === 'winner' ? 'Winner’s' : 'Open'} Bounty</b>: ${active.sent}/5 drinks sent${active.startRound > now ? `, counting from ${h(slotLabel(active.startRound))}` : ''}. Last round: ${h(slotLabel(active.deadlineRound))}.</p><div class="meter"><i style="width:${Math.min(100, active.sent * 20)}%"></i></div>` : ''}
        ${done.map((b) => `<p class="fine">${b.kind === 'winner' ? 'Winner’s' : 'Open'} Bounty: ${b.status === 'hit' ? `✅ hit${b.kind === 'winner' ? (b.reward ? `: ${h(S.winnerRewards?.[b.reward]?.name || b.reward)}` : ': pick your reward') : ': +25 points'}` : '💀 missed'}</p>`).join('')}
      </section>`);
    }
    const owed = (S.penaltiesOwed || []).filter((x) => x.teamId === myTeam.id);
    if (owed.length) parts.push(`<section class="card"><h3>⏰ Owed next round</h3><ul class="roster">${owed.map((x) => `<li>${x.qty}× ${h(x.drinkName)} <span class="fine">${h(x.reason)}</span></li>`).join('')}</ul></section>`);
    if (S.eyeSpy) {
      const rows = S.eyeSpy.rows;
      parts.push(`<section class="card"><h3>👁️ Eye Spy</h3><p class="fine">Every drink sent up to ${time(S.eyeSpy.at)}.</p>
        ${rows.length ? `<table class="spy"><thead><tr><th>Round</th><th>From</th><th>To</th><th>Drinks</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${x.round || '–'}</td><td>${h(teamName(x.from))}</td><td>${h(teamName(x.to))}</td><td>${x.qty}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nobody has sent anything yet.</p>'}
      </section>`);
    }
    return parts.join('');
  }

  // ---------- TV ----------
  function tvRound() {
    const r = S.round;
    if (!r) return '';
    const head = `<div class="eyebrow">${h(r.label)}${r.final ? ' 🔥' : ''}</div><h2 class="tv-live">${h(r.gameName)}</h2>${r.actMechanics?.length ? `<p class="act-mech">⚙️ ${h(r.actName)}: ${r.actMechanics.map(h).join(', ')}</p>` : ''}${r.phase === 'done' ? '' : phaseStrip(r)}`;
    if (r.phase === 'game' && r.play) return `${head}${tvPlay(r)}`;
    if (r.phase === 'game') {
      if (!r.revealedAt) return `${head}<p class="tv-big">Blocks are picking their players: ${until(r.pickDeadline)}</p>
        <ul class="picks">${roundTeams().map((t) => `<li style="--c:${h(t.color)}">${chip(t)} <span>${r.picked.includes(t.id) ? '✅ locked in' : '…'}</span></li>`).join('')}</ul>${cooldownLine(r)}`;
      return `${head}${r.isGroup ? '<p class="tv-big">Everyone plays!</p>' : pickedList(r)}${cooldownLine(r)}`;
    }
    if (r.phase === 'results') return `${head}<p class="tv-big">Results coming up…</p>${r.isGroup ? '' : pickedList(r)}`;
    if (r.phase === 'spending') return `${head}${placingsList(r)}<p class="tv-big">🛒 The shop is open. Send your drinks.</p>`;
    if (r.phase === 'drinks') return `${head}${tvBarGrid(r)}`;
    return `${head}${placingsList(r)}<p class="fine">${r.number >= (S.plan?.total || 12) ? 'That’s the night. The winner is about to be crowned.' : r.final ? `That’s the end of Act ${r.act}. Act ${r.act + 1} is next.` : 'Round over. Next round soon.'}</p>`;
  }

  function cooldownLine(r) {
    return r.cooldown?.length ? `<p class="fine">Sitting out (played recently): ${names(r.cooldown)}</p>` : '';
  }

  function placingsList(r) {
    const rows = Object.entries(r.placings || {}).sort((a, b) => a[1] - b[1]);
    return rows.length ? `<ol class="placings">${rows.map(([id, n]) => `<li style="--c:${h(team(id)?.color || '#888')}"><span class="rank">${placeName(n)}</span><span class="b-n">${h(teamName(id))}</span><b>+${h(money(r.prizes[id] || 0))}</b></li>`).join('')}</ol>` : '';
  }

  // During drinks the TV is a grid: one tile per block, its clip looping once it's filmed.
  function tvBarGrid(r) {
    const clipFor = (teamId) => (S.clips || []).find((c) => c.teamId === teamId && c.status === 'live' && c.ts >= r.drinksStartedAt);
    const blocks = [...roundTeams(), ...(r.serves.some((s) => s.teamId === HOLDING) ? [{ id: HOLDING, name: 'Holding Cell', color: '#888888' }] : [])];
    return `<div class="bar-grid">${blocks
      .map((t) => {
        const st = serveOf(r, t.id);
        const clip = clipFor(t.id);
        return `<div class="bar-tile s-${st.state}" style="--c:${h(t.color)}">
          ${clip ? `<video src="${h(clip.url)}" autoplay muted loop playsinline></video>` : ''}
          <div class="bar-tile-t"><b>${h(t.name)}</b><span>${st.state === 'serving' ? until(st.s.timerEndsAt) : st.state === 'queued' ? `${placeName(st.pos)} in line · ${plural(st.s.drinks, 'drink')}` : st.state === 'done' ? `Done · +${h(money(st.s.reward))} · 🔥${st.s.streak}` : st.state === 'missed' && st.s.streakLost ? 'Out of time · streak lost' : SERVE_LABEL[st.state]}</span></div>
        </div>`;
      })
      .join('')}</div>`;
  }

  function winnerCard() {
    const w = team(S.winner.teamId);
    return w ? `<section class="card winner-card" style="--c:${h(w.color)}"><div class="eyebrow">Tonight’s winner</div><h2>👑 ${h(w.name)}</h2><p>${plural(w.points || 0, 'point')}${S.me?.teamId === w.id ? '. That’s your block!' : ''}</p></section>` : '';
  }

  function winnerScreen() {
    const w = S.winner && team(S.winner.teamId);
    if (!w) return '';
    return `<div class="winner" style="--c:${h(w.color)}"><div class="winner-in"><div class="eyebrow">Tonight’s winner</div><h1 class="logo">👑 ${h(w.name)}</h1><p class="tv-big">${plural(w.points || 0, 'point')}</p>${w.motto ? `<p class="tagline">${h(w.motto)}</p>` : ''}</div></div>`;
  }

  // ---------- host: the Round tab ----------
  function aRound() {
    const r = S.round;
    const running = r && r.phase !== 'done';
    const teams = roundTeams();
    let main = '';
    if (!running) {
      const games = [...S.games].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
      const n = (r?.number || 0) + 1;
      const over = n > (S.plan?.total || 12);
      main = over ? `<section class="card"><h3>That’s the night.</h3><p>${S.winner ? `👑 ${h(teamName(S.winner.teamId))} won with the most points.` : 'The winner is crowned when the last round finishes.'}</p></section>` : `<section class="card">
        <h3>${r ? `${h(r.label)} is done.` : 'No rounds yet.'} Next up: ${h(slotLabel(n))}</h3>
        ${games.length ? `<form data-admin="startRound" class="row wrap">
          <label class="grow">Game (next in the schedule is picked)<select id="rd_game" name="gameId">${games.map((g) => `<option value="${g.id}">${h(g.name)} · ${g.playersNeeded ? `${plural(g.playersNeeded, 'player')} per block` : 'group game'}${g.status === 'done' ? ' (played)' : ''}</option>`).join('')}</select></label>
          <button class="btn big">▶ Start ${h(slotLabel(n))}</button>
        </form>
        <p class="fine">Blocks get ${S.settings.pickSeconds} seconds to pick players on their phones. The shop closes until results are in.</p>` : '<p>Add games in the 🏁 Games tab first, with how many players each block sends.</p>'}
      </section>`;
    } else if (r.phase === 'game' && r.play) {
      main = hostPlay(r);
    } else if (r.phase === 'game') {
      main = `<section class="card"><h3>Picks${r.revealedAt ? ' are in' : `: ${until(r.pickDeadline)} left`}</h3>
        <ul class="picks">${teams.map((t) => `<li style="--c:${h(t.color)}">${chip(t)} <span>${r.picks[t.id] ? names(r.picks[t.id]) : 'waiting…'}</span>${r.pickedBy[t.id] === 'auto' ? ' <small class="fine">auto</small>' : ''}</li>`).join('')}</ul>
        ${cooldownLine(r)}
        <div class="row wrap">${r.revealedAt ? '' : btn('Reveal now (auto-pick the rest)', 'revealPicks', {}, 'ghost')}${btn('Game’s over: enter results ▶', 'toResults', {}, 'big')}</div>
      </section>`;
    } else if (r.phase === 'results') {
      const prizes = S.settings.prizeMoney;
      main = `<section class="card"><h3>Results for ${h(r.gameName)}</h3>
        <form data-form="results" class="results-form">
          ${teams.map((t, i) => `<div class="res-row" style="--c:${h(t.color)}">${chip(t)}
            <label>Place<select name="place:${t.id}">${['', ...teams.map((_, n) => n + 1)].map((n) => `<option value="${n}" ${n === i + 1 ? 'selected' : ''}>${n ? `${placeName(n)} · +${prizes[Math.min(n, prizes.length) - 1]}` : 'No placing'}</option>`).join('')}</select></label>
            <label>Bonus<input name="bonus:${t.id}" type="number" min="0" placeholder="0" /></label></div>`).join('')}
          <button class="btn big">Pay prizes and open the shop</button>
        </form>
        <p class="fine">Prize money by place: ${prizes.map((n, i) => `${placeName(i + 1)} ${n}`).join(' · ')}. The 1st-place block unlocks the Winner’s Bounty.</p>
      </section>`;
    } else if (r.phase === 'spending') {
      const pending = S.orders.filter((o) => o.type === 'drink' && o.status === 'pending' && !o.queuedRound);
      const by = {};
      for (const o of pending) by[o.targetTeamId] = (by[o.targetTeamId] || 0) + (o.qty || 1);
      main = `<section class="card"><h3>🛒 Shop’s open</h3>
        ${placingsList(r)}
        <p>Drinks ordered so far: ${Object.entries(by).map(([id, n]) => `${h(teamName(id))} ${n}`).join(' · ') || 'none yet'}</p>
        ${(S.reflects || []).filter((x) => x.round >= r.number).map((x) => `<p>🪞 ${h(teamName(x.teamId))} has Reflect for ${h(slotLabel(x.round))}${x.round === r.number ? ' (this round)' : ''}.</p>`).join('')}
        ${btn('🔒 Close shop and start drinks ▶', 'startDrinks', {}, 'big', 'Close the shop and line everyone up at the bar?')}
      </section>`;
    } else if (r.phase === 'drinks') {
      main = barPanel(r);
    }
    return `
      ${S.winner ? `<section class="card"><h3>👑 ${h(teamName(S.winner.teamId))} has been crowned</h3><p class="fine">The TV is showing the winner.</p>${btn('Hide the winner screen', 'clearWinner', {}, 'ghost sm')}</section>` : ''}
      ${r ? `<section class="card round-head"><div class="eyebrow">${h(r.label)}</div><h2>${h(r.gameName)}</h2>${r.phase === 'done' ? '<p class="fine">Done.</p>' : phaseStrip(r)}</section>` : ''}
      ${main}
      ${!r || r.phase !== 'drinks' ? assignDrinksCard() : ''}
      ${S.penaltiesOwed?.length ? `<section class="card"><h3>⏰ Owed next round</h3><ul class="roster">${S.penaltiesOwed.map((x) => `<li>${h(teamName(x.teamId))}: ${x.qty}× ${h(x.drinkName)} <span class="fine">${h(x.reason)}</span></li>`).join('')}</ul></section>` : ''}
      ${(S.bounties || []).some((b) => b.status === 'active') ? `<section class="card"><h3>🎯 Bounties running</h3><ul class="roster">${S.bounties.filter((b) => b.status === 'active').map((b) => `<li>${h(teamName(b.teamId))}: ${b.kind === 'winner' ? 'Winner’s' : 'Open'} · ${b.sent}/5 sent · last round ${b.deadlineRound}</li>`).join('')}</ul></section>` : ''}
      ${S.night?.status === 'draft' && !r ? '<section class="card"><h3>🎬 Set up the night first</h3><p class="fine">Choose the games for each act and confirm in Setup.</p><button class="btn" data-act="atab" data-tab="setup">Go to Setup</button></section>' : ''}
      <p class="fine center">👑 When the last act’s final round finishes, the block with the most points is crowned automatically.</p>`;
  }

  // Where a library game sits in the sequence, by act name and round.
  function usedIn(gameId) {
    const per = S.settings.roundsPerAct;
    return (S.night?.acts || []).flatMap((a) => a.rounds.map((gid, i) => (gid === gameId ? `${a.name} · ${i + 1 === per ? 'Final' : `R${i + 1}`}` : null))).filter(Boolean);
  }

  // Round n's place in the night, worked out the same way as the server.
  function slotLabel(n) {
    const per = Math.max(1, S.plan?.perAct || 3);
    const inAct = ((n - 1) % per) + 1;
    return `Act ${Math.floor((n - 1) / per) + 1} · ${inAct === per ? 'Final round' : `Round ${inAct}`}`;
  }

  // The whole night: every act's rounds, the games lined up for them, and how each went.
  // In Setup each round is a picker; on the Round tab it's read-only.
  function nightPlan(editable = false) {
    const night = S.night || { acts: [], status: 'draft' };
    const per = S.settings.roundsPerAct;
    const played = S.rounds || [];
    const catalog = Object.entries(S.mechanicsCatalog || {});
    const gameName = (id) => S.games.find((g) => g.id === id)?.name;
    const acts = night.acts.map((act, a) => {
      const rows = act.rounds.map((gid, i) => {
        const n = a * per + i + 1;
        const done = played.find((x) => x.number === n);
        const state = done ? (done.phase === 'done' ? 'done' : 'live') : '';
        const label = i + 1 === per ? 'Final round' : `Round ${i + 1}`;
        if (editable && !done) {
          return `<li class="slot pick-slot ${gid ? '' : 'empty'}"><span class="slot-l">${label}</span>
            <select class="slot-select" id="slot_${a + 1}_${i + 1}" data-setup="slot" data-act-no="${a + 1}" data-slot="${i + 1}" aria-label="${h(act.name)} ${label}">
              <option value="">Choose a game…</option>${S.games.map((g) => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${h(g.name)}${APP_RUN[g.runBy] ? ' · app' : ''}</option>`).join('')}
            </select></li>`;
        }
        return `<li class="slot ${state}"><span class="slot-l">${label}</span><span class="slot-g">${h(done?.gameName || gameName(gid) || '') || '<i class="fine">no game yet</i>'}</span><span class="fine">${done?.winnerTeamId ? `🏆 ${h(teamName(done.winnerTeamId))}` : state === 'live' ? h(done.phase) : ''}</span></li>`;
      });
      const mech = editable
        ? catalog.length
          ? `<div class="mechs">${catalog.map(([k, m]) => `<label class="check" title="${h(m.desc)}"><input type="checkbox" data-setup="mech" data-act-no="${a + 1}" data-key="${h(k)}" ${act.mechanics.includes(k) ? 'checked' : ''} /> ${h(m.name)}</label>`).join('')}</div>`
          : '<p class="fine">Act mechanics will show up here as they’re added.</p>'
        : act.mechanics.length
          ? `<p class="fine">⚙️ ${act.mechanics.map((k) => h(S.mechanicsCatalog?.[k]?.name || k)).join(', ')}</p>`
          : '';
      const title = editable ? `<input class="act-name" id="act_name_${a + 1}" data-setup="rename" data-act-no="${a + 1}" value="${h(act.name)}" maxlength="40" aria-label="Name of act ${a + 1}" />` : `<h4>${h(act.name)}</h4>`;
      return `<div class="act-plan">${title}${mech}<ol class="slots">${rows.join('')}</ol></div>`;
    });
    return `<section class="card"><h3>🎬 The night: ${night.acts.length} acts × ${per} rounds</h3>
      ${editable && !S.games.length ? `<p class="row wrap warn-line">⚠️ No games in the library yet, so the rounds have nothing to choose from. ${btn('📥 Add the party’s games', 'loadStarterGames', {}, 'sm')}</p>` : ''}
      <p class="fine">${editable ? 'Name each act, switch on its mechanics, and tap a round to choose its game.' : night.status === 'draft' ? 'Not confirmed yet: set it up in 🎬 Setup.' : 'Rounds follow this sequence. Change future rounds in 🎬 Setup.'}</p>
      <div class="night-plan">${acts.join('')}</div></section>`;
  }

  // ---------- host: 🎬 Setup, where the night is created ----------
  function aSetup() {
    const st = S.settings;
    const night = S.night || { acts: [], status: 'draft' };
    const empty = night.acts.reduce((n, a) => n + a.rounds.filter((x) => !x || !S.games.some((g) => g.id === x)).length, 0);
    const live = night.status === 'live';
    return `
      <section class="card setup-status">
        <h3>${night.confirmedAt ? 'Editing the night' : 'Create the night'}</h3>
        <p class="fine">1. Settings · 2. LeParty party · 3. Games · 4. The sequence · 5. Confirm.${(S.rounds || []).length ? ` ${plural(S.rounds.length, 'round')} already played stay locked.` : ''} This page goes away once you confirm.</p>
      </section>
      <section class="card">
        <h3>1 · The night</h3>
        <form data-admin="updateSettings" class="grid2">
          <label>Party name<input id="su_name" name="partyName" maxlength="40" value="${h(st.partyName)}" /></label>
          <label>Tagline<input id="su_tag" name="tagline" maxlength="80" value="${h(st.tagline)}" /></label>
          <label>Acts<input id="su_acts" name="actsCount" type="number" min="1" max="10" value="${st.actsCount}" /></label>
          <label>Rounds per act (the last is the final round)<input id="su_rpa" name="roundsPerAct" type="number" min="1" max="10" value="${st.roundsPerAct}" /></label>
          <label>Max per block<input id="su_max" name="maxBlockSize" type="number" min="2" max="12" value="${st.maxBlockSize}" /></label>
          <label>Starting credits per block<input id="su_start" name="startingBudget" type="number" min="0" max="1000" value="${st.startingBudget}" /></label>
          <label>Seconds to pick players<input id="su_pick" name="pickSeconds" type="number" min="15" max="300" value="${st.pickSeconds}" /></label>
          <label>Seconds at the bar<input id="su_serve" name="serveSeconds" type="number" min="10" max="120" value="${st.serveSeconds}" /></label>
          <label>Trivia: seconds per question<input id="su_q" name="questionSeconds" type="number" min="5" max="120" value="${st.questionSeconds}" /></label>
          <label>Is Jason lying?: seconds to vote<input id="su_v" name="voteSeconds" type="number" min="5" max="120" value="${st.voteSeconds}" /></label>
          <label>Anime openings: seconds to guess<input id="su_g" name="guessSeconds" type="number" min="10" max="300" value="${st.guessSeconds}" /></label>
          <label>Games a player sits out after playing<input id="su_cd" name="cooldownGames" type="number" min="0" max="5" value="${st.cooldownGames}" /></label>
          <label>Streak credits (× drinks finished in a row)<input id="su_streak" name="streakCredits" type="number" min="0" max="100" value="${st.streakCredits}" /></label>
          <label>Phones<select id="su_phones" name="phoneMode"><option value="team" ${st.phoneMode === 'team' ? 'selected' : ''}>One phone per block (scan the block card)</option><option value="guest" ${st.phoneMode === 'guest' ? 'selected' : ''}>Every guest on their own phone</option></select></label>
          <label>Spending<select id="su_spend" name="spendMode">${[['anyone', 'Straight away'], ['request', 'A block decision (seconds)'], ['captain', 'Shot Caller only']].map(([k, l]) => `<option value="${k}" ${st.spendMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn span2">Save</button>
        </form>
      </section>
      <h3 class="section-h">2 · Contestants from LeParty</h3>
      ${lepartyCard()}
      <h3 class="section-h">3 · Games</h3>
      ${aGames()}
      <h3 class="section-h">4 · The sequence</h3>
      ${nightPlan(true)}
      ${live ? '' : `<section class="card confirm-card"><h3>5 · Confirm</h3>
        <p>${empty ? `⚠️ ${plural(empty, 'round')} still need${empty === 1 ? 's' : ''} a game.` : '✅ Every round has a game.'}${st.lepartyEventId ? ' Confirming also pulls the contestants in from LeParty.' : ''}</p>
        <button class="btn big" data-act="confirm-night" ${empty ? 'disabled' : ''}>✅ Confirm and create the night</button></section>`}`;
  }

  function assignDrinksCard() {
    const drinks = S.items.filter((i) => i.type === 'drink' && i.active);
    if (!drinks.length || !S.teams.length) return '';
    return `<section class="card"><h3>🍺 Assign drinks</h3><p class="fine">Goes into the next drinks queue, like any order. Scores for nobody.</p>
      <form data-admin="assignDrinks" class="grid2">
        <label>Block<select id="as_team" name="teamId">${S.teams.map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join('')}</select></label>
        <label>Drink<select id="as_item" name="itemId">${drinks.map((d) => `<option value="${d.id}">${h(d.emoji)} ${h(d.name)}</option>`).join('')}</select></label>
        <label>How many<input id="as_qty" name="qty" type="number" min="1" max="10" value="1" /></label>
        <label>Reason<input id="as_why" name="reason" maxlength="80" placeholder="broke a house rule" /></label>
        <button class="btn span2">Add to the queue</button>
      </form></section>`;
  }

  // One row per drink: two "5× Spirit" orders from different senders pour as "10× Spirit".
  function pourGroups(lines) {
    return Object.values(
      lines.reduce((acc, b) => {
        const k = b.name.replace(/^\d+× /, '').replace(/ \(.*\)$/, '');
        acc[k] = acc[k] || { k, emoji: b.emoji, qty: 0, from: [], adjust: [] };
        acc[k].qty += b.qty;
        if (b.adjust) acc[k].adjust.push(b.adjust);
        acc[k].from.push(`${b.from}${b.note ? ` “${b.note}”` : ''}`);
        return acc;
      }, {}),
    );
  }
  const pourList = (lines) =>
    `<ul class="pour">${pourGroups(lines)
      .map((x) => `<li><span class="mega">${h(x.emoji)}</span><b>${x.qty}× ${h(x.k)}</b>${x.adjust.length ? ` <span class="chip yellow">${h(x.adjust.join(', '))}</span>` : ''}${ui.senders ? `<small>${h(x.from.join(', '))}</small>` : ''}</li>`)
      .join('')}</ul>`;

  // The bartender's view: who's drinking, who's next and what to pour.
  function barPanel(r) {
    const serving = r.serves.filter((s) => s.servedAt && !s.finishedAt);
    const next = r.serves.find((s) => !s.servedAt);
    const pour = (s) => pourList(s.breakdown);
    return `<section class="card bar">
      <div class="row wrap bar-actions">
        ${next ? btn(`Next: ${h(teamName(next.teamId))} ▶`, 'barNext', {}, 'big') : '<p class="fine">Everyone’s been served.</p>'}
        ${serving.length ? btn('↶ Back', 'barBack', {}, 'ghost') : ''}
        <button class="btn ghost sm" data-act="senders">${ui.senders ? 'Hide senders' : 'Show senders'}</button>
      </div>
      ${serving.map((s) => `<div class="bar-now" style="--c:${h(team(s.teamId)?.color || '#888')}"><div class="bar-now-h"><b>${h(teamName(s.teamId))}</b>${until(s.timerEndsAt, 'big-cd')}${btn(`Done in time ✓ (+${(S.settings.streakCredits || 5) * ((team(s.teamId)?.drinkStreak || 0) + s.drinks)} cr)`, 'barDone', { teamId: s.teamId }, 'sm')}</div>${pour(s)}</div>`).join('')}
      ${next ? `<h3>Up next: ${h(teamName(next.teamId))} · ${plural(next.drinks, 'drink')}</h3>${pour(next)}` : ''}
      <h3>The line</h3>
      <ol class="queue">${r.serves.map((s) => { const st = serveOf(r, s.teamId); return `<li class="s-${st.state}">${h(teamName(s.teamId))} · ${plural(s.drinks, 'drink')} <span class="tag">${SERVE_LABEL[st.state]}${st.state === 'done' ? ` +${s.reward}` : ''}</span> <small class="fine">🔥${team(s.teamId)?.drinkStreak || 0}</small></li>`; }).join('') || '<li>Nobody owes anything.</li>'}</ol>
    </section>`;
  }

  function yardTab() {
    const live = S.games.find((g) => g.status === 'live');
    const todos = todoItems().length || eng() === 'amongus';
    const feedN = ui.feedAll ? 40 : 5;
    return `
      ${S.winner ? winnerCard() : ''}
      ${rewardPicker()}
      ${incomingAlerts()}
      
      ${roundCard()}
      ${pendingCard()}
      ${augmentCard()}
      ${todos ? todoCard() : ''}
      ${lockupRules(S.me.status, live)}
      ${matchCard()}
      ${live && !S.round ? liveGameCard(live) : ''}
      <section class="card">
        <h3>Yard Gossip</h3>
        ${feedList(feedN)}
        ${S.feed.length > 5 ? `<button class="btn ghost sm" data-act="feed-more">${ui.feedAll ? 'Show less' : `Show more (${Math.min(S.feed.length, 40) - 5})`}</button>` : ''}
      </section>`;
  }

  function shopTab() {
    const me = S.me;
    const myTeam = team(me.teamId);
    const blocked =
      S.settings.shopOpen === false
        ? 'The commissary is closed. The hosts will open it again soon.'
        : !myTeam
          ? 'Holding Cell inmates don’t get a commissary account. Get a block to bail you out 🔑'
          : S.settings.spendMode === 'captain' && !me.isCaptain
            ? 'Only your Shot Caller 👑 can spend tonight. Lobby them.'
            : '';
    // One category at a time, as compact rows; tap a row for the details and the Buy button.
    const CATS = [
      ['drinks', '🍺 Drinks', ['drink', 'gift']],
      ['power', '⚡ Power-ups', ['reflect', 'eyespy', 'bounty']],
      ['punish', '😈 Punish', ['punishment']],
      ['stash', '🔄 Stash', ['deflect', 'bail', 'warp']],
      ['supplies', '🧃 Supplies', ['supply']],
    ];
    const cats = CATS.map(([k, label, types]) => [k, label, S.items.filter((i) => types.includes(i.type))]).filter(([, , list]) => list.length);
    const cur = cats.find(([k]) => k === ui.shopCat) || cats[0];
    const short = (t) => {
      const first = String(t || '').split(/(?<=[.!?])\s/)[0];
      return first.length > 70 ? `${first.slice(0, 68)}…` : first;
    };
    const hint = (it) => {
      if (it.type === 'drink') return it.bundles?.length ? `Deals: ${it.bundles.map((b) => (b.label ? `${h(b.label.toLowerCase())} of ${b.qty} for ${b.cost}` : `${b.qty} for ${b.cost}`)).join(' · ')}` : h(short(it.desc));
      if (['reflect', 'eyespy', 'bounty'].includes(it.type)) return `⏳ Starts next round · ${h(short(it.desc).replace(/^(Next round|At the start of next round|Starting next round), /i, ''))}`;
      return `${h(short(it.desc))}${it.drinks ? ` · 🍺×${it.drinks} each` : ''}`;
    };
    const pity = myTeam && eng() === 'genshin' ? `<p class="pity">✦ Pity ${myTeam.pity}/${S.settings.warpPity}</p>` : myTeam && eng() === 'tft' && myTeam.augment === 'hustler' ? '<p class="pity">🏷️ Hustler: 25% off everything.</p>' : '';
    return `
      ${blocked ? `<p class="warnbox">${h(blocked)}</p>` : ''}
      ${pity}
      <nav class="shop-cats" role="tablist">${cats.map(([k, label]) => `<button role="tab" aria-selected="${k === cur[0]}" class="${k === cur[0] ? 'on' : ''}" data-act="shop-cat" data-cat="${k}">${label}</button>`).join('')}</nav>
      <section class="card shop-list">
        ${(cur ? cur[2] : [])
          .map((it) => {
            const soldOut = it.stock !== null && it.stock <= 0;
            const broke = myTeam && myTeam.budget < priceOf(it);
            return `<button class="item shop-row t-${h(it.type)}" data-act="buy-open" data-item-id="${it.id}" ${blocked || soldOut || broke ? 'disabled' : ''}>
              <span class="item-e">${h(it.emoji)}</span>
              <span class="row-main"><span class="item-n">${h(it.name)}</span><span class="item-d">${hint(it)}</span></span>
              <span class="row-price"><b>${soldOut ? 'Sold out' : h(money(priceOf(it)))}</b>${it.type === 'drink' ? `<small>★${it.points || 0} each</small>` : it.stock !== null && !soldOut ? `<small>${it.stock} left</small>` : ''}</span>
            </button>`;
          })
          .join('')}
      </section>
      ${myTeam && willRequest() ? `<p class="fine center">Spending is a block decision: picks need the Shot Caller 👑 or ${plural(S.settings.requestSeconds, 'blockmate')} to second them.</p>` : ''}`;
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
    let qtyPicker = '';
    let cost = priceOf(it);
    if (it.type === 'drink') {
      const q = ui.sheet.qty || 1;
      const quote = drinkQuote(it, q);
      cost = quote.cost;
      const deals = it.bundles || [];
      qtyPicker = `<label>How many</label>
        <div class="qty-row">
          <button class="btn ghost sm" data-act="qty" data-qty="${q - 1}" ${q <= 1 ? 'disabled' : ''} aria-label="One fewer">−</button>
          <b class="qty-n" aria-live="polite">${q}</b>
          <button class="btn sm" data-act="qty" data-qty="${q + 1}" ${q >= 10 ? 'disabled' : ''} aria-label="One more">+</button>
          ${deals.map((b) => `<button class="target deal ${q === b.qty ? 'on' : ''}" data-act="qty" data-qty="${b.qty}">${h(b.label || `${b.qty}×`)} deal</button>`).join('')}
        </div>
        <div class="qty-total"><span>${q}× ${h(it.name)}${quote.bundle ? ` <span class="chip yellow">${h(quote.bundle.label || 'bundle')} deal</span>` : ''}</span><span><b>${h(money(cost))}</b> · <b>★ ${plural(quote.points, 'point')}</b></span></div>
        <p class="fine">The block you send them to decides who drinks.${myTeam && myTeam.budget < cost ? ` <b class="red-t">${h(myTeam.name)} only has ${h(money(myTeam.budget))}.</b>` : ''}</p>`;
      if (myTeam && myTeam.budget < cost) ready = false;
    }
    return `
      <div class="sheet-bg" data-act="sheet-close"></div>
      <div class="sheet ${enter(`buy:${it.id}`)}" role="dialog" aria-label="Buy ${h(it.name)}">
        <div class="sheet-h"><span class="mega">${h(it.emoji)}</span><div><h2>${h(it.name)}</h2><p class="fine">${h(it.desc)}</p></div></div>
        ${picker}
        ${qtyPicker}
        ${['supply', 'gift', 'punishment', 'drink'].includes(it.type) ? `
          <details class="note-fold"><summary>${it.type === 'punishment' ? '💬 Add some trash talk' : '💬 Add a note for the bartender'}</summary>
          <input id="buy_note" maxlength="120" aria-label="Note" placeholder="${it.type === 'punishment' ? 'Enjoy, losers' : 'e.g. vodka soda, extra lime'}" /></details>` : ''}
        <div class="row sheet-actions">
          <button class="btn ghost" data-act="sheet-close">Cancel</button>
          <button class="btn" data-act="buy-confirm" ${ready ? '' : 'disabled'}>${!ready ? (target === 'team' && !ui.sheet.targetTeamId ? 'Pick a block first' : target === 'holdingPlayer' && !ui.sheet.targetPlayerId ? 'Pick someone first' : 'Not enough credits') : `${willRequest() ? 'Ask the block' : it.type === 'warp' ? 'Warp' : it.type === 'drink' ? 'Send' : 'Buy'} for ${h(money(cost))}`}</button>
        </div>
        ${willRequest() ? `<p class="fine center">Goes to your block. It goes through when the Shot Caller approves it or ${plural(secondsNeeded(myTeam, S.me.id), 'blockmate')} second it.</p>` : ''}
        <p class="fine center">${myTeam ? `${h(myTeam.name)} has ${h(money(myTeam.budget))}.` : ''}</p>
      </div>`;
  }

  const ORDER_STATUS = { incoming: 'awaiting response', pending: 'with the hosts', done: 'done', cancelled: 'cancelled' };

  function cellTab() {
    const me = S.me;
    if (me.status === 'holding') return holdingView();
    const myTeam = team(me.teamId);
    const members = blockmates(myTeam.id);
    const inv = myTeam.inventory || {};
    const stash = inv.deflect;
    const ledger = myTeam.ledger || [];
    const orders = S.orders || [];
    return `
      ${eng() === 'genshin' ? partyLineup(myTeam) : ''}
      ${augmentCard()}
      <section class="card cell-head block-banner" style="--c:${h(myTeam.color)}">
        <div class="eyebrow">Your block · ${ordinal(rankOf(myTeam.id))} of ${S.teams.length}</div>
        <h2>${h(myTeam.name)}${nick(myTeam)}</h2>
        ${myTeam.motto ? `<p class="motto">${h(myTeam.motto)}</p>` : ''}
        ${eng() === 'tft' && myTeam.augment ? `<p class="aug-chip">${S.augments[myTeam.augment].emoji} <b>${h(S.augments[myTeam.augment].name)}</b> · ${h(S.augments[myTeam.augment].desc)}</p>` : ''}
        <div class="stats"><div><b>${h(money(myTeam.budget))}</b><span>credits</span></div><div><b>★${myTeam.points || 0}</b><span>points</span></div><div><b>🔥${myTeam.drinkStreak || 0}</b><span>streak</span></div></div>
        <p class="fine">Streak = drinks finished in time in a row. Each time you finish at the bar you get ${h(money(S.settings.streakCredits || 5))} × your streak; run out of time and it resets.</p>
        ${renameControls(myTeam, members)}
      </section>
      ${matchCard()}
      ${requestsCard(myTeam)}
      ${blockExtras(myTeam)}
      <section class="card">
        <h3>Blockmates · ${members.length}/${S.settings.maxBlockSize}</h3>
        <ul class="roster">${members.map((p) => `<li>${p.isCaptain ? '👑' : '🧡'} ${h(p.name)}${p.id === me.id ? ' <span class="fine">(you)</span>' : ''}${immune.has(p.id) ? ' 🛡️' : ''}${p.drinksOwed ? ` <span class="fine">🍺×${p.drinksOwed}</span>` : ''}</li>`).join('')}</ul>
      </section>
      ${stash ? `<section class="card">
        <h3>Contraband stash</h3>
        <div class="stash">
          <div class="stash-i"><span class="mega">🔄</span><b>${inv.deflect || 0}</b><span>Deflect cards<br/><small>bounce a punishment back</small></span></div>
        </div>
      </section>` : ''}
      ${holdingRoster(true)}
      ${ledger.length ? `<details class="card fold"><summary>🧾 Account activity</summary><ul class="roster ledger">${ledger.map((l) => `<li><span class="${l.amount < 0 ? 'red-t' : 'green-t'}">${l.amount > 0 ? '+' : ''}${l.amount}</span> ${h(l.text)} <span class="fine">${time(l.ts)}</span></li>`).join('')}</ul><p class="fine">Unexplained withdrawals happen when a snitch pulls off a sabotage.</p></details>` : ''}
      ${orders.length ? `<details class="card fold"><summary>📦 Block orders · ${orders.length}</summary><ul class="orders">${orders
        .map((o) => {
          const dir = o.type === 'bail' ? `bailed ${h(o.targetPlayerName)}` : o.type === 'supply' ? 'for us' : o.targetTeamId === me.teamId ? `from ${h(teamName(o.fromTeamId))}` : `→ ${h(teamName(o.targetTeamId))}`;
          return `<li class="s-${o.status}"><span>${h(o.emoji)} <b>${h(o.name)}</b> <span class="fine">${dir}${o.originalFromTeamId === me.teamId ? ` · by ${h(o.buyerName)}` : ''}</span></span><span class="tag">${ORDER_STATUS[o.status] || o.status}</span></li>`;
        })
        .join('')}</ul></details>` : ''}`;
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
      ${list.length ? `<ul class="roster">${list.map((p) => `<li>${h(p.name)} <span class="fine">#${h(p.inmateNo)}</span>${p.drinksOwed ? ` <span class="fine">🍺×${p.drinksOwed}</span>` : ''}</li>`).join('')}</ul>` : '<p class="empty">Empty.</p>'}
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
      ${briefingCard()}`;
  }

  function briefingBody(g) {
    return `<h2>${h(g.name)}</h2>${g.desc ? `<p>${h(g.desc)}</p>` : ''}
      ${g.rules ? `<div class="rules">${h(g.rules)}</div>` : '<p class="fine">No written rules — the hosts will explain.</p>'}
      ${g.holdingRule ? `<p class="rule">🕳️ Holding Cell: ${h(g.holdingRule)}</p>` : ''}
      ${S.me.status !== 'block' ? lockupReminder() : ''}`;
  }

  function lockupReminder() {
    const st = S.settings;
    return `<p class="fine">You’re in the Holding Cell: ${h(st.holdingRules)}</p>`;
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
    return `<section class="card brief-card"><div class="eyebrow">📋 Briefing</div><p class="fine">No game running.${next ? ` Up next: <b>${h(next.name)}</b>.` : ''}</p></section>`;
  }

  function standings() {
    return [...S.teams].sort((a, b) => (b.points || 0) - (a.points || 0) || b.earned - a.earned || b.budget - a.budget);
  }

  function drinkTab(limit = 50) {
    const owing = S.players.filter((p) => p.drinksOwed > 0).sort((a, b) => b.drinksOwed - a.drinksOwed).slice(0, limit);
    return owing.length ? `<ul class="roster">${owing.map((p) => `<li>${h(p.name)} <span class="fine">${statusChip(p)}</span> <b class="drink-owed">🍺×${p.drinksOwed}</b></li>`).join('')}</ul>` : '<p class="empty">Everyone’s paid up. For now.</p>';
  }

  // TFT act: a block's augment and streak, shown next to its name.
  const streakBits = (t) =>
    eng() !== 'tft' ? [] : [t.augment && S.augments[t.augment].emoji, t.streak > 1 ? `🔥${t.streak}` : t.streak < -1 ? `💧${-t.streak}` : ''].filter(Boolean);
  const streakTag = (t) => streakBits(t).map((x) => ` · ${x}`).join('');

  function boardTab() {
    const rows = standings();
    const adventurers = eng() === 'genshin' ? [...S.players].sort((a, b) => (b.adventureExp || 0) - (a.adventureExp || 0)).slice(0, 10) : [];
    return `
      ${adventurers.length ? `<section class="card"><h3>${h(W('topList', 'Top Adventurers'))}</h3><ol class="gi-ranks">${adventurers.map((p, i) => `<li class="${p.id === S.me?.id ? 'mine' : ''}"><span class="rank">${i + 1}</span>${avatar(p)}<span class="b-n">${h(p.name)}<small>${h(teamName(p.teamId))}</small></span><b>${eng() === 'genshin' && W('rank') ? 'Lv' : 'AR'} ${arOf(p)}</b></li>`).join('')}</ol></section>` : ''}
      <section class="card">
        <h3>🏆 Block Standings</h3>
        ${rows.length ? `<ol class="board">${rows
          .map((t, i) => `<li style="--c:${h(t.color)}" class="${t.id === S.me?.teamId ? 'mine' : ''}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}${nick(t)}<small>${t.motto ? `${h(t.motto)} · ` : ''}${plural(blockmates(t.id).length, 'inmate')}</small></span><span class="b-s"><b>${plural(t.points || 0, 'pt')}</b><small>${t.earned} earned · ${h(money(t.budget))} left${streakTag(t)}</small></span></li>`)
          .join('')}</ol>` : '<p class="empty">No blocks yet.</p>'}
      </section>
      <section class="card">
        <h3>Roster</h3>
        ${S.teams.map((t) => `<div class="roster-team"><div>${chip(t)}</div><div class="fine">${blockmates(t.id).map((p) => `${p.isCaptain ? '👑' : ''}${h(p.name)}`).join(', ') || 'empty'}</div></div>`).join('')}
        <div class="roster-team"><div>${chip(null)}</div><div class="fine">${inHolding().map((p) => h(p.name)).join(', ') || 'empty'}</div></div>
      </section>
      <section class="card"><h3>🍺 Drink tab</h3>${drinkTab()}</section>`;
  }

  // ---------- admin ----------
  function adminPage() {
    // Until the night is created, the console is the setup page and nothing else.
    if (S.night?.status === 'draft') return setupPage();
    const pending = S.orders.filter((o) => o.status === 'pending').length;
    const incoming = S.orders.filter((o) => o.status === 'incoming').length;
    const lockup = inHolding().length;
    const toPour = cafeteria().toPour;
    const tabs = [
      ['round', `🎲 Round${S.round && S.round.phase !== 'done' ? ` <b class="badge">${h(S.round.phase)}</b>` : ''}`],
      ['cafe', `🍽️ Cafeteria${toPour ? ` <b class="badge">${toPour}</b>` : ''}`],
      ['orders', `🧾 Orders${pending + incoming ? ` <b class="badge">${pending + incoming}</b>` : ''}`],
      ['money', '💰 Payouts'],
      ['lockup', `⚖️ Punish / Lockup${lockup ? ` <b class="badge grey">${lockup}</b>` : ''}`],
      ['shop', '🛒 Commissary'],
      ['clips', `🎥 Clips${S.clips.filter((c) => c.status === 'pending').length ? ` <b class="badge">${S.clips.filter((c) => c.status === 'pending').length}</b>` : ''}`],
      ['settings', '⚙️ Settings'],
    ];
    // Games live in Setup now and Blocks in Settings; old remembered tabs land there.
    if (ui.atab === 'blocks') ui.atab = 'settings';
    if (!tabs.some(([k]) => k === ui.atab)) ui.atab = 'round';
    const body = { round: aRound, cafe: aCafeteria, orders: aOrders, money: aMoney, lockup: aLockup, shop: aShop, clips: aClips, settings: aSettings }[ui.atab] || aRound;
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

  // The first page a host sees: create the night, then it's gone.
  function setupPage() {
    return `
      <header class="top admin-top setup-top">
        <div class="top-row">
          <div class="who"><div class="who-name">🎬 Create the night</div><div class="who-sub">${h(S.settings.partyName)} · ${S.hostRole === 'officer' ? 'Commissary Officer' : 'Warden'}</div></div>
          <div class="row"><button class="btn ghost sm" data-act="logout">Log out</button></div>
        </div>
      </header>
      <main class="content admin">${aSetup()}</main>`;
  }

  // Hosts flip the whole party from one act to the next.
  function actSwitcher() {
    const i = S.act;
    const a = S.acts[i];
    const nextA = S.acts[i + 1];
    return `<div class="act-switch">
      <div class="act-now"><span class="mega">${a.emoji}</span><div><div class="eyebrow">${oneAct() ? 'Tonight' : `Act ${a.numeral} of ${S.acts.length} · ${h(a.game)}`}</div><b>${h(oneAct() ? S.settings.partyName : a.name)}</b></div></div>
      <div class="row">
        ${i > 0 ? btn('◀', 'setAct', { index: i - 1 }, 'ghost sm', `Go back to Act ${S.acts[i - 1].numeral}: ${S.acts[i - 1].name}?`) : ''}
        ${btn('📺 Play intro on TV', 'playIntro', {}, 'ghost sm')}
        ${nextA ? btn(`Next: ${nextA.emoji} ${h(nextA.name)} ▶`, 'setAct', { index: i + 1 }, 'sm', `Start Act ${nextA.numeral}: ${nextA.name} (${nextA.game})? Every phone and the TV switch over now.`) : oneAct() ? '' : '<span class="fine">Final act</span>'}
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

  // The cafeteria: every block's drinks at once, so the bar can pour ahead.
  // Before drinks start it adds up what's on order plus penalties owed; once the queue is built it follows the queue.
  function cafeteria() {
    const r = S.round;
    const live = r?.phase === 'drinks';
    const drinkItem = (name) => S.items.find((i) => i.type === 'drink' && i.name === name);
    const rows = new Map();
    const row = (teamId) => {
      if (!rows.has(teamId)) rows.set(teamId, { teamId, lines: [], drinks: 0, serve: null });
      return rows.get(teamId);
    };
    if (live) {
      for (const s of r.serves) {
        const x = row(s.teamId);
        x.lines = s.breakdown || [];
        x.drinks = s.drinks;
        x.serve = serveOf(r, s.teamId);
      }
    } else {
      const orders = S.orders.filter((o) => o.type === 'drink' && o.status === 'pending' && !o.queuedRound);
      for (const o of orders) {
        const qty = o.pourQty ?? o.qty ?? 1;
        const x = row(o.targetTeamId);
        x.lines.push({ emoji: o.emoji, name: o.name, qty, adjust: o.adjust || '', from: o.origin === 'admin' ? 'The hosts' : teamName(o.fromTeamId), note: o.origin ? '' : o.note });
        x.drinks += qty;
      }
      for (const p of S.penaltiesOwed || []) {
        const x = row(p.teamId);
        x.lines.push({ emoji: drinkItem(p.drinkName)?.emoji || '🥃', name: p.drinkName, qty: p.qty, adjust: '', from: `Penalty: ${p.reason}`, note: '' });
        x.drinks += p.qty;
      }
    }
    // Personal drinks on the drink tab (Shot Penalty, host sentences, Holding Cell rounds), per block.
    const tabOf = (teamId) => (teamId === HOLDING ? inHolding() : blockmates(teamId)).reduce((a, p) => a + (p.drinksOwed || 0), 0);
    const blocks = [...rows.values()].filter((x) => x.drinks > 0 || (x.serve && x.serve.state !== 'safe'));
    // Pour order: the bar's queue once it exists; before that fewest first, like the bar will be.
    if (!live) blocks.sort((a, b) => a.drinks - b.drinks);
    const waiting = live ? blocks.filter((x) => x.serve?.state === 'queued') : blocks;
    const toPour = waiting.reduce((a, x) => a + x.drinks, 0);
    const safe = [...S.teams.map((t) => t.id), ...(inHolding().length ? [HOLDING] : [])].filter((id) => !blocks.some((x) => x.teamId === id));
    return { r, live, blocks, waiting, toPour, safe, tabOf };
  }

  function aCafeteria() {
    const c = cafeteria();
    const { r, live } = c;
    const totals = pourGroups(c.waiting.flatMap((x) => x.lines));
    const when = live ? `${h(r.label)} · drinks are on` : r && r.phase !== 'done' ? `${h(r.label)} · ${h(r.phase)}` : 'Between rounds';
    const head = `<section class="card">
      <div class="row wrap spread"><div><div class="eyebrow">🍽️ Cafeteria · ${when}</div><h3>${live ? 'Still to pour' : 'Coming up at the bar'}: ${plural(c.toPour, 'drink')}</h3></div>
        <button class="btn ghost sm" data-act="senders">${ui.senders ? 'Hide senders' : 'Show senders'}</button></div>
      ${totals.length ? `<div class="row wrap">${totals.map((x) => `<span class="chip muted big-chip">${h(x.emoji)} ${x.qty}× ${h(x.k)}</span>`).join('')}</div>` : ''}
      <p class="fine">${live
        ? 'Every block in tonight’s bar line, in the order they’re served. Blocks already at the bar or done are greyed out.'
        : 'Drinks sent so far plus penalties owed, per block. These can still change: the shop may be open, and Reflect, bonus drinks and shields only apply when drinks start.'}</p>
    </section>`;
    const card = (x) => {
      const t = team(x.teamId);
      const st = x.serve?.state;
      const tab = c.tabOf(x.teamId);
      return `<section class="card cafe-block${live && st !== 'queued' ? ' cafe-past' : ''}" style="--c:${h(t?.color || '#888888')}">
        <div class="bar-now-h">${targetChip(x.teamId)}<span class="cafe-n">${plural(x.drinks, 'drink')}</span>${st ? `<span class="tag">${SERVE_LABEL[st]}${st === 'queued' ? ` · #${x.serve.pos}` : ''}</span>` : ''}</div>
        ${pourList(x.lines)}
        ${tab ? `<p class="fine">🍺 Plus ${plural(tab, 'drink')} on members’ drink tab</p>` : ''}
      </section>`;
    };
    const safeTabs = c.safe.map((id) => [id, c.tabOf(id)]).filter(([, n]) => n);
    return `${head}
      ${c.blocks.length ? `<div class="cafe-grid">${c.blocks.map(card).join('')}</div>` : `<section class="card"><p class="empty">Nothing to pour yet. Drinks show up here as blocks send them.</p></section>`}
      ${c.safe.length ? `<section class="card"><h3>Nothing from the bar${live ? ' this round' : ' yet'}</h3><p>${c.safe.map((id) => h(teamName(id))).join(', ')}</p>${safeTabs.length ? `<p class="fine">On the drink tab: ${safeTabs.map(([id, n]) => `${h(teamName(id))} ${n}`).join(', ')}</p>` : ''}</section>` : ''}`;
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
            <div class="money-h"><b>${h(t.name)}</b><span><b>${t.budget}</b> cr · ${t.earned} earned · <b>${plural(t.points || 0, 'pt')}</b></span></div>
            <div class="row wrap">${[1, 5, 10, 25].map((n) => btn(`+${n}`, 'adjustBudget', { teamId: t.id, amount: n }, 'sm')).join('')}${[-5, -10].map((n) => btn(`${n}`, 'adjustBudget', { teamId: t.id, amount: n }, 'ghost sm')).join('')}
              <span class="fine">Points</span>${btn('+1 pt', 'adjustPoints', { teamId: t.id, amount: 1 }, 'ghost sm')}${btn('−1 pt', 'adjustPoints', { teamId: t.id, amount: -1 }, 'ghost sm', `Take a point off ${t.name}?`)}</div>
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
      </section>
      <section class="card">
        <h3>Correct points</h3>
        <p class="fine">Points go up automatically when a block sends drinks, by each drink’s points on the menu (bundles score a bit more). A Shot Penalty scores 1. Refunding the order takes its points back. Use this only to fix a mistake.</p>
        <form data-admin="adjustPoints" class="grid2">
          <label>Block<select id="pts_team" name="teamId">${S.teams.map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join('')}</select></label>
          <label>Points (negative = take away)<input id="pts_amt" name="amount" type="number" required placeholder="1" /></label>
          <label class="span2">Reason (shows in the feed)<input id="pts_reason" name="reason" maxlength="80" placeholder="drink sent at the bar by hand" /></label>
          <button class="btn span2">Adjust points</button>
        </form>
      </section>`;
  }

  function aGames() {
    return `
      <section class="card">
        <h3>Add a game to the library</h3>
        <p class="row wrap">${btn('📥 Add the party’s games', 'loadStarterGames', {}, 'sm')}<span class="fine">Loads the 14 games on the party’s list (skips any you already have).</span></p>
        <form data-admin="addGame" class="grid2">
          <label>Name<input id="g_name" name="name" maxlength="60" required placeholder="Flip Cup Prison Riot" /></label>
          <label>Description<input id="g_desc" name="desc" maxlength="200" placeholder="Best of 3. Winner +30." /></label>
          <label>Players per block (0 = group game, everyone plays)<input id="g_pn" name="playersNeeded" type="number" min="0" max="10" value="1" /></label>
          <label>Run by<select id="g_rb" name="runBy">${[['host', '🧑‍⚖️ Hosts (you enter the results)'], ['coldwar', '🧊 App: Cold War drinking'], ['trivia', '❓ App: Trivia'], ['lying', '🤥 App: Is Jason lying?'], ['anime', '🎵 App: Anime openings (typed, first right answer wins)']].map(([k, l]) => `<option value="${k}" ${('host') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Stories (Is Jason lying?)<input id="g_st" name="stories" type="number" min="1" max="20" value="${h(5)}" /></label>
          <label class="span2">❓ Trivia questions, one per line: Question | answer | answer | answer | answer | right one (A–D)<textarea id="g_tq" name="questions" rows="4" placeholder="Capital of France? | Paris | Rome | Oslo | Madrid | A">${h('')}</textarea></label>
          <label class="span2">🎵 Anime openings, one per line: Label | the anime | other spellings you’ll accept<textarea id="g_op" name="openings" rows="3" placeholder="Opening 1 | Attack on Titan | Shingeki no Kyojin | AoT"></textarea></label>
          <label class="span2">📋 How to play (shown on every phone when the game goes live)<textarea id="g_rules" name="rules" rows="5" maxlength="1200" placeholder="Each block lines up on one side of the table.&#10;Drink, then flip your cup from the edge.&#10;Next person goes when the cup lands upside down.&#10;First block to finish wins."></textarea></label>
          <label>🕳️ Extra rule for Holding Cell<input id="g_hold" name="holdingRule" maxlength="160" placeholder="Must flip with your off hand" /></label>
          <button class="btn span2">Add to schedule</button>
        </form>
      </section>
      <section class="card">
        <h3>Game library (${S.games.length})</h3>
        <p class="fine">Put these into rounds in the sequence below. A game can be used in more than one round.</p>
        ${S.games.length ? `<ul class="glist">${S.games
          .map((g) => `<li class="g-${g.status}">
            <div class="g-h">${usedIn(g.id).map((l) => `<span class="chip">${h(l)}</span>`).join(' ') || '<span class="chip muted">not in the sequence</span>'} <b>${h(g.name)}</b> <span class="tag">${g.status.toUpperCase()}</span> <span class="fine">${APP_RUN[g.runBy] ? `${APP_RUN[g.runBy]} · run by the app${g.runBy === 'trivia' ? ` · ${plural(g.questions?.length || 0, 'question')}` : g.runBy === 'anime' ? ` · ${plural(g.openings?.length || 0, 'opening')}` : ''}` : g.playersNeeded ? `${plural(g.playersNeeded, 'player')} per block` : 'group game'}</span></div>
            ${g.desc ? `<div class="fine">${h(g.desc)}</div>` : ''}
            ${g.rules ? `<div class="rules small">${h(g.rules)}</div>` : '<div class="fine">⚠️ No how-to-play rules yet.</div>'}
            ${g.holdingRule ? `<div class="fine">🕳️ ${h(g.holdingRule)}</div>` : ''}
            ${g.results ? `<div class="fine">Paid: ${Object.entries(g.results).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ') || 'nothing'}</div>` : ''}
            <div class="row wrap">${btn('🗑 Delete', 'removeGame', { gameId: g.id }, 'ghost sm', `Delete ${g.name}? Rounds using it go back to empty.`)}</div>
            <details>
              <summary class="fine">✏️ Edit game & rules${g.status === 'live' ? ' (saving pops the new briefing up on every phone)' : ''}</summary>
              <form data-admin="updateGame" class="grid2">
                <input type="hidden" name="gameId" value="${g.id}" />
                <label>Name<input id="ge_${g.id}_name" name="name" value="${h(g.name)}" maxlength="60" /></label>
                <label>Description<input id="ge_${g.id}_desc" name="desc" value="${h(g.desc)}" maxlength="200" /></label>
                <label>Players per block (0 = group game)<input id="ge_${g.id}_pn" name="playersNeeded" type="number" min="0" max="10" value="${h(g.playersNeeded ?? 1)}" /></label>
                <label>Run by<select id="ge_${g.id}_rb" name="runBy">${[['host', '🧑‍⚖️ Hosts (you enter the results)'], ['coldwar', '🧊 App: Cold War drinking'], ['trivia', '❓ App: Trivia'], ['lying', '🤥 App: Is Jason lying?'], ['anime', '🎵 App: Anime openings (typed, first right answer wins)']].map(([k, l]) => `<option value="${k}" ${(g.runBy || 'host') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Stories (Is Jason lying?)<input id="ge_${g.id}_st" name="stories" type="number" min="1" max="20" value="${h(g.stories || 5)}" /></label>
          <label class="span2">❓ Trivia questions, one per line: Question | answer | answer | answer | answer | right one (A–D)<textarea id="ge_${g.id}_tq" name="questions" rows="4" placeholder="Capital of France? | Paris | Rome | Oslo | Madrid | A">${h(g.questionsText || '')}</textarea></label>
                <label class="span2">🎵 Anime openings: Label | the anime | other spellings<textarea id="ge_${g.id}_op" name="openings" rows="3" placeholder="Opening 1 | Attack on Titan | AoT">${h(g.openingsText || '')}</textarea></label>
                <label class="span2">📋 How to play<textarea id="ge_${g.id}_rules" name="rules" rows="5" maxlength="1200">${h(g.rules)}</textarea></label>
                <label>🕳️ Holding Cell rule<input id="ge_${g.id}_hold" name="holdingRule" value="${h(g.holdingRule)}" maxlength="160" /></label>
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
      <label class="check"><input type="checkbox" id="fin_${g.id}_pen" name="penalties" checked /> Apply round penalties (Holding +${S.settings.holdingDrinks} 🍺)</label>
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
      <div class="p-n">${selectable ? `<input type="checkbox" class="pick" id="sel_${p.id}" name="sel_${p.id}" aria-label="Select ${h(p.name)}" /> ` : ''}<b>${h(p.name)}</b>${p.fromLeParty ? ' <span title="From LeParty">🔗</span>' : ''}${p.lepartyGone ? ' <span class="chip red">not checked in on LeParty</span>' : ''} <span class="fine">#${h(p.inmateNo)}${p.drinksOwed ? ` · 🍺×${p.drinksOwed}` : ''}</span> ${p.status === 'solitary' ? `<span class="chip red">🔒 ${plural(p.solitary.rounds, 'rd')}</span>` : ''}</div>
      <select id="pt_${p.id}" data-change="updatePlayer" data-player-id="${p.id}" name="teamId">
        <option value="">🕳️ Holding Cell</option>${S.teams.map((t) => `<option value="${t.id}" ${p.teamId === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('')}
      </select>
      <div class="row wrap">${extra}</div>
    </div>`;
  }

  // A block's card: what its phone scans, or the code it types.
  const cardUrl = (t) => `${location.origin}/?b=${t.joinToken}`;
  const qrFor = (t) => `/qr.svg?url=${encodeURIComponent(cardUrl(t))}`;

  // Run the night on LeParty's check-in and draw: pick the event, then it keeps itself in sync.
  function lepartyCard() {
    const lp = S.leparty || {};
    const st = S.settings;
    if (!S.lepartyConfigured) {
      return `<section class="card"><h3>🔗 LeParty</h3><p class="fine">Not connected. To run tonight on LeParty’s check-in and draw, add <code>LEPARTY_URL</code> and <code>LEPARTY_SECRET</code> to this deployment (the secret must match LeParty’s <code>SSS_ROSTER_SECRET</code>), then redeploy.</p></section>`;
    }
    const gone = S.players.filter((p) => p.lepartyGone);
    const events = ui.lpEvents;
    return `<section class="card">
      <h3>🔗 LeParty</h3>
      ${events
        ? `<form data-admin="updateSettings" class="row wrap"><label class="grow">Event<select id="lp_event" name="lepartyEventId"><option value="">Pick an event…</option>${events.map((e) => `<option value="${h(e.id)}" ${e.id === st.lepartyEventId ? 'selected' : ''}>${h(e.name || e.theme_title || e.id)}${e.held_on ? ` · ${h(e.held_on)}` : ''}${e.status ? ` (${h(e.status)})` : ''}</option>`).join('')}</select></label><button class="btn sm">Use this event</button></form>`
        : `<p>${st.lepartyEventId ? `Event: <b>${h(lp.eventName || st.lepartyEventId)}</b>` : 'No event picked yet.'} <button class="btn ghost sm" data-act="lp-events">${st.lepartyEventId ? 'Change event' : 'Pick the event'}</button></p>`}
      ${st.lepartyEventId ? `<div class="row wrap">${btn('🔄 Sync now', 'syncLeParty', {}, 'sm')}<span class="fine">${lp.lastSync ? `Last synced ${time(lp.lastSync)}. Checks again about every 30 seconds while this console or the TV is open.` : 'Not synced yet.'}</span></div>` : ''}
      ${lp.error ? `<p class="warnbox">⚠️ ${h(lp.error)}</p>` : ''}
      ${lp.changes?.length ? `<details class="fold"><summary>Recent changes (${lp.changes.length})</summary><ul class="roster">${lp.changes.map((c) => `<li>${h(c)}</li>`).join('')}</ul></details>` : ''}
      ${gone.length ? `<p class="fine">⚠️ No longer checked in on LeParty: ${gone.map((p) => `${h(p.name)} ${btn('Remove', 'removePlayer', { playerId: p.id }, 'ghost xs', `Remove ${p.name} from tonight?`)}`).join(' · ')}</p>` : ''}
      <p class="fine">Blocks and checked-in guests come from LeParty. Late check-ins land on the block LeParty gives them (the lightest one), moves follow LeParty, and nobody is removed mid-game: anyone who drops off is flagged here instead.</p>
    </section>`;
  }

  function aBlocks(showLeParty = true) {
    const waiting = inHolding().length;
    const team = S.settings.phoneMode === 'team';
    return `
      ${showLeParty ? lepartyCard() : ''}
      <section class="card">
        <h3>🚔 Add guests</h3>
        <form data-admin="addGuests" class="grid2">
          <label class="span2">Names, one per line<textarea id="ag_names" name="names" rows="5" placeholder="Shen&#10;Edwin&#10;Jason"></textarea></label>
          <label>Put them on<select id="ag_team" name="teamId"><option value="">Holding (then Build blocks)</option>${S.teams.map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join('')}</select></label>
          <button class="btn">Add guests</button>
        </form>
        <p class="fine">${team ? 'Guests don’t book in on their phones tonight: each block plays on one phone. Add everyone here, then Build blocks.' : 'Guests can also book themselves in on their phones.'}</p>
      </section>
      ${team && S.teams.length ? `<section class="card">
        <h3>📱 Block phones</h3>
        <p class="fine">Each block’s phone scans its card (or types the code at ${h(location.host)}). The latest scan wins. Never show these on the TV: anyone with a code can take that block over. If a card leaks, give it a new code.</p>
        <div class="cards-grid">${S.teams
          .map((t) => `<div class="block-card" style="--c:${h(t.color)}">
            <img class="qr" src="${qrFor(t)}" alt="QR code for ${h(t.name)}" />
            <div><b>${h(t.name)}</b><div class="code">${h(t.joinCode)}</div>
            <div class="fine">${t.phoneAt ? `📱 Phone connected ${time(t.phoneAt)}` : 'No phone yet'}</div>
            ${btn('New code', 'reissueBlockCode', { teamId: t.id }, 'ghost xs', `Give ${t.name} a new code? Its phone is signed out and the old card stops working.`)}</div>
          </div>`)
          .join('')}</div>
        <button class="btn ghost sm" data-act="print-cards">🖨 Print block cards</button>
      </section>` : ''}
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
    return `
      ${punishCard()}
      <section class="card">
        <h3>🕳️ Holding Cell (${holding.length})</h3>
        <p class="fine">Late arrivals and anyone kicked off a block. Parole them onto a block with the dropdown, or let blocks buy a 🔑 Bail Bond.</p>
        ${holding.length ? `<div class="ptable">${holding.map((p) => playerRow(p, drinkBtns(p))).join('')}</div>` : '<p class="empty">Empty.</p>'}
      </section>
      <section class="card">
        <h3>🍺 Drink tab</h3>
        <div class="row wrap">${btn(`⏱️ End round now (Holding +${st.holdingDrinks})`, 'tickRound', {}, 'ghost sm', 'Apply round penalties now? (Finishing a game already does this.)')}</div>
        ${S.players.some((p) => p.drinksOwed) ? `<div class="ptable">${S.players.filter((p) => p.drinksOwed).sort((a, b) => b.drinksOwed - a.drinksOwed).map((p) => `<div class="prow"><div class="p-n"><b>${h(p.name)}</b> ${statusChip(p)}</div><b class="drink-owed">🍺×${p.drinksOwed}</b><div class="row">${drinkBtns(p)}</div></div>`).join('')}</div>` : '<p class="empty">Nobody owes anything.</p>'}
      </section>
      <section class="card">
        <h3>Lockup rules</h3>
        <form data-admin="updateSettings" class="grid2">
          <label class="span2">🕳️ Holding Cell standing rules<input id="lk_hr" name="holdingRules" value="${h(st.holdingRules)}" maxlength="240" /></label>
          <label>Holding drinks per round<input id="lk_hd" name="holdingDrinks" type="number" min="0" max="5" value="${st.holdingDrinks}" /></label>
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
      <label>Points per drink (Send drinks)<input id="${prefix}_points" name="points" type="number" min="0" max="50" value="${h(it.points ?? 0)}" /></label>
      <label>Penalty drinks each (punishments)<input id="${prefix}_drinks" name="drinks" type="number" min="0" max="5" value="${h(it.drinks ?? 0)}" /></label>
      <label>Credit drain (punishments)<input id="${prefix}_drain" name="drain" type="number" min="0" value="${h(it.drain ?? 0)}" /></label>
      <label>Drained credits go to the buyer<select id="${prefix}_steal" name="steal"><option value="false">No, they vanish</option><option value="true" ${it.steal ? 'selected' : ''}>Yes, it's a robbery</option></select></label>
      <label>On the shelf during<select id="${prefix}_act" name="act"><option value="">Every act</option>${S.acts.map((a) => `<option value="${a.engine}" ${it.act === a.engine ? 'selected' : ''}>Act ${a.numeral} only: ${h(a.name)}</option>`).join('')}</select></label>`;
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
              <summary><span class="mega">${h(it.emoji)}</span> <b>${h(it.name)}</b> <span class="fine">${it.price} cr · ${h(S.itemTypes[it.type]?.label)}${it.act ? ` · Act ${S.acts.find((a) => a.engine === it.act)?.numeral} only` : ''}${it.drinks ? ` · 🍺×${it.drinks}` : ''}${it.stock !== null ? ` · ${it.stock} left` : ''}${it.active ? '' : ' · HIDDEN'}</span></summary>
              <form data-admin="updateItem" class="grid2"><input type="hidden" name="itemId" value="${it.id}" />${itemFields(`it_${it.id}`, it)}
                <div class="row span2">${btn(it.active ? 'Hide' : 'Show', 'updateItem', { itemId: it.id, active: !it.active }, 'ghost sm')}${btn('🗑 Delete', 'removeItem', { itemId: it.id }, 'ghost sm', `Delete ${it.name}?`)}<button class="btn sm">Save</button></div>
              </form>
            </details>
          </li>`)
          .join('')}</ul>
      </section>`;
  }

  function aClips() {
    const st = S.settings;
    const tag = { live: 'ON THE TV', pending: 'WAITING', hidden: 'HIDDEN' };
    return `<section class="card">
        <h3>🎥 Shot Cam</h3>
        <p class="fine">Inmates on a block film their shots (up to ${CLIP_SECONDS} seconds) from the app, and live clips rotate on the TV. Hide anything that shouldn’t be on the big screen; Remove deletes it for good.</p>
        <form data-admin="updateSettings" class="grid2">
          <label class="check"><input type="checkbox" id="cl_on" name="clipsEnabled" ${st.clipsEnabled ? 'checked' : ''} /> Shot Cam on</label>
          <label class="check"><input type="checkbox" id="cl_ok" name="clipsNeedApproval" ${st.clipsNeedApproval ? 'checked' : ''} /> A host okays each clip before the TV shows it</label>
          <button class="btn span2">Save</button>
        </form>
      </section>
      <section class="card">
        <h3>Clips (${S.clips.length})</h3>
        ${S.clips.length ? `<div class="clip-grid">${S.clips
          .map((c) => `<div class="clip-card s-${c.status}">
            <video src="${h(c.url)}" preload="metadata" muted playsinline controls></video>
            <div><span class="tag">${tag[c.status]}</span> ${chip(team(c.teamId))}</div>
            <div class="fine">${h(c.playerName)} · ${time(c.ts)}${c.caption ? ` · “${h(c.caption)}”` : ''}</div>
            <div class="row wrap">${c.status !== 'live' ? btn('Show on TV', 'reviewClip', { clipId: c.id, action: 'live' }, 'sm') : btn('Hide', 'reviewClip', { clipId: c.id, action: 'hidden' }, 'ghost sm')}${btn('🗑 Remove', 'reviewClip', { clipId: c.id, action: 'remove' }, 'ghost sm', 'Delete this clip for good?')}</div>
          </div>`)
          .join('')}</div>` : '<p class="empty">No clips yet. They’ll show up here as blocks send them.</p>'}
      </section>`;
  }

  function aSettings() {
    const st = S.settings;
    return `
      <h3 class="section-h">🔐 Blocks</h3>
      ${aBlocks(false)}
      <h3 class="section-h">🎬 Schedule</h3>
      ${nightPlan(false)}
      <p>${btn('✏️ Edit the setup', 'reopenNight', {}, 'ghost sm', 'Go back to the setup page? Rounds already played stay as they are; confirm again when you’re done.')}</p>
      <h3 class="section-h">⚙️ Everything else</h3>
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
          <label class="span2">Act lineup (switching starts the same act number in the other lineup)<select id="s_set" name="actSet">${Object.entries(S.actSets || {}).map(([k, v]) => `<option value="${k}" ${st.actSet === k ? 'selected' : ''}>${h(v)}</option>`).join('')}</select></label>
          <label>🌠 Warp: 5★ chance %<input id="s_w5" name="warp5" type="number" min="0" max="100" value="${st.warp5}" /></label>
          <label>🌠 Warp: 4★ chance %<input id="s_w4" name="warp4" type="number" min="0" max="100" value="${st.warp4}" /></label>
          <label>🌠 Warp: guaranteed 5★ every N pulls<input id="s_wp" name="warpPity" type="number" min="1" max="50" value="${st.warpPity}" /></label>
          <button class="btn span2">Save settings</button>
        </form>
      </section>
      <section class="card danger-zone">
        <h3>🧨 Fresh start</h3>
        <p class="fine">Removes every inmate, block, order, punishment and feed line, and resets every game to upcoming. Keeps your games and their rules, the commissary shelf, settings and host logins. Use it to clear out test data before the party.</p>
        <form data-admin="freshStart" class="row wrap"><input id="fs_confirm" name="confirm" placeholder="Type RESET" autocomplete="off" /><button class="btn danger" data-confirm="Wipe every inmate, block and order and start fresh? This can't be undone.">Wipe it</button></form>
      </section>
      <section class="card">
        <h3>📺 Act intros on the TV</h3>
        <p class="fine">The TV plays a short trailer whenever you change acts (or tap “Play intro on TV”). Leave a box blank for the built-in trailer, or paste an https link to your own video (an .mp4 / .webm file or a YouTube link) to play that instead. Tap the TV once at the start of the night so it’s allowed to play sound.</p>
        <form data-admin="updateSettings" class="grid2">
          ${S.acts.map((a) => `<label>Act ${a.numeral}: ${h(a.name)}<input id="iv_${a.id}" name="introVideo_${a.id}" type="url" placeholder="Built-in trailer" value="${h(st.introVideos?.[a.id] || '')}" /></label>`).join('')}
          <button class="btn span2">Save intros</button>
        </form>
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
    const rows = standings();
    const max = Math.max(1, ...rows.map((t) => t.points || 0));
    const holding = inHolding();
    return `
      <div class="tv">
        ${winnerScreen()}
        ${audio?.state === 'running' ? '' : '<button class="tv-sound" data-act="tv-sound">🔊 Tap once to enable intro sound</button>'}
        <header class="tv-h">${hero(true)}${oneAct() ? '' : `<div class="act-tag">${curAct().emoji} Act ${curAct().numeral} · ${h(curAct().name)}</div>`}<h1 class="logo">${h(S.settings.partyName)}</h1><div class="tagline">${h(curAct().tagline)}</div></header>
        ${phaseBanner()}
        ${S.announcement ? `<div class="announce tv-ann"><span class="mega">📣</span><div class="announce-t">${h(S.announcement.text)}</div></div>` : ''}
        <div class="tv-grid ${S.round?.phase === 'drinks' || (S.round?.phase === 'game' && S.round.play) ? 'drinks' : ''}">
          <section class="card">
            <h2>🏆 Standings</h2><p class="fine">Blocks score points for every drink they send. Most points wins.</p>
            <ol class="tv-board">${rows.map((t, i) => `<li style="--c:${h(t.color)}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}${t.nickname || streakBits(t).length ? `<small>${[t.nickname && h(t.nickname), ...streakBits(t)].filter(Boolean).join(' · ')}</small>` : ''}</span><span class="tv-bar"><i style="width:${((t.points || 0) / max) * 100}%"></i></span><b>${t.points || 0}</b></li>`).join('') || '<p class="empty">No blocks yet</p>'}</ol>
          </section>
          <section class="card tv-center">
            ${S.round ? tvRound() : live ? `<div class="eyebrow">🏁 Now in the yard</div><h2 class="tv-live">${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}${tvHeat(live)}${live.rules ? `<div class="rules tv-rules">${h(live.rules)}</div>` : ''}${live.holdingRule ? `<p class="rule">🕳️ Holding: ${h(live.holdingRule)}</p>` : ''}` : next ? `<div class="eyebrow">Up next</div><h2 class="tv-live">${h(next.name)}</h2>` : `<div class="eyebrow">Yard</div><h2>Free time 🍻</h2>`}
            ${S.orders.length ? `<h3>⚠️ Incoming punishments</h3><ul class="feed">${S.orders.map((o) => `<li><span class="f-e">${h(o.emoji)}</span><span class="f-t">${h(o.name)}: ${h(teamName(o.fromTeamId))} → <b>${h(teamName(o.targetTeamId))}</b> (deciding…)</span></li>`).join('')}</ul>` : ''}
          </section>
          ${(S.clips || []).length ? `<section class="card tv-feed tv-reel"><h2>🎥 Shot Cam</h2><div id="reel-slot"></div>${feedList(3)}</section>` : `<section class="card tv-feed"><h2>Yard Gossip</h2>${feedList(12)}${S.settings.clipsEnabled ? '<p class="fine">🎥 Film your block taking its shots in the app to get on the Shot Cam.</p>' : ''}</section>`}
          <section class="card tv-lockup">
            <div><h3>🕳️ Holding Cell</h3><div class="tv-names">${holding.map((p) => `<span>${h(p.name)}${p.drinksOwed ? ` <b>🍺${p.drinksOwed}</b>` : ''}</span>`).join('') || '<span class="fine">empty</span>'}</div><div class="fine">${h(S.settings.holdingRules)}</div></div>
          </section>
          ${S.settings.phoneMode === 'team'
            ? `<section class="card tv-qr"><div class="mega">📱</div><div><b>One phone per block</b><div class="fine">Scan your block’s card, or go to ${h(location.host)} and type its code.</div><div class="fine">${plural(S.players.length, 'inmate')} on ${plural(S.teams.length, 'block')}</div></div></section>`
            : `<section class="card tv-qr"><img class="qr" src="/qr.svg?url=${encodeURIComponent(`${location.origin}/`)}" alt="QR code to join" /><div><b>Scan to get booked</b><div class="fine">${h(location.host)}</div><div class="fine">${plural(S.players.length, 'inmate')} booked</div></div></section>`}
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
    tab: (d) => { ui.tab = d.tab; LS.set('sss_tab', d.tab); window.scrollTo(0, 0); render(); },
    atab: (d) => { ui.atab = d.tab; LS.set('sss_atab', d.tab); render(); },
    senders: () => { ui.senders = !ui.senders; render(); },
    'feed-more': () => { ui.feedAll = !ui.feedAll; render(); },
    'board-open': () => { ui.board = true; render(); },
    'confirm-night': async () => {
      if (!confirm('Create the night with this sequence?')) return;
      const res = await admin('confirmNight');
      if (!res.ok) return;
      const sy = res.result?.synced;
      toast(sy?.error ? `Night created, but LeParty didn’t sync: ${sy.error}` : sy ? `🎬 Night created. ${plural((sy.changes || []).length, 'change')} from LeParty.` : '🎬 Night created.', sy?.error ? 'warn' : 'ok');
      ui.atab = 'round';
      LS.set('sss_atab', 'round');
      render();
    },
    answer: async (d) => {
      if (d.confirm && !confirm(d.confirm)) return;
      await act('answer', { value: d.value });
    },
    'lp-events': async () => {
      const res = await admin('lepartyEvents');
      if (res.ok) {
        ui.lpEvents = res.result.events;
        if (!ui.lpEvents.length) toast('LeParty has no open events.', 'warn');
        render();
      }
    },
    // One printable page of block cards: QR, block name and code.
    'print-cards': () => {
      const w = window.open('', '_blank');
      if (!w) return toast('Allow pop-ups to print the cards.', 'warn');
      const cards = S.teams.map((t) => `<div class="c" style="border-color:${h(t.color)}"><img src="${location.origin}${qrFor(t)}" /><h2>${h(t.name)}</h2><p class="code">${h(t.joinCode)}</p><p>Scan to make this phone ${h(t.name)}’s phone, or go to <b>${h(location.host)}</b> and type the code.</p><p class="small">${h(S.settings.partyName)} · keep this card face down</p></div>`).join('');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Block cards</title><style>body{font-family:system-ui,sans-serif;margin:0}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}.c{border:6px solid;border-radius:10px;padding:14px;text-align:center;break-inside:avoid}img{width:62%;max-width:240px}h2{margin:6px 0 0;font-size:28px}.code{font:700 40px/1 ui-monospace,monospace;letter-spacing:6px;margin:6px 0}.small{color:#666;font-size:12px}@media print{button{display:none}}</style></head><body><button onclick="print()" style="margin:12px;font-size:18px">Print</button><main>${cards}</main></body></html>`);
      w.document.close();
    },
    'board-close': () => { ui.board = false; opened.delete('board'); render(); },
    'shop-cat': (d) => { ui.shopCat = d.cat; render(); },
    'bounty-reward': async (d) => {
      if (d.confirm && !confirm(d.confirm)) return;
      const res = await act('bountyReward', { bountyId: d.bountyId, reward: d.reward });
      if (res.ok) toast('🏅 Reward locked in.', 'ok');
    },
    commission: async (d) => {
      if (d.confirm && !confirm(d.confirm)) return;
      const res = await act('commission', { commissionId: d.commissionId });
      if (!res.ok) return;
      const r = res.result || {};
      if (r.all) splash('passed', `${W('commissions', 'Commissions')}: done`, `${W('guild', 'The Adventurers’ Guild')} pays out · ${W('rank', 'AR')} ${r.rank}`, 3200);
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
    shotcam: () => {
      if (!canFilm()) return toast('Only inmates on a block can film for the TV.', 'warn');
      openCam();
    },
    'tv-sound': () => {
      unlockAudio();
      setTimeout(render, 100);
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
      render();
    },
    'buy-open': (d) => { ui.sheet = { itemId: d.itemId, targetTeamId: null, targetPlayerId: null }; delete drafts.buy_note; render(); },
    'sheet-close': () => {
      if (ui.sheet) opened.delete(`buy:${ui.sheet.itemId}`);
      ui.sheet = null;
      render();
    },
    'pick-target': (d) => { ui.sheet.targetTeamId = d.teamId; render(); },
    qty: (d) => { ui.sheet.qty = Math.max(1, Math.min(10, Number(d.qty) || 1)); render(); },
    'pick-player': (d) => { ui.sheet.targetPlayerId = d.playerId; render(); },
    'buy-confirm': async () => {
      const noteEl = document.getElementById('buy_note');
      const { itemId, targetTeamId, targetPlayerId, qty } = ui.sheet;
      const res = await act('buy', { itemId, targetTeamId, targetPlayerId, qty: qty || 1, note: noteEl ? noteEl.value : '' });
      if (!res.ok) return;
      const it = S.items.find((i) => i.id === itemId);
      const r = res.result || {};
      if (r.status === 'requested') toast('🛒 Sent to your block. Get them to second it (or ask the Shot Caller).', 'ok');
      else if (r.warp) { /* the pull splash says it all */ }
      else if (r.status === 'stashed' && ['reflect', 'eyespy', 'bounty'].includes(it?.type)) toast(`${it.emoji} Bought. It starts next round.`, 'ok');
      else if (r.status === 'stashed') toast(`${it?.emoji || ''} Stashed on your block. Shhh.`, 'ok');
      else if (it?.type === 'bail') toast('🔑 Bail posted. Welcome your new blockmate.', 'ok');
      else if (it?.type === 'drink') toast(`${it.emoji} Sent to ${teamName(targetTeamId)}. ★ +${drinkQuote(it, qty || 1).points}`, 'ok');
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
      const res = await admin(type, args);
      if (type === 'syncLeParty' && res.ok) {
        const c = res.result?.changes || [];
        toast(c.length ? `🔗 ${plural(c.length, 'change')} from LeParty: ${c.slice(0, 3).join(' · ')}${c.length > 3 ? '…' : ''}` : '🔗 Already up to date with LeParty.', 'ok');
      }
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
    if (el.dataset.setup) {
      const actNo = Number(el.dataset.actNo);
      delete drafts[el.id];
      // A focused control holds back re-renders; let go so the grid and the Confirm button update.
      if (el.dataset.setup !== 'rename') el.blur();
      if (el.dataset.setup === 'rename') admin('renameAct', { act: actNo, name: el.value });
      if (el.dataset.setup === 'slot') admin('setSlot', { act: actNo, slot: Number(el.dataset.slot), gameId: el.value });
      if (el.dataset.setup === 'mech') {
        const boxes = [...document.querySelectorAll(`[data-setup="mech"][data-act-no="${actNo}"]`)];
        admin('setActMechanics', { act: actNo, mechanics: boxes.filter((b) => b.checked).map((b) => b.dataset.key).join(',') });
      }
      return;
    }
    if (el.dataset.pick && S?.round) {
      const form = el.closest('form');
      ui.picks = { round: S.round.number, ids: [...form.querySelectorAll('[data-pick]:checked')].map((x) => x.dataset.pick) };
      render();
      return;
    }
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
    guess: async (data, form) => {
      const sent = data.guess;
      const res = await act('answer', { value: sent });
      if (!res.ok) return;
      // Clear only what was sent, so a guess typed while this one was checking isn't lost.
      // (The page may have redrawn meanwhile, so look the box up again.)
      if (drafts.guess_box === sent) delete drafts.guess_box;
      const box = document.getElementById('guess_box');
      if (box && box.value === sent) box.value = '';
      if (res.result?.correct) toast('✅ Got it first!', 'ok');
      else toast(`❌ “${sent}” isn’t it. Try again.`, 'warn');
    },
    pick: async (data) => {
      const playerIds = Object.keys(data).filter((k) => k.startsWith('p:') && data[k]).map((k) => k.slice(2));
      const res = await act('pick', { playerIds });
      if (res.ok) {
        ui.picks = null;
        toast('✅ Locked in.', 'ok');
      }
    },
    results: async (data) => {
      const placings = {};
      const bonus = {};
      for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('place:') && v) placings[k.slice(6)] = v;
        if (k.startsWith('bonus:') && v) bonus[k.slice(6)] = v;
      }
      const res = await admin('enterResults', { placings, bonus });
      if (res.ok) toast('Prizes paid. The shop is open.', 'ok');
    },
    claim: async (data, form) => {
      const res = await send({ kind: 'claim', code: data.code });
      if (res.ok) {
        LS.set('sss_token', res.result.token);
        kind = 'player';
        clearDrafts(form);
        toast('📱 This phone now plays for your block.', 'ok');
        render();
      }
    },
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
      if (res.ok && form.querySelector('#lp_event')) {
        // Picked the LeParty event: close the picker and pull its guests straight away.
        ui.lpEvents = null;
        render();
        const sync = await admin('syncLeParty');
        if (sync.ok) toast(`🔗 Imported from LeParty: ${plural((sync.result?.changes || []).length, 'change')}.`, 'ok');
        return;
      }
      if (res.ok && form.dataset.admin === 'addGuests') {
        const ta = form.querySelector('textarea');
        if (ta && ta.value === data.names) ta.value = '';
        delete drafts[ta?.id];
        toast(`Added ${plural(res.result?.added || 0, 'guest')}${res.result?.skipped ? ` (${res.result.skipped} already on the list)` : ''}.`, 'ok');
        render();
        return;
      }
      if (res.ok) {
        clearDrafts(form);
        if (['addGame', 'addTeam', 'addItem', 'announce', 'adjustBudget', 'adjustPoints', 'assignPunishment', 'freshStart'].includes(form.dataset.admin)) form.reset();
        render();
        toast('Done ✔', 'ok');
      }
    }
  });

  render();
  // A block card's QR code opens /?b=<token>: this device becomes that block's phone.
  const cardToken = !hostRoute && route === '/' ? new URLSearchParams(location.search).get('b') : null;
  if (cardToken) {
    history.replaceState(null, '', '/');
    send({ kind: 'claim', token: cardToken }).then((res) => {
      if (!res.ok) return;
      LS.set('sss_token', res.result.token);
      kind = 'player';
      toast('📱 This phone now plays for your block.', 'ok');
      render();
    });
  }
  poll().then(schedule);
  // Any tap on the TV counts as the click browsers need before they'll play sound.
  document.addEventListener('pointerdown', () => kind === 'tv' && unlockAudio());
  // Keep the phone's clock honest without re-rendering the page.
  setInterval(() => document.querySelectorAll('.ph-clock').forEach((el) => (el.textContent = clock())), 20000);
  // Round timers count down every second. When one runs out, the TV and hosts nudge the server
  // straight away (phones wait a few seconds in case one of those already did).
  let lastTick = 0;
  setInterval(() => {
    document.querySelectorAll('[data-until]').forEach((el) => {
      el.textContent = fmtLeft(Number(el.dataset.until));
      el.classList.toggle('low', Number(el.dataset.until) - Date.now() < 10000);
    });
    const due = S?.nextDeadline;
    const grace = kind === 'player' ? 4000 + Math.random() * 3000 : 300;
    if (due && Date.now() > due + grace && Date.now() - lastTick > 3000) {
      lastTick = Date.now();
      send({ kind: 'tick' });
    }
  }, 1000);
})();
