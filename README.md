# LeParty — phase 1 (signup)

> `CLAUDE.md` holds the working context and the decisions behind the
> code. `docs/schema.md` is the full schema and design reference,
> including the phase-2 tables.

Guest signup and host console for themed parties. Phase 1 covers everything
before the night: profiles, RSVP, potluck, mugshots, and the guest list.

The game itself — days, games, the drinks economy, the draw — is phase 2 and
isn't here. The schema is laid out so phase 2 adds tables rather than
changing these.

## What's in it

**Self-service signup** — the one link the host hands out for everything:

| Step | Path | What it does |
| --- | --- | --- |
| Profile | `/signup` | Name and capacity band, written to `people`. First visit creates it (and sets a `leparty_profile` cookie, this browser's whole identity); later visits edit it. |
| Parties | `/parties` | Every `open` party. "I'm going" creates (or reuses) a `participants` row with `rsvp: yes` and drops the guest straight into potluck. |

**Party flow** (`/i/<invite-token>`), one screen at a time — reached via `/parties`, or directly if the host shares a specific guest's link:

| Step | Path | What it does |
| --- | --- | --- |
| Invite | `/i/<token>` | Theme, date, dress code. RSVP yes or no. |
| Identity | `/i/<token>/identity` | Name and capacity band. Already set by `/signup` for anyone who joined that way; this step is the fallback for anyone who isn't. |
| Potluck | `/i/<token>/potluck` | Shows the running count by category (protein, carbs, snacks, sweets, alcohol) before they choose, then takes their item and dietary notes. |
| Mugshot | `/i/<token>/mugshot` | In-browser camera, downscaled client-side, or a file picker. Required — no skipping. |
| Booked | `/i/<token>/booked` | Inmate number, what to bring, what happens next. |
| Declined | `/i/<token>/declined` | The can't-make-it path, reversible until the night. |

**Host console** (`/host`, gated by a passcode):

| Screen | Path | What it does |
| --- | --- | --- |
| Parties | `/host` | Every party, newest first. |
| New party | `/host/new` | Theme, dress code, date, block count. Creates the blocks too. |
| Event | `/host/<id>` | Guest list, RSVPs, potluck tally, aggregated allergies, block names/colours/charges, copy invite links one at a time or all at once. |
| Edit party | `/host/<id>/edit` | Same form as create, plus archive and reopen. |
| Guest | `/host/<id>/guest/<pid>` | Fix a name or band, set RSVP or potluck by hand, take or delete their mugshot, rotate their invite link, remove them. |
| Check-in | `/host/<id>/checkin` | Tap-your-face grid for the door, search, door registration, mugshots at the door, close check-in. |
| The draw | `/host/<id>/draw` | Balanced blocks proposed, adjustable, nothing written until you confirm. |
| Block cards | `/host/<id>/cards` | Printable cards with real QR codes and join codes. |

**On the night** (`/join` and `/b/<block-token>`): a block scans its card or
types its code and lands on its own page. In phase 1 that page confirms the
scan and shows the block its roster, sentence and commissary; the game
arrives there in phase 2.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). The free tier
   is plenty for one party.
2. Open the SQL editor and run `supabase/migrations/0001_phase1.sql`. It
   creates the tables, the inmate-number trigger, the `mugshots` storage
   bucket, and turns on RLS with no policies.
3. From **Project Settings → API**, copy the project URL and the
   **service_role** key.

RLS with no policies denies everything to the anon key. All data access in
this app goes through server-side code using the service role key, so the
browser never holds a database credential. Keep it that way: never prefix
`SUPABASE_SERVICE_ROLE_KEY` with `NEXT_PUBLIC_`.

### 2. Run it locally

```bash
cp .env.example .env.local   # then fill it in
npm install
npm run dev
```

Open <http://localhost:3000/host>, sign in with your `HOST_PASSCODE`, create
a party, add yourself as a guest and click your own invite link to walk the
flow.

### 3. Deploy

