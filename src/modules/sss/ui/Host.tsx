'use client';

import { useState } from 'react';
import { Countdown, Do, Feed, RoundHead, Standings, TeamChip, useGame } from './common';
import BarQueue from './BarQueue';
import { PlayHost } from './Plays';
import { fill } from '../messages';
import type { hostView } from '../engine/views';

type View = ReturnType<typeof hostView>;
type Round = NonNullable<View['round']>;

/** The host's console for the game: run the round in front of you, make rulings, set the night up. */
export default function Host() {
  const { view, v } = useGame<View>();
  const round = view.round;
  const live = round && round.phase !== 'done' ? round : null;
  const teams = view.teams.map((t) => t.id);

  return (
    <div className="g-host">
      <RoundHead round={round} />
      {view.winner ? (
        <div className="notice">
          <strong>{v.team(view.winner.teamId)}</strong> won the night. <Do type="clearWinner" quiet>TAKE THE CROWN BACK</Do>
        </div>
      ) : null}

      {!teams.length ? <div className="notice">Nobody is on a {v.group} yet. Check people in and run the draw; the game picks them up by itself.</div> : null}

      {!live ? <StartRound /> : null}
      {live?.phase === 'game' ? <GamePhase round={live} teams={teams} /> : null}
      {live?.phase === 'results' ? <Results round={live} teams={teams} /> : null}
      {live?.phase === 'spending' ? <Spending round={live} /> : null}
      {live?.phase === 'drinks' ? <BarQueue round={live} /> : null}

      <h2>Standings</h2>
      <Standings teams={view.teams} pointsAsOf={view.pointsAsOf} incomeStep={view.settings.streamStep} />
      <p className="small">
        Standard drinks sent tonight: <span className="mono">{view.standards.sent}</span> of a planned <span className="mono">{view.standards.target}</span>, after{' '}
        {view.standards.played} of {view.standards.rounds} rounds.
      </p>

      <details className="g-fold">
        <summary>Rulings: cash, points, drinks and orders</summary>
        <Rulings />
      </details>
      <details className="g-fold" open={!view.rounds.length}>
        <summary>Set up the night: rounds, games and the order they’re played</summary>
        <Setup />
      </details>

      <h2>What’s happened</h2>
      <Feed feed={view.feed} limit={30} />
    </div>
  );
}

function StartRound() {
  const { view, v } = useGame<View>();
  const next = view.rounds.length + 1;
  const over = next > view.plan.total;
  const act = Math.floor((next - 1) / view.plan.perAct);
  const planned = view.night.acts[act]?.rounds[(next - 1) % view.plan.perAct] || '';
  const [gameId, setGameId] = useState('');
  const chosen = gameId || planned || view.games.find((g) => g.status !== 'done')?.id || '';
  if (over) {
    return (
      <div className="box box--quiet">
        <p style={{ marginTop: 0 }}>Every round has been played.</p>
        {!view.winner ? <Do type="crownWinner">Crown the {v.group} with the most points</Do> : null}
      </div>
    );
  }
  return (
    <div className="box box--quiet">
      <label className="field" htmlFor="g-next">
        Round {next} of {view.plan.total}: which game
      </label>
      <select id="g-next" value={chosen} onChange={(e) => setGameId(e.target.value)}>
        {view.games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.runBy !== 'host' ? ' (on the phones)' : g.playersNeeded ? ` (${g.playersNeeded} per ${v.group})` : ' (everyone)'}
            {g.status === 'done' ? ' — played' : ''}
          </option>
        ))}
      </select>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <Do type="startRound" args={{ gameId: chosen }} big disabled={!chosen}>
          Start the round
        </Do>
        <Do type="setShop" args={{ open: !view.shopOpen }} quiet>
          {view.shopOpen ? `CLOSE ${v.shop.toUpperCase()}` : `OPEN ${v.shop.toUpperCase()} BETWEEN ROUNDS`}
        </Do>
      </div>
    </div>
  );
}

