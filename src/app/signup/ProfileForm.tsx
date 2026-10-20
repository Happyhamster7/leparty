'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveProfile, type FormState } from './actions';
import { CAPACITY_BANDS } from '@/lib/types';

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Filing…' : editing ? 'Save' : 'Continue'}
    </button>
  );
}

export default function ProfileForm({
  name,
  band,
  editing,
}: {
  name: string;
  band: number | null;
  editing: boolean;
}) {
  const [state, formAction] = useFormState<FormState, FormData>(saveProfile, {});

  return (
    <form action={formAction}>
      <label className="field" htmlFor="display_name">
        Name on your paperwork
      </label>
      <input
        id="display_name"
        name="display_name"
        type="text"
        defaultValue={name}
        placeholder="Jess Whitlock"
        autoComplete="name"
        required
      />
      {!editing ? (
        <p className="small" style={{ margin: '-10px 0 20px' }}>
          Use your full name &mdash; first and last. It&rsquo;s what tells you apart from anyone
          else in the system, and what we&rsquo;ll look for if you come back later.
        </p>
      ) : null}

      <p className="eyebrow" id="caplabel">
        How much do you drink
      </p>

      <div className="radios" role="radiogroup" aria-labelledby="caplabel">
        {CAPACITY_BANDS.map((b) => (
          <label className="radio" key={b.value}>
            <input
              type="radio"
              name="capacity_band"
              value={b.value}
              defaultChecked={band === b.value}
            />
            <span className="num">{b.value}</span>
            <span style={{ fontSize: 14 }}>{b.label}</span>
          </label>
        ))}
      </div>

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}

      <p className="small" style={{ marginBottom: 22 }}>
        Only the Warden sees this. It&rsquo;s used to even out the cell blocks, nothing else.
      </p>

      <Submit editing={editing} />
    </form>
  );
}
