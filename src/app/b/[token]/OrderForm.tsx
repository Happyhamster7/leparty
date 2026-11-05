'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { placeOrder, type OrderState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Place order'}
    </button>
  );
}

export default function OrderForm({
  roundId,
  blockId,
  token,
  drinkTypes,
  blocks,
  ownOrders,
}: {
  roundId: string;
  blockId: string;
  token: string;
  drinkTypes: { id: string; name: string; cost: number; points: number }[];
  blocks: { id: string; name: string }[];
  ownOrders: { id: string; targetName: string; drinkName: string; qty: number; cost: number }[];
}) {
  const action = placeOrder.bind(null, roundId, blockId, token);
  const [state, formAction] = useFormState<OrderState, FormData>(action, {});

  return (
    <>
      <form action={formAction}>
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
              {d.name} — {d.cost} each
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
          Order exactly 5 or 10 for a bundle discount (8 for a Soju bottle). Orders are secret — the
          other team won&rsquo;t see this coming.
        </p>
      </form>

      <p className="eyebrow" style={{ marginTop: 20 }}>
        Your orders this round
      </p>
      <div className="box box--quiet">
        {ownOrders.length === 0 ? (
          <p style={{ margin: 0 }} className="small">
            No orders placed yet.
          </p>
        ) : (
          ownOrders.map((o) => (
            <div className="meter-row" key={o.id}>
              <span className="name">
                {o.qty}× {o.drinkName} → {o.targetName}
              </span>
              <span className="count mono">{o.cost}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
