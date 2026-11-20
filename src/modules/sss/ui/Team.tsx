'use client';

import { useState } from 'react';
import { Countdown, Do, Feed, RoundHead, Standings, TeamChip, useGame } from './common';
import { PlayPublic, PlayTeam } from './Plays';
import { fill } from '../messages';
import { quoteDrinks } from '../engine/quote';
import type { teamView } from '../engine/views';

type View = ReturnType<typeof teamView>;
type Round = NonNullable<View['round']>;

/**
 * The team's phone. One screen that shows what this team needs right
 * now and changes by itself as the round moves on.
 */
export default function Team() {
  const { view, v } = useGame<View>();
  const me = view.teamId;
  const mine = view.teams.find((t) => t.id === me);
  const round = view.round;
  const live = round && round.phase !== 'done' ? round : null;
  const teams = view.teams.map((t) => t.id);

  if (!mine) return <div className="notice">Your {v.group} isn’t in the game yet. It joins as soon as someone on it is checked in.</div>;

  return (
    <div className="g-team">
      <div className="stat-row">
        <div className="stat">
          <p className="label">Cash</p>
          <p className="value">{v.money(mine.money)}</p>
        </div>
        <div className="stat">
          <p className="label">Points</p>
          <p className="value">{mine.points}</p>
        </div>
      </div>
      <RoundHead round={round} />

      {view.winner ? (
        <div className="box box--dark">
          <p className="eyebrow">That’s the night</p>
          <h2>{view.winner.teamId === me ? 'You won.' : `${v.team(view.winner.teamId)} won.`}</h2>
        </div>
      ) : null}

      {(mine.pickpockets ?? 0) > 0 ? <Pickpocket teams={teams.filter((t) => t !== me)} /> : null}
      {live?.phase === 'game' ? <Game round={live} me={me} teams={teams} /> : null}
      {live?.phase === 'results' ? <div className="box box--dark">The game’s over. {v.host.charAt(0).toUpperCase() + v.host.slice(1)} is entering the results.</div> : null}
      {live?.phase === 'drinks' ? <Drinks round={live} me={me} /> : null}
      {view.shopOpen ? <Shop round={live} me={me} teams={teams} /> : live?.phase === 'spending' ? null : !live ? <p className="small">{v.shop.charAt(0).toUpperCase() + v.shop.slice(1)} is closed between rounds.</p> : null}

      <Extras me={me} />

      <h2>Standings</h2>
      <Standings teams={view.teams} pointsAsOf={view.pointsAsOf} incomeStep={view.settings.streamStep} />
      <Feed feed={view.feed} limit={8} />
    </div>
  );
}

function Game({ round, me, teams }: { round: Round; me: string; teams: string[] }) {
  const { view, send, busy, v, person, membersOf } = useGame<View>();
  const [picked, setPicked] = useState<string[]>([]);
  const game = view.games.find((g) => g.id === round.gameId);
  const rules = game?.rules ? <p className="small">{fill(game.rules, v)}</p> : null;

  if (round.play) {
    return (
      <>
        {rules}
        {round.play.done ? <PlayPublic play={round.play} teams={teams} /> : <PlayTeam play={round.play} teams={teams} me={me} />}
      </>
    );
  }
  if (round.isGroup) {
    return (
      <div className="box box--dark">
        <p className="eyebrow">Everyone plays</p>
        {rules}
      </div>
    );
  }
  if (round.revealedAt) {
    return (
      <div className="box box--dark">
        <p className="eyebrow">Playing {round.gameName}</p>
        <ul className="g-reveal">
          {teams.map((id) => (
            <li key={id}>
              <TeamChip id={id} /> {(round.picks[id] || []).map(person).join(', ') || 'nobody'}
            </li>
          ))}
        </ul>
        {rules}
      </div>
    );
  }
  const mine = round.picks[me];
  if (mine) {
    return (
      <div className="box box--dark">
        <p className="eyebrow">Locked in</p>
        <p style={{ margin: 0 }}>{mine.map(person).join(', ') || 'Nobody is free to play.'} Everyone’s picks show together once the last {v.group} is in.</p>
      </div>
    );
  }
  const need = Math.min(round.playersNeeded, round.eligible.length);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < need ? [...p, id] : need === 1 ? [id] : p));
  return (
    <div className="box box--dark">
      <p className="eyebrow">
        Pick {need} to play {round.gameName} <Countdown until={round.pickDeadline} />
      </p>
      {rules}
      <div className="g-people">
        {membersOf(me).map((m) => {
          const out = !round.eligible.includes(m.id);
          return (
            <button key={m.id} type="button" className={`g-person${picked.includes(m.id) ? ' on' : ''}`} disabled={out} onClick={() => toggle(m.id)}>
              {m.name}
              <span className="small">{out ? 'played recently' : `${view.played[m.id] || 0} played`}</span>
            </button>
          );
        })}
      </div>
      <button className="btn g-big" type="button" disabled={busy || picked.length !== need} onClick={() => send('pick', { playerIds: picked })}>
        Lock in
      </button>
      <p className="small">If time runs out, whoever has played least is picked for you.</p>
    </div>
  );
}

