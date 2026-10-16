'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { toggleCheckIn } from '../nightActions';
import { initials } from '@/lib/types';

export type GridPerson = {
  participantId: string;
  name: string;
  inmateNumber: number | null;
  photoUrl: string | null;
  present: boolean;
  rsvp: 'pending' | 'yes' | 'no';
};

export default function CheckinGrid({
  eventId,
  people,
}: {
  eventId: string;
  people: GridPerson[];
}) {
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');

  const [optimistic, setOptimistic] = useOptimistic(
    people,
    (state: GridPerson[], id: string) =>
      state.map((p) => (p.participantId === id ? { ...p, present: !p.present } : p))
  );

  const arrived = optimistic.filter((p) => p.present).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return optimistic;
    return optimistic.filter((p) => p.name.toLowerCase().includes(q));
  }, [optimistic, query]);

  function tap(p: GridPerson) {
    startTransition(async () => {
      setOptimistic(p.participantId);
      await toggleCheckIn(eventId, p.participantId, !p.present);
    });
  }

  return (
    <>
      <div className="checkin-head">
        <div style={{ flex: '1 1 220px' }}>
          <h1>Find yourself</h1>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Tap your own mugshot. That&rsquo;s all check-in is.
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <p
            style={{
              margin: '0 0 2px',
              fontFamily: 'var(--display)',
              fontWeight: 600,
              fontSize: 38,
              lineHeight: 1,
            }}
          >
            {arrived}
            <span style={{ color: '#8d8676' }}> / {optimistic.length}</span>
          </p>
          <p className="mono" style={{ margin: 0, fontSize: 11, letterSpacing: '0.1em' }}>
            ARRIVED
          </p>
        </div>
      </div>

      <label className="field" htmlFor="findname">
        Search
      </label>
      <input
        id="findname"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing a name"
        style={{ marginBottom: 20 }}
      />

      {shown.length === 0 ? (
        <div className="box box--quiet">
          <p style={{ margin: 0 }}>
            Nobody matches &ldquo;{query}&rdquo;. They may need adding at the door.
          </p>
        </div>
      ) : (
        <div className="face-grid">
          {shown.map((p) => (
            <button
              key={p.participantId}
              type="button"
              className={p.present ? 'face face--in' : 'face'}
              onClick={() => tap(p)}
              aria-pressed={p.present}
            >
              <span className="face__avatar">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt="" />
                ) : (
                  initials(p.name)
                )}
              </span>
              <span className="face__name">{p.name}</span>
              <span className="face__num">
                {p.present ? 'HERE' : p.rsvp === 'no' ? 'SAID NO' : (p.inmateNumber ?? '----')}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
