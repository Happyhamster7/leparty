'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { savePotluck, type FormState } from '../actions';
import type { PotluckTally } from '@/lib/potluck';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Filing…' : 'Continue'}
    </button>
  );
}

export default function PotluckForm({
  token,
  tally,
  item,
  category,
  dietary,
}: {
  token: string;
  tally: PotluckTally[];
  item: string;
  category: string;
  dietary: string;
}) {
  const action = savePotluck.bind(null, token);
  const [state, formAction] = useFormState<FormState, FormData>(action, {});

  const sorted = [...tally].sort((a, b) => b.short - a.short);
  const firstShort = sorted.find((t) => t.short > 0);
  const preselect = category || firstShort?.key || 'main';

  return (
    <form action={formAction}>
      <label className="field" htmlFor="potluck_category">
        Category
      </label>
      <select id="potluck_category" name="potluck_category" defaultValue={preselect}>
        {sorted.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
            {t.short > 0 ? ` — still needs ${t.short}` : ''}
          </option>
        ))}
      </select>

      <label className="field" htmlFor="potluck_item">
        What you&rsquo;re bringing
      </label>
      <input
        id="potluck_item"
        name="potluck_item"
        type="text"
        defaultValue={item}
        placeholder="Two trays of lasagne"
        required
      />

      <label className="field eyebrow--quiet" htmlFor="dietary_notes">
        Allergies or won&rsquo;t eat <span className="opt">(optional)</span>
      </label>
      <input
        id="dietary_notes"
        name="dietary_notes"
        type="text"
        defaultValue={dietary}
        placeholder="No shellfish"
      />

      {state.error ? <p className="error">{state.error}</p> : null}

      <Submit />
    </form>
  );
}
