'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSession, type Sent } from '@/lib/sessions/useSession';
import type { Roster } from '@/modules/types';
import { roundLabel, sayError, sayFeed, type Voice } from '../messages';
import { voiceFromWords, type Words } from '../voice';
import type { SoundSet } from '@/lib/sounds';

type Game<V> = {
  view: V;
  roster: Roster;
  v: Voice;
  /** Sends an action. A refusal is shown in the screen's notice and also returned. */
  send: (type: string, args?: Record<string, unknown>) => Promise<Sent>;
  /** True while any action is in flight: buttons disable so a tap can't be doubled by impatience. */
  busy: boolean;
  teamName: (id: string | null | undefined) => string;
  teamColour: (id: string) => string;
  person: (id: string) => string;
  membersOf: (teamId: string) => Roster['members'];
  /** The theme's sound cues, on screens that make sound. */
  sounds?: SoundSet;
  /** The page's "film a clip" control, for the game to show at the right moment. */
  film?: React.ReactNode;
};

const Ctx = createContext<Game<unknown> | null>(null);

export function useGame<V>(): Game<V> {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGame outside <GameScreen>');
  return g as Game<V>;
}

/**
 * Wraps one of the game's screens: holds the live connection, the
 * party's words and names, and the one place a refusal is shown.
 */
export function GameScreen({
  sessionId,
  headers,
  words,
  everyMs,
  sounds,
  film,
  children,
}: {
  sessionId: string;
  headers: Record<string, string>;
  words: Words;
  everyMs?: number;
  sounds?: SoundSet;
  film?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { data, status, send: rawSend } = useSession<unknown>(sessionId, headers, everyMs);
  const [busy, setBusy] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);

  const game = useMemo(() => {
    if (!data) return null;
    const v = voiceFromWords(words, data.roster);
    const groups = new Map(data.roster.groups.map((g) => [g.id, g]));
    const people = new Map(data.roster.members.map((m) => [m.id, m.name]));
    const send = async (type: string, args: Record<string, unknown> = {}) => {
      setBusy((n) => n + 1);
      setRefusal(null);
      const out = await rawSend(type, args);
      setBusy((n) => n - 1);
      if (!out.ok) setRefusal(out.code === 'net.offline' ? 'Couldn’t reach the server. Try again.' : sayError(out.code, out.params, v));
      return out;
    };
    return {
      view: data.view,
      roster: data.roster,
      v,
      send,
      busy: false,
      teamName: (id: string | null | undefined) => (id ? groups.get(id)?.name ?? '—' : '—'),
      teamColour: (id: string) => groups.get(id)?.colour ?? 'var(--ink)',
      person: (id: string) => people.get(id) ?? 'Someone',
      membersOf: (teamId: string) => data.roster.members.filter((m) => m.groupId === teamId && !m.away),
    };
  }, [data, words, rawSend]);

  if (status === 'denied') {
    return (
      <div className="notice" role="alert">
        This screen is no longer signed in to this game. If another phone scanned the same card, it has taken over; reload
        this page to take it back.
      </div>
    );
  }
  if (status === 'gone') return <div className="notice">This game has ended.</div>;
  if (!game) return <p className="small">Connecting…</p>;

  return (
    <Ctx.Provider value={{ ...game, busy: busy > 0, sounds, film }}>
      {status === 'offline' ? <div className="notice">Connection lost. Retrying…</div> : null}
      {refusal ? (
        <div className="notice g-refusal" role="alert" onClick={() => setRefusal(null)}>
          {refusal}
        </div>
      ) : null}
      {data?.status === 'archived' ? <div className="notice">This game has ended. What follows is how it finished.</div> : null}
      {children}
    </Ctx.Provider>
  );
}

