# LeParty — database schema and design

The full design, mirrored into the repo so it travels with the code.
Source doc: https://claude.ai/code/artifact/636e45b5-2a0e-4c29-995d-da27e55d54fb

Phase 1 (signup and intake) is built; its tables are in
`supabase/migrations/0001_phase1.sql`. Phase 2 (the game) is not built.
Its behaviour is specified in `docs/halloween-game-design.md`, the
source of truth; this file holds its tables.

## How it's organised

People persist across parties; everything else belongs to one event. A
guest's profile is written once and reused, while their block,
money, points, drinks and clips are all scoped to a single night.

Four decisions drive the model:

- **Blocks are the unit of play.** A block is a team. Money, points and
  drinks owed all sit on the block; drinks are sent to a block, and the
  block decides who drinks.
- **Theme lives in data, not code.** Games, drink types and items are
  rows in catalogue tables scoped to an event. A new party is a new
  theme pack, not a rewrite.
- **Intents, not state writes.** Phones write `drink_orders` and
  `item_uses`. One server-side step turns them into the drinks queue
  when the host starts the drinks phase.
- **Append-only history.** Nothing overwrites a balance. Money, points
  and stars are derived from a ledger, so you can always see why a
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
| theme_key | text | Selects the theme pack: jail, heist, cult |
| theme_title | text | How the theme is announced: "Cellblock H" |
| theme_blurb | text | The premise, shown on the invite |
| dress_code | text | What to wear |
| dress_code_notes | text | Optional detail, what to avoid |
| venue | text | Shown on the invite |
| held_on | date | |
| starts_at_label | text | Free text: "7:00 PM" |
| status | text | draft, open, checkin, running, archived |
| config | jsonb | Block count; phase 2 adds starting money |
| current_day | int | Phase 2: the current round number |
| phase | text | intake, then the current round's phase: game, results, spending, drinks; paused |

`phase` and `current_day` are what every phone and the big screen
poll. Changing them is how you advance the night.

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
| charge | text | The block's ridiculous crime |
| captain_participant_id | uuid | Unused: there are no captains |
| team_device_id | text | Phase 2: the device that last scanned the QR |
| team_device_claimed_at | timestamptz | Phase 2: when it took over |

Never `?team=1`. `join_token` is random, scoped to the event, and
rotatable — someone will try typing another block's id into the URL bar.

Join codes avoid O, 0, I and 1, because they get read aloud across a
room in bad light.

Balances are deliberately absent. Money, points and stars are derived
from the ledger.

**One team phone, latest scan wins** (phase 2). Scanning the QR sets
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

## Game tables (phase 2, not built)

The behaviour these tables serve is in `docs/halloween-game-design.md`,
which is the source of truth for Phase 2. It replaced an earlier design
(Days, Yard time, Lights out, Roll call, sentence and commissary,
substitutes, wildcards); those tables are gone from this doc.

A team is a `blocks` row. The split that matters: phones write
`drink_orders` and `item_uses`; one server-side step turns them into a
drinks queue (`serves`) when the host starts the drinks phase, and
`ledger_entries` are written as things actually happen.

### acts

Rounds are grouped into Acts.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| number | int | Act 1, Act 2 |
| name | text | Optional |

### games

The catalogue for one event. Placeholder list until rules are settled.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| name | text | |
| rules | text | Shown on the team phones |
| format | text | per_team, team_relay, all_teams, head_to_head |
| players_needed | int | Per team. Null for group games |
| is_group | bool | Whole team plays; no prompt, no cooldown |
| result_type | text | placings, score, winner, per_player |

### rounds

One game played. The heart of the state machine.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| act_id | uuid | FK acts |
| number | int | Across the whole night |
| game_id | uuid | FK games |
| phase | text | game, results, spending, drinks, done |
| pick_deadline | timestamptz | End of the 1-minute player pick |
| picks_revealed_at | timestamptz | All picks shown at once |
| shop_closed_at | timestamptz | Orders after this are rejected |
| drinks_started_at | timestamptz | When the queue was built |
| completed_at | timestamptz | Set by auto-advance |

