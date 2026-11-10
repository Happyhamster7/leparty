# LeParty — database schema and design

The full design, mirrored into the repo so it travels with the code.
Source doc: https://claude.ai/code/artifact/636e45b5-2a0e-4c29-995d-da27e55d54fb

The core (signup, intake, check-in, the draw, blocks) is built; its
tables are below. Games plug in as modules and keep their own state;
see `docs/rework-plan.md`.

## How it's organised

People persist across parties; everything else belongs to one event. A
guest's profile is written once and reused, while their block,
money, points, drinks and clips are all scoped to a single night.

Four decisions drive the model:

- **Blocks are the unit of play.** A block is a team. Money, points and
  drinks owed all sit on the block; drinks are sent to a block, and the
  block decides who drinks.
- **Theme is separate from games.** A theme is a code pack in
  `src/themes` (words, colours, later sprites and sounds), picked per
  event with `theme_key`. It works with no game running, and a game
  takes its words from it.
- **One source of truth for people and groups.** `participants` and
  `blocks` are the only record of who is here and which group they are
  in. A game refers to them by id and never keeps its own copy.
- **Append-only history.** Nothing overwrites a balance. A game's money
  and points are derived from a ledger, so you can always see why a
  number is what it is, and rewind if a ruling goes wrong.

Postgres via Supabase. All ids are `uuid` with `gen_random_uuid()`
defaults; `created_at` is `timestamptz default now()` on every table and
is omitted below.

---

## Persistent tables

Only one table survives between parties, and it holds almost nothing:
who someone is and how much they drink.

### people

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| display_name | text | What appears on the big screen |
| capacity_band | int | 1–5, current value. Host-visible only |
| profile_token | text | Unguessable; not what invite links carry |
| created_at | timestamptz | |

No auth, no passwords.

`capacity_band` lives here because it's a property of the person, but it
drifts over time. It is snapshotted onto `participants` at draw time so
past events stay accurate. Band 1 covers anyone not drinking that night,
so there is no separate flag.

Photo, potluck item and dietary notes all live on `participants`. A
returning guest sets up their profile once; from then on, opening an
event invite only asks what they're bringing and takes this party's
mugshot.

There is deliberately **no uniqueness constraint on `display_name`** —
see "Identity" below.

---

## Event tables

One party is one `events` row. Everything else hangs off it, which is
what makes the app reusable.

### events

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| name | text | Internal name: "October lockup" |
| theme_key | text | Selects the theme pack in `src/themes`: jail (Prison), plain. An unknown key renders as Prison |
| theme_title | text | How the theme is announced: "Cellblock H" |
| theme_blurb | text | The premise, shown on the invite |
| dress_code | text | What to wear |
| dress_code_notes | text | Optional detail, what to avoid |
| venue | text | Shown on the invite |
| held_on | date | |
| starts_at_label | text | Free text: "7:00 PM" |
| status | text | draft, open, checkin, running, archived |
| config | jsonb | Block count |
| display_token | text | Unguessable, unique. Opens the TV at `/tv/<token>`. Added migration `0010` |
| bar_token | text | Unguessable, unique. Opens the bar's tablet at `/bar/<token>`. Added migration `0010` |

The two tokens are how the TV and the bar get in without the host
passcode: each can see its own screen and nothing a host can do.

`config` is jsonb rather than columns because these are knobs tuned
between parties that shouldn't need a migration. Headcount is not one of
them: it is whoever checked in, and nothing caps it.

`theme_title`, `theme_blurb` and `dress_code` are the invite — what a
guest sees before filling anything in. `theme_key` stays separate
because it's the machine-readable one that selects the theme pack.

### participants

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| person_id | uuid | FK people |
| block_id | uuid | FK blocks, null until the draw |
| invite_token | text | Unguessable, unique. This is the guest's link |
| rsvp | text | pending, yes, no |
| potluck_item | text | Asked when they open the event invite |
| potluck_category | text | protein, carbs, salad, snacks, sweets, alcohol |
| dietary_notes | text | Allergies, what they won't eat |
| photo_path | text | Path in the private mugshots bucket |
| capacity_snapshot | int | Copied from people at draw time |
| inmate_number | int | Unique per event, assigned by trigger from 4001 |
| checked_in_at | timestamptz | Null means not arrived |
| signup_completed_at | timestamptz | Null means they haven't finished |
| left_early | bool | Flagged by you; nothing else changes |

