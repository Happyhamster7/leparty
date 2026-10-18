'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { doorRegister } from '../nightActions';
import type { HostState } from '../../actions';
import { CAPACITY_BANDS } from '@/lib/types';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Booking…' : 'Book in'}
    </button>
  );
}

export default function DoorRegister({ eventId }: { eventId: string }) {
  const action = doorRegister.bind(null, eventId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Clear only the name we just submitted, so typing ahead while an add
  // is in flight can't lose someone. See AddGuestForm for the same fix.
  useEffect(() => {
    if (state.error || !state.added) return;
    const input = nameRef.current;
    if (input && input.value.trim() === state.added.trim()) input.value = '';
    input?.focus();
  }, [state]);

  if (!open) {
    return (
      <button className="btn btn--quiet btn--inline" type="button" onClick={() => setOpen(true)}>
        + NOT ON THE LIST
      </button>
    );
  }

  return (
    <div className="box" style={{ marginBottom: 0 }}>
      <p className="eyebrow">Register at the door</p>
      <form action={formAction}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 180px' }}>
            <label className="field" htmlFor="door_name">
              Name
            </label>
            <input
              ref={nameRef}
              id="door_name"
              name="display_name"
              type="text"
              placeholder="Name"
              style={{ marginBottom: 0 }}
              required
            />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label className="field" htmlFor="door_band">
              Capacity
            </label>
            <select
              id="door_band"
              name="capacity_band"
              defaultValue="3"
              style={{ marginBottom: 0 }}
            >
              {CAPACITY_BANDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.value} — {b.label}
                </option>
              ))}
            </select>
          </div>
          <Submit />
          <button
            className="btn btn--quiet btn--inline"
            type="button"
            onClick={() => setOpen(false)}
          >
            DONE
          </button>
        </div>
        {state.error ? (
          <p className="error" role="alert" style={{ margin: '12px 0 0' }}>
            {state.error}
          </p>
        ) : state.notice ? (
          <p className="small" style={{ margin: '12px 0 0', color: '#0f5438' }}>
            {state.notice}
          </p>
        ) : null}
      </form>
      <p className="small" style={{ margin: '12px 0 0' }}>
        Three fields on purpose. They&rsquo;re booked in and marked present straight away; if the
        draw has already run they drop into the lightest block.
      </p>
    </div>
  );
}
