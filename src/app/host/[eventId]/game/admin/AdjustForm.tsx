'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { adjustBalance } from './actions';
import type { HostState } from '../../../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Adjust'}
    </button>
  );
}

export default function AdjustForm({
  eventId,
  blocks,
}: {
  eventId: string;
  blocks: { id: string; name: string }[];
}) {
  const action = adjustBalance.bind(null, eventId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});

  return (
    <form action={formAction} style={{ marginBottom: 28 }}>
      {state.notice ? <div className="notice">{state.notice}</div> : null}

      <label className="field" htmlFor="block_id">
        Block
      </label>
      <select id="block_id" name="block_id" required>
        {blocks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <label className="field" htmlFor="kind">
        Kind
      </label>
      <select id="kind" name="kind" required>
        <option value="money">Money</option>
        <option value="points">Points</option>
      </select>

      <label className="field" htmlFor="amount">
        Amount <span className="opt">(negative to deduct)</span>
      </label>
      <input id="amount" name="amount" type="number" required />

      <label className="field" htmlFor="note">
        Note <span className="opt">(optional)</span>
      </label>
      <input id="note" name="note" type="text" placeholder="e.g. best cosplay, ruling overturned" />

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
