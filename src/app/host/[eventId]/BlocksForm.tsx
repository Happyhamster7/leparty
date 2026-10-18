'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveBlocks, type HostState } from '../actions';

export type BlockEditRow = {
  id: string;
  name: string;
  colour: string;
  charge: string | null;
  join_code: string;
  in_play: boolean;
  members: number;
};

const CHARGE_IDEAS = [
  'Conspiracy to monopolise the aux cord',
  'Aggravated karaoke',
  'Grand theft of the last slice',
  'Possession of an unlicensed opinion',
  'Loitering by the snack table',
  'Impersonating a bartender',
  'Reckless use of a disposable camera',
  'Running an unlicensed casino in the laundry',
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save blocks'}
    </button>
  );
}

export default function BlocksForm({
  eventId,
  blocks,
}: {
  eventId: string;
  blocks: BlockEditRow[];
}) {
  const action = saveBlocks.bind(null, eventId);
  const [state, formAction] = useFormState<HostState, FormData>(action, {});

  return (
    <form action={formAction}>
      {state.notice ? <div className="notice">{state.notice}</div> : null}

      <div className="scroller">
        <table className="list">
          <thead>
            <tr>
              <th>Block</th>
              <th>Colour</th>
              <th>The charge</th>
              <th>Code</th>
              <th>In play</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => (
              <tr key={b.id}>
                <td className="tight">
                  <input
                    type="text"
                    name={`name_${b.id}`}
                    defaultValue={b.name}
                    aria-label={`Name of ${b.name}`}
                    style={{ marginBottom: 0, minWidth: 110, minHeight: 40 }}
                  />
                </td>
                <td className="tight">
                  <input
                    type="color"
                    name={`colour_${b.id}`}
                    defaultValue={b.colour}
                    aria-label={`Colour of ${b.name}`}
                    style={{
                      marginBottom: 0,
                      width: 46,
                      minHeight: 40,
                      padding: 2,
                      cursor: 'pointer',
                    }}
                  />
                </td>
                <td style={{ minWidth: 240 }}>
                  <input
                    type="text"
                    name={`charge_${b.id}`}
                    defaultValue={b.charge ?? ''}
                    placeholder={CHARGE_IDEAS[i % CHARGE_IDEAS.length]}
                    aria-label={`Charge for ${b.name}`}
                    style={{ marginBottom: 0, minHeight: 40 }}
                  />
                </td>
                <td className="tight mono" style={{ letterSpacing: '0.16em' }}>
                  {b.join_code}
                </td>
                <td className="tight small">
                  {b.in_play ? `yes · ${b.members}` : b.members > 0 ? String(b.members) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}

      <Submit />

      <p className="small" style={{ marginTop: 14 }}>
        Charges print on the block cards and show on each block&rsquo;s own page. The placeholders
        are suggestions &mdash; leave one blank and that card simply has no charge.
      </p>
    </form>
  );
}