function GamePhase({ round, teams }: { round: Round; teams: string[] }) {
  const { v, person, view } = useGame<View>();
  const game = view.games.find((g) => g.id === round.gameId);
  if (round.play) {
    return (
      <>
        {game?.rules ? <p className="small">{fill(game.rules, v)}</p> : null}
        <PlayHost play={round.play} teams={teams} />
        <p className="small">Finishing takes the round to Results with the app’s placings filled in, for you to check.</p>
      </>
    );
  }
  return (
    <div className="box box--quiet">
      {game?.rules ? <p className="small">{fill(game.rules, v)}</p> : null}
      {round.isGroup ? (
        <p style={{ marginTop: 0 }}>Everyone plays. Run the game, then enter the results.</p>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            {round.revealedAt ? 'Picks are in.' : `Each ${v.group} is picking ${round.playersNeeded} on its phone.`} <Countdown until={round.revealedAt ? null : round.pickDeadline} />
          </p>
          <ul className="g-reveal">
            {teams.map((id) => (
              <li key={id}>
                <TeamChip id={id} />{' '}
                {round.picks[id] ? round.picks[id].map(person).join(', ') || 'nobody free to play' : <span className="small">still picking</span>}
                {round.pickedBy[id] === 'auto' ? <span className="small"> (picked for them)</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="btn-row">
        {!round.revealedAt ? (
          <Do type="revealPicks" quiet>
            REVEAL PICKS NOW
          </Do>
        ) : null}
        <Do type="toResults" big>
          The game’s over: enter results
        </Do>
      </div>
    </div>
  );
}

function Results({ round, teams }: { round: Round; teams: string[] }) {
  const { send, busy, v, view } = useGame<View>();
  const [places, setPlaces] = useState<Record<string, string>>(() => Object.fromEntries(teams.map((id) => [id, String(round.proposed?.[id] ?? '')])));
  const [rewards, setRewards] = useState<Record<string, string>>({});
  const prize = (place: number) => (place >= 1 ? view.settings.prizeMoney[Math.min(place, view.settings.prizeMoney.length) - 1] ?? 0 : 0);
  return (
    <form
      className="box box--quiet"
      onSubmit={(e) => {
        e.preventDefault();
        send('enterResults', { placings: places, rewards: Object.fromEntries(Object.entries(rewards).filter(([, x]) => x !== '')) });
      }}
    >
      <p style={{ marginTop: 0 }}>
        Where did each {v.group} place? First place wins the round. {round.proposed ? 'The app has filled these in from the game; change any that are wrong.' : ''}
      </p>
      <div className="scroller"><table className="list">
        <thead>
          <tr>
            <th>{v.group}</th>
            <th>Place</th>
            <th>Prize (leave blank for the usual)</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((id) => (
            <tr key={id}>
              <td>
                <TeamChip id={id} />
              </td>
              <td>
                <select value={places[id] ?? ''} onChange={(e) => setPlaces({ ...places, [id]: e.target.value })} aria-label={`Place for ${v.team(id)}`}>
                  <option value="">didn’t place</option>
                  {teams.map((_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  placeholder={places[id] ? String(prize(Number(places[id]))) : '0'}
                  value={rewards[id] ?? ''}
                  onChange={(e) => setRewards({ ...rewards, [id]: e.target.value })}
                  aria-label={`Prize for ${v.team(id)}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <button className="btn g-big" type="submit" disabled={busy}>
        Pay the prizes and open {v.shop}
      </button>
    </form>
  );
}

function Spending({ round }: { round: Round }) {
  const { v, view } = useGame<View>();
  const waiting = view.orders.filter((o) => o.type === 'drink' && o.status === 'pending' && !o.queuedRound);
  return (
    <div className="box box--quiet">
      <p style={{ marginTop: 0 }}>
        {v.shop.charAt(0).toUpperCase() + v.shop.slice(1)} is open. <Countdown until={round.shopDeadline} label="Closes in" />
      </p>
      <p className="small">
        {waiting.length} drink order{waiting.length === 1 ? '' : 's'} so far, {waiting.reduce((n, o) => n + o.qty, 0)} drinks. When the clock runs out the bar queue starts by itself.
      </p>
      <div className="btn-row">
        <Do type="startDrinks" big>
          Close {v.shop} and start drinks
        </Do>
        <Do type="extendShop" args={{ seconds: 30 }} quiet>
          +30 SECONDS
        </Do>
        <Do type="extendShop" args={{ seconds: 60 }} quiet>
          +60 SECONDS
        </Do>
      </div>
    </div>
  );
}

function Rulings() {
  const { view, send, busy, v } = useGame<View>();
  const teams = view.teams.map((t) => t.id);
  const drinks = view.items.filter((i) => i.type === 'drink');
  const [f, setF] = useState({ teamId: '', kind: 'money', amount: '', reason: '', drinkTeam: '', itemId: '', qty: '1', why: '' });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const pending = view.orders.filter((o) => o.status === 'pending');
  const TeamSelect = ({ value, onChange, id }: { value: string; onChange: (x: string) => void; id: string }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Choose a {v.group}</option>
      {teams.map((t) => (
        <option key={t} value={t}>
          {v.team(t)}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <form
        className="g-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const out = await send(f.kind === 'money' ? 'adjustMoney' : 'adjustPoints', { teamId: f.teamId, amount: f.amount, reason: f.reason });
          if (out.ok) set({ amount: '', reason: '' });
        }}
      >
        <div>
          <label className="field" htmlFor="r-team">Give or take</label>
          <TeamSelect id="r-team" value={f.teamId} onChange={(x) => set({ teamId: x })} />
        </div>
        <div>
          <label className="field" htmlFor="r-kind">What</label>
          <select id="r-kind" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="money">Cash</option>
            <option value="points">Points</option>
          </select>
        </div>
        <div>
          <label className="field" htmlFor="r-amount">Amount (minus to take)</label>
          <input id="r-amount" type="number" value={f.amount} onChange={(e) => set({ amount: e.target.value })} required />
        </div>
        <div>
          <label className="field" htmlFor="r-reason">Why (shown in the feed)</label>
          <input id="r-reason" type="text" maxLength={80} value={f.reason} onChange={(e) => set({ reason: e.target.value })} />
        </div>
        <button className="btn btn--inline" type="submit" disabled={busy}>
          Apply
        </button>
      </form>

      <form
        className="g-row"
        onSubmit={async (e) => {
          e.preventDefault();
          const out = await send('assignDrinks', { teamId: f.drinkTeam, itemId: f.itemId || drinks[0]?.id, qty: f.qty, reason: f.why });
          if (out.ok) set({ why: '' });
        }}
      >
        <div>
          <label className="field" htmlFor="r-dteam">Send drinks to</label>
          <TeamSelect id="r-dteam" value={f.drinkTeam} onChange={(x) => set({ drinkTeam: x })} />
        </div>
        <div>
          <label className="field" htmlFor="r-item">Drink</label>
          <select id="r-item" value={f.itemId || drinks[0]?.id} onChange={(e) => set({ itemId: e.target.value })}>
            {drinks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.emoji} {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field" htmlFor="r-qty">How many</label>
          <input id="r-qty" type="number" min={1} max={10} value={f.qty} onChange={(e) => set({ qty: e.target.value })} />
        </div>
        <div>
          <label className="field" htmlFor="r-why">Why</label>
          <input id="r-why" type="text" maxLength={80} value={f.why} onChange={(e) => set({ why: e.target.value })} />
        </div>
        <button className="btn btn--inline" type="submit" disabled={busy}>
          Add to the next queue
        </button>
      </form>
      <p className="small">Drinks from {v.host} score nobody. They can’t be added once this round’s queue is built.</p>

      <h3>Orders waiting ({pending.length})</h3>
      {pending.length ? (
        <div className="scroller"><table className="list">
          <tbody>
            {pending.slice(0, 40).map((o) => (
              <tr key={o.id}>
                <td>
                  {o.qty}× {o.emoji} {o.name}
                </td>
                <td>
                  {o.origin ? <span className="small">{o.origin}</span> : <TeamChip id={o.fromTeamId} />} → <TeamChip id={o.targetTeamId} />
                </td>
                <td>
                  <Do type="resolveOrder" args={{ orderId: o.id, action: 'cancel' }} quiet confirm="Cancel this order and refund it?">
                    CANCEL
                  </Do>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p className="small">None.</p>
      )}
    </>
  );
}

function Setup() {
  const { view, send, busy, v } = useGame<View>();
  const s = view.settings;
  const played = view.rounds.length;
  const [editing, setEditing] = useState<string | null>(null);
  const NUMBERS: [keyof typeof s, string][] = [
    ['actsCount', 'Acts'],
    ['roundsPerAct', 'Rounds per act'],
    ['startingBudget', 'Starting cash'],
    ['pickSeconds', 'Seconds to pick players'],
    ['shopSeconds', 'Seconds the shop stays open (0 = you close it)'],
    ['serveSeconds', 'Seconds at the bar'],
    ['cooldownGames', 'Games a player sits out after playing'],
    ['questionSeconds', 'Seconds per trivia question'],
  ];
  return (
    <>
      <form
        className="g-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          send('updateSettings', Object.fromEntries([...data.entries()]));
        }}
      >
        {NUMBERS.map(([key, label]) => (
          <div key={key}>
            <label className="field" htmlFor={`s-${key}`}>{label}</label>
            <input id={`s-${key}`} name={key} type="number" defaultValue={s[key] as number} key={`${key}-${s[key]}`} />
          </div>
        ))}
        <div style={{ gridColumn: 'span 2' }}>
          <label className="field" htmlFor="s-prizes">Prize money, first place down</label>
          <input id="s-prizes" name="prizeMoney" type="text" defaultValue={s.prizeMoney.join(', ')} key={s.prizeMoney.join()} />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button className="btn btn--inline" type="submit" disabled={busy}>
            Save
          </button>
        </div>
      </form>
      <p className="small">Starting cash only applies to a {v.group} that hasn’t been seen yet. Points are published at the end of each act.</p>

      <h3>The order of play</h3>
      <p className="small">Optional. Without it you choose the game as you start each round.</p>
      <div className="scroller"><table className="list">
        <tbody>
          {view.night.acts.map((act, a) => (
            <tr key={act.id}>
              <td>
                <input
                  type="text"
                  aria-label={`Name for act ${a + 1}`}
                  placeholder={`Act ${a + 1}`}
                  defaultValue={act.name}
                  maxLength={40}
                  onBlur={(e) => e.target.value !== act.name && send('renameAct', { act: a + 1, name: e.target.value })}
                />
              </td>
              {act.rounds.map((gameId, i) => {
                const number = a * view.plan.perAct + i + 1;
                return (
                  <td key={i}>
                    <select aria-label={`Game for round ${number}`} value={gameId || ''} disabled={busy || number <= played} onChange={(e) => send('setSlot', { act: a + 1, slot: i + 1, gameId: e.target.value })}>
                      <option value="">Round {number}: choose on the night</option>
                      {view.games.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table></div>

      <h3>Games</h3>
      <div className="scroller"><table className="list">
        <tbody>
          {view.games.map((g) => (
            <tr key={g.id}>
              <td>
                <strong>{g.name}</strong>
                <span className="small">
                  {' '}
                  {g.runBy === 'host' ? (g.playersNeeded ? `${g.playersNeeded} per ${v.group}, you score it` : 'everyone, you score it') : 'played on the phones'}
                  {g.runBy === 'trivia' ? ` · ${g.questions.length} questions` : ''}
                  {g.runBy === 'anime' ? ` · ${g.openings.length} openings` : ''}
                  {g.runBy === 'lying' || g.runBy === 'dilemma' ? ` · ${g.stories} turns` : ''}
                </span>
              </td>
              <td>
                <button className="btn btn--quiet btn--inline" type="button" onClick={() => setEditing(editing === g.id ? null : g.id)}>
                  {editing === g.id ? 'CLOSE' : 'EDIT'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {editing ? <GameEditor key={editing} gameId={editing} onClose={() => setEditing(null)} /> : null}
      <AddGame />

      <h3>The shelf</h3>
      <Shelf />

      <h3>Start over</h3>
      <Do type="restart" quiet confirm="Wipe everything that has happened and go back to round 1? The games and the order of play are kept.">
        RESTART FROM ROUND 1
      </Do>
    </>
  );
}

const KINDS: [string, string][] = [
  ['host', 'You run it and enter the results'],
  ['trivia', 'Trivia, on the phones'],
  ['coldwar', 'Cold War drinking, on the phones'],
  ['twothirds', 'Two-Thirds of the Average, on the phones'],
  ['dilemma', 'Prisoner’s Dilemma, on the phones'],
  ['anime', 'Name the opening, on the phones'],
  ['lying', 'Truth or lie, on the phones'],
];

function GameEditor({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const { view, send, busy, v } = useGame<View>();
  const g = view.games.find((x) => x.id === gameId);
  const [kind, setKind] = useState(g?.runBy ?? 'host');
  if (!g) return null;
  return (
    <form
      className="box box--quiet"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget).entries());
        const out = await send('updateGame', { gameId, ...d });
        if (out.ok) onClose();
      }}
    >
      <label className="field" htmlFor="ge-name">Name</label>
      <input id="ge-name" name="name" type="text" defaultValue={g.name} maxLength={60} required />
      <label className="field" htmlFor="ge-kind">How it’s played</label>
      <select id="ge-kind" name="runBy" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        {KINDS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {kind === 'host' ? (
        <>
          <label className="field" htmlFor="ge-players">Players each {v.group} sends (0 = everyone plays)</label>
          <input id="ge-players" name="playersNeeded" type="number" min={0} max={10} defaultValue={g.playersNeeded} />
        </>
      ) : null}
      <label className="field" htmlFor="ge-rules">How to play (shown to everyone; write {'{group}'} for the theme’s word)</label>
      <textarea id="ge-rules" name="rules" defaultValue={g.rules} />
      {kind === 'trivia' ? (
        <>
          <label className="field" htmlFor="ge-q">Questions, one per line: Question | answer | answer | answer | answer | right one (A–D)</label>
          <textarea id="ge-q" name="questions" rows={8} defaultValue={g.questionsText} />
        </>
      ) : null}
      {kind === 'anime' ? (
        <>
          <label className="field" htmlFor="ge-o">Openings, one per line: Label | anime | other spellings…</label>
          <textarea id="ge-o" name="openings" rows={8} defaultValue={g.openingsText} />
        </>
      ) : null}
      {kind === 'lying' || kind === 'dilemma' ? (
        <>
          <label className="field" htmlFor="ge-s">How many {kind === 'lying' ? 'stories' : 'turns'}</label>
          <input id="ge-s" name="stories" type="number" min={1} max={20} defaultValue={g.stories} />
        </>
      ) : null}
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn btn--inline" type="submit" disabled={busy}>
          Save game
        </button>
        <Do type="removeGame" args={{ gameId }} quiet confirm={`Remove ${g.name} from the library?`} onDone={(o) => o.ok && onClose()}>
          REMOVE
        </Do>
      </div>
    </form>
  );
}

function AddGame() {
  const { send, busy } = useGame<View>();
  const [name, setName] = useState('');
  return (
    <form
      className="g-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const sent = name;
        const out = await send('addGame', { name: sent });
        // Clear only what was sent: typing the next name while this one saves must not lose it.
        if (out.ok) setName((now) => (now === sent ? '' : now));
      }}
    >
      <div>
        <label className="field" htmlFor="ag-name">Add a game</label>
        <input id="ag-name" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
      </div>
      <button className="btn btn--inline" type="submit" disabled={busy}>
        Add, then edit it
      </button>
    </form>
  );
}

/** Prices, points and what's on the shelf. Each row saves on its own. */
function Shelf() {
  const { view, send, busy, v } = useGame<View>();
  return (
    <>
      <p className="small">
        A drink scores its points for the {v.group} that sent it when it’s served. Bundle prices (5 or 10 at once) are fixed. Untick an item to take it off the
        shelf.
      </p>
      <div className="scroller"><table className="list">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Points</th>
            <th>On the shelf</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {view.items.map((it) => (
            <tr key={`${it.id}-${it.price}-${it.points}-${it.active}`}>
              <td>
                {it.emoji} {it.name}
              </td>
              <td>
                {it.type === 'bounty' ? <span className="small">staked in points</span> : <input form={`sh-${it.id}`} name="price" type="number" min={0} defaultValue={it.price} aria-label={`Price of ${it.name}`} style={{ width: 90 }} />}
              </td>
              <td>{it.type === 'drink' ? <input form={`sh-${it.id}`} name="points" type="number" min={0} max={50} defaultValue={it.points} aria-label={`Points for ${it.name}`} style={{ width: 80 }} /> : null}</td>
              <td>
                <input form={`sh-${it.id}`} name="active" type="checkbox" defaultChecked={it.active} aria-label={`${it.name} on the shelf`} />
              </td>
              <td>
                <form
                  id={`sh-${it.id}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    send('updateItem', { itemId: it.id, ...(d.has('price') ? { price: d.get('price') } : {}), ...(d.has('points') ? { points: d.get('points') } : {}), active: d.get('active') === 'on' });
                  }}
                >
                  <button className="btn btn--quiet btn--inline" type="submit" disabled={busy}>
                    SAVE
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
