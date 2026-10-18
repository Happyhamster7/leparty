'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateGuest, type HostState } from '../../../actions';
import { CAPACITY_BANDS, POTLUCK_CATEGORIES } from '@/lib/types';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export default function GuestForm({
  eventId,
  participantId,
  name,
  band,
  rsvp,
  item,
  category,
  dietary,
}: {
  eventId: string;
  participantId: string;
  name: string;
  band: number | null;
  rsvp: string;
  item: string;
  category: string;
  dietary: string;
}) {
  const action = updateGuest.bind(null, eventId, participantId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});

  return (
    <form action={formAction}>
      {state.notice ? <div className="notice">{state.notice}</div> : null}

      <label className="field" htmlFor="display_name">
        Name
      </label>
      <input id="display_name" name="display_name" type="text" defaultValue={name} required />

      <div className="grid-2">
        <div>
          <label className="field" htmlFor="capacity_band">
            Capacity band
          </label>
          <select id="capacity_band" name="capacity_band" defaultValue={band ?? ''}>
            <option value="">Not set</option>
            {CAPACITY_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.value} — {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field" htmlFor="rsvp">
            RSVP
          </label>
          <select id="rsvp" name="rsvp" defaultValue={rsvp}>
            <option value="pending">Pending</option>
            <option value="yes">Coming</option>
            <option value="no">Can&rsquo;t make it</option>
          </select>
        </div>
      </div>

      <p className="small" style={{ margin: '-10px 0 20px' }}>
        Name and capacity live on their person record, so they carry to the next party. Everything
        below is just this one.
      </p>

      <div className="grid-2">
        <div>
          <label className="field" htmlFor="potluck_item">
            Bringing
          </label>
          <input
            id="potluck_item"
            name="potluck_item"
            type="text"
            defaultValue={item}
            placeholder="Two trays of lasagne"
          />
        </div>
        <div>
          <label className="field" htmlFor="potluck_category">
            Category
          </label>
          <select id="potluck_category" name="potluck_category" defaultValue={category}>
            <option value="">Not set</option>
            {POTLUCK_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="field" htmlFor="dietary_notes">
        Allergies or won&rsquo;t eat
      </label>
      <input
        id="dietary_notes"
        name="dietary_notes"
        type="text"
        defaultValue={dietary}
        placeholder="No shellfish"
      />

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}

      <Submit />
    </form>
  );
}
