'use client';

import { useState } from 'react';
import { Countdown, Do, TeamChip, useGame } from './common';
import type { barView } from '../engine/views';

type Round = NonNullable<ReturnType<typeof barView>['round']>;
type Serve = Round['serves'][number];

/**
 * The bar's controls: who is up, what to pour, and the four things a
 * bartender can say about a team. Every button names its team, so a
 * second tap can't skip anyone. Used by the bar's tablet and the host.
 */
export default function BarQueue({ round }: { round: Round }) {
  const { v } = useGame();
  const [showSenders, setShowSenders] = useState(false);
  const serves = round.serves;
  const up = serves.filter((s) => s.servedAt && !s.finishedAt);
  const waiting = serves.filter((s) => !s.servedAt);
  const done = serves.filter((s) => s.finishedAt);
  const next = waiting[0];
  const lastUp = up[up.length - 1];

  if (!serves.length) return <div className="box box--quiet">Nobody was sent any drinks this round.</div>;

  return (
    <div className="g-bar">
      {up.map((s) => (
        <div className="box box--dark g-bar__up" key={s.teamId}>
          <p className="eyebrow">At the bar</p>
          <h2 className="g-bar__team">
            <TeamChip id={s.teamId} /> <span className="mono">{s.drinks} to pour</span>
          </h2>
          <Pour serve={s} showSenders={showSenders} />
          {s.timerEndsAt ? (
            <p className="g-bar__clock">
              <Countdown until={s.timerEndsAt} />
            </p>
          ) : null}
          <div className="btn-row">
            {!s.timerEndsAt ? (
              <Do type="barStart" args={{ teamId: s.teamId }} big>
                Start the clock
              </Do>
            ) : null}
            <Do type="barDone" args={{ teamId: s.teamId }} big>
              Done in time
            </Do>
            <Do type="barFail" args={{ teamId: s.teamId }} quiet confirm={`${v.team(s.teamId)} couldn’t finish? They lose points and their drink income.`}>
              COULDN’T FINISH
            </Do>
            {s === lastUp ? (
              <Do type="barBack" args={{ teamId: s.teamId }} quiet>
                BACK (CALLED BY MISTAKE)
              </Do>
            ) : null}
          </div>
        </div>
      ))}

      {next ? (
        <div className="box box--quiet">
          <p className="eyebrow">Next in line</p>
          <h2 className="g-bar__team">
            <TeamChip id={next.teamId} /> <span className="mono">{next.drinks} to pour</span>
          </h2>
          <Pour serve={next} showSenders={showSenders} />
          <Do type="barNext" args={{ teamId: next.teamId }} big>
            Call {v.team(next.teamId)} up
          </Do>
        </div>
      ) : null}

      <label className="g-check">
        <input type="checkbox" checked={showSenders} onChange={(e) => setShowSenders(e.target.checked)} /> Show who sent each drink
      </label>

      {waiting.length > 1 ? (
        <p className="small">
          Then:{' '}
          {waiting.slice(1).map((s) => (
            <span key={s.teamId}>
              <TeamChip id={s.teamId} /> <span className="mono">{s.drinks}</span>{' '}
            </span>
          ))}
        </p>
      ) : null}
      {done.length ? (
        <p className="small">
          Done:{' '}
          {done.map((s) => (
            <span key={s.teamId}>
              <TeamChip id={s.teamId} /> {s.failed ? '(couldn’t finish)' : s.missed ? '(out of time)' : `(+${v.money(s.reward)})`}{' '}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function Pour({ serve, showSenders }: { serve: Serve; showSenders: boolean }) {
  const { v } = useGame();
  const lines = 'breakdown' in serve && serve.breakdown ? serve.breakdown : [];
  if (!lines.length) return null;
  const from = (o: (typeof lines)[number]) => {
    if (o.origin === 'penalty') return o.note === 'missed_bounty' ? 'Penalty: missed a bounty' : 'Penalty: ran out of time';
    if (o.origin === 'admin') return `From ${v.host}${o.note ? `: ${o.note}` : ''}`;
    if (o.origin === 'game') return `From the game${o.note ? ` (${o.note})` : ''}`;
    if (o.origin === 'mystery') return `Mystery Box (${v.team(o.fromTeamId)})`;
    return `${v.team(o.fromTeamId)}${o.hidden ? ' (anonymous to the room)' : ''}${o.reflected ? ' (reflected)' : ''}`;
  };
  return (
    <ul className="g-pour">
      {lines.map((o, i) => (
        <li key={i}>
          <strong>
            {o.qty}× {o.emoji} {o.name}
          </strong>
          {o.noChaser ? <span className="g-tag">NEAT, NO CHASER</span> : null}
          {showSenders ? <span className="small"> {from(o)}</span> : null}
        </li>
      ))}
    </ul>
  );
}
