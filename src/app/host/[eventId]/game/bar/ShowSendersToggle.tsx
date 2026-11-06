'use client';

import { useEffect, useState } from 'react';

/**
 * "The bartender's iPad still has its own separate 'Show senders'
 * toggle for serving purposes, and resets to hidden for each new
 * order" (docs/halloween-game-design.md section 6). "New order" here
 * means a new team called up — resetting on serveId covers that.
 */
export default function ShowSendersToggle({
  serveId,
  plain,
  withSenders,
}: {
  serveId: string;
  plain: { name: string; qty: number }[];
  withSenders: { senderName: string; drinkName: string; qty: number }[];
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(false);
  }, [serveId]);

  const rows = show ? withSenders : plain;

  return (
    <div className="box box--quiet" style={{ marginBottom: 20 }}>
      <div className="meter-row">
        <span className="name" style={{ fontWeight: 600 }}>
          {show ? 'Senders' : 'Drinks'}
        </span>
        <button className="btn btn--quiet btn--inline" type="button" onClick={() => setShow((s) => !s)}>
          {show ? 'Hide senders' : 'Show senders'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="small" style={{ margin: 0 }}>
          No drinks on record for them this round.
        </p>
      ) : show ? (
        withSenders.map((b, i) => (
          <div className="meter-row" key={i}>
            <span className="name">
              {b.senderName} → {b.drinkName}
            </span>
            <span className="count mono">{b.qty}</span>
          </div>
        ))
      ) : (
        plain.map((b) => (
          <div className="meter-row" key={b.name}>
            <span className="name">{b.name}</span>
            <span className="count mono">{b.qty}</span>
          </div>
        ))
      )}
    </div>
  );
}
