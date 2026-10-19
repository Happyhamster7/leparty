# LeParty — database schema and design

The full design, mirrored into the repo so it travels with the code.
Source doc: https://claude.ai/code/artifact/636e45b5-2a0e-4c29-995d-da27e55d54fb

Phase 1 (signup and intake) is built; its tables are in
`supabase/migrations/0001_phase1.sql`. Phase 2 (the game) is designed
here but not built.

## How it's organised

People persist across parties; everything else belongs to one event. A
guest's profile is written once and reused, while their block,
sentence, drinks and clips are all scoped to a single night.

Four decisions drive the model:

- **Blocks are the unit of play.** Sentence, commissary and drinks owed
  all sit on the block. Inmates exist underneath as a roster for
  nominating who drinks.
- **Theme lives in data, not code.** Item names, prices, substitutes and
  wildcards are rows in catalogue tables scoped to an event. A new party
  is a new theme pack, not a rewrite.
- **Intents, not state writes.** Phones write rows to `purchases`. One
  resolver turns them into `drinks` and balance changes in a single
  defined step. This is what makes last-write-wins safe and gives Roll
  call something to reveal.
- **Append-only history.** Nothing overwrites a balance. Sentence and
  commissary are derived from a ledger, so you can always see why a
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
| config | jsonb | Starting sentence, commissary, block count |
| current_day | int | Which Day the night is on |
| phase | text | intake, yard, lights_out, roll_call, serving, wildcard, paused |

`phase` and `current_day` are what every phone and the big screen
subscribe to. Changing them is how you advance the night — the single
most important realtime channel in the app.

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
| captain_participant_id | uuid | Nullable, social only |

Never `?team=1`. `join_token` is random, scoped to the event, and
rotatable — someone will try typing another block's id into the URL bar.

Join codes avoid O, 0, I and 1, because they get read aloud across a
room in bad light.

Balances are deliberately absent. Sentence and commissary are derived
from the ledger.

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

Past roughly six per block, one shared phone stops working as a huddle,
so multiple devices per block becomes the normal case rather than the
fallback.

---

## Game tables (phase 2, not built)

The split that matters: `purchases` is what phones write, `drinks` and
`ledger_entries` are what the resolver writes.

### days

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| number | int | Day 1, Day 2 |
| game_id | uuid | FK games, what was played |
| lights_out_closes_at | timestamptz | Drives the countdown |
| resolved_at | timestamptz | When Roll call ran |

### games

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| name | text | |
| rules | text | Shown on the phones |
| grouping_mode | text | blocks, mixed, random, captains, losers |
| payout | jsonb | Years off and commissary by placing |
| played_at | timestamptz | Null until played |

`grouping_mode` is how events that cut across blocks are handled. Blocks
are the default.

### groupings

One row per temporary team when a game isn't played by blocks.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| game_id | uuid | FK games |
| label | text | "Group 3" |
| participant_ids | uuid[] | Who's in it |

### game_results

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| game_id | uuid | FK games |
| block_id | uuid | FK blocks |
| placing | int | 1 is best |
| note | text | For host overrides |

### purchases

What a phone writes during Lights out. Unresolved rows are intents, not
facts.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| day_id | uuid | FK days |
| actor_block_id | uuid | Who spent |
| item_key | text | FK items |
| target_block_id | uuid | Nullable for self-cast items |
| cost | int | Price at purchase time |
| submitted_by_device | text | For debugging, not enforcement |
| superseded | bool | Last write wins sets this on earlier rows |
| resolved_at | timestamptz | Null until Roll call |

Last-write-wins is implemented here: a new submission from any device on
the block flags previous rows `superseded` rather than deleting them, so
you can see what a block changed its mind about.

### drinks

One row per drink owed, written by the resolver.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| day_id | uuid | FK days |
| block_id | uuid | Who owes it |
| source_block_id | uuid | Who sent it, null for wildcards |
| origin | text | purchase, wildcard, game_loss, host |
| nominee_participant_id | uuid | Null until the block picks |
| outcome | text | shot, substitute, years |
| substitute_key | text | FK substitutes |
| years_paid | int | When outcome is years |
| settled_at | timestamptz | |

The block owes the drink; `nominee_participant_id` is filled in during
Serve your time. Counting that column per participant is what shows the
table who's been carrying the block.

### clips

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| drink_id | uuid | FK drinks |
| storage_path | text | Supabase Storage |
| upload_state | text | pending, uploaded, failed |
| duration_ms | int | |
| featured | bool | For the big screen feed |

`upload_state` is the important one. The Day advances when the drink is
settled, never when the file finishes uploading.

### ledger_entries

Append-only. Every change to a block's sentence or commissary is a row.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| block_id | uuid | FK blocks |
| day_id | uuid | Nullable |
| kind | text | sentence or commissary |
| delta | int | Signed |
| reason | text | game_payout, purchase, bribe, wildcard, host_adjust |
| ref_id | uuid | The purchase, drink or wildcard that caused it |

Current balances are `sum(delta)` grouped by block and kind. Slower than
a counter column, but a wrong ruling becomes one compensating row rather
than a guess at what the number should have been.

---

## Catalogue tables (phase 2, not built)

Where reusability actually comes from. Swap these rows and the jail
party becomes a heist or a cult without touching application code.

