'use client';

import { Countdown, RoundHead, useGame } from './common';
import BarQueue from './BarQueue';
import type { barView } from '../engine/views';

type View = ReturnType<typeof barView>;

/** The bar's tablet: nothing but the queue, in large type. */
export default function Bar() {
  const { view, v } = useGame<View>();
  const round = view.round;
  if (round?.phase === 'drinks') {
    return (
      <>
        <RoundHead round={round} />
        <BarQueue round={round} />
      </>
    );
  }
  return (
    <>
      <RoundHead round={round} />
      <h1>Nothing to pour</h1>
      <p className="lede">
        {round?.phase === 'spending' ? (
          <>
            {v.shop.charAt(0).toUpperCase() + v.shop.slice(1)} is open. The queue arrives when it closes. <Countdown until={round.shopDeadline} />
          </>
        ) : round && round.phase !== 'done' ? (
          'A game is being played. Drinks come after it.'
        ) : (
          'Between rounds. Leave this page open.'
        )}
      </p>
    </>
  );
}
