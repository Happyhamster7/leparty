'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { assignDrink } from './actions';
import type { HostState } from '../../../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Assign'}
    </button>
  );
}

export default function AssignForm({
  eventId,
  blocks,
  drinkTypes,
}: {
  eventId: string;
  blocks: { id: string; name: string }[];
  drinkTypes: { id: string; name: string }[];
}) {
  const action = assignDrink.bind(null, eventId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});

  return (
    <form action={formAction} style={{ marginBottom: 28 }}>
      {state.notice ? <div className="notice">{state.notice}</div> : null}

      <label className="field" htmlFor="target_block_id">
        Send to
      </label>
      <select id="target_block_id" name="target_block_id" required>
        {blocks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <label className="field" htmlFor="drink_type_id">
        Drink
      </label>
      <select id="drink_type_id" name="drink_type_id" required>
        {drinkTypes.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <label className="field" htmlFor="qty">
        Quantity
      </label>
      <input id="qty" name="qty" type="number" min={1} defaultValue={1} required />

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}

      <Submit />

      <p className="small" style={{ marginTop: 10 }}>
        Only works before this round&rsquo;s drinks queue is built.
      </p>
    </form>
  );
}