function Drinks({ round, me }: { round: Round; me: string }) {
  const { v } = useGame<View>();
  const serves = round.serves;
  const mine = serves.find((s) => s.teamId === me);
  if (!mine) return <div className="box box--dark">Safe this round: nobody sent you anything.</div>;
  const ahead = serves.filter((s) => !s.servedAt).findIndex((s) => s.teamId === me);
  return (
    <div className="box box--dark">
      <p className="eyebrow">Drinks</p>
      {mine.finishedAt ? (
        <p style={{ margin: 0 }}>
          {mine.failed ? 'Couldn’t finish: points and drink income lost.' : mine.missed ? 'Out of time. That’s an extra shot next round.' : `Done in time: +${v.money(mine.reward)}.`}
        </p>
      ) : mine.servedAt ? (
        <>
          <h2>You’re up: {mine.drinks} to drink.</h2>
          {mine.neat ? <p className="g-tag">{mine.neat} taken neat, no chaser</p> : null}
          <p className="g-bar__clock">{mine.timerEndsAt ? <Countdown until={mine.timerEndsAt} /> : 'The clock starts once they’re poured.'}</p>
        </>
      ) : (
        <p style={{ margin: 0 }}>
          {mine.drinks} coming your way. {ahead > 0 ? `${ahead} ${ahead === 1 ? v.group : v.groups} ahead of you at the bar.` : 'You’re next at the bar.'}
        </p>
      )}
    </div>
  );
}

function Pickpocket({ teams }: { teams: string[] }) {
  const { view, v } = useGame<View>();
  return (
    <div className="box box--dark">
      <p className="eyebrow">You have a Pickpocket</p>
      <p className="small">Take half of one {v.group}’s cash, whenever you like.</p>
      <div className="btn-row">
        {teams.map((id) => (
          <Do key={id} type="pickpocket" args={{ targetTeamId: id }} quiet confirm={`Rob ${v.team(id)}?`}>
            ROB {v.team(id).toUpperCase()} ({v.money(view.teams.find((t) => t.id === id)?.money ?? 0)})
          </Do>
        ))}
      </div>
    </div>
  );
}

