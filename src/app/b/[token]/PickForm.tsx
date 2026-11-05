'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { submitPicks, type PickState } from './actions';

type Player = { id: string; name: string; onCooldown: boolean };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Confirm picks'}
    </button>
  );
}

export default function PickForm({
  roundId,
  blockId,
  token,
  needed,
  players,
}: {
  roundId: string;
  blockId: string;
  token: string;
  /** Null for a whole-team pick — every eligible player is sent regardless of checkboxes. */
  needed: number | null;
  players: Player[];
}) {
  const action = submitPicks.bind(null, roundId, blockId, token);
  const [state, formAction] = useFormState<PickState, FormData>(action, {});

  return (
    <form action={formAction}>
      <p className="small" style={{ marginBottom: 10 }}>
        {needed === null
          ? 'Whole team plays this one.'
          : `Pick ${needed} player${needed === 1 ? '' : 's'}.`}
      </p>

      <div className="box box--quiet" style={{ marginBottom: 14 }}>
        {players.map((p) => (
          <label
            key={p.id}
            className="meter-row"
            style={{ opacity: p.onCooldown ? 0.4 : 1, cursor: p.onCooldown ? 'default' : 'pointer' }}
          >
            <span className="name">
              <input
                type="checkbox"
                name="participant_id"
                value={p.id}
                disabled={p.onCooldown}
                style={{ marginRight: 8 }}
              />
              {p.name}
            </span>
            <span className="count small">{p.onCooldown ? 'cooldown' : ''}</span>
          </label>
        ))}
      </div>

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
