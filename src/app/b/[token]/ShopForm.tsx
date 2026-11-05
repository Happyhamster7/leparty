'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { buyItem, type ShopState } from './actions';
import type { EyeSpyRow } from '@/lib/items';

function BuySubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--inline" type="submit" disabled={pending}>
      {pending ? 'Buying…' : 'Buy'}
    </button>
  );
}

function ShopItem({
  roundId,
  blockId,
  token,
  item,
}: {
  roundId: string;
  blockId: string;
  token: string;
  item: {
    key: string;
    name: string;
    description: string;
    price: number | null;
    status: 'available' | 'bought_this_round' | 'bought_tonight' | 'taken_this_round' | 'not_priced';
    eyeSpyResult?: EyeSpyRow[];
  };
}) {
  const action = buyItem.bind(null, roundId, blockId, token, item.key);
  const [state, formAction] = useFormState<ShopState, FormData>(action, {});

  return (
    <div className="box box--quiet" style={{ marginBottom: 14 }}>
      <div className="meter-row">
        <span className="name" style={{ fontWeight: 600 }}>
          {item.name}
        </span>
        <span className="count mono">{item.price ?? '—'}</span>
      </div>
      <p className="small" style={{ margin: '0 0 10px' }}>
        {item.description}
      </p>

      {item.status === 'available' ? (
        <form action={formAction}>
          {state.error ? (
            <p className="error" role="alert">
              {state.error}
            </p>
          ) : null}
          <BuySubmit />
        </form>
      ) : item.key === 'eye_spy' && item.status === 'bought_this_round' ? (
        <>
          {item.eyeSpyResult && item.eyeSpyResult.length > 0 ? (
            item.eyeSpyResult.map((row, i) => (
              <div className="meter-row" key={i}>
                <span className="name">
                  Round {row.roundNumber} — {row.senderName}
                </span>
                <span className="count mono">{row.qty}</span>
              </div>
            ))
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Nobody&rsquo;s sent you a served drink yet.
            </p>
          )}
        </>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          {item.status === 'bought_this_round' && 'Already bought this round.'}
          {item.status === 'bought_tonight' && 'Already used for the night.'}
          {item.status === 'taken_this_round' && 'Already played by another team this round.'}
          {item.status === 'not_priced' && 'Not for sale yet.'}
        </p>
      )}
    </div>
  );
}

export default function ShopForm({
  roundId,
  blockId,
  token,
  shop,
}: {
  roundId: string;
  blockId: string;
  token: string;
  shop: {
    key: string;
    name: string;
    description: string;
    price: number | null;
    status: 'available' | 'bought_this_round' | 'bought_tonight' | 'taken_this_round' | 'not_priced';
    eyeSpyResult?: EyeSpyRow[];
  }[];
}) {
  return (
    <>
      {shop.map((item) => (
        <ShopItem key={item.key} roundId={roundId} blockId={blockId} token={token} item={item} />
      ))}
    </>
  );
}
