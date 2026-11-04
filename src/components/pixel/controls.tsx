'use client';

/**
 * The stateful parts of the pixel kit. See ./kit.tsx for the rest.
 */

import { useState, type ReactNode } from 'react';
import type { IconName } from './icons';
import { Icon } from './kit';

/** Menu tabs along the top edge of a window; the active one is raised. */
export function Tabs({
  items,
  initial = 0,
}: {
  items: { key: string; icon: IconName; label: string; content: ReactNode }[];
  initial?: number;
}) {
  const [active, setActive] = useState(initial);
  return (
    <div className="px-tabs">
      <div className="px-tabs__row" role="tablist">
        {items.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={i === active}
            aria-controls={`panel-${t.key}`}
            className={i === active ? 'px-tab pxf-tab' : 'px-tab pxf-tab-idle'}
            onClick={() => setActive(i)}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {items.map((t, i) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`panel-${t.key}`}
          aria-labelledby={`tab-${t.key}`}
          hidden={i !== active}
          className="px-tabs__panel pxf-wood"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

/** Quantity picker for shop rows: minus, count, plus. */
export function Stepper({
  initial = 0,
  min = 0,
  max = 9,
  label,
}: {
  initial?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  const [n, setN] = useState(initial);
  return (
    <span className="px-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="px-stepper__btn pxf-btn-paper"
        onClick={() => setN((v) => Math.max(min, v - 1))}
        disabled={n <= min}
        aria-label={`One fewer ${label}`}
      >
        −
      </button>
      <span className="px-stepper__value pxf-slot" aria-live="polite">
        {n}
      </span>
      <button
        type="button"
        className="px-stepper__btn pxf-btn"
        onClick={() => setN((v) => Math.min(max, v + 1))}
        disabled={n >= max}
        aria-label={`One more ${label}`}
      >
        +
      </button>
    </span>
  );
}

/** Arrow cycler from character creation: ◀ value ▶. */
export function Cycler({ options, label }: { options: string[]; label: string }) {
  const [i, setI] = useState(0);
  const step = (d: number) => setI((v) => (v + d + options.length) % options.length);
  return (
    <span className="px-cycler" role="group" aria-label={label}>
      <button type="button" className="px-cycler__arrow" onClick={() => step(-1)} aria-label={`Previous ${label}`}>
        <span className="px-arrow px-arrow--left" />
      </button>
      <span className="px-cycler__value pxf-slot" aria-live="polite">
        {options[i]}
      </span>
      <button type="button" className="px-cycler__arrow" onClick={() => step(1)} aria-label={`Next ${label}`}>
        <span className="px-arrow px-arrow--right" />
      </button>
    </span>
  );
}
