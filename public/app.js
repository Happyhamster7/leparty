/* Shifty Shen Slammer — client. One file, no build step. */
(() => {
  const socket = io();
  const $app = document.getElementById('app');
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };

  const route = location.pathname.replace(/\/+$/, '') || '/';
  let kind = 'connecting'; // connecting | guest | player | admin | tv
  let S = null;
  let guest = {};
  let online = false;
  let pendingRender = false;
  const ui = {
    tab: LS.get('sss_tab') || 'yard',
    atab: LS.get('sss_atab') || 'orders',
    sheet: null, // { itemId, targetTeamId }
    reveal: false,
    finishing: null,
    bribe: false,
  };
  const drafts = {};

  // ---------- helpers ----------
  const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const team = (id) => S?.teams.find((t) => t.id === id) || null;
  const player = (id) => S?.players.find((p) => p.id === id) || null;
  const teamName = (id) => team(id)?.name || '—';
  const chip = (t, extra = '') => (t ? `<span class="chip ${extra}" style="--c:${h(t.color)}">${h(t.name)}</span>` : '<span class="chip muted">No cell</span>');
  const roleOf = (key) => S?.roles?.[key];
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    const box = document.getElementById('toasts');
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  function send(event, payload = {}) {
    return new Promise((resolve) => {
      socket.timeout(8000).emit(event, payload, (err, res) => {
        if (err) res = { ok: false, error: 'The server is not answering. Check your connection.' };
        if (!res.ok) toast(res.error, 'error');
        resolve(res);
      });
    });
  }
  const admin = (type, args = {}) => send('admin', { type, ...args });
  const act = (type, args = {}) => send('act', { type, ...args });

  // ---------- connection ----------
  socket.on('connect', () => {
    online = true;
    socket.emit(
      'hello',
      { token: LS.get('sss_token'), adminToken: route === '/warden' ? LS.get('sss_admin') : null, tv: route === '/tv' },
      (res) => {
        kind = res.kind;
        if (kind === 'guest') {
          guest = res;
          S = null;
        }
        render();
      },
    );
  });
  socket.on('disconnect', () => {
    online = false;
    render();
  });
  socket.on('state', (v) => {
    const prev = S;
    S = v;
    if (kind === 'player') notifyChanges(prev, v);
    render();
  });
  socket.on('kicked', () => {
    LS.del('sss_token');
    kind = 'guest';
    S = null;
    toast('The Warden released you from the system. Book in again to rejoin.', 'error');
    render();
  });

  function notifyChanges(prev, next) {
    if (!prev || !next.me) return;
    const was = new Set((prev.orders || []).filter(isIncomingForMe(prev)).map((o) => o.id + o.bounces));
    for (const o of next.orders.filter(isIncomingForMe(next))) {
      if (!was.has(o.id + o.bounces)) {
        toast(`⚠️ ${teamName(o.fromTeamId)} hit your cell with ${o.name}!`, 'warn');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      }
    }
    if (prev.mafia.phase !== next.mafia.phase && ['night', 'vote'].includes(next.mafia.phase) && navigator.vibrate) navigator.vibrate(300);
    if (prev.me.teamId !== next.me.teamId && next.me.teamId) toast(`You've been assigned to ${teamName(next.me.teamId)}.`);
  }
  const isIncomingForMe = (v) => (o) => o.type === 'punishment' && o.status === 'incoming' && o.targetTeamId === v.me.teamId;

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
    document.body.dataset.phase = S?.mafia?.phase || 'off';
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
    if (S?.settings?.partyName) document.title = route === '/warden' ? `Warden · ${S.settings.partyName}` : S.settings.partyName;
  }

  function page() {
    const offline = online ? '' : '<div class="offline">📡 Lost signal to the yard… reconnecting</div>';
    if (kind === 'connecting') return `${offline}<div class="boot">Booking you in…</div>`;
    if (kind === 'tv') return offline + (S ? tvPage() : '');
    if (kind === 'admin') return offline + (S ? adminPage() : '');
    if (kind === 'player') return offline + (S ? playerPage() : '<div class="boot">Loading your rap sheet…</div>');
    return offline + (route === '/warden' ? wardenLogin() : landing());
  }

  // ---------- guest screens ----------
  function landing() {
    return `
      <main class="landing">
        <div class="bars"></div>
        <div class="landing-inner">
          <div class="stamp">BOOKING</div>
          <h1 class="logo">${h(guest.partyName || 'Shifty Shen Slammer')}</h1>
          <p class="tagline">${h(guest.tagline || '')}</p>
          <form data-form="join" class="card booking">
            <label for="join_name">Name for the booking sheet</label>
            <input id="join_name" name="name" maxlength="24" autocomplete="nickname" placeholder="e.g. Shen" required />
            <button class="btn big" type="submit">Book me in 🚔</button>
            <p class="fine">You'll get an inmate number, a charge, and a cell block. Keep this tab open all night — it remembers you.</p>
          </form>
          <p class="fine center"><a href="/warden">Warden login</a> · <a href="/tv">TV screen</a></p>
        </div>
      </main>`;
  }

  function wardenLogin() {
    return `
      <main class="landing">
        <div class="bars"></div>
        <div class="landing-inner">
          <div class="stamp">RESTRICTED</div>
          <h1 class="logo">Warden Office</h1>
          <form data-form="pin" class="card booking">
            <label for="pin">Warden PIN</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required />
            <button class="btn big" type="submit">Enter the control room</button>
          </form>
          <p class="fine center"><a href="/">← Back to the yard</a></p>
        </div>
      </main>`;
  }

  // ---------- player ----------
  function playerPage() {
    const me = S.me;
    const myTeam = team(me.teamId);
    const tabs = [
      ['yard', '🏟️', 'Yard'],
      ['shop', '🛒', 'Commissary'],
      ['cell', '🔐', 'My Cell'],
      ['rap', '🗂️', 'Rap Sheet'],
      ['board', '🏆', 'Board'],
    ];
    const body = { yard: yardTab, shop: shopTab, cell: cellTab, rap: rapTab, board: boardTab }[ui.tab] || yardTab;
    return `
      <header class="top">
        <div class="top-row">
          <div class="who">
            <div class="who-name">${h(me.name)} ${me.isCaptain ? '<span title="Shot Caller">👑</span>' : ''}</div>
            <div class="who-sub">#${h(me.inmateNo)} · ${chip(myTeam)} ${me.status === 'solitary' ? '<span class="chip red">SOLITARY</span>' : ''}</div>
          </div>
          <div class="credits" title="${myTeam ? h(myTeam.name) : ''} credits">
            <div class="credits-n">${myTeam ? myTeam.budget : 0}</div>
            <div class="credits-l">credits</div>
          </div>
        </div>
      </header>
      ${phaseBanner()}
      ${announcement()}
      ${incomingAlerts()}
      <main class="content">${body()}</main>
      ${ui.sheet ? buySheet() : ''}
      <nav class="tabs">
        ${tabs.map(([k, icon, label]) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${icon}<span>${label}</span>${k === 'rap' && needsMafiaAction() ? '<i class="dot"></i>' : ''}${k === 'cell' && myIncoming().length ? '<i class="dot"></i>' : ''}</button>`).join('')}
      </nav>`;
  }

  function needsMafiaAction() {
    const m = S.mafia;
    const me = S.me;
    if (me.status !== 'gen_pop') return false;
    if (m.phase === 'vote') return !m.myVote;
    if (m.phase === 'night') return ['snitch', 'guard', 'lawyer'].includes(me.role) && !m.myNight;
    return false;
  }

  const myIncoming = () => (S.orders || []).filter(isIncomingForMe(S));

  function phaseBanner() {
    const m = S.mafia;
    if (m.phase === 'night') return `<div class="phase night">🌙 LIGHTS OUT — Night ${m.round}${kind === 'player' ? ' · check your Rap Sheet' : ''}</div>`;
    if (m.phase === 'vote') return `<div class="phase vote">🗳️ LOCKDOWN VOTE OPEN · ${plural(m.votesCast, 'vote')} cast</div>`;
    if (m.phase === 'over') return `<div class="phase over">${m.winner === 'snitches' ? '🐀 The snitches run the block!' : '🎉 General Population wins!'}</div>`;
    return '';
  }

  function announcement() {
    if (!S.announcement) return '';
    return `<div class="announce"><span class="mega">📣</span><div><div class="announce-t">${h(S.announcement.text)}</div><div class="fine">from the Warden · ${time(S.announcement.ts)}</div></div></div>`;
  }

  function incomingAlerts() {
    const list = myIncoming();
    if (!list.length) return '';
    const myTeam = team(S.me.teamId);
    const deflects = myTeam?.inventory?.deflect || 0;
    return list
      .map(
        (o) => `
        <div class="incoming">
          <div class="incoming-h">⚠️ INCOMING PUNISHMENT</div>
          <div class="incoming-b"><span class="mega">${h(o.emoji)}</span><div><b>${h(o.name)}</b> from ${chip(team(o.fromTeamId))}${o.bounces ? ` <span class="chip yellow">bounced ×${o.bounces}</span>` : ''}
            ${o.drain ? `<div class="fine">Costs your cell ${o.drain} credits</div>` : ''}${o.note ? `<div class="note">“${h(o.note)}”</div>` : ''}</div></div>
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

  function yardTab() {
    const live = S.games.find((g) => g.status === 'live');
    const upcoming = S.games.filter((g) => g.status === 'upcoming');
    const done = S.games.filter((g) => g.status === 'done');
    return `
      ${live ? `<section class="card live"><div class="eyebrow">🏁 Now in the yard</div><h2>${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}</section>` : ''}
      ${S.games.length ? `
        <section class="card">
          <h3>Tonight's Schedule</h3>
          <ol class="schedule">
            ${S.games.map((g) => `<li class="g-${g.status}"><span>${h(g.name)}</span><span class="tag">${g.status === 'live' ? 'LIVE' : g.status === 'done' ? 'DONE' : 'UP NEXT'}</span>${g.results ? `<div class="fine">${Object.entries(g.results).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ')}</div>` : ''}</li>`).join('')}
          </ol>
          ${!live && !upcoming.length && done.length ? '<p class="fine">That’s the whole schedule. The Warden may have more surprises…</p>' : ''}
        </section>` : ''}
      <section class="card">
        <h3>Yard Gossip</h3>
        ${feedList()}
      </section>`;
  }

  function shopTab() {
    const me = S.me;
    const myTeam = team(me.teamId);
    const blocked = !myTeam ? 'You haven’t been assigned a cell yet — the Warden will sort you out.' : S.settings.captainOnlySpending && !me.isCaptain ? 'Only your Shot Caller 👑 can spend tonight. Lobby them.' : '';
    const groups = Object.entries(S.itemTypes)
      .map(([type, info]) => [type, info, S.items.filter((i) => i.type === type)])
      .filter(([, , list]) => list.length);
    return `
      <section class="card shop-head">
        <div><div class="eyebrow">Commissary</div><h2>${myTeam ? `${myTeam.budget} credits` : 'No cell yet'}</h2><p class="fine">Spending comes out of your whole cell’s budget. Spend wisely… or don’t.</p></div>
        ${myTeam ? `<div class="inv-mini"><span title="Deflect cards">🔄 ${myTeam.inventory?.deflect || 0}</span><span title="Bribes">💵 ${myTeam.inventory?.immunity || 0}</span></div>` : ''}
      </section>
      ${blocked ? `<p class="warnbox">${h(blocked)}</p>` : ''}
      ${groups
        .map(
          ([type, info, list]) => `
        <h3 class="section-h">${h(info.label)}</h3>
        <div class="items">
          ${list
            .map((it) => {
              const soldOut = it.stock !== null && it.stock <= 0;
              const broke = myTeam && myTeam.budget < it.price;
              const disabled = blocked || soldOut || broke;
              return `<button class="item t-${h(it.type)}" data-act="buy-open" data-item-id="${it.id}" ${disabled ? 'disabled' : ''}>
                <span class="item-e">${h(it.emoji)}</span>
                <span class="item-n">${h(it.name)}</span>
                <span class="item-d">${h(it.desc)}</span>
                <span class="item-p">${soldOut ? 'SOLD OUT' : `${it.price} cr`}${it.stock !== null && !soldOut ? ` · ${it.stock} left` : ''}</span>
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
    const info = S.itemTypes[it.type];
    const others = S.teams.filter((t) => t.id !== S.me.teamId);
    const myTeam = team(S.me.teamId);
    return `
      <div class="sheet-bg" data-act="sheet-close"></div>
      <div class="sheet" role="dialog" aria-label="Buy ${h(it.name)}">
        <div class="sheet-h"><span class="mega">${h(it.emoji)}</span><div><h2>${h(it.name)}</h2><p class="fine">${h(it.desc)}</p></div></div>
        ${info.needsTarget ? `
          <label>Target cell</label>
          <div class="targets">${others.map((t) => `<button class="target ${ui.sheet.targetTeamId === t.id ? 'on' : ''}" style="--c:${h(t.color)}" data-act="pick-target" data-team-id="${t.id}">${h(t.name)}</button>`).join('') || '<p class="fine">No other cells to target.</p>'}</div>` : ''}
        ${['supply', 'gift', 'punishment'].includes(it.type) ? `
          <label for="buy_note">${it.type === 'punishment' ? 'Trash talk (optional)' : 'Note for the bartender (optional)'}</label>
          <input id="buy_note" maxlength="120" placeholder="${it.type === 'punishment' ? 'Enjoy, losers' : 'e.g. vodka soda, extra lime'}" />` : ''}
        <div class="row sheet-actions">
          <button class="btn ghost" data-act="sheet-close">Cancel</button>
          <button class="btn" data-act="buy-confirm" ${info.needsTarget && !ui.sheet.targetTeamId ? 'disabled' : ''}>Buy for ${it.price} cr</button>
        </div>
        <p class="fine center">${myTeam ? `${myTeam.name} has ${myTeam.budget} credits.` : ''}</p>
      </div>`;
  }

  const ORDER_STATUS = { incoming: 'awaiting response', pending: 'with the Warden', done: 'delivered', cancelled: 'cancelled', stashed: 'stashed' };

  function cellTab() {
    const me = S.me;
    const myTeam = team(me.teamId);
    if (!myTeam) return '<section class="card"><h2>No cell yet</h2><p>The Warden hasn’t assigned you to a cell block. Sit tight, inmate.</p></section>';
    const members = S.players.filter((p) => p.teamId === myTeam.id);
    const inv = myTeam.inventory || {};
    const voteOpen = S.mafia.phase === 'vote';
    const immune = new Set(S.mafia.immune);
    return `
      <section class="card cell-head" style="--c:${h(myTeam.color)}">
        <div class="eyebrow">Your cell block</div>
        <h2>${h(myTeam.name)}</h2>
        <div class="stats"><div><b>${myTeam.budget}</b><span>credits</span></div><div><b>${myTeam.earned}</b><span>earned tonight</span></div><div><b>${members.length}</b><span>inmates</span></div></div>
      </section>
      <section class="card">
        <h3>Contraband stash</h3>
        <div class="stash">
          <div class="stash-i"><span class="mega">🔄</span><b>${inv.deflect || 0}</b><span>Snitch Slips<br/><small>bounce a punishment back</small></span></div>
          <div class="stash-i"><span class="mega">💵</span><b>${inv.immunity || 0}</b><span>Bribes<br/><small>vote immunity</small></span></div>
        </div>
        ${voteOpen && inv.immunity ? `
          <p class="fine">Lockdown vote is open — bribe a guard to protect someone in your cell:</p>
          <div class="targets">${members.filter((p) => p.status === 'gen_pop').map((p) => `<button class="target" style="--c:${h(myTeam.color)}" data-act="immunity" data-target-id="${p.id}" ${immune.has(p.id) ? 'disabled' : ''}>${immune.has(p.id) ? '🛡️ ' : ''}${h(p.name)}</button>`).join('')}</div>` : ''}
      </section>
      <section class="card">
        <h3>Cellmates</h3>
        <ul class="roster">${members.map((p) => `<li>${p.isCaptain ? '👑' : '🧡'} ${h(p.name)} <span class="fine">#${h(p.inmateNo)}</span>${p.status === 'solitary' ? ' <span class="chip red">solitary</span>' : ''}${immune.has(p.id) ? ' 🛡️' : ''}</li>`).join('')}</ul>
      </section>
      <section class="card">
        <h3>Cell orders</h3>
        ${S.orders.length ? `<ul class="orders">${S.orders
          .map((o) => {
            const outgoing = o.fromTeamId === me.teamId || o.originalFromTeamId === me.teamId;
            const dir = o.type === 'supply' ? 'for us' : o.targetTeamId === me.teamId ? `from ${h(teamName(o.fromTeamId))}` : `→ ${h(teamName(o.targetTeamId))}`;
            return `<li class="s-${o.status}"><span>${h(o.emoji)} <b>${h(o.name)}</b> <span class="fine">${dir}${outgoing && o.buyerName && o.originalFromTeamId === me.teamId ? ` · bought by ${h(o.buyerName)}` : ''}</span></span><span class="tag">${ORDER_STATUS[o.status] || o.status}</span></li>`;
          })
          .join('')}</ul>` : '<p class="empty">Nothing ordered yet. Hit the commissary.</p>'}
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
          <div class="mug-team">${chip(team(me.teamId))}</div>
        </div>
      </section>
      ${m.hasRoles ? `
        <section class="card role-card ${ui.reveal ? 'shown' : ''}" data-act="reveal">
          ${ui.reveal
            ? `<div class="mega">${role.emoji}</div><h2>${h(role.name)}</h2><p>${h(role.blurb)}</p>${me.role === 'snitch' ? snitchCrew() : ''}<p class="fine">Tap to hide</p>`
            : `<div class="mega">🗂️</div><h2>Secret role</h2><p class="fine">Tap to reveal. Shield your screen!</p>`}
        </section>` : ''}
      ${mafiaPanel()}
      ${me.role === 'guard' && (m.frisks || []).length ? `<section class="card"><h3>🔦 Frisk results</h3><ul class="roster">${m.frisks.map((f) => `<li>Night ${f.round}: ${h(player(f.targetId)?.name || '?')} — ${f.isSnitch ? '<b class="red-t">🐀 SNITCH</b>' : 'clean'}</li>`).join('')}</ul></section>` : ''}`;
  }

  function snitchCrew() {
    const crew = S.players.filter((p) => p.role === 'snitch' && p.id !== S.me.id);
    return crew.length ? `<p class="fine">Your fellow snitches: <b>${crew.map((p) => h(p.name)).join(', ')}</b></p>` : '<p class="fine">You are the only snitch. Lone rat.</p>';
  }

  function mafiaPanel() {
    const m = S.mafia;
    const me = S.me;
    const alive = S.players.filter((p) => p.status === 'gen_pop');
    if (!m.hasRoles || m.phase === 'off') return '<section class="card"><h3>🐀 The Snitch Game</h3><p class="fine">The Warden hasn’t dealt secret roles yet. When they do, your role shows up here.</p></section>';
    if (m.phase === 'over') return `<section class="card center"><div class="mega">${m.winner === 'snitches' ? '🐀' : '🎉'}</div><h2>${m.winner === 'snitches' ? 'Snitches win' : 'General Population wins'}</h2>${m.lastResult ? `<p>${h(m.lastResult.text)}</p>` : ''}</section>`;
    if (me.status !== 'gen_pop') return `<section class="card center"><div class="mega">🔒</div><h2>You’re in solitary</h2><p class="fine">No votes, no night moves. Keep quiet and enjoy the show (and your drink).</p></section>`;

    if (m.phase === 'night') {
      const cfg = {
        snitch: ['🐀 Who are you ratting out tonight?', alive.filter((p) => p.id !== me.id && p.role !== 'snitch')],
        guard: ['🔦 Who do you want to frisk?', alive.filter((p) => p.id !== me.id)],
        lawyer: ['⚖️ Who are you protecting tonight?', alive],
      }[me.role];
      if (!cfg) return '<section class="card center night-card"><div class="mega">😴</div><h2>Eyes closed, inmate</h2><p class="fine">Put your phone down. The Warden will call Lights On.</p></section>';
      const [q, targets] = cfg;
      const locked = me.role === 'guard' && m.myNight;
      const picks = m.snitchPicks || {};
      return `<section class="card night-card">
        <h3>${q}</h3>
        ${locked ? `<p>You frisked <b>${h(player(m.myNight)?.name)}</b>: ${(m.frisks || []).find((f) => f.round === m.round)?.isSnitch ? '<b class="red-t">🐀 SNITCH!</b>' : 'clean.'}</p>` : ''}
        <div class="targets">${targets
          .map((p) => {
            const crewPicks = me.role === 'snitch' ? Object.entries(picks).filter(([sid, tid]) => tid === p.id && sid !== me.id).map(([sid]) => player(sid)?.name).filter(Boolean) : [];
            return `<button class="target ${m.myNight === p.id ? 'on' : ''}" data-act="night" data-target-id="${p.id}" ${locked ? 'disabled' : ''}>${h(p.name)}${crewPicks.length ? `<small> ← ${h(crewPicks.join(', '))}</small>` : ''}</button>`;
          })
          .join('')}</div>
        <p class="fine">${me.role === 'snitch' ? 'Snitches see each other’s picks. Most picks wins; ties are random.' : me.role === 'guard' ? 'One frisk per night. Result is instant and only you see it.' : 'You can change your pick until Lights On.'}</p>
      </section>`;
    }

    if (m.phase === 'vote') {
      const tally = m.tally || {};
      const max = Math.max(1, ...Object.values(tally));
      const immune = new Set(m.immune);
      return `<section class="card">
        <h3>🗳️ Lockdown vote: who’s the snitch?</h3>
        <div class="votes">${alive
          .map((p) => `<button class="vote ${m.myVote === p.id ? 'on' : ''}" data-act="vote" data-target-id="${p.id}" ${p.id === me.id ? 'disabled' : ''}>
            <span class="bar" style="width:${((tally[p.id] || 0) / max) * 100}%"></span>
            <span class="v-n">${h(p.name)} ${immune.has(p.id) ? '🛡️' : ''}</span><span class="v-c">${tally[p.id] || 0}</span></button>`)
          .join('')}
          <button class="vote skip ${m.myVote === 'skip' ? 'on' : ''}" data-act="vote" data-target-id="skip"><span class="bar" style="width:${((tally.skip || 0) / max) * 100}%"></span><span class="v-n">Skip / no one</span><span class="v-c">${tally.skip || 0}</span></button>
        </div>
        <p class="fine">You can change your vote until the Warden closes it. 🛡️ = bribed a guard, votes against them don’t count.</p>
      </section>`;
    }
    return `<section class="card"><h3>☀️ Daytime in the yard</h3>${m.lastResult ? `<p>${h(m.lastResult.text)}</p>` : ''}<p class="fine">Discuss. Accuse. Lie. The Warden will call the next Lights Out or Lockdown Vote.</p><p class="fine">${plural(alive.length, 'inmate')} still in General Population.</p></section>`;
  }

  function standings() {
    return [...S.teams].sort((a, b) => b.earned - a.earned || b.budget - a.budget);
  }

  function boardTab() {
    const rows = standings();
    return `
      <section class="card">
        <h3>🏆 Cell Block Standings</h3>
        ${rows.length ? `<ol class="board">${rows
          .map((t, i) => `<li style="--c:${h(t.color)}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}<small>${plural(S.players.filter((p) => p.teamId === t.id).length, 'inmate')}</small></span><span class="b-s"><b>${t.earned}</b><small>earned · ${t.budget} left</small></span></li>`)
          .join('')}</ol>` : '<p class="empty">No cell blocks yet.</p>'}
      </section>
      <section class="card">
        <h3>Inmate Roster</h3>
        ${S.teams.map((t) => `<div class="roster-team"><div>${chip(t)}</div><div class="fine">${S.players.filter((p) => p.teamId === t.id).map((p) => `${p.isCaptain ? '👑' : ''}${h(p.name)}${p.status === 'solitary' ? ` 🔒${p.role ? ` (${h(roleOf(p.role)?.name)})` : ''}` : ''}`).join(', ') || 'empty'}</div></div>`).join('')}
        ${S.players.some((p) => !p.teamId) ? `<div class="roster-team"><div>${chip(null)}</div><div class="fine">${S.players.filter((p) => !p.teamId).map((p) => h(p.name)).join(', ')}</div></div>` : ''}
      </section>`;
  }

  // ---------- admin ----------
  function adminPage() {
    const pending = S.orders.filter((o) => o.status === 'pending').length;
    const incoming = S.orders.filter((o) => o.status === 'incoming').length;
    const tabs = [
      ['orders', `🧾 Orders${pending + incoming ? ` <b class="badge">${pending + incoming}</b>` : ''}`],
      ['money', '💰 Payouts'],
      ['games', '🏁 Games'],
      ['cells', '🔐 Cells'],
      ['shop', '🛒 Commissary'],
      ['mafia', '🐀 Snitch Game'],
      ['settings', '⚙️ Settings'],
    ];
    const body = { orders: aOrders, money: aMoney, games: aGames, cells: aCells, shop: aShop, mafia: aMafia, settings: aSettings }[ui.atab] || aOrders;
    return `
      <header class="top admin-top">
        <div class="top-row">
          <div class="who"><div class="who-name">🔑 Warden Control Room</div><div class="who-sub">${h(S.settings.partyName)} · ${plural(S.players.length, 'inmate')} · ${plural(S.teams.length, 'cell')}</div></div>
          <div class="row"><a class="btn ghost sm" href="/tv" target="_blank">📺 TV</a><button class="btn ghost sm" data-act="logout">Log out</button></div>
        </div>
        <nav class="atabs">${tabs.map(([k, l]) => `<button data-act="atab" data-tab="${k}" class="${ui.atab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      </header>
      ${phaseBanner()}
      <main class="content admin">${body()}</main>`;
  }

  const btn = (label, type, args = {}, cls = '', confirm = '') =>
    `<button type="button" class="btn ${cls}" data-act="admin" data-type="${type}" ${Object.entries(args).map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${h(v)}"`).join(' ')} ${confirm ? `data-confirm="${h(confirm)}"` : ''}>${label}</button>`;

  function orderRow(o) {
    const from = team(o.originalFromTeamId || o.fromTeamId);
    const to = team(o.targetTeamId);
    const route = o.type === 'supply' ? chip(to) : `${chip(team(o.fromTeamId))} → ${chip(to)}`;
    return `<li class="order s-${o.status}">
      <div class="o-main"><span class="mega">${h(o.emoji)}</span><div><b>${h(o.name)}</b> <span class="fine">${o.price} cr · ${time(o.ts)}${o.bounces ? ` · bounced ×${o.bounces}` : ''}${o.drained ? ` · drained ${o.drained}` : ''}</span>
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
      <section class="card"><h3>🍹 To deliver / enforce (${pending.length})</h3>${pending.length ? `<ul class="olist">${pending.map(orderRow).join('')}</ul>` : '<p class="empty">Queue is clear. Go get a drink, Warden.</p>'}</section>
      <section class="card"><h3>⏳ Punishments waiting on the target (${incoming.length})</h3><p class="fine">The target cell can take it or play a deflect card. Force it if they’re stalling.</p>${incoming.length ? `<ul class="olist">${incoming.map(orderRow).join('')}</ul>` : '<p class="empty">None.</p>'}</section>
      <section class="card"><h3>Recent</h3>${closed.length ? `<ul class="olist compact">${closed.map(orderRow).join('')}</ul>` : '<p class="empty">Nothing yet.</p>'}</section>`;
  }

  function aMoney() {
    if (!S.teams.length) return '<section class="card"><p>Create cell blocks in the 🔐 Cells tab first.</p></section>';
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
          <label>Cell<select id="pay_team" name="teamId">${S.teams.map((t) => `<option value="${t.id}">${h(t.name)}</option>`).join('')}</select></label>
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
          <button class="btn span2">Add to schedule</button>
        </form>
      </section>
      <section class="card">
        <h3>Schedule</h3>
        ${S.games.length ? `<ul class="glist">${S.games
          .map((g) => `<li class="g-${g.status}">
            <div class="g-h"><b>${h(g.name)}</b> <span class="tag">${g.status.toUpperCase()}</span></div>
            ${g.desc ? `<div class="fine">${h(g.desc)}</div>` : ''}
            ${g.results ? `<div class="fine">Paid: ${Object.entries(g.results).map(([id, n]) => `${h(teamName(id))} ${n > 0 ? '+' : ''}${n}`).join(' · ') || 'nothing'}</div>` : ''}
            <div class="row wrap">
              ${g.status !== 'live' ? btn('▶ Go live', 'setGameStatus', { gameId: g.id, status: 'live' }, 'sm') : btn('⏸ Back to upcoming', 'setGameStatus', { gameId: g.id, status: 'upcoming' }, 'ghost sm')}
              ${g.status !== 'done' ? `<button class="btn sm" data-act="finish-open" data-game-id="${g.id}">🏆 Finish & pay out</button>` : btn('Reopen', 'setGameStatus', { gameId: g.id, status: 'upcoming' }, 'ghost sm')}
              ${btn('↑', 'moveGame', { gameId: g.id, dir: -1 }, 'ghost sm')}${btn('↓', 'moveGame', { gameId: g.id, dir: 1 }, 'ghost sm')}
              ${btn('🗑', 'removeGame', { gameId: g.id }, 'ghost sm', `Delete ${g.name}?`)}
            </div>
            ${ui.finishing === g.id ? finishForm(g) : ''}
          </li>`)
          .join('')}</ul>` : '<p class="empty">No games yet.</p>'}
      </section>`;
  }

  function finishForm(g) {
    if (!S.teams.length) return '<p class="warnbox">No cell blocks to pay out.</p>';
    return `<form data-form="finish" data-game-id="${g.id}" class="finish">
      <p class="fine">Credits for each cell (leave blank for 0, negative to fine):</p>
      <div class="grid2">${S.teams.map((t) => `<label>${chip(t)}<input id="fin_${g.id}_${t.id}" name="pts_${t.id}" type="number" inputmode="numeric" placeholder="0" /></label>`).join('')}</div>
      <div class="row"><button type="button" class="btn ghost sm" data-act="finish-close">Cancel</button><button class="btn sm">Pay out & close game</button></div>
    </form>`;
  }

  function aCells() {
    const unassigned = S.players.filter((p) => !p.teamId).length;
    return `
      <section class="card">
        <h3>Cell blocks</h3>
        ${S.teams.length ? '' : `<div class="row">${btn('Create 2', 'seedTeams', { count: 2 }, 'sm')}${btn('Create 3', 'seedTeams', { count: 3 }, 'sm')}${btn('Create 4', 'seedTeams', { count: 4 }, 'sm')}</div>`}
        <ul class="tlist">${S.teams
          .map((t) => `<li style="--c:${h(t.color)}">
            <form data-admin="updateTeam" class="row wrap">
              <input type="hidden" name="teamId" value="${t.id}" />
              <input type="color" id="tc_${t.id}" name="color" value="${h(t.color)}" />
              <input id="tn_${t.id}" name="name" value="${h(t.name)}" maxlength="30" />
              <button class="btn sm">Save</button>
              ${btn('🗑', 'removeTeam', { teamId: t.id }, 'ghost sm', `Delete ${t.name}? Its inmates become unassigned.`)}
            </form>
            <div class="row wrap fine">
              ${t.budget} cr ·
              🔄 ${t.inventory.deflect} ${btn('+', 'setInventory', { teamId: t.id, kind: 'deflect', count: t.inventory.deflect + 1 }, 'ghost xs')}${btn('−', 'setInventory', { teamId: t.id, kind: 'deflect', count: t.inventory.deflect - 1 }, 'ghost xs')}
              · 💵 ${t.inventory.immunity} ${btn('+', 'setInventory', { teamId: t.id, kind: 'immunity', count: t.inventory.immunity + 1 }, 'ghost xs')}${btn('−', 'setInventory', { teamId: t.id, kind: 'immunity', count: t.inventory.immunity - 1 }, 'ghost xs')}
            </div>
          </li>`)
          .join('')}</ul>
        <form data-admin="addTeam" class="row wrap"><input id="nt_name" name="name" maxlength="30" placeholder="New cell block name" /><button class="btn sm">Add cell</button></form>
      </section>
      <section class="card">
        <h3>Inmates (${S.players.length})</h3>
        <div class="row wrap">
          ${unassigned ? btn(`Assign ${unassigned} unassigned`, 'shuffleTeams', { onlyUnassigned: true }, 'sm') : ''}
          ${btn('🎲 Shuffle everyone', 'shuffleTeams', { onlyUnassigned: false }, 'ghost sm', 'Reshuffle ALL inmates into new cells? Shot Callers get reset.')}
        </div>
        ${S.players.length ? `<div class="ptable">${S.players
          .map((p) => `<div class="prow ${p.status}">
            <div class="p-n"><b>${h(p.name)}</b> <span class="fine">#${h(p.inmateNo)} · ${h(roleOf(p.role)?.emoji)} ${h(roleOf(p.role)?.name)}</span></div>
            <select id="pt_${p.id}" data-change="updatePlayer" data-player-id="${p.id}" name="teamId">
              <option value="">— no cell —</option>${S.teams.map((t) => `<option value="${t.id}" ${p.teamId === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('')}
            </select>
            <div class="row">
              ${btn(p.isCaptain ? '👑 Captain' : 'Make 👑', 'updatePlayer', { playerId: p.id, isCaptain: !p.isCaptain }, p.isCaptain ? 'sm' : 'ghost sm')}
              ${btn(p.status === 'solitary' ? 'Release' : '🔒', 'updatePlayer', { playerId: p.id, status: p.status === 'solitary' ? 'gen_pop' : 'solitary' }, 'ghost sm')}
              ${btn('🗑', 'removePlayer', { playerId: p.id }, 'ghost sm', `Remove ${p.name} from the party? Their phone gets logged out.`)}
            </div>
          </div>`)
          .join('')}</div>` : `<p class="empty">Nobody booked yet. Put the TV screen up so people can scan the QR code.</p>`}
      </section>`;
  }

  function itemFields(prefix, it = {}) {
    const types = Object.entries(S.itemTypes).map(([k, v]) => `<option value="${k}" ${it.type === k ? 'selected' : ''}>${h(v.label)}</option>`).join('');
    return `
      <label class="xs-col">Emoji<input id="${prefix}_emoji" name="emoji" value="${h(it.emoji ?? '')}" maxlength="4" placeholder="🍹" /></label>
      <label>Name<input id="${prefix}_name" name="name" value="${h(it.name ?? '')}" maxlength="40" required /></label>
      <label class="span2">Description<input id="${prefix}_desc" name="desc" value="${h(it.desc ?? '')}" maxlength="160" /></label>
      <label>Price<input id="${prefix}_price" name="price" type="number" min="0" value="${h(it.price ?? 10)}" /></label>
      <label>Type<select id="${prefix}_type" name="type">${types}</select></label>
      <label>Stock (blank = ∞)<input id="${prefix}_stock" name="stock" type="number" min="0" value="${it.stock ?? ''}" /></label>
      <label>Credit drain (punishments)<input id="${prefix}_drain" name="drain" type="number" min="0" value="${h(it.drain ?? 0)}" /></label>`;
  }

  function aShop() {
    return `
      <section class="card">
        <h3>Add commissary item</h3>
        <form data-admin="addItem" class="grid2">${itemFields('ni')}<button class="btn span2">Stock the shelf</button></form>
        <p class="fine"><b>Types:</b> “For your cell” = mixer/supply delivered to the buyer · “Send to another cell” = gift drink · “Punishment” = target cell can take it or deflect · “Deflect card” &amp; “Vote immunity” go into the buyer’s stash.</p>
      </section>
      <section class="card">
        <h3>Shelf (${S.items.length})</h3>
        <ul class="ilist">${S.items
          .map((it) => `<li class="${it.active ? '' : 'inactive'}">
            <details>
              <summary><span class="mega">${h(it.emoji)}</span> <b>${h(it.name)}</b> <span class="fine">${it.price} cr · ${h(S.itemTypes[it.type]?.label)}${it.stock !== null ? ` · ${it.stock} left` : ''}${it.active ? '' : ' · HIDDEN'}</span></summary>
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
    const alive = S.players.filter((p) => p.status === 'gen_pop');
    const name = (id) => (id === 'skip' ? 'Skip' : h(player(id)?.name || '?'));
    const night = m.night || { kills: {}, frisks: {}, protects: {} };
    return `
      <section class="card">
        <h3>How it works</h3>
        <p class="fine">Deal secret roles → call <b>Lights Out</b> (everyone closes eyes; snitches pick a target, the guard frisks, the lawyer protects on their phones) → <b>Lights On</b> reveals who got ratted out → open a <b>Lockdown Vote</b> to send a suspect to solitary. Repeat until all snitches are caught or they outnumber everyone. Bribes 💵 bought at the commissary make someone immune from a vote.</p>
        <form data-admin="assignRoles" class="row wrap">
          <label class="xs-col">🐀 Snitches<input id="r_snitch" name="snitch" type="number" min="1" value="${Math.max(1, Math.round(S.players.length / 5))}" /></label>
          <label class="xs-col">🔦 Guards<input id="r_guard" name="guard" type="number" min="0" value="1" /></label>
          <label class="xs-col">⚖️ Lawyers<input id="r_lawyer" name="lawyer" type="number" min="0" value="1" /></label>
          <button class="btn sm" ${m.hasRoles ? 'data-confirm="Re-deal all roles? Everyone goes back to General Population."' : ''}>🃏 Deal roles</button>
          ${m.hasRoles ? btn('Reset game', 'resetMafia', {}, 'ghost sm', 'Reset the snitch game and clear all roles?') : ''}
        </form>
      </section>
      ${m.hasRoles ? `
      <section class="card">
        <h3>Phase: ${h(m.phase.toUpperCase())}${m.round ? ` · Night ${m.round}` : ''}</h3>
        <div class="row wrap">
          ${m.phase === 'night' ? btn('☀️ Lights On (resolve night)', 'endNight') : btn('🌙 Lights Out', 'startNight', {}, '', '')}
          ${m.phase === 'vote' ? btn('🔨 Close vote & sentence', 'closeVote') : m.phase !== 'night' ? btn('🗳️ Open Lockdown Vote', 'openVote', {}, 'ghost') : ''}
        </div>
        ${m.lastResult ? `<p class="fine">Last: ${h(m.lastResult.text)}</p>` : ''}
        ${m.phase === 'night' ? `
          <div class="grid3">
            <div><b>🐀 Snitch picks</b>${Object.entries(night.kills).map(([s, t]) => `<div class="fine">${name(s)} → ${name(t)}</div>`).join('') || '<div class="fine">waiting…</div>'}</div>
            <div><b>🔦 Frisks</b>${Object.entries(night.frisks).map(([s, t]) => `<div class="fine">${name(s)} → ${name(t)}</div>`).join('') || '<div class="fine">waiting…</div>'}</div>
            <div><b>⚖️ Protects</b>${Object.entries(night.protects).map(([s, t]) => `<div class="fine">${name(s)} → ${name(t)}</div>`).join('') || '<div class="fine">waiting…</div>'}</div>
          </div>` : ''}
        ${m.phase === 'vote' ? `
          <p><b>${m.votesCast}</b> of ${alive.length} voted.</p>
          <div class="grid2">
            <div><b>Tally</b>${Object.entries(m.tally || {}).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<div class="fine">${name(id)} — ${n}${m.immune.includes(id) ? ' 🛡️ immune' : ''}</div>`).join('') || '<div class="fine">no votes</div>'}</div>
            <div><b>Ballots</b>${Object.entries(m.votes || {}).map(([v, t]) => `<div class="fine">${name(v)} → ${name(t)}</div>`).join('') || '<div class="fine">—</div>'}</div>
          </div>` : ''}
      </section>
      <section class="card">
        <h3>Secret roles (Warden eyes only)</h3>
        <div class="ptable">${S.players
          .map((p) => `<div class="prow ${p.status}">
            <div class="p-n"><b>${h(p.name)}</b> <span class="fine">${chip(team(p.teamId))}</span></div>
            <select id="pr_${p.id}" data-change="updatePlayer" data-player-id="${p.id}" name="role">${Object.entries(S.roles).map(([k, r]) => `<option value="${k}" ${p.role === k ? 'selected' : ''}>${r.emoji} ${h(r.name)}</option>`).join('')}</select>
            ${btn(p.status === 'solitary' ? '🕊️ Release' : '🔒 Solitary', 'updatePlayer', { playerId: p.id, status: p.status === 'solitary' ? 'gen_pop' : 'solitary' }, 'ghost sm')}
          </div>`)
          .join('')}</div>
      </section>` : ''}`;
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
          <label>Starting credits for new cells<input id="s_start" name="startingBudget" type="number" min="0" value="${st.startingBudget}" /></label>
          <label class="check"><input type="checkbox" id="s_capt" name="captainOnlySpending" ${st.captainOnlySpending ? 'checked' : ''} /> Only Shot Callers 👑 can spend</label>
          <button class="btn span2">Save settings</button>
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
    const m = S.mafia;
    const rows = standings();
    const max = Math.max(1, ...rows.map((t) => t.earned));
    const alive = S.players.filter((p) => p.status === 'gen_pop');
    const tally = m.tally || {};
    const vmax = Math.max(1, ...Object.values(tally));
    return `
      <div class="tv">
        <header class="tv-h"><div class="bars thin"></div><h1 class="logo">${h(S.settings.partyName)}</h1><div class="tagline">${h(S.settings.tagline)}</div></header>
        ${phaseBanner()}
        ${S.announcement ? `<div class="announce tv-ann"><span class="mega">📣</span><div class="announce-t">${h(S.announcement.text)}</div></div>` : ''}
        <div class="tv-grid">
          <section class="card">
            <h2>🏆 Standings</h2>
            <ol class="tv-board">${rows.map((t, i) => `<li style="--c:${h(t.color)}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}</span><span class="tv-bar"><i style="width:${(t.earned / max) * 100}%"></i></span><b>${t.earned}</b></li>`).join('') || '<p class="empty">No cells yet</p>'}</ol>
          </section>
          <section class="card">
            ${live ? `<div class="eyebrow">🏁 Now in the yard</div><h2 class="tv-live">${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}` : next ? `<div class="eyebrow">Up next</div><h2 class="tv-live">${h(next.name)}</h2>` : `<div class="eyebrow">Yard</div><h2>Free time 🍻</h2>`}
            ${m.phase === 'vote' ? `<h3>🗳️ Lockdown Vote · ${m.votesCast}/${alive.length}</h3><div class="votes">${alive.map((p) => `<div class="vote"><span class="bar" style="width:${((tally[p.id] || 0) / vmax) * 100}%"></span><span class="v-n">${h(p.name)} ${m.immune.includes(p.id) ? '🛡️' : ''}</span><span class="v-c">${tally[p.id] || 0}</span></div>`).join('')}</div>` : ''}
            ${m.phase === 'night' ? '<div class="tv-night">🌙<br/>LIGHTS OUT<br/><small>Eyes closed, inmates.</small></div>' : ''}
            ${S.orders.length ? `<h3>⚠️ Incoming punishments</h3><ul class="feed">${S.orders.map((o) => `<li><span class="f-e">${h(o.emoji)}</span><span class="f-t">${h(o.name)}: ${h(teamName(o.fromTeamId))} → <b>${h(teamName(o.targetTeamId))}</b> (deciding…)</span></li>`).join('')}</ul>` : ''}
          </section>
          <section class="card tv-feed"><h2>Yard Gossip</h2>${feedList(12)}</section>
          <section class="card tv-qr"><img class="qr" src="/qr.svg?url=${encodeURIComponent(`${location.origin}/`)}" alt="QR code to join" /><div><b>Scan to get booked</b><div class="fine">${h(location.host)}</div><div class="fine">${plural(S.players.length, 'inmate')} booked · ${S.players.filter((p) => p.status === 'solitary').length} in solitary</div></div></section>
        </div>
      </div>`;
  }

  // ---------- events ----------
  const ACTIONS = {
    tab: (d) => { ui.tab = d.tab; ui.reveal = false; LS.set('sss_tab', d.tab); window.scrollTo(0, 0); render(); },
    atab: (d) => { ui.atab = d.tab; LS.set('sss_atab', d.tab); render(); },
    reveal: () => { ui.reveal = !ui.reveal; render(); },
    'buy-open': (d) => { ui.sheet = { itemId: d.itemId, targetTeamId: null }; delete drafts.buy_note; render(); },
    'sheet-close': () => { ui.sheet = null; render(); },
    'pick-target': (d) => { ui.sheet.targetTeamId = d.teamId; render(); },
    'buy-confirm': async () => {
      const noteEl = document.getElementById('buy_note');
      const { itemId, targetTeamId } = ui.sheet;
      const res = await act('buy', { itemId, targetTeamId, note: noteEl ? noteEl.value : '' });
      if (res.ok) {
        const it = S.items.find((i) => i.id === itemId);
        toast(res.result?.status === 'stashed' ? `${it?.emoji || ''} Stashed in your cell. Shhh.` : `${it?.emoji || ''} Ordered! The Warden is on it.`, 'ok');
        ui.sheet = null;
        delete drafts.buy_note;
        render();
      }
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
      if (res.ok && res.result && 'isSnitch' in res.result) toast(res.result.isSnitch ? '🐀 They’re a SNITCH!' : '✅ They’re clean.', res.result.isSnitch ? 'warn' : 'ok');
      else if (res.ok) toast('Locked in. 🤫', 'ok');
    },
    vote: async (d) => {
      const res = await act('vote', { targetId: d.targetId });
      if (res.ok) toast('Vote cast 🗳️', 'ok');
    },
    'finish-open': (d) => { ui.finishing = d.gameId; render(); },
    'finish-close': () => { ui.finishing = null; render(); },
    logout: () => { LS.del('sss_admin'); socket.emit('logout'); kind = 'guest'; S = null; render(); },
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
      const res = await send('join', { name: data.name });
      if (res.ok) {
        LS.set('sss_token', res.result.token);
        kind = 'player';
        ui.tab = 'rap';
        clearDrafts(form);
        toast('Welcome to the Slammer. 🔒', 'ok');
        render();
      }
    },
    pin: async (data, form) => {
      const res = await send('admin:login', { pin: data.pin });
      if (res.ok) {
        LS.set('sss_admin', res.result.adminToken);
        kind = 'admin';
        clearDrafts(form);
        render();
      }
    },
    finish: async (data, form) => {
      const results = {};
      for (const [k, v] of Object.entries(data)) if (k.startsWith('pts_') && v !== '') results[k.slice(4)] = Number(v);
      const res = await admin('finishGame', { gameId: form.dataset.gameId, results });
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
        if (['addGame', 'addTeam', 'addItem', 'announce', 'adjustBudget'].includes(form.dataset.admin)) form.reset();
        render();
        toast('Done ✔', 'ok');
      }
    }
  });

  render();
})();