`events.phase` mirrors the current round's phase so every view can poll
one row.

### round_players

Who played, for the reveal and for cooldowns.

| Column | Type | Notes |
| --- | --- | --- |
| round_id | uuid | FK rounds |
| block_id | uuid | FK blocks |
| participant_id | uuid | FK participants |
| picked_by | text | team or auto |

Primary key `(round_id, participant_id)`. A participant is on cooldown
if they appear in either of the two most recent non-group rounds.
Auto-pick takes eligible players with the fewest rows here.

### game_results

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| round_id | uuid | FK rounds |
| block_id | uuid | FK blocks |
| placing | int | 1 is best |
| score | int | For score-type games |
| note | text | Host overrides |

### drink_types

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| name | text | Vodka shot, soju |
| points | int | Points to the sender on serve |
| cost | int | Money to send one |

### drink_orders

What a team phone writes during spending. Admin drinks and penalty
shots land here too, so the queue has one source.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| round_id | uuid | FK rounds |
| sender_block_id | uuid | Null for admin and penalty drinks |
| origin | text | team, admin, penalty |
| target_block_id | uuid | Always a team, never a player |
| drink_type_id | uuid | FK drink_types |
| qty | int | |
| status | text | pending, cancelled, reflected, served |
| scores_for_block_id | uuid | Set by Reflect to the reflecting team |
| penalty_id | uuid | FK penalties when origin is penalty |

Drinks go to a team; the team decides who drinks. Nothing here names a
player and nothing caps a player.

### items and item_uses

Placeholders. The four draft items are Eye Spy, Reflect, Bus ticket
and Lock-up.

| items column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| key | text | eye_spy, reflect, bus_ticket, lock_up |
| name | text | |
| description | text | |
| price | int | Money |
| buyer_rule | text | any, bottom_4 |
| limit_per_round | int | Null for unlimited |
| limit_per_night | int | Null for unlimited |

| item_uses column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| round_id | uuid | FK rounds |
| block_id | uuid | Buyer |
| item_id | uuid | FK items |
| target_block_id | uuid | Nullable |
| target_participant_id | uuid | Bus ticket and Lock-up only |
| result | jsonb | E.g. what Eye Spy showed |

### serves

The drinks queue, one row per receiving team per round, built when the
drinks phase starts.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| round_id | uuid | FK rounds |
| block_id | uuid | Receiving team |
| drink_count | int | Total owed this round |
| queue_position | int | Fewest first, ties random |
| served_at | timestamptz | Bartender pressed Next |
| timer_ends_at | timestamptz | served_at plus 30 seconds |
| finished_at | timestamptz | Timer ended or host marked done |
| finished_by | text | timer or host |
| missed_time | bool | Didn't finish in 30 seconds |

A team with no drinks gets no row and shows "Safe this round". Auto-
advance fires when every row in the round has `finished_at`.

### penalties

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| block_id | uuid | FK blocks |
| from_round_id | uuid | Where it was earned |
| applies_round_id | uuid | Null until the next round's queue is built |
| kind | text | extra_shot (others to be decided) |
| reason | text | missed_time, host, failed_bounty |
| qty | int | Null means the default (1). Added migration `0008` for failed bounties, which owe 3 |
| drink_type_id | uuid | FK drink_types. Null means the default (cheapest). Added migration `0008` for failed bounties, which owe Spirit specifically |

Missing the 30 seconds, or missing a bounty's target, writes one
`extra_shot` row; the next queue build turns it into a `drink_orders`
row with `origin = 'penalty'`, using `qty`/`drink_type_id` if set, or
the 1-shot-of-the-cheapest-drink default otherwise.

### bounties

