'use client';

import { useState } from 'react';
import { Countdown, Do, TeamChip, useGame } from './common';

/**
 * The six games the app runs itself, from three seats: the host (who
 * moves it along), a team's phone (which answers) and the room (which
 * watches). The engine has already left out whatever each seat must
 * not see, so these only draw what they're given.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Play = Record<string, any>;

const LETTERS = 'ABCD';

function Scores({ scores, teams }: { scores: Record<string, number>; teams: string[] }) {
  const sorted = [...teams].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
  return (
    <p className="g-scores">
      {sorted.map((id) => (
        <span key={id}>
          <TeamChip id={id} /> <span className="mono">{scores[id] || 0}</span>
        </span>
      ))}
    </p>
  );
}

function Locked({ ids, teams, verb }: { ids: string[]; teams: string[]; verb: string }) {
  return (
    <p className="g-scores">
      {teams.map((id) => (
        <span key={id}>
          <TeamChip id={id} /> {ids.includes(id) ? `✓ ${verb}` : '…'}
        </span>
      ))}
    </p>
  );
}

/** What the whole room may see of the game in progress. Also the top of the host's and teams' screens. */
export function PlayPublic({ play, teams }: { play: Play; teams: string[] }) {
  const { v } = useGame();
  if (play.kind === 'coldwar' || play.kind === 'twothirds') {
    const box: Record<string, { n?: number; locked?: boolean; auto?: boolean }> = play.kind === 'coldwar' ? play.bids : play.picks;
    if (!play.revealed) {
      return (
        <>
          <p className="lede">
            {play.kind === 'coldwar' ? `Every ${v.group} is secretly picking 1 to ${play.max} shots.` : `Every ${v.group} is secretly picking a number from 0 to ${play.max}.`}{' '}
            <Countdown until={play.deadline} />
          </p>
          <Locked ids={Object.keys(box)} teams={teams} verb="locked in" />
        </>
      );
    }
    return (
      <>
        {play.kind === 'twothirds' ? (
          <p className="lede">
            The average was {play.average}. Two-thirds of it is <strong>{play.target}</strong>.
          </p>
        ) : null}
        <ol className="g-reveal">
          {(play.order as string[]).map((id) => (
            <li key={id}>
              <TeamChip id={id} /> <span className="mono">{box[id]?.n ?? 'no pick'}</span>
              {box[id]?.auto ? <span className="small"> (didn’t pick)</span> : null}
              {play.drinks?.[id] ? <span className="g-tag">drinks {play.drinks[id]}</span> : null}
            </li>
          ))}
        </ol>
      </>
    );
  }
  if (play.kind === 'trivia') {
    const q = play.question;
    if (!q) return <p className="lede">Trivia: {play.count} questions. Waiting for the first one.</p>;
    return (
      <>
        <p className="eyebrow">
          Question {play.qi + 1} of {play.count} <Countdown until={play.deadline} />
        </p>
        <h2>{q.q}</h2>
        <ol className="g-options">
          {(q.options as string[]).map((o, i) => (
            <li key={i} className={q.answer === i && play.state !== 'asking' ? 'right' : ''}>
              <span className="mono">{LETTERS[i]}</span> {o}
            </li>
          ))}
        </ol>
        {play.state === 'asking' ? <Locked ids={play.answered} teams={teams} verb="answered" /> : <Scores scores={play.scores} teams={teams} />}
      </>
    );
  }
  if (play.kind === 'lying') {
    return (
      <>
        <p className="eyebrow">
          Story {play.n || '—'} of {play.total} <Countdown until={play.deadline} />
        </p>
        {play.state === 'voting' || play.state === 'closed' ? <Locked ids={play.voted} teams={teams} verb="voted" /> : null}
        {play.state === 'revealed' ? <h2>It was {play.truth === 'truth' ? 'the truth' : 'a lie'}.</h2> : null}
        <Scores scores={play.scores} teams={teams} />
      </>
    );
  }
  if (play.kind === 'anime') {
    return (
      <>
        <p className="eyebrow">
          {play.label || 'Opening'} · {play.i + 1 > 0 ? `${play.i + 1} of ${play.count}` : `${play.count} to guess`} <Countdown until={play.deadline} />
        </p>
        {play.state === 'open' ? <p className="lede">Type the anime on your {v.group}’s phone. First right answer takes it.</p> : null}
        {play.state === 'won' ? (
          <h2>
            <TeamChip id={play.winner} /> got it: {play.answer}
          </h2>
        ) : null}
        {play.state === 'missed' ? <h2>Nobody got it: {play.answer}</h2> : null}
        <Scores scores={play.scores} teams={teams} />
      </>
    );
  }
  // dilemma
  const last = play.results?.[play.n];
  return (
    <>
      <p className="eyebrow">
        Turn {play.n || '—'} of {play.total} <Countdown until={play.deadline} />
      </p>
      <ul className="g-reveal">
        {(play.pairs as [string, string][]).map(([a, b]) => (
          <li key={a}>
            <TeamChip id={a} /> {last?.[a] ? <strong>{last[a].choice === 'snitch' ? 'snitched' : 'stayed silent'}</strong> : play.picked.includes(a) ? '✓' : '…'} vs <TeamChip id={b} />{' '}
            {b !== 'house' ? last?.[b] ? <strong>{last[b].choice === 'snitch' ? 'snitched' : 'stayed silent'}</strong> : play.picked.includes(b) ? '✓' : '…' : last?.[a] ? <strong>{last[a].theirs === 'snitch' ? 'snitched' : 'stayed silent'}</strong> : ''}
          </li>
        ))}
      </ul>
      <Scores scores={play.scores} teams={teams} />
    </>
  );
}

