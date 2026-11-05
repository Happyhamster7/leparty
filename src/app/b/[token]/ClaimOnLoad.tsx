'use client';

import { useEffect, useRef } from 'react';
import { claimTeamPhone } from './actions';

/** Fires once per page load so this device becomes the team phone. */
export default function ClaimOnLoad({ blockId, token }: { blockId: string; token: string }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    claimTeamPhone(blockId, token);
  }, [blockId, token]);

  return null;
}