Unique on `(event_id, person_id)`.

Inmate numbers come from a database trigger. Assigning them in
application code would race when two guests finish signup at once.

### blocks

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| name | text | "Block B" or a themed name |
| colour | text | Hex, used on the TV and the card |
| join_token | text | Unguessable, in the QR |
| join_code | text | Six characters, typed fallback |
| in_play | bool | False for a block the draw didn't need |
| charge | text | One line of flavour for the group. The theme names it: "The charge" in Prison, "Motto" in Plain |
| captain_participant_id | uuid | Unused: there are no captains |
| team_device_id | text | The device that last scanned the QR |
| team_device_claimed_at | timestamptz | When it took over |

Never `?team=1`. `join_token` is random, scoped to the event, and
rotatable — someone will try typing another block's id into the URL bar.

Join codes avoid O, 0, I and 1, because they get read aloud across a
room in bad light.

Balances are deliberately absent. Money, points and stars are derived
from the ledger.

**One team phone, latest scan wins.** Scanning the QR sets
`team_device_id` to that device and signs the previous one out. Because
any scan takes over, rotating `join_token` is how the host shuts out a
leaked card; the new code shows on the host console.

### Variable headcount

Headcount is unknown until check-in closes, so the draw divides whoever
turned up across a fixed number of blocks rather than filling blocks of
a fixed size. Forty people across eight blocks gives fives; forty-six
gives some sixes; thirty-two gives fours.

The block count is fixed because the big screen is the binding
constraint — eight rows read from across a room, fourteen don't. Block
size is what flexes, and nobody notices a block with an extra member.

Three consequences:

- **Blocks are created with the event, not with the draw.** All rows
  exist, with names, colours, tokens and codes, before anyone has RSVP'd.
  The draw only fills rosters, so cards can be printed in advance and
  `in_play` marks the ones the night actually used. A card with no roster
  printed on it is reusable between parties.
- **The balancer compares total capacity per block, not average.** A
  six-person block carries more drinking capacity than a five, which is
  correct — it also has more people to spread drinks across, so the two
  effects roughly cancel.
- **Two screens have to scale.** The check-in grid auto-fits columns and
  scrolls; the draw review shows blocks of different sizes side by side.

Only one device per block acts for the team at a time (latest scan
wins); everyone else watches the public screens.

---

## Game tables (retired)

Migrations `0006`–`0009` built a relational game: `acts`, `games`,
`rounds`, `round_players`, `game_results`, `drink_types`,
`drink_orders`, `items`, `item_uses`, `serves`, `penalties`, `bounties`,
`clips` and `ledger_entries`. Migration `0010` drops all of them, along
with `events.current_day`, `events.phase`, `events.ended_at`,
`events.winner_block_id` and `blocks.bonus_points_per_drink`.

Games are now modules. Each running game keeps its state in one JSON
document and logs every action; those tables (`game_sessions`,
`game_actions`) arrive with phase 4 of `docs/rework-plan.md` and will be
documented here then.

Two ideas from the retired tables carry forward. Balances are still
derived from an append-only ledger, never stored. And phones still
write intents that one server-side step turns into state.

---

## Implementation notes (phase 1, built)

**The invite link is a participant token, not a person token.**
`participants.invite_token` is one link per person per party.
`people.profile_token` stays on the table but isn't what the link
carries. Last party's link cannot open this party, and dropping one
guest doesn't touch their profile.

**RSVP was added** to the original design. Without it a headcount counts
invitations rather than attendance. The decline path is reversible right
up to the night.

**Row level security is on with no policies at all.** Every read and
write goes through server-side code using the service role key, so the
anon key reaches nothing and the browser never holds a database
credential. Simpler than writing policies for a token-based app with no
accounts, and fails safe if the anon key leaks into client code.

**Photos are paths, not URLs.** `participants.photo_path` points into a
private Storage bucket, served through short-lived signed URLs. The
browser crops to 3:4, downscales to 900px and encodes JPEG at 0.72
before upload, taking a 6 MB phone photo to roughly 120 KB — which is
what makes it survive party wifi.

Two operational notes: the camera needs HTTPS, so it works on localhost
and on a deployed host but not over plain HTTP on a LAN address; and
invite links are built from `NEXT_PUBLIC_SITE_URL`, so links copied from
the console are wrong until that is set.

