'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createEvent, updateEvent, type HostState } from './actions';
import type { EventRow } from '@/lib/types';

function Submit({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending
        ? mode === 'create'
          ? 'Opening the wing…'
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
        placeholder="October lockup"
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
            placeholder="Cellblock H"
            defaultValue={event?.theme_title ?? ''}
          />
        </div>
        <div>
          <label className="field" htmlFor="theme_key">
            Theme pack
          </label>
          <select id="theme_key" name="theme_key" defaultValue={event?.theme_key ?? 'jail'}>
            <option value="jail">Jail</option>
            <option value="heist">Heist</option>
            <option value="cult">Cult</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <label className="field" htmlFor="theme_blurb">
        The premise
      </label>
      <textarea
        id="theme_blurb"
        name="theme_blurb"
        placeholder="Forty inmates. Eight cell blocks. A night of games, and a sentence to work off."
        defaultValue={event?.theme_blurb ?? ''}
      />

      <label className="field" htmlFor="dress_code">
        Dress code
      </label>
      <input
        id="dress_code"
        name="dress_code"
        type="text"
        placeholder="Orange jumpsuits, prison chic."
        defaultValue={event?.dress_code ?? ''}
      />

      <label className="field eyebrow--quiet" htmlFor="dress_code_notes">
        Dress code notes <span className="opt">(optional)</span>
      </label>
      <input
        id="dress_code_notes"
        name="dress_code_notes"
        type="text"
        placeholder="No actual police uniforms."
        defaultValue={event?.dress_code_notes ?? ''}
      />

      <h2>Game setup</h2>
      <p className="small" style={{ marginBottom: 18 }}>
        Block count is fixed; block size floats with however many turn up. Eight rows read from
        across a room, fourteen don&rsquo;t.
        {mode === 'edit'
          ? ' Raising this adds blocks. Lowering it only removes blocks that are empty and not in play.'
          : ''}
      </p>

      <div className="grid-2">
        <div>
          <label className="field" htmlFor="block_count">
            Cell blocks
          </label>
          <input
            id="block_count"
            name="block_count"
            type="number"
            min={2}
            max={12}
            defaultValue={cfg?.block_count ?? 8}
          />
        </div>
        <div>
          <label className="field" htmlFor="starting_sentence">
            Starting sentence (years)
          </label>
          <input
            id="starting_sentence"
            name="starting_sentence"
            type="number"
            min={1}
            defaultValue={cfg?.starting_sentence ?? 25}
          />
        </div>
      </div>

      <label className="field" htmlFor="starting_commissary">
        Starting commissary
      </label>
      <input
        id="starting_commissary"
        name="starting_commissary"
        type="number"
        min={0}
        defaultValue={cfg?.starting_commissary ?? 200}
      />

      {state.error ? <p className="error">{state.error}</p> : null}

      <Submit mode={mode} />
    </form>
  );
}