Push to GitHub, import the repo at [vercel.com](https://vercel.com), and set
the four environment variables from `.env.example` in the Vercel project.
Set `NEXT_PUBLIC_SITE_URL` to the deployed URL — invite links are built from
it, so links copied from the console are wrong until it's set.

The camera needs HTTPS, which Vercel gives you. It also works on
`localhost`, but not over plain HTTP on a LAN address.

## Environment variables

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only. |
| `HOST_PASSCODE` | Gates `/host`. Anything you like. |
| `NEXT_PUBLIC_SITE_URL` | No trailing slash. Used to build invite links. |

## How a few things work

**No accounts.** A guest's link carries an unguessable
`participants.invite_token`. That's the whole authentication model, which is
right for a private party and wrong for anything else. The host console is a
passcode in an httpOnly cookie.

**Returning guests.** `people` holds only name, capacity band and a token,
and persists between parties. `participants` holds everything party-specific.
Adding a guest offers a list of everyone on file who isn't already on this
party, with their band and how many parties they've been to; picking one
reuses that person, so their invite skips the identity step and opens at the
potluck question.

Names are never matched silently. Two different people called Sam Rafiq must
not collapse into one profile, so typing a name that already exists is
refused with a prompt to either pick the existing person or tick "different
person" and give them something distinguishing. This matters more than it
sounds at forty-plus guests across repeat parties.

**Photos.** The browser crops to 3:4, downscales to 900px and encodes JPEG at
0.72 before upload — a 6MB phone photo lands around 120KB, which matters on
party wifi. Files go to a private Supabase bucket and are served through
30-minute signed URLs. If `getUserMedia` is blocked, the file picker with
`capture` opens the phone's own camera app instead.

**Inmate numbers** are assigned per event by a database trigger, starting at
4001.

**The draw** is a snake draft by capacity, then local-search swaps between
the heaviest and lightest blocks until the gap stops narrowing. It's a pure
function in `src/lib/draw.ts`, so it runs in the browser while you adjust and
nothing touches the database until you press confirm. Blocks are compared on
*total* capacity, not average: an uneven block carries more drinking capacity,
which is correct, and it also has more people to spread drinks across, so the
two effects roughly cancel. Across 32–61 guests into 8 blocks it lands at a
spread of 0–1 capacity points.

Confirming the draw writes `block_id` on everyone, snapshots each person's
capacity band onto `participants.capacity_snapshot`, marks the blocks that got
people `in_play`, and moves the event to `running`. Blocks the draw didn't need
stay out of play, so their printed cards simply go unused.

**Latecomers after the draw** drop into the in-play block with the least total
capacity. The draw is never re-run — a stable draw matters more than perfect
balance once the night has started.

**Block cards** can be printed either way. With rosters shown they have to be
printed on the night, after the draw; hide the rosters and they can be printed
in advance and reused at the next party, since blocks keep their codes. Join
codes avoid O, 0, I and 1, because they get read aloud in bad light.

**Blocks exist before the draw.** Creating a party creates its blocks with
names, colours, tokens and join codes, all marked `in_play: false`. This is
what lets you print the cards in advance: the draw only fills rosters, and
unused blocks stay out of play.

## Phase 2, when you get there

Tables to add: `days`, `games`, `groupings`, `game_results`, `purchases`,
`drinks`, `clips`, `ledger_entries`, `items`, `substitutes`, `wildcards`,
`theme_strings`.

Two things worth keeping from the design work:

- Phones write **intents** to `purchases`; one server-side resolver turns
  them into `drinks` and `ledger_entries` in a fixed eleven-step order. That
  single resolution step is what makes last-write-wins safe and gives Roll
  Call something to reveal.
- Balances are never stored. Sentence and commissary are `sum(delta)` over
  an append-only `ledger_entries`, so a wrong ruling is one compensating row
  rather than a guess at what the number should have been.

Still undecided: the win condition (race to zero versus lowest after a fixed
number of days), item pricing, and whether sends are anonymous.
