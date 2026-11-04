'use client';

/**
 * Team phone shop (phase 2 Spending). The shop is the screen's one
 * window, edge to edge on a phone, with a small title plate on its top
 * edge. Inside, top to bottom:
 *
 *   1. Status     money and points at the left, time left at the right
 *   2. Tabs       one per category (Drinks, Items), active one raised
 *   3. Card grid  two columns of landscape cards, wider than tall: a
 *                 chip on the top edge, the sprite at the left, name and
 *                 one line at the right, price tag bottom right. A
 *                 tapped card rings gold and opens …
 *   4. Details    a dialog: sprite, stats, description, who to send it
 *                 to (drinks), quantity, total, and the Buy/Send button
 *   5. Round bar  what this team has bought this round, and Done
 *
 * Buying writes an intent (a drink order or an item use) through onBuy;
 * the server checks balances and limits. Per CLAUDE.md there is no
 * "are you sure" step: the details dialog is the order form, and its
 * button places the order.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { IconName } from './icons';
import { Icon, Price } from './kit';

export type ShopStat = { label: string; value: string; tone?: 'good' | 'bad' };

export type ShopItem = {
  key: string;
  name: string;
  /** Plural used in receipts, e.g. "beers". Defaults to name. */
  plural?: string;
  icon: IconName;
  price: number;
  /** Chip on the card's top edge, e.g. "+2 pts" or "1 a night". */
  tag?: string;
  /** Second line on the card. Defaults to the first stat's value. */
  line?: string;
  stats: ShopStat[];
  description: string;
  /** Most that can be bought now (limits left). Defaults to 9. */
  max?: number;
  /** Drinks go to another team, so the dialog asks which. */
  needsTarget?: boolean;
  soldOut?: string;
};

export type ShopCategory = { key: string; label: string; icon: IconName; items: ShopItem[] };

export type ShopOrder = { item: string; qty: number; target?: string; total: number };

