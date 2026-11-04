import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './gallery.css';
import {
  BigButton,
  Bundle,
  Button,
  Checkbox,
  ChoiceCard,
  Clock,
  Dialogue,
  EnergyBar,
  Field,
  Hearts,
  Hotbar,
  Icon,
  Interstitial,
  Leaderboard,
  Letter,
  NoticeBoard,
  OptionRow,
  Panel,
  PersonRow,
  PinnedCard,
  Pips,
  Price,
  QuestList,
  ShopRow,
  Slot,
  SlotGrid,
  Tally,
  Toast,
  Tooltip,
  Wallet,
  Window,
} from '@/components/pixel/kit';
import { Cycler, Stepper, Tabs } from '@/components/pixel/controls';
import { ItemDetails, ShopCard, ShopScreen, ShopStatus } from '@/components/pixel/shop';
import { SHOP_DEMO, SHOP_TARGETS } from './shop-demo';
import { ICON_NAMES } from '@/components/pixel/icons';

export const metadata: Metadata = {
  title: 'LeParty pixel kit',
  robots: { index: false },
};

/**
 * Gallery of the pixel kit: every component, then example screens built
 * from them with sample data. Always shows the pixel skin, whatever the
 * cookie says. Not linked from the app.
 */

const PALETTE: [string, string][] = [
  ['Outline', '#3b1d12'],
  ['Wood dark', '#6e3416'],
  ['Wood', '#a3521f'],
  ['Wood light', '#eaa65a'],
  ['Parchment', '#fde6b2'],
  ['Parchment shade', '#f2cd8a'],
  ['Tan', '#dcab68'],
  ['Cream', '#fff6c8'],
  ['Gold', '#f2b72c'],
  ['Green', '#4f9e3a'],
  ['Red', '#c9402f'],
  ['Blue', '#24477e'],
];

const SPACING: [string, number, string][] = [
  ['--px', 3, 'Hairlines, pressed offset'],
  ['--s-1', 6, 'Icon to label'],
  ['--s-2', 12, 'Inside rows and chips'],
  ['--s-3', 18, 'Inside frames, between rows'],
  ['--s-4', 24, 'Between groups'],
  ['--s-5', 36, 'Between sections'],
  ['--s-6', 48, 'Above a title'],
];

const FRAMES = [
  'wood',
  'hud',
  'board',
  'paper',
  'tooltip',
  'slot',
  'slot-locked',
  'slot-active',
  'btn',
  'btn-paper',
  'btn-green',
  'btn-red',
  'plank',
];

const TEAMS = [
  { name: 'Block A', color: '#c9402f', points: 34, change: 6 },
  { name: 'Block B', color: '#3b7bc7', points: 41, change: 9 },
  { name: 'Block C', color: '#4f9e3a', points: 22 },
  { name: 'Block D', color: '#f2b72c', points: 29, change: 3 },
  { name: 'Block E', color: '#7d45a8', points: 18 },
  { name: 'Block F', color: '#e07a1d', points: 25, change: 2 },
];

function Section({ id, title, source, children }: { id: string; title: string; source: string; children: ReactNode }) {
  return (
    <section className="kit-section" aria-labelledby={id}>
      <Window title={title}>
        <p className="kit-source" id={id}>
          {source}
        </p>
        {children}
      </Window>
    </section>
  );
}

