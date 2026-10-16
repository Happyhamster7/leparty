'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveIdentity, type FormState } from '../actions';
import { CAPACITY_BANDS } from '@/lib/types';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Filing…' : 'Continue'}
    </button>
  );
}

export default function IdentityForm({
  token,
  name,
  band,
}: {
  token: string;
  name: string;
  band: number | null;
}) {
  const action = saveIdentity.bind(null, token);
  const [state, formAction] = useFormState<FormState, FormData>(action, {});

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

      {state.error ? <p className="error">{state.error}</p> : null}

      <p className="small" style={{ marginBottom: 22 }}>
        Only the Warden sees this. It&rsquo;s used to even out the cell blocks, nothing else.
      </p>

      <Submit />
    </form>
  );
}
