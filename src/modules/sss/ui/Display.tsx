'use client';

import { Countdown, Feed, RoundHead, Standings, TeamChip, useGame } from './common';
import { PlayPublic } from './Plays';
import { fill, sayFeed } from '../messages';
import type { displayView } from '../engine/views';

type View = ReturnType<typeof displayView>;

/** The TV: what the whole room may know, big enough to read from the back. */
export default function Display() {
  const { view, v, person } = useGame<View>();
  const round = view.round;
  const live = round && round.phase !== 'done' ? round : null;
  const teams = view.teams.map((t) => t.id);
  const game = round ? view.games.find((g) => g.id === round.gameId) : null;

  return (
    <div className="g-tv">
      {view.flash ? <div className="g-flash">{sayFeed(view.flash.kind, view.flash.params, v)}</div> : null}
      <div className="g-tv__main">
        <RoundHead round={round} />
        {view.winner ? (
          <h1 className="g-tv__headline">
            <TeamChip id={view.winner.teamId} /> wins the night
          </h1>
        ) : null}

        {live?.phase === 'game' ? (
          <>
            <h1 className="g-tv__headline">{live.gameName}</h1>
            {game?.rules ? <p className="g-tv__rules">{fill(game.rules, v)}</p> : null}
            {live.play ? (
              <PlayPublic play={live.play} teams={teams} />
            ) : live.isGroup ? (
              <p className="lede">Everyone plays.</p>
            ) : live.revealedAt ? (
              <ul className="g-reveal">
                {teams.map((id) => (
                  <li key={id}>
                    <TeamChip id={id} /> {(live.picks[id] || []).map(person).join(', ') || 'nobody'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lede">
                Each {v.group} is picking {live.playersNeeded} to play. {live.picked.length} of {teams.length} in. <Countdown until={live.pickDeadline} />
              </p>
            )}
          </>
        ) : null}

        {live?.phase === 'results' ? <h1 className="g-tv__headline">Results coming</h1> : null}

        {live?.phase === 'spending' ? (
          <>
            <h1 className="g-tv__headline">
              {v.shop.charAt(0).toUpperCase() + v.shop.slice(1)} is open <Countdown until={live.shopDeadline} />
            </h1>
            <ol className="g-reveal">
              {Object.entries(live.placings)
                .sort((a, b) => a[1] - b[1])
                .map(([id, place]) => (
                  <li key={id}>
                    <span className="mono">{place}</span> <TeamChip id={id} /> <span className="mono">+{v.money(live.prizes[id])}</span>
                  </li>
                ))}
            </ol>
          </>
        ) : null}

        {live?.phase === 'drinks' ? (
          <>
            <h1 className="g-tv__headline">Drinks</h1>
            <ul className="g-reveal">
              {live.serves.map((s) => (
                <li key={s.teamId} className={s.servedAt && !s.finishedAt ? 'up' : ''}>
                  <TeamChip id={s.teamId} /> <span className="mono">{s.drinks}</span>{' '}
                  {s.finishedAt ? (s.failed ? 'couldn’t finish' : s.missed ? 'out of time' : 'done') : s.servedAt ? s.timerEndsAt ? <Countdown until={s.timerEndsAt} /> : 'at the bar' : 'waiting'}
                  {s.neat ? <span className="g-tag">{s.neat} neat</span> : null}
                </li>
              ))}
            </ul>
            {!live.serves.length ? <p className="lede">Nobody sent any drinks this round.</p> : null}
          </>
        ) : null}

        {!live && !view.winner ? <h1 className="g-tv__headline">{round ? 'Next round soon' : 'The game starts soon'}</h1> : null}
      </div>

      <div className="g-tv__side">
        <Standings teams={view.teams} showMoney={false} pointsAsOf={view.pointsAsOf} />
        <Feed feed={view.feed} limit={7} />
      </div>
    </div>
  );
}