function Spec({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={wide ? 'kit-spec kit-spec--wide' : 'kit-spec'}>
      <div className="kit-spec__demo">{children}</div>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

function Phone({ label, top, children }: { label: string; top: [string, string]; children: ReactNode }) {
  return (
    <figure className="kit-phone">
      <figcaption>{label}</figcaption>
      <div className="shell">
        <div className="topbar">
          <span>{top[0]}</span>
          <span>{top[1]}</span>
        </div>
        <div className="body">{children}</div>
      </div>
    </figure>
  );
}

function cell(name: string | null, num: string, init: string) {
  const bars = (
    <div className="cell__bars" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
  if (!name) {
    return (
      <div className="cell cell--empty" key={num}>
        <div className="cell__tag">Vacant</div>
        <div className="cell__frame">{bars}</div>
        <p className="cell__number">&mdash;</p>
      </div>
    );
  }
  return (
    <div className="cell" key={num}>
      <div className="cell__tag">{name}</div>
      <div className="cell__frame">
        <span className="initials">{init}</span>
        {bars}
      </div>
      <p className="cell__number">{num}</p>
    </div>
  );
}

export default function KitPage() {
  return (
    <div data-skin="pixel" className="px-page kit">
      <header className="kit-head">
        <h1 className="huge">Pixel kit</h1>
        <Panel tone="paper" className="kit-intro">
          <p>
            Components for LeParty&rsquo;s pixel skin, after the menus in Stardew Valley. Each section
            names the game screen it comes from. The art is original and drawn by{' '}
            <code>scripts/pixel-sprites.py</code>. Notes on function, placement and spacing are in{' '}
            <code>docs/pixel-ui-reference.md</code>.
          </p>
          <p className="kit-jump">
            <a href="#screens">Jump to example screens</a>
          </p>
        </Panel>
      </header>

      {/* ------------------------------------------------ foundations */}
      <Section id="s-found" title="Foundations" source="One art pixel is 3 CSS px. Every size below is a multiple of it.">
        <h3 className="kit-h">Palette</h3>
        <div className="kit-swatches">
          {PALETTE.map(([n, hex]) => (
            <div className="kit-swatch" key={n}>
              <span style={{ background: hex }} />
              <strong>{n}</strong>
              <code>{hex}</code>
            </div>
          ))}
        </div>

        <h3 className="kit-h">Spacing</h3>
        <div className="kit-spacing">
          {SPACING.map(([t, v, use]) => (
            <div className="kit-space" key={t}>
              <code>{t}</code>
              <span className="kit-space__bar" style={{ width: v * 3 }} />
              <span>
                {v}px &middot; {use}
              </span>
            </div>
          ))}
        </div>

        <h3 className="kit-h">Type</h3>
        <div className="kit-type">
          <p className="kit-type__display">Jersey 10 for titles and numbers</p>
          <p className="kit-type__body">
            Pixelify Sans for everything you read. Dark brown on parchment, never black on white.
          </p>
          <h1 className="huge" style={{ fontSize: 54 }}>
            Title screen
          </h1>
        </div>
      </Section>

      {/* ------------------------------------------------------ frames */}
      <Section id="s-frames" title="Frames" source="9-slice sprites, light from the top left. Menus, slots and buttons share one bevel.">
        <div className="kit-frames">
          {FRAMES.map((f) => (
            <Spec name={f} key={f}>
              <span className={`kit-frame pxf-${f}`} />
            </Spec>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------- icons */}
      <Section id="s-icons" title="Icons" source="16 art px, drawn at 3x. Small inline icons are 8 art px. Silhouettes mark what's not found yet.">
        <div className="kit-icons">
          {ICON_NAMES.map((n) => (
            <Spec name={n} key={n}>
              <Icon name={n} />
            </Spec>
          ))}
          <Spec name="dim">
            <Icon name="pie" dim />
          </Spec>
          <Spec name="scale 6">
            <Icon name="pumpkin" scale={6} />
          </Spec>
        </div>
      </Section>

      {/* ----------------------------------------------------- buttons */}
      <Section id="s-buttons" title="Buttons" source="From the title screen and the OK and cancel buttons. They lift on hover and press down one art pixel.">
        <div className="kit-row">
          <Button>Report for intake</Button>
          <Button variant="paper">Change dish</Button>
          <Button variant="confirm" icon="ok">
            Place order
          </Button>
          <Button variant="danger" icon="cancel">
            Remove guest
          </Button>
          <Button disabled>Shop closed</Button>
          <button className="btn btn--quiet btn--inline" type="button">
            Can&rsquo;t make it
          </button>
        </div>
        <div className="kit-row" style={{ marginTop: 'var(--s-5)' }}>
          <BigButton icon="envelope" label="Join" href="#" />
          <BigButton icon="key" label="Host" href="#" />
          <BigButton icon="trophy" label="Scores" href="#" />
        </div>
      </Section>

      {/* --------------------------------------------------- inventory */}
      <Section id="s-inv" title="Inventory" source="Inventory and collections. Slots touch; only groups get gaps. Hover or focus a slot for its tooltip.">
        <div className="kit-split">
          <Spec name="SlotGrid · Slot">
            <SlotGrid columns={4}>
              <Slot icon="shield" tooltip={{ title: 'Reflect', kind: 'Item', body: 'Drinks aimed at you this round go back to their senders.', price: 40 }} />
              <Slot icon="scroll" count={2} tooltip={{ title: 'Eye Spy', kind: 'Item', body: 'See who has sent drinks to whom, round by round.', price: 25 }} />
              <Slot icon="mug" count={6} starred />
              <Slot icon="shot" count={3} active />
              <Slot icon="cocktail" locked />
              <Slot icon="potion" locked />
              <Slot />
              <Slot />
            </SlotGrid>
          </Spec>
          <Spec name="Tooltip">
            <Tooltip title="Reflect" kind="Item" body="Drinks aimed at you this round go back to their senders." price={40} />
          </Spec>
        </div>
        <Spec name="Tabs" wide>
          <Tabs
            items={[
              { key: 'items', icon: 'chest', label: 'Items', content: <p style={{ margin: 0 }}>The team&rsquo;s items, ready to use.</p> },
              { key: 'drinks', icon: 'mug', label: 'Drinks', content: <p style={{ margin: 0 }}>Drinks you&rsquo;ve sent this round.</p> },
              { key: 'log', icon: 'scroll', label: 'Log', content: <p style={{ margin: 0 }}>Everything that happened tonight.</p> },
            ]}
          />
        </Spec>
        <Spec name="Hotbar" wide>
          <Hotbar
            active={1}
            slots={[{ icon: 'shield' }, { icon: 'scroll', count: 2 }, { icon: 'mug', count: 6 }, {}, {}, {}]}
          />
        </Spec>
      </Section>

      {/* --------------------------------------------------------- HUD */}
      <Section id="s-hud" title="HUD" source="Clock and money from the top right of the screen, energy from the bottom right. Each piece is its own small frame.">
        <div className="kit-row kit-row--end">
          <Spec name="Clock">
            <Clock round="Round 3" time="0:42" phase="Spending" />
          </Spec>
          <Spec name="Wallet">
            <Wallet amount={185} />
          </Spec>
          <Spec name="EnergyBar">
            <div className="kit-dark kit-row">
              <EnergyBar value={0.9} label="30s" />
              <EnergyBar value={0.45} label="14s" />
              <EnergyBar value={0.15} label="4s" />
            </div>
          </Spec>
          <Spec name="Pips · Hearts · Price">
            <div className="kit-stack">
              <Pips value={4} max={5} label="Tolerance" />
              <Hearts value={3} />
              <Price amount={40} />
            </div>
          </Spec>
        </div>
      </Section>

      {/* ---------------------------------------------------- feedback */}
      <Section id="s-feed" title="Feedback" source="Item pop-ups, the dialogue box and the day transition. Small, quick, and out of the way.">
        <div className="kit-split">
          <Spec name="Toast">
            <div className="px-toasts">
              <Toast icon="coin" title="Prize money" detail="+60" />
              <Toast icon="mug" title="Drink sent to Block C" detail="+2" />
              <Toast icon="envelope" title="You're booked in" />
            </div>
          </Spec>
          <Spec name="Stamp · notice">
            <div className="stamp">Booked</div>
            <div className="notice">Welcome back. We still have your details.</div>
          </Spec>
        </div>
        <Spec name="Dialogue" wide>
          <Dialogue name="The Warden" more>
            <p>Shop&rsquo;s open for one minute. Buy what you need and send drinks where they&rsquo;ll hurt.</p>
          </Dialogue>
        </Spec>
        <Spec name="Interstitial" wide>
          <Interstitial kicker="Act II" title="Lights out" />
        </Spec>
      </Section>

      {/* ------------------------------------------------------- forms */}
      <Section id="s-forms" title="Forms" source="Character creation and the options menu. Inputs are recessed slots; labels sit above.">
        <div className="kit-split">
          <div>
            <Field label="Your name" htmlFor="kit-name">
              <input id="kit-name" type="text" defaultValue="Mara Quinn" />
            </Field>
            <Field label="Bringing" hint="pick one" htmlFor="kit-cat">
              <select id="kit-cat" defaultValue="desserts">
                <option value="mains">Mains</option>
                <option value="desserts">Desserts</option>
                <option value="drinks">Drinks</option>
              </select>
            </Field>
          </div>
          <div>
            <OptionRow label="Show on the big screen">
              <Checkbox name="kit-a" defaultChecked label="On" />
            </OptionRow>
            <OptionRow label="Costume">
              <Cycler label="costume" options={['Prison orange', 'Stripes', 'Guard', 'Escapee']} />
            </OptionRow>
            <OptionRow label="Quantity">
              <Stepper label="drinks" initial={2} />
            </OptionRow>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------- shop */}
      <Section
        id="s-shop"
        title="Shop"
        source="The team phone shop. One window with a small title plate; money, points and time in one row; category tabs; landscape item cards, wider than tall, that ring gold when tapped; a details dialog with the Buy button. Buying places the order straight away, with no extra confirm step."
      >
        <Spec name="ShopStatus" wide>
          <div style={{ maxWidth: 360 }}>
            <ShopStatus money={185} points={41} timeLeft="0:42" />
          </div>
        </Spec>
        <Spec name="ShopCard: normal, highlighted, can't afford, sold out" wide>
          <div className="px-shop__grid" style={{ maxWidth: 696 }}>
            <ShopCard item={SHOP_DEMO[0].items[0]} />
            <ShopCard item={SHOP_DEMO[1].items[0]} selected />
            <ShopCard item={SHOP_DEMO[0].items[2]} short />
            <ShopCard item={SHOP_DEMO[1].items[2]} />
          </div>
        </Spec>
        <div className="kit-split">
          <Spec name="ItemDetails (a drink: pick a team)">
            <div className="px-dialog-still pxf-wood">
              <ItemDetails item={SHOP_DEMO[0].items[1]} money={185} targets={SHOP_TARGETS} />
            </div>
          </Spec>
          <Spec name="ItemDetails (an item: limit 1)">
            <div className="px-dialog-still pxf-wood">
              <ItemDetails item={SHOP_DEMO[1].items[0]} money={30} />
            </div>
          </Spec>
        </div>
      </Section>

      {/* ------------------------------------------------------- lists */}
      <Section id="s-lists" title="Lists" source="Shop rows, the social tab, the shipping summary, bundles, the quest log and scoreboards.">
        <div className="kit-split">
          <Spec name="ShopRow">
            <div>
              <ShopRow icon="shield" name="Reflect" detail="1 per night" price={40} action={<Stepper label="Reflect" max={1} />} />
              <ShopRow icon="scroll" name="Eye Spy" detail="1 per round" price={25} action={<Stepper label="Eye Spy" max={1} />} />
              <ShopRow icon="potion" name="Sold out" detail="Back next round" price={30} disabled />
            </div>
          </Spec>
          <Spec name="PersonRow">
            <div>
              <PersonRow name="Mara Quinn" initials="MQ" meta="Inmate 0412" hearts={4} />
              <PersonRow name="Theo Park" initials="TP" meta="Inmate 0413 · checked in" done right={<Icon name="ok" label="Checked in" />} />
              <PersonRow name="Jules Ortega" initials="JO" meta="Inmate 0414" hearts={2} />
            </div>
          </Spec>
          <Spec name="Tally">
            <Tally
              rows={[
                { icon: 'trophy', label: 'First place', amount: 60 },
                { icon: 'star', label: 'Star for most drinks sent', amount: 30 },
                { icon: 'pumpkin', label: 'Best costume', amount: 20 },
              ]}
              totalLabel="Paid to Block B"
            />
          </Spec>
          <Spec name="Bundle">
            <div>
              <Bundle icon="pie" title="Desserts" have={1} need={4} note="Three more people bringing a dessert." />
              <Bundle icon="mug" title="Drinks" have={3} need={3} />
            </div>
          </Spec>
          <Spec name="QuestList">
            <QuestList
              items={[
                { title: 'RSVP', done: true },
                { title: 'Turn up in costume', detail: 'Bring the lemon tart.' },
                { title: 'Tap your face at the door' },
              ]}
            />
          </Spec>
          <Spec name="ChoiceCard">
            <div className="px-choices">
              <ChoiceCard icon="warden" title="Mara" body="Fresh. Can play." selected />
              <ChoiceCard icon="skull" title="Theo" body="Played last round." meta="Back in 2 games" />
            </div>
          </Spec>
        </div>
        <Spec name="Leaderboard" wide>
          <Leaderboard rows={TEAMS.slice(0, 4)} />
        </Spec>
        <Spec name="NoticeBoard · PinnedCard" wide>
          <NoticeBoard title="Open parties">
            <PinnedCard date="Sat 31 Oct" title="Lockdown at the Lighthouse" action={<Button variant="paper">Join</Button>}>
              <p>14 Harbour St, 7:30pm</p>
            </PinnedCard>
            <PinnedCard date="Sat 12 Dec" title="Summer solstice heist" action={<Button variant="paper">Join</Button>}>
              <p>Venue to be announced</p>
            </PinnedCard>
          </NoticeBoard>
        </Spec>
        <Spec name="Letter" wide>
          <Letter greeting="Dear Mara," signoff="The Warden" attachment={{ icon: 'key', label: 'Your invite link' }}>
            <p>You&rsquo;ve been detained. Report to 14 Harbour St on Saturday 31 October at 7:30pm, in costume.</p>
          </Letter>
        </Spec>
      </Section>

      {/* ---------------------------------------------- example screens */}
      <section className="kit-section" id="screens" aria-labelledby="screens-h">
        <h2 className="kit-screens-title" id="screens-h">
          Example screens
        </h2>
        <p className="kit-screens-lede">
          Guest screens use the app&rsquo;s real classes, so they show exactly what the skin does to today&rsquo;s
          pages. The game screens are new, built from the kit with sample data.
        </p>

        <h3 className="kit-group">Guest phone</h3>
        <div className="kit-phones">
          <Phone label="Invite · mail" top={['Dept. of Corrections', 'Form 1-A']}>
            <Letter greeting="Dear Mara," signoff="The Warden">
              <p>
                You&rsquo;ve been detained. Lights out at midnight, and nobody leaves until the warden says so.
              </p>
              <p>
                <strong>Sat 31 Oct, 7:30pm</strong>
                <br />
                14 Harbour St
              </p>
            </Letter>
            <div style={{ height: 'var(--s-4)' }} />
            <div className="box">
              <p className="eyebrow">Dress code</p>
              <p style={{ margin: 0 }}>Prison orange or stripes. Contraband welcome.</p>
            </div>
            <a className="btn" href="#">
              Report for intake
            </a>
            <div style={{ marginTop: 'var(--s-2)', textAlign: 'center' }}>
              <button className="btn btn--quiet btn--inline" type="button">
                Can&rsquo;t make it
              </button>
            </div>
            <p className="mono" style={{ textAlign: 'center', margin: 'var(--s-2) 0 0' }}>
              18 booked so far
            </p>
          </Phone>

          <Phone label="Potluck · bundles" top={['Intake', 'Step 3 of 3']}>
            <h1>Commissary</h1>
            <p className="lede">Everyone brings one thing. Here&rsquo;s what&rsquo;s still short.</p>
            <div style={{ marginBottom: 'var(--s-4)' }}>
              <Bundle icon="drumstick" title="Mains" have={3} need={4} />
              <Bundle icon="pie" title="Desserts" have={1} need={4} />
              <Bundle icon="mug" title="Drinks" have={3} need={3} />
            </div>
            <label className="field" htmlFor="ex-cat">
              Category
            </label>
            <select id="ex-cat" defaultValue="desserts">
              <option value="desserts">Desserts</option>
            </select>
            <label className="field" htmlFor="ex-item">
              What you&rsquo;re bringing <span className="opt">(50 words or fewer)</span>
            </label>
            <input id="ex-item" type="text" defaultValue="Lemon tart" />
            <button className="btn" type="button">
              File it
            </button>
          </Phone>

          <Phone label="Booked · quest log" top={['Intake complete', 'File 0412']}>
            <div className="stamp">Booked</div>
            <PersonRow name="Mara Quinn" initials="MQ" meta="Inmate 0412 · block assigned on the night" />
            <div style={{ height: 'var(--s-4)' }} />
            <p className="eyebrow">What happens next</p>
            <QuestList
              items={[
                { title: 'Turn up in costume', detail: 'Bring the lemon tart.' },
                { title: 'Tap your own face at the door' },
                { title: 'Blocks are drawn once everyone’s arrived' },
              ]}
            />
            <div className="btn-row">
              <a className="btn" href="#">
                Complete
              </a>
            </div>
            <div className="btn-row" style={{ marginTop: 'var(--s-2)' }}>
              <a className="btn btn--ghost" style={{ flex: 1 }} href="#">
                Retake mugshot
              </a>
              <a className="btn btn--ghost" style={{ flex: 1 }} href="#">
                Change dish
              </a>
            </div>
            <div className="px-toasts" style={{ marginTop: 'var(--s-4)' }}>
              <Toast icon="envelope" title="You're booked in" />
            </div>
          </Phone>

          <Phone label="Who's going · collection" top={['Dept. of Corrections', 'Roll call']}>
            <h1>Who&rsquo;s going</h1>
            <p className="lede">Everyone booked in so far.</p>
            <div className="cellblock" style={{ marginBottom: 'var(--s-4)' }}>
              <div className="tier">
                <p className="tier__label">Tier 1</p>
                <div className="tier__row">
                  {cell('Mara', '0412', 'MA')}
                  {cell('Theo', '0413', 'TH')}
                  {cell('Jules', '0414', 'JU')}
                  {cell('Priya', '0415', 'PR')}
                </div>
                <div className="tier__floor" aria-hidden="true" />
              </div>
              <div className="tier">
                <p className="tier__label">Tier 2</p>
                <div className="tier__row">
                  {cell('Sam', '0416', 'SA')}
                  {cell('Ollie', '0417', 'OL')}
                  {cell(null, 'v1', '')}
                  {cell(null, 'v2', '')}
                </div>
              </div>
            </div>
            <div className="btn-row">
              <a className="btn btn--quiet btn--inline" href="#">
                Back to my file
              </a>
            </div>
          </Phone>
        </div>

        <h3 className="kit-group">Host console</h3>
        <div className="kit-phones">
          <Phone label="Check-in · social tab" top={["Warden's console", 'Intake desk']}>
            <h1>Intake desk</h1>
            <div className="stat-row">
              <div className="stat">
                <p className="label">Checked in</p>
                <p className="value">11</p>
              </div>
              <div className="stat">
                <p className="label">Still to come</p>
                <p className="value">7</p>
              </div>
            </div>
            <div className="box">
              <PersonRow name="Mara Quinn" initials="MQ" meta="0412" right={<Icon name="ok" label="Checked in" />} done />
              <PersonRow name="Theo Park" initials="TP" meta="0413" right={<Button variant="paper">Check in</Button>} />
              <PersonRow name="Jules Ortega" initials="JO" meta="0414" right={<Button variant="paper">Check in</Button>} />
              <PersonRow name="Priya Shah" initials="PS" meta="0415" right={<Icon name="ok" label="Checked in" />} done />
            </div>
          </Phone>

          <Phone label="Parties · billboard" top={["Warden's console", 'Parties']}>
            <NoticeBoard title="Parties">
              <PinnedCard date="Sat 31 Oct · open" title="Lockdown at the Lighthouse" action={<Button variant="paper">Open</Button>}>
                <p>18 booked, 6 blocks</p>
              </PinnedCard>
              <PinnedCard date="Draft" title="Summer solstice heist" action={<Button variant="paper">Edit</Button>}>
                <p>Not open for signup yet</p>
              </PinnedCard>
            </NoticeBoard>
            <div style={{ height: 'var(--s-4)' }} />
            <Button block icon="envelope">
              New party
            </Button>
          </Phone>
        </div>

        <h3 className="kit-group">Phase 2 · team phone</h3>
        <div className="kit-phones">
          <figure className="kit-phone">
            <figcaption>Spending · shop (tap a card)</figcaption>
            <div className="kit-screen">
              <div data-shop-demo>
                <ShopScreen money={185} points={41} timeLeft="0:42" categories={SHOP_DEMO} targets={SHOP_TARGETS} />
              </div>
            </div>
          </figure>

          <Phone label="Game pick · level up" top={['Block B', 'Team phone']}>
            <div className="kit-hud">
              <Clock round="Round 4" time="0:51" phase="Pick a player" />
            </div>
            <h1>Who plays Apple bob?</h1>
            <p className="lede">One player. Picks are revealed together.</p>
            <div className="px-choices">
              <ChoiceCard icon="warden" title="Mara" body="Ready to play" selected />
              <ChoiceCard icon="warden" title="Sam" body="Ready to play" />
              <ChoiceCard icon="skull" title="Theo" meta="Sits out 2 games" />
              <ChoiceCard icon="skull" title="Ollie" meta="Sits out 1 game" />
            </div>
            <div style={{ height: 'var(--s-4)' }} />
            <Button block>Lock in Mara</Button>
          </Phone>

          <Phone label="Results · shipping summary" top={['Block B', 'Team phone']}>
            <h1>Round 3 results</h1>
            <div className="box">
              <Tally
                rows={[
                  { icon: 'trophy', label: 'First in Apple bob', amount: 60 },
                  { icon: 'star', label: 'Most drinks sent', amount: 30 },
                ]}
                totalLabel="Paid to you"
              />
            </div>
            <div className="px-toasts">
              <Toast icon="coin" title="Prize money" detail="+90" />
              <Toast icon="star" title="Points for drinks served" detail="+9" />
            </div>
            <div style={{ height: 'var(--s-4)' }} />
            <Button block>Next round</Button>
          </Phone>
        </div>

        <h3 className="kit-group">Phase 2 · big screen</h3>
        <div className="kit-big">
          <div className="kit-big__main">
            <Window title="Leaderboard">
              <Leaderboard rows={TEAMS} />
            </Window>
          </div>
          <div className="kit-big__side">
            <Clock round="Act II · round 3" time="0:42" phase="Drinks" />
            <Window title="At the bar">
              <div className="kit-bar">
                <div className="kit-bar__team">
                  <span className="kit-bar__swatch" style={{ background: '#4f9e3a' }} />
                  <span>
                    <strong>Block C</strong>
                    <br />
                    <span className="kit-muted">2 beers, 1 shot</span>
                  </span>
                </div>
                <div className="kit-dark">
                  <EnergyBar value={0.47} label="14s" />
                </div>
              </div>
              <p className="kit-muted" style={{ margin: 'var(--s-2) 0 0' }}>
                Up next: Block E, then Block A
              </p>
            </Window>
            <div className="px-toasts">
              <Toast icon="shield" title="Block D played Reflect" />
              <Toast icon="skull" title="Block F owes an extra shot" />
            </div>
          </div>
        </div>
        <div style={{ height: 'var(--s-5)' }} />
        <Interstitial kicker="Act II" title="Lights out" />
      </section>

      <footer className="kit-foot">
        <Hearts value={5} />
      </footer>
    </div>
  );
}
