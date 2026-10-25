/* Shifty Shen Slammer — client. One file, no build step. */
(() => {
  const socket = io();
  const $app = document.getElementById('app');
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };

  const HOLDING = 'holding';
  const route = location.pathname.replace(/\/+$/, '') || '/';
  let kind = 'connecting'; // connecting | guest | player | admin | tv
  let S = null;
  let guest = {};
  let online = false;
  let pendingRender = false;
  const ui = {
    tab: LS.get('sss_tab') || 'yard',
    atab: LS.get('sss_atab') || 'orders',
    sheet: null, // { itemId, targetTeamId, targetPlayerId }
    reveal: false,
    finishing: null,
  };
  const drafts = {};

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
    if (a.status !== b.status || a.teamId !== b.teamId) {
      if (b.status === 'solitary') toast(`🔒 You’ve been thrown in SOLITARY (${plural(b.solitary.rounds, 'round')}).`, 'warn');
      else if (b.status === 'holding') toast('🕳️ You’re in the Holding Cell. Earn your way onto a block!', 'warn');
      else if (b.teamId) toast(`🔐 You’re on ${teamName(b.teamId)}.`, 'ok');
      buzz(300);
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
            <p class="fine">You’ll start in the Holding Cell with an inmate number and a charge until the Warden puts you on a block. Keep this tab open all night — it remembers you.</p>
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
      ['cell', me.status === 'block' ? '🔐' : me.status === 'holding' ? '🕳️' : '🔒', me.status === 'block' ? 'My Block' : me.status === 'holding' ? 'Holding' : 'Solitary'],
      ['rap', '🗂️', 'Rap Sheet'],
      ['board', '🏆', 'Board'],
    ];
    const body = { yard: yardTab, shop: shopTab, cell: cellTab, rap: rapTab, board: boardTab }[ui.tab] || yardTab;
    return `
      <header class="top">
        <div class="top-row">
          <div class="who">
            <div class="who-name">${h(me.name)} ${me.isCaptain ? '<span title="Shot Caller">👑</span>' : ''}</div>
            <div class="who-sub">#${h(me.inmateNo)} · ${statusChip(me)}</div>
          </div>
          ${myTeam ? `<div class="credits" title="${h(myTeam.name)} credits"><div class="credits-n">${myTeam.budget}</div><div class="credits-l">credits</div></div>` : ''}
        </div>
      </header>
      ${phaseBanner()}
      ${announcement()}
      ${drinkCard()}
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
    if (me.status === 'solitary') return false;
    if (m.phase === 'vote') return me.status === 'block' && !m.myVote;
    if (m.phase === 'night') return !m.myNight;
    return false;
  }

  const myIncoming = () => (S.orders || []).filter(isIncomingFor(S));

  function phaseBanner() {
    const m = S.mafia;
    if (m.phase === 'night') return `<div class="phase night">🌙 LIGHTS OUT — Night ${m.round}${kind === 'player' ? ' · everyone pick a name on your Rap Sheet' : ''}</div>`;
    if (m.phase === 'vote') return `<div class="phase vote">🗳️ BLOCK VOTES OPEN · ${plural(m.votesCast, 'vote')} cast</div>`;
    if (m.phase === 'over') return `<div class="phase over">${m.winner === 'snitches' ? '🐀 Snitches got away with it!' : '🎉 Every snitch was caught!'}</div>`;
    return '';
  }

  function announcement() {
    if (!S.announcement) return '';
    return `<div class="announce"><span class="mega">📣</span><div><div class="announce-t">${h(S.announcement.text)}</div><div class="fine">from the Warden · ${time(S.announcement.ts)}</div></div></div>`;
  }

  function drinkCard() {
    const me = S.me;
    if (!me.drinksOwed) return '';
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
        <p class="fine">Get out by getting bailed 🔑 by a block (they buy it at the commissary) or by impressing the Warden. ${st.holdingDrinks ? `+${plural(st.holdingDrinks, 'drink')} every round you’re in here.` : ''}</p>
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
      ${live.holdingRule ? `<p class="rule">🕳️ Holding Cell: ${h(live.holdingRule)}</p>` : ''}
      ${live.solitaryRule ? `<p class="rule">🔒 Solitary: ${h(live.solitaryRule)}</p>` : ''}</section>`;
  }

  function yardTab() {
    const live = S.games.find((g) => g.status === 'live');
    return `
      ${lockupRules(S.me.status, live)}
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
          : S.settings.captainOnlySpending && !me.isCaptain
            ? 'Only your Shot Caller 👑 can spend tonight. Lobby them.'
            : '';
    const groups = Object.entries(S.itemTypes)
      .map(([type, info]) => [type, info, S.items.filter((i) => i.type === type)])
      .filter(([, , list]) => list.length);
    return `
      <section class="card shop-head">
        <div><div class="eyebrow">Commissary</div><h2>${myTeam ? `${myTeam.budget} credits` : 'No account'}</h2><p class="fine">Spending comes out of your whole block’s budget.</p></div>
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
              const broke = myTeam && myTeam.budget < it.price;
              const disabled = blocked || soldOut || broke;
              return `<button class="item t-${h(it.type)}" data-act="buy-open" data-item-id="${it.id}" ${disabled ? 'disabled' : ''}>
                <span class="item-e">${h(it.emoji)}</span>
                <span class="item-n">${h(it.name)}</span>
                <span class="item-d">${h(it.desc)}</span>
                <span class="item-p">${soldOut ? 'SOLD OUT' : `${it.price} cr`}${it.stock !== null && !soldOut ? ` · ${it.stock} left` : ''}${it.drinks ? ` · 🍺×${it.drinks}` : ''}</span>
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
      <div class="sheet" role="dialog" aria-label="Buy ${h(it.name)}">
        <div class="sheet-h"><span class="mega">${h(it.emoji)}</span><div><h2>${h(it.name)}</h2><p class="fine">${h(it.desc)}</p></div></div>
        ${picker}
        ${['supply', 'gift', 'punishment'].includes(it.type) ? `
          <label for="buy_note">${it.type === 'punishment' ? 'Trash talk (optional)' : 'Note for the bartender (optional)'}</label>
          <input id="buy_note" maxlength="120" placeholder="${it.type === 'punishment' ? 'Enjoy, losers' : 'e.g. vodka soda, extra lime'}" />` : ''}
        <div class="row sheet-actions">
          <button class="btn ghost" data-act="sheet-close">Cancel</button>
          <button class="btn" data-act="buy-confirm" ${ready ? '' : 'disabled'}>Buy for ${it.price} cr</button>
        </div>
        <p class="fine center">${myTeam ? `${h(myTeam.name)} has ${myTeam.budget} credits.` : ''}</p>
      </div>`;
  }

  const ORDER_STATUS = { incoming: 'awaiting response', pending: 'with the Warden', done: 'done', cancelled: 'cancelled' };

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
      <section class="card cell-head" style="--c:${h(myTeam.color)}">
        <div class="eyebrow">Your block</div>
        <h2>${h(myTeam.name)}</h2>
        <div class="stats"><div><b>${myTeam.budget}</b><span>credits</span></div><div><b>${myTeam.earned}</b><span>earned tonight</span></div><div><b>${members.length}/${S.settings.maxBlockSize}</b><span>inmates</span></div></div>
      </section>
      <section class="card">
        <h3>Contraband stash</h3>
        <div class="stash">
          <div class="stash-i"><span class="mega">🔄</span><b>${inv.deflect || 0}</b><span>Snitch Slips<br/><small>bounce a punishment back</small></span></div>
          <div class="stash-i"><span class="mega">💵</span><b>${inv.immunity || 0}</b><span>Bribes<br/><small>block-vote immunity</small></span></div>
        </div>
        ${voteOpen && inv.immunity && me.status === 'block' ? `
          <p class="fine">Block vote is open — bribe a guard to protect someone on your block:</p>
          <div class="targets">${members.filter((p) => p.status === 'block').map((p) => `<button class="target" style="--c:${h(myTeam.color)}" data-act="immunity" data-target-id="${p.id}" ${immune.has(p.id) ? 'disabled' : ''}>${immune.has(p.id) ? '🛡️ ' : ''}${h(p.name)}</button>`).join('')}</div>` : ''}
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
            ? `<div class="mega">${role.emoji}</div><h2>${h(role.name)}</h2><p>${h(role.blurb)}</p>${me.revealed ? '<p class="fine">You’ve been exposed. Your powers are gone.</p>' : ''}<p class="fine">Tap to hide</p>`
            : `<div class="mega">🗂️</div><h2>Secret role</h2><p class="fine">Tap to reveal. Shield your screen!</p>`}
        </section>` : ''}
      ${mafiaPanel()}`;
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
        <div class="targets">${targets.map((p) => `<button class="target ${m.myNight === p.id ? 'on' : ''}" data-act="night" data-target-id="${p.id}">${h(p.name)}</button>`).join('')}</div>
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
            <span class="v-n">${h(p.name)}${p.id === me.id ? ' (you)' : ''} ${immune.has(p.id) ? '🛡️' : ''}</span><span class="v-c">${tally[p.id] || 0}</span></button>`)
          .join('')}
          <button class="vote skip ${m.myVote === 'skip' ? 'on' : ''}" data-act="vote" data-target-id="skip"><span class="bar" style="width:${((tally.skip || 0) / max) * 100}%"></span><span class="v-n">Keep everyone</span><span class="v-c">${tally.skip || 0}</span></button>
        </div>
        <p class="fine">Needs a majority of the block. Catch the snitch: +${S.settings.snitchBounty} credits and they go to solitary. Kick an innocent: −${S.settings.wrongfulPenalty} credits and they go to the Holding Cell. 🛡️ = bribed.</p>
      </section>`;
    }
    return `<section class="card"><h3>☀️ Daytime in the yard</h3>${m.lastResult ? `<p>${h(m.lastResult.text)}</p>` : ''}${m.lastResult?.whispers?.length ? `<p class="fine">Most suspected: ${h(m.lastResult.whispers.join(', '))}</p>` : ''}<p class="fine">Watch your blockmates. Who’s acting shifty? The Warden will call the next Lights Out or Block Vote.</p></section>`;
  }

  function standings() {
    return [...S.teams].sort((a, b) => b.earned - a.earned || b.budget - a.budget);
  }

  function drinkTab(limit = 50) {
    const owing = S.players.filter((p) => p.drinksOwed > 0).sort((a, b) => b.drinksOwed - a.drinksOwed).slice(0, limit);
    return owing.length ? `<ul class="roster">${owing.map((p) => `<li>${h(p.name)} <span class="fine">${statusChip(p)}</span> <b class="drink-owed">🍺×${p.drinksOwed}</b></li>`).join('')}</ul>` : '<p class="empty">Everyone’s paid up. For now.</p>';
  }

  function boardTab() {
    const rows = standings();
    return `
      <section class="card">
        <h3>🏆 Block Standings</h3>
        ${rows.length ? `<ol class="board">${rows
          .map((t, i) => `<li style="--c:${h(t.color)}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}<small>${plural(blockmates(t.id).length, 'inmate')}</small></span><span class="b-s"><b>${t.earned}</b><small>earned · ${t.budget} left</small></span></li>`)
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
    const tabs = [
      ['orders', `🧾 Orders${pending + incoming ? ` <b class="badge">${pending + incoming}</b>` : ''}`],
      ['money', '💰 Payouts'],
      ['games', '🏁 Games'],
      ['blocks', '🔐 Blocks'],
      ['lockup', `⛓️ Lockup${lockup ? ` <b class="badge grey">${lockup}</b>` : ''}`],
      ['shop', '🛒 Commissary'],
      ['mafia', '🐀 Snitches'],
      ['settings', '⚙️ Settings'],
    ];
    const body = { orders: aOrders, money: aMoney, games: aGames, blocks: aBlocks, lockup: aLockup, shop: aShop, mafia: aMafia, settings: aSettings }[ui.atab] || aOrders;
    return `
      <header class="top admin-top">
        <div class="top-row">
          <div class="who"><div class="who-name">🔑 Warden Control Room</div><div class="who-sub">${h(S.settings.partyName)} · ${plural(S.players.length, 'inmate')} · ${plural(S.teams.length, 'block')}</div></div>
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
      <section class="card"><h3>🍹 To deliver / enforce (${pending.length})</h3>${pending.length ? `<ul class="olist">${pending.map(orderRow).join('')}</ul>` : '<p class="empty">Queue is clear. Go get a drink, Warden.</p>'}</section>
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
          <label>🕳️ Extra rule for Holding Cell<input id="g_hold" name="holdingRule" maxlength="160" placeholder="Must flip with your off hand" /></label>
          <label>🔒 Extra rule for Solitary<input id="g_sol" name="solitaryRule" maxlength="160" placeholder="Drink a full cup every flip" /></label>
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
            ${g.holdingRule ? `<div class="fine">🕳️ ${h(g.holdingRule)}</div>` : ''}${g.solitaryRule ? `<div class="fine">🔒 ${h(g.solitaryRule)}</div>` : ''}
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
    return `<form data-form="finish" data-game-id="${g.id}" class="finish">
      <p class="fine">Credits for each block (leave blank for 0, negative to fine):</p>
      <div class="grid2">${S.teams.map((t) => `<label>${chip(t)}<input id="fin_${g.id}_${t.id}" name="pts_${t.id}" type="number" inputmode="numeric" placeholder="0" /></label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="fin_${g.id}_pen" name="penalties" checked /> Apply round penalties (Holding +${S.settings.holdingDrinks} 🍺, Solitary +${S.settings.solitaryDrinks} 🍺, sentences −1)</label>
      <div class="row"><button type="button" class="btn ghost sm" data-act="finish-close">Cancel</button><button class="btn sm">Pay out & close game</button></div>
    </form>`;
  }

  function playerRow(p, extra = '') {
    return `<div class="prow ${p.status}">
      <div class="p-n"><b>${h(p.name)}</b> <span class="fine">#${h(p.inmateNo)} · ${h(roleOf(p.role)?.emoji)}${p.revealed ? ' (exposed)' : ''}${p.drinksOwed ? ` · 🍺×${p.drinksOwed}` : ''}</span> ${p.status === 'solitary' ? `<span class="chip red">🔒 ${plural(p.solitary.rounds, 'rd')}</span>` : ''}</div>
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
        ${S.players.length ? `<div class="ptable">${S.players
          .map((p) => playerRow(p, `
              ${p.teamId ? btn(p.isCaptain ? '👑 Captain' : 'Make 👑', 'updatePlayer', { playerId: p.id, isCaptain: !p.isCaptain }, p.isCaptain ? 'sm' : 'ghost sm') : ''}
              ${btn('🗑', 'removePlayer', { playerId: p.id }, 'ghost sm', `Remove ${p.name} from the party? Their phone gets logged out.`)}`))
          .join('')}</div>` : `<p class="empty">Nobody booked yet. Put the TV screen up so people can scan the QR code.</p>`}
      </section>`;
  }

  function aLockup() {
    const st = S.settings;
    const holding = inHolding();
    const solitary = inSolitary();
    return `
      <section class="card">
        <h3>🕳️ Holding Cell (${holding.length})</h3>
        <p class="fine">Late arrivals and anyone kicked off a block. Parole them onto a block with the dropdown, or let blocks buy a 🔑 Bail Bond.</p>
        ${holding.length ? `<div class="ptable">${holding.map((p) => playerRow(p, `${btn('🔒 Solitary', 'sendToSolitary', { playerId: p.id, rounds: 1, reason: 'Warden’s orders' }, 'ghost sm')}${drinkBtns(p)}`)).join('')}</div>` : '<p class="empty">Empty.</p>'}
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
      <label>Credit drain (punishments)<input id="${prefix}_drain" name="drain" type="number" min="0" value="${h(it.drain ?? 0)}" /></label>`;
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
              <summary><span class="mega">${h(it.emoji)}</span> <b>${h(it.name)}</b> <span class="fine">${it.price} cr · ${h(S.itemTypes[it.type]?.label)}${it.drinks ? ` · 🍺×${it.drinks}` : ''}${it.stock !== null ? ` · ${it.stock} left` : ''}${it.active ? '' : ' · HIDDEN'}</span></summary>
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
        <h3>Secret roles (Warden eyes only)</h3>
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
          <label class="check span2"><input type="checkbox" id="s_capt" name="captainOnlySpending" ${st.captainOnlySpending ? 'checked' : ''} /> Only Shot Callers 👑 can spend</label>
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
    const holding = inHolding();
    const solitary = inSolitary();
    return `
      <div class="tv">
        <header class="tv-h"><div class="bars thin"></div><h1 class="logo">${h(S.settings.partyName)}</h1><div class="tagline">${h(S.settings.tagline)}</div></header>
        ${phaseBanner()}
        ${S.announcement ? `<div class="announce tv-ann"><span class="mega">📣</span><div class="announce-t">${h(S.announcement.text)}</div></div>` : ''}
        <div class="tv-grid">
          <section class="card">
            <h2>🏆 Standings</h2>
            <ol class="tv-board">${rows.map((t, i) => `<li style="--c:${h(t.color)}"><span class="rank">${i + 1}</span><span class="b-n">${h(t.name)}</span><span class="tv-bar"><i style="width:${(t.earned / max) * 100}%"></i></span><b>${t.earned}</b></li>`).join('') || '<p class="empty">No blocks yet</p>'}</ol>
            ${m.phase === 'vote' ? `<h3 class="section-h">🗳️ Block votes</h3>${S.teams.map((t) => {
              const tally = m.tallies?.[t.id] || {};
              const top = Object.entries(tally).filter(([id]) => id !== 'skip').sort((a, b) => b[1] - a[1])[0];
              return `<div class="fine">${chip(t)} ${Object.values(tally).reduce((a, b) => a + b, 0)} votes${top ? ` · leading: <b>${h(player(top[0])?.name)}</b> (${top[1]})` : ''}</div>`;
            }).join('')}` : ''}
          </section>
          <section class="card">
            ${live ? `<div class="eyebrow">🏁 Now in the yard</div><h2 class="tv-live">${h(live.name)}</h2>${live.desc ? `<p>${h(live.desc)}</p>` : ''}${live.holdingRule ? `<p class="rule">🕳️ Holding: ${h(live.holdingRule)}</p>` : ''}${live.solitaryRule ? `<p class="rule">🔒 Solitary: ${h(live.solitaryRule)}</p>` : ''}` : next ? `<div class="eyebrow">Up next</div><h2 class="tv-live">${h(next.name)}</h2>` : `<div class="eyebrow">Yard</div><h2>Free time 🍻</h2>`}
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

  // ---------- events ----------
  const ACTIONS = {
    tab: (d) => { ui.tab = d.tab; ui.reveal = false; LS.set('sss_tab', d.tab); window.scrollTo(0, 0); render(); },
    atab: (d) => { ui.atab = d.tab; LS.set('sss_atab', d.tab); render(); },
    reveal: () => { ui.reveal = !ui.reveal; render(); },
    'buy-open': (d) => { ui.sheet = { itemId: d.itemId, targetTeamId: null, targetPlayerId: null }; delete drafts.buy_note; render(); },
    'sheet-close': () => { ui.sheet = null; render(); },
    'pick-target': (d) => { ui.sheet.targetTeamId = d.teamId; render(); },
    'pick-player': (d) => { ui.sheet.targetPlayerId = d.playerId; render(); },
    'buy-confirm': async () => {
      const noteEl = document.getElementById('buy_note');
      const { itemId, targetTeamId, targetPlayerId } = ui.sheet;
      const res = await act('buy', { itemId, targetTeamId, targetPlayerId, note: noteEl ? noteEl.value : '' });
      if (!res.ok) return;
      const it = S.items.find((i) => i.id === itemId);
      const r = res.result || {};
      if (r.status === 'intel') toast(r.hasSnitch ? '📡 Wiretap says: there IS a snitch on your block. 🐀' : '📡 Wiretap says: your block is clean. For now.', r.hasSnitch ? 'warn' : 'ok');
      else if (r.status === 'stashed') toast(`${it?.emoji || ''} Stashed on your block. Shhh.`, 'ok');
      else if (it?.type === 'bail') toast('🔑 Bail posted. Welcome your new blockmate.', 'ok');
      else toast(`${it?.emoji || ''} Ordered! The Warden is on it.`, 'ok');
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
        if (['addGame', 'addTeam', 'addItem', 'announce', 'adjustBudget', 'sendToSolitary'].includes(form.dataset.admin)) form.reset();
        render();
        toast('Done ✔', 'ok');
      }
    }
  });

  render();
})();
