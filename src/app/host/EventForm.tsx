'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createEvent, updateEvent, type HostState } from './actions';
import type { EventRow } from '@/lib/types';
import { THEME_PACKS, themePack } from '@/themes';

function Submit({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending
        ? mode === 'create'
          ? 'Creating…'
          : 'Saving…'
        : mode === 'create'
          ? 'Create party'
          : 'Save changes'}
    </button>
  );
}

export default function EventForm({ event }: { event?: EventRow }) {
  const mode: 'create' | 'edit' = event ? 'edit' : 'create';
  const action = event ? updateEvent.bind(null, event.id) : createEvent;
  const [state, formAction] = useFormState<HostState, FormData>(action, {});

  const cfg = event?.config;

  return (
    <form action={formAction}>
      {state.notice ? <div className="notice">{state.notice}</div> : null}

      <h2>The party</h2>

      <label className="field" htmlFor="name">
        Internal name
      </label>
      <input
        id="name"
        name="name"
        type="text"
        placeholder="October party"
        defaultValue={event?.name ?? ''}
        required
      />

      <div className="grid-2">
        <div>
          <label className="field" htmlFor="held_on">
            Date
          </label>
          <input id="held_on" name="held_on" type="date" defaultValue={event?.held_on ?? ''} />
        </div>
        <div>
          <label className="field" htmlFor="starts_at_label">
            Start time
          </label>
          <input
            id="starts_at_label"
            name="starts_at_label"
            type="text"
            placeholder="7:00 PM"
            defaultValue={event?.starts_at_label ?? ''}
          />
        </div>
      </div>

      <label className="field" htmlFor="venue">
        Venue
      </label>
      <input
        id="venue"
        name="venue"
        type="text"
        placeholder="14 Rivett St"
        defaultValue={event?.venue ?? ''}
      />

      <h2>Theme</h2>

      <div className="grid-2">
        <div>
          <label className="field" htmlFor="theme_title">
            Title guests see
          </label>
          <input
            id="theme_title"
            name="theme_title"
            type="text"
            placeholder="The big night"
            defaultValue={event?.theme_title ?? ''}
          />
        </div>
        <div>
          <label className="field" htmlFor="theme_key">
            Theme
          </label>
          {/* themePack() maps a retired key (heist, cult, custom) onto the pack it always rendered as. */}
          <select id="theme_key" name="theme_key" defaultValue={themePack(event?.theme_key ?? 'jail').key}>
            {THEME_PACKS.map((pack) => (
              <option key={pack.key} value={pack.key}>
                {pack.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="field" htmlFor="theme_blurb">
        The premise
      </label>
      <textarea
        id="theme_blurb"
        name="theme_blurb"
        placeholder="What the night is about, in a line or two."
        defaultValue={event?.theme_blurb ?? ''}
      />

      <label className="field" htmlFor="dress_code">
        Dress code
      </label>
      <input
        id="dress_code"
        name="dress_code"
        type="text"
        placeholder="What to wear."
        defaultValue={event?.dress_code ?? ''}
      />

      <label className="field eyebrow--quiet" htmlFor="dress_code_notes">
        Dress code notes <span className="opt">(optional)</span>
      </label>
      <input
        id="dress_code_notes"
        name="dress_code_notes"
        type="text"
        placeholder="What to avoid."
        defaultValue={event?.dress_code_notes ?? ''}
      />

      <h2>Teams</h2>
      <p className="small" style={{ marginBottom: 18 }}>
        The number of teams is fixed; their size floats with however many turn up. Eight rows
        read from across a room, fourteen don&rsquo;t. The theme decides what a team is called.
        {mode === 'edit'
          ? ' Raising this adds teams. Lowering it only removes teams that are empty and not in play.'
          : ''}
      </p>

      <label className="field" htmlFor="block_count">
        Number of teams
      </label>
      <input
        id="block_count"
        name="block_count"
        type="number"
        min={2}
        max={12}
        defaultValue={cfg?.block_count ?? 8}
      />

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}

      <Submit mode={mode} />
    </form>
  );
}
