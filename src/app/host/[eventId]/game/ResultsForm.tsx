'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { submitResults } from './actions';
import type { HostState } from '../../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Pay out and continue'}
    </button>
  );
}

export default function ResultsForm({
  eventId,
  roundId,
  blocks,
  showScore,
}: {
  eventId: string;
  roundId: string;
  blocks: { id: string; name: string }[];
  showScore: boolean;
}) {
  const action = submitResults.bind(null, eventId, roundId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});

  return (
    <form action={formAction}>
      {state.notice ? <div className="notice">{state.notice}</div> : null}

      <div className="scroller">
        <table className="list">
          <thead>
            <tr>
              <th>Block</th>
              <th>Placing</th>
              {showScore ? <th>Score</th> : null}
              <th>Bonus money</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id}>
                <td className="tight">{b.name}</td>
                <td className="tight">
                  <input
                    type="number"
                    name={`placing_${b.id}`}
                    min={1}
                    required
                    aria-label={`Placing for ${b.name}`}
                    style={{ marginBottom: 0, width: 70, minHeight: 40 }}
                  />
                </td>
                {showScore ? (
                  <td className="tight">
                    <input
                      type="number"
                      name={`score_${b.id}`}
                      aria-label={`Score for ${b.name}`}
                      style={{ marginBottom: 0, width: 90, minHeight: 40 }}
                    />
                  </td>
                ) : null}
                <td className="tight">
                  <input
                    type="number"
                    name={`bonus_${b.id}`}
                    defaultValue={0}
                    aria-label={`Bonus money for ${b.name}`}
                    style={{ marginBottom: 0, width: 90, minHeight: 40 }}
                  />
                </td>
                <td style={{ minWidth: 200 }}>
                  <input
                    type="text"
                    name={`note_${b.id}`}
                    placeholder="e.g. best cosplay"
                    aria-label={`Note for ${b.name}`}
                    style={{ marginBottom: 0, minHeight: 40 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}

      <Submit />

      <p className="small" style={{ marginTop: 14 }}>
        Prize money by placing is a placeholder curve, not a decided balance
        (docs/halloween-game-design.md section 11). Bonus money is free-form —
        type whatever the host is awarding it for in the note.
      </p>
    </form>
  );
}