/** The host's controls for moving an app-run game along. */
export function PlayHost({ play, teams }: { play: Play; teams: string[] }) {
  const stepped = ['trivia', 'lying', 'anime', 'dilemma'].includes(play.kind);
  const open = play.state === 'asking' || play.state === 'open' || play.state === 'voting' || play.state === 'closed';
  const noun = { trivia: 'question', lying: 'story', anime: 'opening', dilemma: 'turn' }[play.kind as string] || 'step';
  const position = play.kind === 'trivia' ? play.qi + 1 : play.kind === 'anime' ? play.i + 1 : play.n;
  const total = play.kind === 'trivia' || play.kind === 'anime' ? play.count : play.total;
  return (
    <div className="box box--quiet">
      <PlayPublic play={play} teams={teams} />
      {play.kind === 'anime' && play.accepted ? <p className="small">Accepted answers: {(play.accepted as string[]).join(', ')}</p> : null}
      {play.kind === 'trivia' && play.question ? <p className="small">Right answer: {LETTERS[play.question.answer]}</p> : null}
      <div className="btn-row" style={{ marginTop: 14 }}>
        {stepped && !open && position < total ? (
          <Do type="playNext" big>
            {position ? `Next ${noun}` : `First ${noun}`}
          </Do>
        ) : null}
        {play.kind === 'lying' && (play.state === 'voting' || play.state === 'closed') ? (
          <>
            <Do type="playReveal" args={{ truth: 'truth' }} big>
              It was the truth
            </Do>
            <Do type="playReveal" args={{ truth: 'lie' }} big>
              It was a lie
            </Do>
          </>
        ) : null}
        {play.kind === 'anime' && play.state === 'open' ? (
          <>
            <Do type="playReveal" quiet>
              NOBODY GOT IT
            </Do>
            {teams.map((id) => (
              <Do key={id} type="playReveal" args={{ teamId: id }} quiet>
                GIVE IT TO <TeamChip id={id} />
              </Do>
            ))}
          </>
        ) : null}
        {(play.kind === 'trivia' && play.state === 'asking') || (play.kind === 'dilemma' && play.state === 'open') || ((play.kind === 'coldwar' || play.kind === 'twothirds') && !play.revealed) ? (
          <Do type="playReveal" quiet>
            REVEAL NOW
          </Do>
        ) : null}
        <Do type="playFinish" quiet={stepped && position < total} confirm={stepped && position < total ? `There are ${noun}s left. Finish anyway?` : undefined}>
          Finish and place the teams
        </Do>
      </div>
    </div>
  );
}