Added migration `0008`. One row per Open/Winner's Bounty purchase,
tracking its multi-round window — see
`docs/halloween-game-design.md` section 7 for the simplified rule
actually built (one fixed target, flat money reward) in place of the
design's undecided per-Act rotation and permanent-bonus reward.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| item_use_id | uuid | FK item_uses — the purchase this tracks |
| block_id | uuid | FK blocks — the buyer |
| event_id | uuid | FK events |
| start_round_number | int | The round it was bought in |
| deadline_round_number | int | start + 2 (a 3-round window). Stored as numbers, not round ids — future rounds don't exist yet at purchase time |
| target_qty | int | 5 |
| target_drink_type_id | uuid | FK drink_types. Null means any type — the only target built |
| reward_money | int | 100 (Open Bounty) or 150 (Winner's) |
| resolved_at | timestamptz | Null until the deadline round's shop closes |
| hit | boolean | Null until resolved |

Resolved from `closeShop` once the deadline round is reached: sums
`drink_orders.qty` sent by the block across the whole window. Hit
pays `reward_money` as a `bounty`-reason ledger entry; miss writes a
`penalties` row for 3 shots of Spirit.

### clips

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| serve_id | uuid | FK serves |
| storage_path | text | Supabase Storage, uploaded directly from the phone |
| upload_state | text | pending, uploaded, failed |
| status | text | shown, removed |
| uploaded_at | timestamptz | |

The queue never waits on `upload_state`. Clips are kept after the party.

### ledger_entries

Append-only. Every change to a team's money, points or stars is a row.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| block_id | uuid | FK blocks |
| round_id | uuid | Nullable |
| kind | text | money, points, stars |
| delta | int | Signed |
| reason | text | placing, bonus, star, item, drink_cost, drink_served, host_adjust, bounty |
| ref_id | uuid | The order, result or item use that caused it |

Balances are `sum(delta)` grouped by block and kind. A wrong ruling is
one compensating row.

---

## Starting the drinks phase

One server-side function, idempotent on `round_id`, run when the host
starts drinks:

1. **Take the orders.** `drink_orders` for the round with status
   `pending`. Money for team orders was charged when they were placed.
2. **Apply Reflect.** Drinks aimed at the reflecting team go back to
   their senders, with `scores_for_block_id` set to the reflecting team.
3. **Add penalties.** Each unapplied `extra_shot` for a team becomes a
   `penalty` order against it.
4. **Count per team.** Sum `qty` per target team.
5. **Build the queue.** Insert `serves` ordered by drink count
   ascending, random among ties.

On each Next press: set `served_at` and `timer_ends_at`, write one
`points` ledger row per scoring team, and show the filming prompt on
that team's phone. When the queue is finished, award the round's star.

---

## Queries the schema has to be good at

**Leaderboard.** Points per team: a sum over `ledger_entries` where
`kind = 'points'`. Polled by every screen.

**Money balance.** Same shape with `kind = 'money'`. Checked on every
order and purchase.

**Drinks queue.** `serves` for the current round ordered by
`queue_position`, with totals per drink type from `drink_orders`.

**Eye Spy.** `drink_orders` grouped by round, sender and target, for
every round so far, filtered to the buying team as target.

**Cooldowns.** `round_players` for the last two non-group rounds.

Indexes worth having from the start: `ledger_entries(block_id, kind)`,
`drink_orders(round_id, target_block_id)`, `serves(round_id)`,
`round_players(participant_id)`, `blocks(join_token)`.

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

Phase 2 open questions are tracked in `docs/halloween-game-design.md`
(section 11). The ones that touch the schema:

- **Drink types, points and costs.** Rows in `drink_types`; no schema
  change, but nothing can be balanced without them.
- **Other penalty kinds.** `penalties.kind` only has `extra_shot` so far.
- **Holding cell and "on the bus".** Deferred. They will need a player
  status (and a reason) on `participants` when they come back.
- **Acts.** How many, and whether the night ends on a round or a time.
- **Rosters on block cards.** Printed rosters force printing on the
  night; omitting them makes cards reusable between parties.

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