type Props = {
  title?: string;
  money: number;
  points: number;
  timeLeft: string;
  categories: ShopCategory[];
  /** Other teams, for sending drinks. */
  targets?: string[];
  doneHref?: string;
  onBuy?: (order: ShopOrder) => void | Promise<void>;
};

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function ShopScreen({
  title = 'Shop',
  money: startMoney,
  points,
  timeLeft,
  categories,
  targets = [],
  doneHref = '#',
  onBuy,
}: Props) {
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<ShopItem | null>(null);
  const [spent, setSpent] = useState(0);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const money = startMoney - spent;
  const items = categories[tab]?.items ?? [];

  const byKey = useMemo(() => {
    const m = new Map<string, ShopItem>();
    categories.forEach((c) => c.items.forEach((i) => m.set(i.key, i)));
    return m;
  }, [categories]);

  async function buy(order: ShopOrder) {
    await onBuy?.(order);
    setSpent((s) => s + order.total);
    setOrders((o) => [...o, order]);
    const item = byKey.get(order.item);
    const what = order.qty > 1 ? `${order.qty} ${item?.plural ?? item?.name}` : item?.name;
    setToast(order.target ? `${what} sent to ${order.target}` : `Bought ${what}`);
    setOpen(null);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <section className="px-shop pxf-wood" aria-label={title}>
      <h1 className="px-shop__title px-plate">{title}</h1>

      <ShopStatus money={money} points={points} timeLeft={timeLeft} />

      <div className="px-shop__tabs" role="tablist" aria-label="Categories">
        {categories.map((c, i) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            id={`shop-tab-${c.key}`}
            aria-selected={i === tab}
            aria-controls="shop-grid"
            className={cx('px-shop__tab', i === tab ? 'pxf-btn' : 'pxf-btn-paper')}
            onClick={() => {
              setTab(i);
              setSelected(null);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div
        className="px-shop__grid"
        role="tabpanel"
        id="shop-grid"
        aria-labelledby={`shop-tab-${categories[tab]?.key}`}
      >
        {items.map((item) => (
          <ShopCard
            key={item.key}
            item={item}
            selected={selected === item.key}
            short={item.price > money}
            onPick={() => {
              setSelected(item.key);
              setOpen(item);
            }}
          />
        ))}
      </div>

      <div className="px-shop__toast" aria-live="polite">
        {toast ? (
          <div className="px-toast pxf-tooltip" role="status">
            <Icon name="ok" />
            <span className="px-toast__title">{toast}</span>
          </div>
        ) : null}
      </div>

      <RoundBar orders={orders} byKey={byKey} doneHref={doneHref} />

      <ItemDialog item={open} money={money} targets={targets} onClose={() => setOpen(null)} onBuy={buy} />
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** Money and points at the left, time left at the right: one compact row. */
export function ShopStatus({ money, points, timeLeft }: { money: number; points: number; timeLeft: string }) {
  return (
    <div className="px-shop__status">
      <span className="px-shop__purse pxf-slot">
        <span className="px-shop__stat" aria-label={`Money: ${money}`}>
          <Icon name="coin-s" />
          <span className="px-shop__num">{money}</span>
        </span>
        <span className="px-shop__stat" aria-label={`Points: ${points}`}>
          <Icon name="star-s" />
          <span className="px-shop__num">{points}</span>
        </span>
      </span>
      <span className="px-shop__stat px-shop__time" aria-label={`${timeLeft} left`}>
        <Icon name="hourglass-s" />
        <span className="px-shop__num px-shop__num--time">{timeLeft}</span>
      </span>
    </div>
  );
}

/** Landscape card, after the reference: wider than tall. */
export function ShopCard({
  item,
  selected,
  short,
  onPick,
}: {
  item: ShopItem;
  selected?: boolean;
  short?: boolean;
  onPick?: () => void;
}) {
  const sold = Boolean(item.soldOut);
  const line = item.line ?? item.stats[0]?.value;
  return (
    <button
      type="button"
      className={cx('px-card', selected ? 'pxf-card-active' : 'pxf-card', sold && 'px-card--sold')}
      aria-pressed={selected}
      aria-haspopup="dialog"
      disabled={sold}
      onClick={onPick}
    >
      {item.tag ? <span className="px-card__chip px-plate">{item.tag}</span> : null}
      <span className="px-card__sprite">
        <Icon name={item.icon} dim={sold} />
        <span className="px-card__shadow" aria-hidden="true" />
      </span>
      <span className="px-card__info">
        <span className="px-card__name">{item.name}</span>
        <span className="px-card__line">{sold ? item.soldOut : line}</span>
      </span>
      <span className={cx('px-card__price', short || sold ? 'pxf-tag-short' : 'pxf-tag')}>
        <Icon name="coin-s" />
        <span>{item.price}</span>
      </span>
    </button>
  );
}

/** The details body, shared by the dialog and the gallery's still view. */
export function ItemDetails({
  item,
  money,
  targets = [],
  onClose,
  onBuy,
}: {
  item: ShopItem;
  money: number;
  targets?: string[];
  onClose?: () => void;
  onBuy?: (order: ShopOrder) => void;
}) {
  const limit = item.max ?? 9;
  const afford = Math.floor(money / Math.max(1, item.price));
  const [qty, setQty] = useState(1);
  const [target, setTarget] = useState(0);
  const total = qty * item.price;
  const short = total > money;
  const atMax = qty >= limit;

  useEffect(() => {
    setQty(1);
    setTarget(0);
  }, [item.key]);

  const verb = item.needsTarget ? 'Send' : 'Buy';

  return (
    <div className="px-details">
      <button type="button" className="px-details__close pxf-btn-red" onClick={onClose} aria-label="Close">
        <Icon name="cancel" />
      </button>
      <h2 className="px-details__name pxf-plank">{item.name}</h2>

      <div className="px-details__hero">
        <span className="px-details__sprite pxf-slot">
          <Icon name={item.icon} scale={6} />
        </span>
        <dl className="px-details__stats">
          {item.stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd className={cx(s.tone && `px-card__value--${s.tone}`)}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="px-details__desc">{item.description}</p>

      {item.needsTarget && targets.length ? (
        <div className="px-details__row">
          <span className="px-details__label">Send to</span>
          <span className="px-cycler" role="group" aria-label="Team">
            <button
              type="button"
              className="px-cycler__arrow"
              aria-label="Previous team"
              onClick={() => setTarget((t) => (t - 1 + targets.length) % targets.length)}
            >
              <span className="px-arrow px-arrow--left" />
            </button>
            <span className="px-cycler__value pxf-slot" aria-live="polite">
              {targets[target]}
            </span>
            <button
              type="button"
              className="px-cycler__arrow"
              aria-label="Next team"
              onClick={() => setTarget((t) => (t + 1) % targets.length)}
            >
              <span className="px-arrow px-arrow--right" />
            </button>
          </span>
        </div>
      ) : null}

      <div className="px-details__row">
        <span className="px-details__label">How many</span>
        <span className="px-stepper" role="group" aria-label="Quantity">
          <button
            type="button"
            className="px-stepper__btn pxf-btn-paper"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label="One fewer"
          >
            −
          </button>
          <span className="px-stepper__value pxf-slot" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            className="px-stepper__btn pxf-btn"
            onClick={() => setQty((q) => Math.min(limit, q + 1))}
            disabled={atMax}
            aria-label="One more"
          >
            +
          </button>
        </span>
      </div>

      <div className="px-details__total">
        <span>Total</span>
        <Price amount={total} large />
      </div>
      <p className="px-details__note" aria-live="polite">
        {short
          ? `You need ${total - money} more.`
          : atMax && item.max !== undefined
            ? `That's the most you can buy right now.`
            : `Your money covers up to ${afford}.`}
      </p>

      <div className="px-details__ctas">
        <button type="button" className="px-btn px-btn--paper" onClick={onClose}>
          <span>Cancel</span>
        </button>
        <button
          type="button"
          className="px-btn px-btn--confirm px-btn--icon"
          disabled={short}
          onClick={() =>
            onBuy?.({
              item: item.key,
              qty,
              target: item.needsTarget ? targets[target] : undefined,
              total,
            })
          }
        >
          <Icon name="coin-s" />
          <span>
            {verb} · {total}
          </span>
        </button>
      </div>
    </div>
  );
}

function ItemDialog({
  item,
  money,
  targets,
  onClose,
  onBuy,
}: {
  item: ShopItem | null;
  money: number;
  targets: string[];
  onClose: () => void;
  onBuy: (order: ShopOrder) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);

  return (
    <dialog
      ref={ref}
      className="px-dialog pxf-wood"
      aria-label={item?.name}
      onClose={onClose}
      onClick={(e) => {
        // A tap on the dimmed backdrop closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      {item ? <ItemDetails item={item} money={money} targets={targets} onClose={onClose} onBuy={onBuy} /> : null}
    </dialog>
  );
}

function RoundBar({
  orders,
  byKey,
  doneHref,
}: {
  orders: ShopOrder[];
  byKey: Map<string, ShopItem>;
  doneHref: string;
}) {
  const spent = orders.reduce((s, o) => s + o.total, 0);
  return (
    <footer className="px-shop__bar">
      <div className="px-shop__summary">
        <span className="px-shop__summary-head">This round</span>
        {orders.length ? (
          <span className="px-shop__summary-list">
            {orders.map((o, i) => {
              const item = byKey.get(o.item);
              return (
                <span key={i} className="px-shop__summary-item">
                  {item ? `${o.qty} ${o.qty > 1 ? item.plural ?? item.name : item.name}` : o.item}
                  {o.target ? ` to ${o.target}` : ''}
                </span>
              );
            })}
            <Price amount={spent} />
          </span>
        ) : (
          <span className="px-shop__summary-empty">Nothing yet</span>
        )}
      </div>
      <a className="px-btn px-btn--primary px-shop__done" href={doneHref}>
        <span>Done</span>
      </a>
    </footer>
  );
}
