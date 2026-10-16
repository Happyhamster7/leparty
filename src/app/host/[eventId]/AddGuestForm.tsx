'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addGuest, type HostState } from '../actions';
import { CAPACITY_BANDS } from '@/lib/types';

export type KnownPerson = {
  id: string;
  name: string;
  band: number | null;
  parties: number;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add'}
    </button>
  );
}

export default function AddGuestForm({
  eventId,
  known,
}: {
  eventId: string;
  known: KnownPerson[];
}) {
  const action = addGuest.bind(null, eventId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});
  const [picked, setPicked] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Clear the name only if it still holds what was just submitted.
  // Resetting the whole form here would wipe whatever the host typed
  // while the previous add was in flight — which silently loses guests
  // when you're rattling through a list of forty.
  useEffect(() => {
    if (state.error || !state.added) return;
    const input = nameRef.current;
    if (input && input.value.trim() === state.added.trim()) {
      input.value = '';
    }
    setPicked('');
    input?.focus();
  }, [state]);

  return (
    <form action={formAction}>
      {known.length > 0 ? (
        <>
          <label className="field" htmlFor="person_id">
            Someone from a past party
          </label>
          <select
            id="person_id"
            name="person_id"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">— new person —</option>
            {known.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · band {p.band ?? '?'} · {p.parties}{' '}
                {p.parties === 1 ? 'party' : 'parties'}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}>
          <label className="field" htmlFor="display_name">
            {picked ? 'Name (using the person above)' : 'Name'}
          </label>
          <input
            ref={nameRef}
            id="display_name"
            name="display_name"
            type="text"
            placeholder="Jess Whitlock"
            style={{ marginBottom: 0 }}
            disabled={Boolean(picked)}
            required={!picked}
          />
        </div>

        <div style={{ flex: '1 1 160px' }}>
          <label className="field eyebrow--quiet" htmlFor="capacity_band">
            Capacity <span className="opt">(if you know it)</span>
          </label>
          <select
            id="capacity_band"
            name="capacity_band"
            style={{ marginBottom: 0 }}
            defaultValue=""
          >
            <option value="">They&rsquo;ll pick</option>
            {CAPACITY_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.value} — {b.label}
              </option>
            ))}
          </select>
        </div>

        <Submit />
      </div>

      {!picked ? (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            fontSize: 13,
            color: 'var(--muted-2)',
          }}
        >
          <input type="checkbox" name="force_new" style={{ width: 16, height: 16, margin: 0 }} />
          Different person, same name as someone on file
        </label>
      ) : null}

      {state.error ? (
        <p className="error" style={{ margin: '12px 0 0' }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