/** A team's phone: the one thing it can answer right now. */
export function PlayTeam({ play, teams, me }: { play: Play; teams: string[]; me: string }) {
  const { send, busy, v } = useGame();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const answer = async (val: unknown) => {
    const out = await send('answer', { value: val });
    if (out.ok) {
      setValue('');
      const r = out.result as { correct?: boolean } | null;
      setNote(r && r.correct === false ? 'Not that one. Try again.' : '');
    }
  };
  let ask: React.ReactNode = null;

  if ((play.kind === 'coldwar' || play.kind === 'twothirds') && !play.revealed) {
    const mine = (play.kind === 'coldwar' ? play.bids : play.picks)[me];
    ask =
      mine?.n !== undefined && play.kind === 'twothirds' ? (
        <p className="lede">Locked in: {mine.n}.</p>
      ) : (
        <form
          className="g-inline"
          onSubmit={(e) => {
            e.preventDefault();
            answer(Number(value));
          }}
        >
          <label className="field" htmlFor="pl-n">
            {play.kind === 'coldwar' ? `Shots, 1 to ${play.max}${mine?.n ? ` (now ${mine.n}; you can change it)` : ''}` : `A whole number, 0 to ${play.max}. One go.`}
          </label>
          <input id="pl-n" type="number" inputMode="numeric" min={play.kind === 'coldwar' ? 1 : 0} max={play.max} value={value} onChange={(e) => setValue(e.target.value)} required />
          <button className="btn" type="submit" disabled={busy || value === ''}>
            Lock it in
          </button>
        </form>
      );
  }
  if (play.kind === 'trivia' && play.state === 'asking' && play.question) {
    const mine = play.answers?.[me];
    ask = mine ? (
      <p className="lede">Answered: {LETTERS[mine.choice]}.</p>
    ) : (
      <div className="g-answers">
        {(play.question.options as string[]).map((o, i) => (
          <button key={i} className="btn g-big" type="button" disabled={busy} onClick={() => answer(i)}>
            {LETTERS[i]}. {o}
          </button>
        ))}
      </div>
    );
  }
  if (play.kind === 'lying' && play.state === 'voting') {
    const mine = play.votes?.[me];
    ask = mine ? (
      <p className="lede">Voted: {mine.choice}.</p>
    ) : (
      <div className="g-answers">
        <button className="btn g-big" type="button" disabled={busy} onClick={() => answer('truth')}>
          Truth
        </button>
        <button className="btn g-big" type="button" disabled={busy} onClick={() => answer('lie')}>
          Lie
        </button>
      </div>
    );
  }
  if (play.kind === 'dilemma' && play.state === 'open') {
    ask = play.mine ? (
      <p className="lede">You {play.mine === 'snitch' ? 'snitched' : 'stayed silent'}. Waiting for the reveal.</p>
    ) : (
      <>
        <p className="small">
          Against {play.partner === 'house' ? 'the House' : v.team(play.partner)}. Both silent: 3 points, 1 shot each. One snitches: 5 points and no shots for the snitch, 0 points and
          5 shots for the other. Both snitch: 1 point, 3 shots each.
        </p>
        <div className="g-answers">
          <button className="btn g-big" type="button" disabled={busy} onClick={() => answer('silent')}>
            Stay silent
          </button>
          <button className="btn g-big" type="button" disabled={busy} onClick={() => answer('snitch')}>
            Snitch
          </button>
        </div>
      </>
    );
  }
  if (play.kind === 'anime' && play.state === 'open') {
    ask = (
      <form
        className="g-inline"
        onSubmit={(e) => {
          e.preventDefault();
          answer(value);
        }}
      >
        <label className="field" htmlFor="pl-a">
          Which anime is it? {play.myTries ? `(${play.myTries} tried)` : ''}
        </label>
        <input id="pl-a" type="text" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} required />
        <button className="btn" type="submit" disabled={busy || !value.trim()}>
          Guess
        </button>
        {note ? <p className="error">{note}</p> : null}
      </form>
    );
  }

  return (
    <div className="box box--dark">
      <PlayPublic play={play} teams={teams} />
      {ask}
    </div>
  );
}
