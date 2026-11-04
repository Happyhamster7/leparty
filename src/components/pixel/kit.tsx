/**
 * Pixel kit — presentational components for the pixel skin.
 *
 * Each one comes from a Stardew Valley screen; docs/pixel-ui-reference.md
 * says which, and where it goes in LeParty. They render inside an
 * element with data-skin="pixel" (normally <html>), which supplies the
 * tokens. Server components unless noted; the stateful ones live in
 * ./controls.tsx.
 *
 * Spacing uses the tokens --s-1 … --s-6 (multiples of the 3px art pixel)
 * and never ad hoc values, so everything stays on the pixel grid.
 */

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import type { IconName } from './icons';

type Children = { children?: ReactNode };

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Foundations                                                         */
/* ------------------------------------------------------------------ */

/**
 * One icon from the sprite sheet. Scale 3 puts one art pixel on 3 CSS px,
 * the same as every frame; 6 is for feature icons. Small icons (*-s) are
 * 8x8 art, 24px at scale 3.
 */
export function Icon({
  name,
  scale = 3,
  label,
  dim,
}: {
  name: IconName;
  scale?: 3 | 6;
  /** Give a label when the icon carries meaning on its own. */
  label?: string;
  /** Silhouette, for things not yet found or not yet owned. */
  dim?: boolean;
}) {
  return (
    <span
      className={cx('px-icon', `px-icon--${name}`, dim && 'px-icon--dim')}
      style={{ '--icon-scale': scale } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Menu window: a wooden frame with an optional title plate on its top edge. */
export function Window({
  title,
  tone = 'wood',
  className,
  children,
}: Children & { title?: string; tone?: 'wood' | 'board'; className?: string }) {
  return (
    <section className={cx('px-window', `pxf-${tone}`, title && 'px-window--titled', className)}>
      {title ? <h2 className="px-window__title pxf-plank">{title}</h2> : null}
      {children}
    </section>
  );
}

/** A smaller frame inside a window. */
export function Panel({
  tone = 'hud',
  className,
  children,
}: Children & { tone?: 'hud' | 'paper' | 'tooltip'; className?: string }) {
  return <div className={cx('px-panel', `pxf-${tone}`, className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Buttons (title screen, OK and cancel)                                */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'paper' | 'confirm' | 'danger';

export function Button({
  variant = 'primary',
  icon,
  href,
  type = 'button',
  disabled,
  block,
  children,
}: Children & {
  variant?: ButtonVariant;
  icon?: IconName;
  href?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  block?: boolean;
}) {
  const cls = cx('px-btn', `px-btn--${variant}`, block && 'px-btn--block', icon && 'px-btn--icon');
  const inner = (
    <>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </>
  );
  if (href) {
    return (
      <Link className={cls} href={href}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} type={type} disabled={disabled}>
      {inner}
    </button>
  );
}

/** Square icon-over-label button, from the title screen. */
export function BigButton({ icon, label, href }: { icon: IconName; label: string; href: string }) {
  return (
    <Link className="px-bigbtn" href={href}>
      <Icon name={icon} scale={6} />
      <span>{label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Inventory: slots, tooltips, grids                                    */
/* ------------------------------------------------------------------ */

export type TooltipContent = {
  title: string;
  kind?: string;
  body?: string;
  price?: number;
};

export function Tooltip({ title, kind, body, price, floating }: TooltipContent & { floating?: boolean }) {
  return (
    <span className={cx('px-tooltip', 'pxf-tooltip', floating && 'px-tooltip--floating')} role="tooltip">
      <strong className="px-tooltip__title">{title}</strong>
      {kind ? <span className="px-tooltip__kind">{kind}</span> : null}
      {body ? <span className="px-tooltip__body">{body}</span> : null}
      {price !== undefined ? <Price amount={price} /> : null}
    </span>
  );
}

export type SlotProps = {
  icon?: IconName;
  count?: number;
  /** Gold star in the corner, for the best version of something. */
  starred?: boolean;
  /** Dim silhouette: not found yet, not owned, or still needed. */
  locked?: boolean;
  /** Red frame: selected. */
  active?: boolean;
  label?: string;
  tooltip?: TooltipContent;
};

export function Slot({ icon, count, starred, locked, active, label, tooltip }: SlotProps) {
  const frame = active ? 'pxf-slot-active' : locked ? 'pxf-slot-locked' : 'pxf-slot';
  return (
    <span
      className={cx('px-slot', frame)}
      tabIndex={tooltip ? 0 : undefined}
      aria-label={label ?? tooltip?.title}
    >
      {icon ? <Icon name={icon} dim={locked} /> : null}
      {starred ? (
        <span className="px-slot__star">
          <Icon name="star-s" />
        </span>
      ) : null}
      {count && count > 1 ? <span className="px-slot__count">{count}</span> : null}
      {tooltip ? <Tooltip {...tooltip} floating /> : null}
    </span>
  );
}

/** Slots edge to edge, the way the inventory and collections lay them out. */
export function SlotGrid({ columns, children }: Children & { columns: number }) {
  return (
    <div className="px-slotgrid" style={{ '--cols': columns } as CSSProperties}>
      {children}
    </div>
  );
}

/** The toolbar along the bottom of the HUD: a row of slots in a frame. */
export function Hotbar({ slots, active }: { slots: SlotProps[]; active?: number }) {
  return (
    <div className="px-hotbar pxf-hud">
      {slots.map((s, i) => (
        <Slot key={i} {...s} active={i === active} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HUD: money, clock, energy                                            */
/* ------------------------------------------------------------------ */

export function Price({ amount, large }: { amount: number; large?: boolean }) {
  return (
    <span className={cx('px-price', large && 'px-price--large')}>
      <Icon name="coin-s" />
      <span>{amount.toLocaleString('en-AU')}</span>
    </span>
  );
}

/** Money counter: each digit in its own little window. */
export function Wallet({ amount, label = 'Team money', digits = 5 }: { amount: number; label?: string; digits?: number }) {
  const text = String(Math.max(0, Math.floor(amount))).padStart(digits, ' ');
  return (
    <div className="px-wallet pxf-hud" aria-label={`${label}: ${amount}`}>
      <Icon name="coin-s" />
      <span className="px-wallet__digits" aria-hidden="true">
        {text.split('').map((d, i) => (
          <span key={i} className={cx('px-wallet__digit', d === ' ' && 'px-wallet__digit--blank')}>
            {d === ' ' ? '0' : d}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Clock box from the top-right HUD: phase, big time, round. */
export function Clock({ time, phase, round }: { time: string; phase: string; round: string }) {
  return (
    <div className="px-clock pxf-hud">
      <span className="px-clock__round">{round}</span>
      <span className="px-clock__time">
        <Icon name="hourglass" />
        <span>{time}</span>
      </span>
      <span className="px-clock__phase">{phase}</span>
    </div>
  );
}

/** Vertical bar from the HUD. Used as the 30-second drinks clock. */
export function EnergyBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone = pct <= 25 ? 'low' : pct <= 50 ? 'mid' : 'high';
  return (
    <div className="px-energy" role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className="px-energy__label">{label}</span>
      <span className="px-energy__track pxf-bar">
        <span className={cx('px-energy__fill', `px-energy__fill--${tone}`)} style={{ height: `${pct}%` }} />
      </span>
    </div>
  );
}

/** Ten pips, from the skills tab. */
export function Pips({ value, max = 10, label }: { value: number; max?: number; label: string }) {
  return (
    <span className="px-pips" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx('px-pip', i < value && 'px-pip--on')} />
      ))}
    </span>
  );
}

export function Hearts({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="px-hearts" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name="heart-s" dim={i >= value} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/** "Item received" chip. Stack them bottom-left with .px-toasts. */
export function Toast({ icon, title, detail }: { icon: IconName; title: string; detail?: string }) {
  return (
    <div className="px-toast pxf-tooltip" role="status">
      <Icon name={icon} />
      <span className="px-toast__title">{title}</span>
      {detail ? <span className="px-toast__detail">{detail}</span> : null}
    </div>
  );
}

/** Someone talking: text on the left, portrait and name plate on the right. */
export function Dialogue({
  name,
  portrait = 'warden',
  more,
  children,
}: Children & { name: string; portrait?: IconName; more?: boolean }) {
  return (
    <div className="px-dialogue pxf-wood">
      <div className="px-dialogue__text">
        {children}
        {more ? <span className="px-dialogue__more" aria-label="More" /> : null}
      </div>
      <div className="px-dialogue__who">
        <span className="px-dialogue__portrait pxf-slot">
          <Icon name={portrait} scale={6} />
        </span>
        <span className="px-dialogue__name pxf-plank">{name}</span>
      </div>
    </div>
  );
}

/** Between rounds and Acts: one centred line on the dark. */
export function Interstitial({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="px-interstitial">
      <span className="px-interstitial__kicker">{kicker}</span>
      <span className="px-interstitial__title">{title}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mail and the billboard                                              */
/* ------------------------------------------------------------------ */

export function Letter({
  greeting,
  signoff,
  attachment,
  children,
}: Children & { greeting: string; signoff: string; attachment?: { icon: IconName; label: string } }) {
  return (
    <article className="px-letter pxf-paper">
      <p className="px-letter__greeting">{greeting}</p>
      <div className="px-letter__body">{children}</div>
      <p className="px-letter__signoff">{signoff}</p>
      {attachment ? (
        <div className="px-letter__attachment">
          <Slot icon={attachment.icon} label={attachment.label} />
          <span>{attachment.label}</span>
        </div>
      ) : null}
    </article>
  );
}

export function NoticeBoard({ title, children }: Children & { title: string }) {
  return (
    <Window title={title} tone="board" className="px-board">
      <div className="px-board__pins">{children}</div>
    </Window>
  );
}

export function PinnedCard({ date, title, children, action }: Children & { date: string; title: string; action?: ReactNode }) {
  return (
    <div className="px-pinned pxf-paper">
      <span className="px-pinned__pin" aria-hidden="true" />
      <span className="px-pinned__date">{date}</span>
      <h3 className="px-pinned__title">{title}</h3>
      {children}
      {action ? <div className="px-pinned__action">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

/** Shop row: icon, then name over price and note, then the control at the right. */
export function ShopRow({
  icon,
  name,
  detail,
  price,
  action,
  disabled,
}: {
  icon: IconName;
  name: string;
  detail?: string;
  price?: number;
  action?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cx('px-shoprow', disabled && 'px-shoprow--disabled')}>
      <Slot icon={icon} locked={disabled} />
      <span className="px-shoprow__text">
        <span className="px-shoprow__name">{name}</span>
        <span className="px-shoprow__meta">
          {price !== undefined ? <Price amount={price} /> : null}
          {detail ? <span className="px-shoprow__detail">{detail}</span> : null}
        </span>
      </span>
      {action ? <span className="px-shoprow__action">{action}</span> : null}
    </div>
  );
}

/** One person per row, from the social tab. */
export function PersonRow({
  name,
  initials,
  photo,
  meta,
  hearts,
  right,
  done,
}: {
  name: string;
  initials: string;
  photo?: string;
  meta?: string;
  hearts?: number;
  right?: ReactNode;
  done?: boolean;
}) {
  return (
    <div className={cx('px-person', done && 'px-person--done')}>
      <span className={cx('px-person__portrait', done ? 'pxf-slot-locked' : 'pxf-slot')}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" />
        ) : (
          <span>{initials}</span>
        )}
      </span>
      <span className="px-person__text">
        <span className="px-person__name">{name}</span>
        {meta ? <span className="px-person__meta">{meta}</span> : null}
      </span>
      {hearts !== undefined ? <Hearts value={hearts} /> : null}
      {right ? <span className="px-person__right">{right}</span> : null}
    </div>
  );
}

/** End-of-day shipping summary: one row per category, total at the foot. */
export function Tally({
  rows,
  totalLabel = 'Total',
}: {
  rows: { icon: IconName; label: string; count?: number; amount: number }[];
  totalLabel?: string;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="px-tally">
      {rows.map((r) => (
        <div className="px-tally__row" key={r.label}>
          <Icon name={r.icon} />
          <span className="px-tally__label">{r.label}</span>
          <span className="px-tally__count">{r.count !== undefined ? `x${r.count}` : ''}</span>
          <Price amount={r.amount} />
        </div>
      ))}
      <div className="px-tally__row px-tally__row--total">
        <span />
        <span className="px-tally__label">{totalLabel}</span>
        <span />
        <Price amount={total} large />
      </div>
    </div>
  );
}

/** A shared goal from the Community Center: fill these slots. */
export function Bundle({
  icon,
  title,
  have,
  need,
  note,
}: {
  icon: IconName;
  title: string;
  have: number;
  need: number;
  note?: string;
}) {
  const done = have >= need;
  return (
    <div className={cx('px-bundle', done && 'px-bundle--done')}>
      <div className="px-bundle__head">
        <Icon name={icon} />
        <span className="px-bundle__title">{title}</span>
        <span className="px-bundle__count">
          {done ? <Icon name="ok" label="Covered" /> : `${have} of ${need}`}
        </span>
      </div>
      <SlotGrid columns={Math.min(Math.max(need, have), 4)}>
        {Array.from({ length: Math.max(need, have) }, (_, i) => (
          <Slot key={i} icon={icon} locked={i >= have} />
        ))}
      </SlotGrid>
      {note ? <p className="px-bundle__note">{note}</p> : null}
    </div>
  );
}

/** One of two choices after a level up. */
export function ChoiceCard({
  icon,
  title,
  body,
  selected,
  meta,
}: {
  icon: IconName;
  title: string;
  body?: string;
  meta?: ReactNode;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('px-choice', selected ? 'pxf-slot-active' : 'pxf-btn-paper')}
      aria-pressed={selected}
    >
      <Icon name={icon} scale={6} />
      <span className="px-choice__title">{title}</span>
      {body ? <span className="px-choice__body">{body}</span> : null}
      {meta ? <span className="px-choice__meta">{meta}</span> : null}
    </button>
  );
}

/** The quest log: steps with a tick once done. */
export function QuestList({ items }: { items: { title: string; detail?: string; done?: boolean }[] }) {
  return (
    <ol className="px-quests">
      {items.map((q, i) => (
        <li className={cx('px-quest', q.done && 'px-quest--done')} key={i}>
          <Icon name={q.done ? 'ok' : 'scroll'} />
          <span>
            <span className="px-quest__title">{q.title}</span>
            {q.detail ? <span className="px-quest__detail">{q.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** End-of-contest ranking, sized to read from across a room. */
export function Leaderboard({
  rows,
}: {
  rows: { name: string; color: string; points: number; change?: number }[];
}) {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  return (
    <ol className="px-leader">
      {sorted.map((r, i) => (
        <li className={cx('px-leader__row', i === 0 && 'px-leader__row--first')} key={r.name}>
          <span className="px-leader__place">{i === 0 ? <Icon name="trophy" label="First" /> : i + 1}</span>
          <span className="px-leader__swatch" style={{ background: r.color }} />
          <span className="px-leader__name">{r.name}</span>
          <span className="px-leader__change">{r.change ? `+${r.change}` : ''}</span>
          <span className="px-leader__points">
            <Icon name="star-s" />
            {r.points}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Form helpers                                                        */
/* ------------------------------------------------------------------ */

/** Label above, control below — the character creation layout. */
export function Field({ label, hint, htmlFor, children }: Children & { label: string; hint?: string; htmlFor?: string }) {
  return (
    <div className="px-field">
      <label className="field" htmlFor={htmlFor}>
        {label} {hint ? <span className="opt">({hint})</span> : null}
      </label>
      {children}
    </div>
  );
}

/** Options-menu row: label left, control right. */
export function OptionRow({ label, children }: Children & { label: string }) {
  return (
    <div className="px-option">
      <span className="px-option__label">{label}</span>
      <span className="px-option__control">{children}</span>
    </div>
  );
}

export function Checkbox({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="px-check">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="px-check__box pxf-slot" aria-hidden="true">
        <Icon name="ok" />
      </span>
      <span>{label}</span>
    </label>
  );
}