function Shop({ round, me, teams }: { round: Round | null; me: string; teams: string[] }) {
  const { view, send, busy, v } = useGame<View>();
  const [itemId, setItemId] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState(1);
  const [stake, setStake] = useState('');
  const [note, setNote] = useState('');
  const mine = view.teams.find((t) => t.id === me);
  const drinks = view.items.filter((i) => i.type === 'drink');
  const powerUps = view.items.filter((i) => i.type !== 'drink');
  const item = view.items.find((i) => i.id === itemId) || null;
  const quote = item?.type === 'drink' ? quoteDrinks(item, qty) : null;
  const others = teams.filter((t) => t !== me);
  const s = view.settings;

  const buy = async () => {
    if (!item) return;
    const out = await send('buy', { itemId: item.id, targetTeamId: target, qty, stake });
    if (!out.ok) return;
    const r = out.result as { mystery?: { kind: string; amount?: number; qty?: number; targetTeamId?: string } } | null;
    const m = r?.mystery;
    setNote(
      m
        ? m.kind === 'jackpot'
          ? `Jackpot: +${v.money(m.amount)}.`
          : m.kind === 'pickpocket'
            ? 'A Pickpocket. Use it whenever you like.'
            : m.kind === 'reflect'
              ? 'A Reflect for next round. Keep it quiet.'
              : `${m.qty} drinks, landing on ${m.kind === 'self' ? 'your own ' + v.group : v.team(m.targetTeamId)}.`
        : item.type === 'drink'
          ? `Sent ${qty}× ${item.name} to ${v.team(target)}.`
          : `Bought ${item.name}.`,
    );
    setItemId(null);
    setStake('');
    setQty(1);
  };

  return (
    <div className="g-shop">
      <h2>
        {v.shop.charAt(0).toUpperCase() + v.shop.slice(1)} <Countdown until={round?.shopDeadline} label="closes in" />
      </h2>
      {note ? <div className="notice" onClick={() => setNote('')}>{note}</div> : null}
      <p className="eyebrow">Send drinks: they score when they’re served</p>
      <div className="g-shelf">
        {drinks.map((d) => (
          <button key={d.id} type="button" className={`g-item${itemId === d.id ? ' on' : ''}`} onClick={() => setItemId(itemId === d.id ? null : d.id)}>
            <span className="g-item__name">
              {d.emoji} {d.name}
            </span>
            <span className="mono">
              {v.money(d.price)} · {d.points} pt{d.points === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
      <p className="eyebrow">Power-ups</p>
      <div className="g-shelf">
        {powerUps.map((d) => (
          <button key={d.id} type="button" className={`g-item${itemId === d.id ? ' on' : ''}`} onClick={() => setItemId(itemId === d.id ? null : d.id)}>
            <span className="g-item__name">
              {d.emoji} {d.name}
            </span>
            <span className="mono">{d.type === 'bounty' ? 'stake points' : v.money(d.price)}</span>
          </button>
        ))}
      </div>

      {item ? (
        <div className="box box--quiet g-buy">
          <p style={{ marginTop: 0 }}>
            <strong>
              {item.emoji} {item.name}
            </strong>
          </p>
          <p className="small">{fill(item.desc, v)}</p>
          {item.type === 'drink' ? (
            <>
              <label className="field">Send to</label>
              <div className="g-people">
                {others.map((id) => (
                  <button key={id} type="button" className={`g-person${target === id ? ' on' : ''}`} onClick={() => setTarget(id)}>
                    {v.team(id)}
                  </button>
                ))}
              </div>
              <label className="field" htmlFor="sh-qty">How many (1 to 10)</label>
              <div className="g-qty">
                <button type="button" className="btn btn--quiet btn--inline" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="One fewer">
                  −
                </button>
                <span id="sh-qty" className="mono g-qty__n">
                  {qty}
                </span>
                <button type="button" className="btn btn--quiet btn--inline" onClick={() => setQty(Math.min(10, qty + 1))} aria-label="One more">
                  +
                </button>
                {item.bundles.map((b) => (
                  <button key={b.qty} type="button" className="btn btn--quiet btn--inline" onClick={() => setQty(b.qty)}>
                    {b.qty} FOR {v.money(b.cost)}
                  </button>
                ))}
              </div>
              <p className="mono">
                Costs {v.money(quote?.cost)} · scores {quote?.points} · you have {v.money(mine?.money)}
              </p>
            </>
          ) : null}
          {item.type === 'bounty' ? (
            <>
              <label className="field" htmlFor="sh-stake">
                Points to stake ({s.bountyMinStake} to {s.bountyMaxStake}; you have {mine?.points})
              </label>
              <input id="sh-stake" type="number" min={s.bountyMinStake} max={s.bountyMaxStake} value={stake} onChange={(e) => setStake(e.target.value)} />
              <p className="small">
                Hit it and get {item.bounty === 'winner' ? s.winnerMultiplier : s.bountyMultiplier}× your stake back.
              </p>
            </>
          ) : null}
          <button className="btn g-big" type="button" disabled={busy || (item.type === 'drink' && !target) || (item.type === 'bounty' && !stake)} onClick={buy}>
            {item.type === 'drink' ? `Send ${qty}` : item.type === 'bounty' ? 'Place the bounty' : `Buy for ${v.money(item.price)}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Things the team has going on: bounties, power-ups waiting to start, Eye Spy, and what it has sent and been sent. */
function Extras({ me }: { me: string }) {
  const { view, v } = useGame<View>();
  const active = view.bounties.filter((b) => b.status === 'active');
  const sent = view.orders.filter((o) => o.type === 'drink' && o.fromTeamId === me && !o.origin).slice(0, 8);
  const incoming = view.orders.filter((o) => o.type === 'drink' && o.targetTeamId === me && o.status === 'pending');
  const owed = view.penaltiesOwed.filter((p) => p.teamId === me);
  const KIND: Record<string, string> = { reflect: 'Reflect', eyespy: 'Eye Spy', bounty: 'Your bounty starts counting' };
  if (!active.length && !view.pending.length && !view.eyeSpy && !sent.length && !incoming.length && !owed.length && !view.activeReflect) return null;
  return (
    <div className="g-extras">
      {view.activeReflect ? <div className="notice">Reflect is on this round: every drink aimed at you goes back to whoever sent it.</div> : null}
      {owed.map((p, i) => (
        <div className="notice" key={i}>
          You owe {p.qty} extra next round: {p.reason === 'missed_bounty' ? 'a missed bounty' : 'ran out of time at the bar'}.
        </div>
      ))}
      {active.map((b) => (
        <p key={b.id}>
          <strong>{b.kind === 'winner' ? 'Winner’s' : 'Open'} Bounty:</strong> {b.sent} of {view.bountyRules.target} drinks sent, {b.stake} points staked, by the end of round {b.deadlineRound}.
        </p>
      ))}
      {view.pending.map((p, i) => (
        <p key={i} className="small">
          {KIND[p.kind] || p.kind}: from round {p.round}.
        </p>
      ))}
      {incoming.length ? (
        <p>
          <strong>Coming your way:</strong>{' '}
          {incoming.map((o) => (
            <span key={o.id}>
              {o.qty}× {o.emoji} {o.name} from {o.origin ? (o.origin === 'penalty' ? 'a penalty' : o.origin === 'admin' ? v.host : 'the game') : <TeamChip id={o.fromTeamId} />}
              {o.noChaser ? ' (neat)' : ''};{' '}
            </span>
          ))}
        </p>
      ) : null}
      {sent.length ? (
        <p className="small">
          Sent:{' '}
          {sent.map((o) => (
            <span key={o.id}>
              {o.qty}× {o.name} → {v.team(o.originalTargetTeamId || o.targetTeamId)}
              {o.reflected ? ' (bounced back)' : ''}
              {o.status === 'cancelled' ? ' (cancelled)' : ''};{' '}
            </span>
          ))}
        </p>
      ) : null}
      {view.eyeSpy ? (
        <details className="g-fold">
          <summary>Eye Spy: who has sent what to whom</summary>
          <table className="list">
            <tbody>
              {view.eyeSpy.rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.round ? `Round ${r.round}` : 'waiting'}</td>
                  <td>
                    <TeamChip id={r.from === 'anonymous' ? null : r.from} /> → <TeamChip id={r.to} />
                  </td>
                  <td className="mono">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}