### items

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| key | text | shank, bribe, snitch, riot |
| name | text | Display name |
| description | text | |
| base_cost | int | Commissary |
| effect | text | send, shield, reflect, multiply, split, bounty, reveal, cancel_all |
| effect_value | int | Multiplier, count, whatever the effect needs |
| targets | text | block, self, none |
| stock_per_block | int | Null for unlimited |
| available_from_day | int | Unlocks in later acts |

`effect` is a small closed set the resolver understands. Adding an item
is a row; adding a new kind of effect is code.

### substitutes

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| key | text | vinegar, pickle_juice, hot_sauce |
| name | text | "Toilet wine" |
| years_cost | int | Usually 0 — the point is it's free |
| in_mystery_pool | bool | For the roulette option |

The bribe path — paying in years instead — is a config value on the
event rather than a row here, since it's one number.

### wildcards

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | FK events |
| key | text | lockdown, shakedown, riot, parole |
| name | text | |
| description | text | Shown on the big screen |
| effect | jsonb | What it does when fired |
| fired_on_day | int | Null until used |

### theme_strings

| Column | Type | Notes |
| --- | --- | --- |
| event_id | uuid | FK events |
| key | text | points, currency, team, round, host |
| value | text | sentence, commissary, block, day, warden |

Every label in the UI reads from here. The cheapest possible way to make
the next party feel like a different game.

---

## Lights out resolution order

When the timer closes, one server-side function turns `purchases` into
`drinks` and `ledger_entries`. Order matters, because shields, reflects
and multipliers give different answers depending on when they apply.

1. **Take the final intents.** All `purchases` for the Day where
   `superseded` is false. Anything submitted after
   `lights_out_closes_at` is rejected.
2. **Charge the costs.** One commissary `ledger_entries` row per
   purchase. A block that overspent across devices has its most recent
   purchases dropped until it's within budget — last write wins means
   the latest intent survives, not the cheapest.
3. **Apply cancels.** Any `cancel_all` effect voids every send in the
   Day. Costs stay charged.
4. **Build the send list.** One pending drink per `send` effect.
5. **Apply reflects.** A reflect swaps source and target of the first
   send aimed at its block. Resolve in purchase order so two reflects
   can't ping-pong forever.
6. **Apply shields.** A shield absorbs the first send still aimed at its
   block after reflects. Shield before multiply, so blocking a doubled
   drink blocks both.
7. **Apply multipliers.** A `multiply` effect turns each remaining send
   at its target into `effect_value` drinks.
8. **Apply splits.** A split reassigns some incoming drinks to a
   nominated other block.
9. **Write the drinks.** Insert `drinks` rows with `origin = 'purchase'`.
10. **Settle bounties.** Resolve against the Day's `game_results` and pay
    out in commissary.
11. **Stamp the Day.** Set `resolved_at`, mark purchases resolved, move
    `phase` to `roll_call`.

The resolver must be idempotent, keyed on `day_id`. You will press the
button twice at some point in the night.

Roll call replays steps 4 to 8 as an animation on the big screen, block
by block. The reveal is literally the resolution log played back slowly,
so the drama comes for free once this function is right.

---

## Queries the schema has to be good at

**Leaderboard.** Sentence per block, ascending. A sum over
`ledger_entries` filtered to `kind = 'sentence'`, grouped by block. Runs
on every big-screen refresh — worth a materialised view if the TV ever
feels sluggish.

**Drinks outstanding.** `drinks` where `settled_at is null`, grouped by
block. Drives the "who's still pending" display and gates the Day
closing.

**Who's carrying the block.** Count of `drinks` grouped by
`nominee_participant_id` within a block. Shown on the team phone as
information, not a lockout.

**Commissary balance.** Same shape as the leaderboard with
`kind = 'commissary'`. Must be correct at the instant Lights out closes,
which is why the resolver recomputes rather than trusting a cache.

Indexes worth having from the start: `ledger_entries(block_id, kind)`,
`drinks(day_id, block_id)`, `drinks(nominee_participant_id)`,
`purchases(day_id) where superseded = false`, `blocks(join_token)`.

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
roster, sentence and commissary; the Day loop lands there in phase 2.
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

- **Win condition.** Race to zero sentence, or lowest sentence after a
  fixed number of Days. Changes whether blocks hoard commissary or spend
  it, and it's the one open question that affects the schema — a race
  needs a `released_at` on blocks and a rule for what released blocks
  can still do. Nothing else can be balanced until this is settled.
- **Secret objectives.** Block-level rather than individual, since the
  phone is shared. Would add an `objectives` table.
- **Reveal the sender.** Whether sends are anonymous by default, with
  revealing sold as an item. Affects what Roll call shows.
- **Captain enforcement.** Currently social only.
  `captain_participant_id` exists but nothing checks it.
- **Rosters on block cards.** Printed rosters force printing on the
  night; omitting them makes cards reusable between parties.

## Deliberately left out

- No drink caps, rotation lockouts or confirmation prompts. Pacing is
  managed in the room. The substitute menu is the pressure valve, and
  it's a game mechanic, not a safety feature.
- No highlight-reel stitching. Server-side ffmpeg is real work; compile
  it the next day on a laptop.
- No auth or accounts. Tokens all the way down.
- No rebalancing after late arrivals.
- No merge-blocks handling when people leave early. The block just has
  fewer people to nominate.
