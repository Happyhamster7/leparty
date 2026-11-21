'use client';

import { useState, useTransition } from 'react';
import { vote } from './actions';

type Person = { id: string; name: string };
type Group = { id: string; name: string; colour: string; people: Person[] };

/** Tap a name once for best, again for worst, a third time to clear it. */
export default function VoteForm({ pollId, groups, picks, initial }: { pollId: string; groups: Group[]; picks: number; initial: { best: string[]; worst: string[] } | null }) {
  const [best, setBest] = useState<string[]>(initial?.best ?? []);
  const [worst, setWorst] = useState<string[]>(initial?.worst ?? []);
  const [note, setNote] = useState<{ error?: string; saved?: boolean }>(initial ? { saved: true } : {});
  const [pending, start] = useTransition();

  const tap = (id: string) => {
    setNote({});
    if (best.includes(id)) {
      setBest(best.filter((x) => x !== id));
      if (worst.length < picks) setWorst([...worst, id]);
    } else if (worst.includes(id)) {
      setWorst(worst.filter((x) => x !== id));
    } else if (best.length < picks) {
      setBest([...best, id]);
    } else if (worst.length < picks) {
      setWorst([...worst, id]);
    }
  };

  return (
    <>
      <p className="mono" style={{ marginBottom: 14 }}>
        BEST {best.length}/{picks} · WORST {worst.length}/{picks}
      </p>
      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 14 }}>
          <p className="eyebrow" style={{ borderLeft: `6px solid ${g.colour}`, paddingLeft: 8 }}>
            {g.name}
          </p>
          <div className="g-people">
            {g.people.map((p) => {
              const state = best.includes(p.id) ? 'best' : worst.includes(p.id) ? 'worst' : '';
              return (
                <button key={p.id} type="button" className={`g-person${state ? ` on v-${state}` : ''}`} onClick={() => tap(p.id)} aria-pressed={!!state}>
                  {p.name}
                  <span className="small">{state === 'best' ? 'Best' : state === 'worst' ? 'Worst' : ' '}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {note.error ? <p className="error" role="alert">{note.error}</p> : null}
      {note.saved ? <div className="notice">Your vote is in. You can change it until voting closes.</div> : null}
      <button
        className="btn"
        type="button"
        disabled={pending || (!best.length && !worst.length)}
        onClick={() => start(async () => setNote(await vote(pollId, best, worst)))}
      >
        {pending ? 'Saving…' : note.saved ? 'Vote saved' : 'Cast my vote'}
      </button>
    </>
  );
}