### The draw, as built

The balancer is a pure function (`src/lib/draw.ts`), so it runs in the
browser while you adjust the proposed blocks and nothing reaches the
database until you confirm. Snake draft by capacity, then local-search
swaps between the heaviest and lightest blocks until the gap stops
narrowing. Measured across 32 to 61 guests into eight blocks, it settles
at a spread of 0 to 1 capacity points.

Band 1 (not drinking) sorts to the end of the snake, so those guests
spread one per block without any special case. This is why the separate
not-drinking flag was never needed.

Confirming the draw does four things in order: writes `block_id` on
every assigned participant, copies each person's current capacity band
into `participants.capacity_snapshot`, marks the blocks that received
people `in_play`, and moves the event to `running`.

Two deliberate asymmetries. A latecomer checked in after the draw joins
the in-play block holding the least total capacity, and the draw is
never re-run — a stable draw matters more than perfect balance once the
night has started. And clearing the draw is a separate, explicit action
rather than something a reshuffle does implicitly.

### Phase-1 routes

The block console at `/b/<join_token>` is what the printed QR codes
point at. In phase 1 it confirms the scan worked and shows the block its
roster; in phase 2 it becomes the team phone (see the design doc).
`/join` is the typed-code fallback, resolving a `join_code` against the
ten most recent non-archived events.

### Identity, and why names are never matched silently

The first build reused a `people` row whenever a new guest's display
name matched an existing one. That is wrong at this scale: two different
people called Sam Rafiq would collapse into one profile, and once two
rows shared a name the lookup returned neither and quietly created a
third.

Adding a guest now takes either an explicit `person_id` chosen from a
list of everyone on file — shown with their band and how many parties
they have attended — or a brand-new name. A typed name that already
exists is refused, with the choice to pick the existing person or
confirm a genuinely different one.

### Editing, and what is editable where

Name and capacity band live on `people`, so editing them carries to
every future party. Everything else on the guest page — RSVP, potluck,
dietary notes, photo — is `participants` and scoped to one night.

Block name, colour and charge are editable per block on the event
console. `blocks.charge` was a dead field until that was added.

Changing an event's block count reconciles rather than recreating.
Raising it inserts blocks; lowering it only deletes blocks that are
empty and not in play. A night in progress can never lose a block out
from under it.

`participants.invite_token` can be rotated, killing the old link while
keeping everything the guest has already filled in.

### Mugshots after signup

The camera is one component shared by guest signup and the host console,
so a photo can be taken at the door for anyone who skipped. The check-in
screen lists who is present without a mugshot rather than hiding it in
the grid. Deleting a photo removes the storage object as well as
clearing `photo_path`.

### What running it turned up

The app was run against real Postgres with the phase-1 migration
applied, and driven end to end in a browser. Three bugs surfaced that no
amount of reading would have found.

**Every second guest was silently lost.** Adding a guest reset the whole
form once the server round-trip landed. Type the next name before that
returns — which a host entering forty names does constantly — and the
reset wipes it, so that guest is submitted blank and dropped. Eighteen
names produced eleven guests, alternating. The fix clears only the field
that still holds exactly what was just submitted. Same pattern was in
the door-registration form.

**A first-timer was greeted as a returning guest.** "Returning" was
defined as having a name and capacity band on file, but the host sets
both when adding someone. So a first-time guest saw "welcome back" and
was skipped past the identity step, never getting to correct the host's
guess at their drinking band. Returning now means having attended a
previous party, counted from `participants`.

**A returning guest could finish signup while still marked `pending`.**
Only the identity step wrote `rsvp = 'yes'`, and returning guests
skipped it — so they completed signup without being counted as coming,
dropping them from the headcount and from the draw, which selects on
`rsvp = 'yes'`. The RSVP buttons now show until the answer is recorded,
and saving potluck sets it too.

---

## Open decisions

Tracked in `docs/rework-plan.md`.

## Deliberately left out

- No drink caps or per-player drink tracking. Drinks go to a team and
  the team decides who drinks; pacing is managed in the room. (Player
  *game* cooldowns are a different thing and are in.)
- No video conversion. Clips play as recorded on a Mac display; see the
  design doc.
- No highlight-reel stitching.
- No auth or accounts. Tokens all the way down.
- No rebalancing after late arrivals.
- No captains. `captain_participant_id` stays on `blocks` but is unused.