/** A button that sends one action and can't be pressed again until it has answered. */
export function Do({
  type,
  args,
  children,
  quiet,
  big,
  disabled,
  confirm: ask,
  onDone,
}: {
  type: string;
  args?: Record<string, unknown>;
  children: React.ReactNode;
  quiet?: boolean;
  big?: boolean;
  disabled?: boolean;
  confirm?: string;
  onDone?: (out: Sent) => void;
}) {
  const { send, busy } = useGame();
  return (
    <button
      type="button"
      className={`btn btn--inline${quiet ? ' btn--quiet' : ''}${big ? ' g-big' : ''}`}
      disabled={busy || disabled}
      onClick={async () => {
        if (ask && !window.confirm(ask)) return;
        const out = await send(type, args);
        onDone?.(out);
      }}
    >
      {children}
    </button>
  );
}

/** Seconds left until a server deadline, ticking locally. Shows nothing once there is no deadline. */
export function Countdown({ until, label }: { until: number | null | undefined; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <span className={`g-clock${left <= 10 ? ' g-clock--low' : ''}`}>
      {label ? `${label} ` : ''}
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

export function TeamChip({ id }: { id: string | null | undefined }) {
  const { teamName, teamColour } = useGame();
  if (!id) return <span className="g-chip g-chip--none">Anonymous</span>;
  if (id === 'house') return <span className="g-chip g-chip--none">The House</span>;
  return (
    <span className="g-chip" style={{ borderColor: teamColour(id) }}>
      {teamName(id)}
    </span>
  );
}

type Standing = { id: string; money: number; points: number; pointsLive: boolean; drinkStream: number };

/** The scoreboard. `showMoney` is off on the TV. */
export function Standings({ teams, showMoney = true, pointsAsOf, incomeStep = 0 }: { teams: Standing[]; showMoney?: boolean; pointsAsOf: { act: string } | 'end' | null; incomeStep?: number }) {
  const { v } = useGame();
  const sorted = [...teams].sort((a, b) => b.points - a.points || b.money - a.money);
  const allLive = teams.every((t) => t.pointsLive);
  return (
    <>
      <div className="scroller"><table className="list g-standings">
        <thead>
          <tr>
            <th>{v.group}</th>
            <th>Points</th>
            {showMoney ? <th>Cash</th> : null}
            {showMoney ? <th>Next income</th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id}>
              <td>
                <TeamChip id={t.id} />
              </td>
              <td className="mono">{t.points}</td>
              {showMoney ? <td className="mono">{v.money(t.money)}</td> : null}
              {/* Paid for finishing at the bar in time: one step more than last time. */}
              {showMoney ? <td className="mono">{v.money(t.drinkStream + incomeStep)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table></div>
      {allLive ? null : (
        <p className="small">
          {pointsAsOf === 'end'
            ? 'Final standings.'
            : pointsAsOf
              ? `Points as of the end of ${/^\d+$/.test(pointsAsOf.act) ? `Act ${pointsAsOf.act}` : pointsAsOf.act}. They update when each act ends.`
              : 'Points go up at the end of the first act, and update when each act ends.'}
        </p>
      )}
    </>
  );
}

export function Feed({ feed, limit = 12 }: { feed: { id: string; ts: number; kind: string; params: Record<string, unknown> }[]; limit?: number }) {
  const { v } = useGame();
  const lines = feed.map((f) => ({ id: f.id, text: sayFeed(f.kind, f.params, v) })).filter((f) => f.text).slice(0, limit);
  if (!lines.length) return null;
  return (
    <ul className="g-feed">
      {lines.map((f) => (
        <li key={f.id}>{f.text}</li>
      ))}
    </ul>
  );
}

const PHASES = ['game', 'results', 'spending', 'drinks'] as const;

/** Where the round is: its label and a strip of the four phases. */
export function RoundHead({ round }: { round: { act: number; inAct: number; final: boolean; actName: string; gameName: string; phase: string } | null }) {
  if (!round) return <p className="eyebrow">No round yet</p>;
  return (
    <div className="g-roundhead">
      <p className="eyebrow">
        {roundLabel(round)} · {round.gameName}
      </p>
      <div className="g-phases">
        {PHASES.map((p) => (
          <span key={p} className={p === round.phase ? 'on' : ''}>
            {p}
          </span>
        ))}
        {round.phase === 'done' ? <span className="on">done</span> : null}
      </div>
    </div>
  );
}

export { sayFeed };
