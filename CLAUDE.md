# LeParty — working context

Read this before changing anything. It carries the decisions behind the
code, which the code itself doesn't explain.

An app for running themed parties with games, teams, and a drinks
economy. Phase 1 (signup and intake) is built. Phase 2 (the game) is
built end to end — Game, Results, Spending, Drinks, night-end — with
a handful of items deliberately cut, not deferred. See "Phase 2 — the
game" below for exactly what, and "Phase 2 decisions" for everything
decided along the way that the design doc doesn't say.

**Phase 2 source of truth: `docs/halloween-game-design.md`.** It
replaced an earlier design (Days, sentence and commissary, substitutes,
wildcards) — if you find traces of that anywhere, the design doc wins.
Tables for both phases: `docs/schema.md`. Keep both updated when the
schema or behaviour changes — they're the references this file
summarises.

**Visual direction: pixel art (Stardew Valley-inspired), permanent,**
bound to the jail theme. Reference: `docs/pixel-ui-reference.md`
(palette, type, sprite-sheet format, contrast rules). Was deferred
until Phase 2 was functionally complete — it now is, so this is
unblocked whenever someone wants to pick it up. Nothing's been wired
from it yet.

## Stack

Next.js 14 App Router (TypeScript), Supabase (Postgres + Storage),
plain CSS in `src/app/globals.css`. No Tailwind, no component library,
no test framework yet.

`npm run dev` · `npm run build` · migrations in `supabase/migrations/`,
numbered `0001`–`0009`, run in order against the Supabase SQL editor.
Each new one must actually be run before its feature works — nothing
auto-applies them. If `npm run build` hangs right after the
`Next.js 14.2.35` banner with no further output, it's not your code:
kill stray `node.exe` processes (Windows doesn't always clean these up
from a killed `next dev`/`next build`) and retry.

Env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`HOST_PASSCODE`, `NEXT_PUBLIC_SITE_URL`.

## Decisions that are load-bearing

**All data access is server-side with the service role key.** RLS is on
with *zero policies*, which denies the anon key everything. Never add a
browser-side Supabase client, and never prefix the service key with
`NEXT_PUBLIC_`. This is simpler than writing policies for an app with
no accounts, and fails safe.

**No auth, two cookies.** A guest's whole identity is their browser's
`leparty_profile` cookie, which carries `people.profile_token` — set at
`/signup`, the one link the host hands out for everything. A specific
party invite carries `participants.invite_token` the same way. The
host console is a passcode in an httpOnly cookie. Right for a private
party, wrong for anything else.

**`people` persists across parties; everything else is per-event.**
`people` holds only display name, capacity band and a token. Name and
capacity edits carry to future parties; RSVP, potluck, dietary notes
and photos are `participants` and belong to one night.

**Guests add themselves; the host only removes.** `/signup` creates or
edits a profile, `/parties` lists every `status = 'open'` event and
lets the guest join one (`joinParty` in `src/app/parties/actions.ts`).
There is no host-side add-guest form anymore — the host's only lever
over the roster is `removeGuest`.

**Names are now the matching key — reversed from the old decision.**
Phase 1 originally kept `people.display_name` deliberately non-unique,
because the host-driven add flow needed to tell two different same-named
people apart. Self-service signup inverted that: without an account, a
typed name is the only way to recognize a returning guest, so `/signup`
looks up an existing person by name (case/whitespace-insensitive) and
logs the guest into that profile instead of creating a second one.
`people_display_name_unique_idx` (migration `0004`) enforces this at
the DB level; `saveProfile` in `src/app/signup/actions.ts` returns a
friendly error instead of a raw constraint violation. Accepted
tradeoff, stated by the user: two unrelated real people sharing an
identical name will collide, and there's no "different person, same
name" escape hatch anymore.

**Block count is fixed, block size floats.** The big screen is the
constraint — eight rows read from across a room, fourteen don't.
Headcount is whoever checked in; nothing caps it.

**Blocks are created with the event, not with the draw.** All blocks
exist with names, colours, tokens and join codes before anyone RSVPs,
so cards can be printed in advance. The draw only fills rosters and
sets `in_play`.

**Balances are never stored** (phase 2). Money, points and stars are
`sum(delta)` over an append-only ledger, so a wrong ruling is one
compensating row rather than a guess.

**No drink caps or per-player drink tracking.** Drinks are sent to a
team, never a named player, and the team decides who drinks. Pacing is
managed in the room, not by the app; non-drinkers swap to water at the
bar. Don't add drink caps or confirmation prompts. This rule is about
drinks only: player *game* cooldowns (sat out for two games after
playing) are part of the design.

## Three bugs that were found by running it — don't reintroduce

**Form reset races.** Never call `form.reset()` in a `useEffect` after a
server action returns. The host types the next name while the previous
add is in flight, the reset wipes it, and that guest is silently lost —
this dropped 7 of 18 guests. Actions return `added: string`; forms
clear a field only when it still holds exactly that value. See
`DoorRegister`.

**"Returning guest" means attended a previous party**, counted from
`participants` — not "has a profile" (`hasAttendedBefore` in
`src/lib/invite.ts`). This no longer drives step routing — guests set
their own name and band at `/signup` before any party exists, so
`nextStep` doesn't need to special-case first-timers the way it did
when the host pre-filled a guess. `hasAttendedBefore` is kept only for
the "welcome back" notice text.

**RSVP must be recorded before signup can complete.** The draw selects
on `rsvp = 'yes'`, so a guest who finishes signup while still `pending`
is invisible to the headcount *and* the draw. The invite page shows the
yes/no buttons until the answer is recorded, and `savePotluck` sets it
too.

## Conventions

- Server components by default; client components only where there's
  state or a camera. Co-locate them next to the page that uses them.
- Server actions live in `actions.ts` / `nightActions.ts` next to their
  routes. Form actions take `(boundArgs, prevState, formData)` and
  return `HostState` / `FormState` so `useFormState` can show errors.
- Validate in the action and return `{ error }`; don't trust the client.
- `src/lib/draw.ts` is pure and runs in the browser during the draw —
  keep it dependency-free. `proposeDraw` shuffles people before sorting
  by capacity, so same-capacity peers land differently on each call —
  deliberate, so the Reshuffle button actually does something. The
  balance guarantee comes from capacity sums, not from who specifically
  fills a slot, so this doesn't weaken it.
- Copy is plain and direct, sentence case, no exclamation marks. The
  jail theme lives in content, not in the component names.
- Design tokens are CSS custom properties in `globals.css`. Paper
  `--paper`, ink `--ink`, one rust accent `--rust`. Oswald for display,
  IBM Plex Mono for anything that reads as data, IBM Plex Sans for body.

## State of play

Built: self-service signup (`/signup`, `/parties`), party signup
(invite, identity, mugshot, potluck, booked, declined), host console
(parties, create, edit, event, guest edit, check-in, draw, cards),
`/join` and `/b/<token>`.

Verified by driving it in a real browser against Postgres: migration
applies, inmate-number trigger works, photos downscale and upload,
balancer hits spread 0–1 across realistic headcounts, QR codes scan.

Not done in phase 1: clone a party, shareable potluck page, CSV export,
reminders (needs an email/SMS provider).

## Phase 2 — the game, built end to end

Full spec: `docs/halloween-game-design.md`. The round flow as it
actually runs: **Game** (teams pick players on the team phone within a
minute; picks revealed at once) → **Results** (host enters placings;
prize money paid) → **Spending** (teams secretly buy items and send
drinks to other teams, which costs money) → **Drinks** (queue built
fewest drinks first, ties random; each team drinks at the bar with 30
seconds on the clock, filmed on the team phone; missing the 30 seconds
is an extra shot next round; auto-advances when every team is done) →
auto-complete, then either the next round or the host ends the night.

Routes, all under `/host/<eventId>/game/` unless noted:

| Route | What it's for |
| --- | --- |
| (index) | Round control: start a round, advance to results, close the shop, start drinks, link to end the night |
| `bar` | The cafeteria iPad: Next, Back (undo the last Next), Mark done, the "Show senders" toggle |
| `screen` | The public display — polls itself every 5s, nobody's standing at it to reload |
| `admin` | Manual balance adjustment, assign a drink straight into the current round's queue, reissue a leaked QR code |
| `finish` | Final standings, confirm the winner |
| `/b/<token>` | The team phone: picks, spending (orders + shop), drinks status, film/upload |

Cut, not deferred: Bus ticket, Lock-up, the holding cell, "on the bus".
Not built: stars (nothing awards that ledger kind), the public
sender-shown-by-default policy for teams generally (the bar's own
toggle is separate and is built), patching an already-built drinks
queue (admin assignment only works before `drinks_started_at` is set).

## Phase 2 decisions

The design doc leaves plenty open on purpose — these are the calls
actually made building it, which the doc and the code don't say on
their own.

**Phones write intents, not state.** Team phones write `drink_orders`
and `item_uses`. One server-side function, idempotent on `round_id`
(`buildDrinksQueue`, `src/lib/drinks.ts`), builds the drinks queue when
the host starts drinks: resolve Reflect → fold in carried-over
penalties → count per team → build `serves`.

**One team phone, latest scan wins.** Scanning a block's QR makes that
device the team phone and signs the previous one out. The host
reissues `join_token`/`join_code` from `/host/<eventId>/game/admin` if
a card leaks — that also clears the block's claimed device.
`blocks.captain_participant_id` is unused — there are no captains.

**Live updates are polling, not a browser database client.** The
public screen polls itself every 5s (`AutoRefresh.tsx`) — a deliberate
reduction from the doc's "about once a second," since nobody's
operating that view and 5s is plenty for a TV. Every other view is
driven by someone acting on it (a host pressing a button, a team
submitting a form), which naturally refetches, so nothing else polls.
Timers store a start/end time on the server; no live countdown is
rendered client-side anywhere yet.

**Videos are not converted, and never touch a Vercel function.** The
team phone requests a signed upload URL from the server, then PUTs the
file straight to Supabase Storage itself with a raw `fetch`/XHR — no
Supabase client in the browser, matching the service-role-only rule.
Clips play as recorded (HEVC), so the display laptop must be a Mac.

**Bundle pricing and points are recomputed at serve time, never
stored.** `drink_orders` has no cost/points column. `priceOrder()`
(`src/lib/drinkPricing.ts`) runs both when an order is charged and
again in `markServed` when points are paid out, from the same `qty`
each time — so `qty` is the only thing that has to stay true.

**Reflect resolves at queue-build, not at purchase.** Buying it just
records the purchase and charges for it. `buildDrinksQueue` is what
actually flips a targeted order's `target_block_id` back to the
sender and sets `scores_for_block_id` to the reflector.

**Bounties simplify the design doc's draft, on purpose.** One fixed
target — 5 of any drink type, counted when sent (not served), within
3 rounds of purchase — instead of a per-Act rotation that has nothing
real to rotate against yet (every round is still Act 1). Winner's
Bounty's reward *is* the permanent +1-point-per-drink bonus
(`blocks.bonus_points_per_drink`), not a choice among three options.
See `src/lib/bounty.ts`.

**Penalties carry their own qty/drink type now.** Originally always
"1 shot of the cheapest drink" for a missed timer. Generalized
(migration `0009`) so a failed bounty can owe something different (3
shots of Spirit) through the exact same next-round-carryover
mechanism, instead of a second code path.

**A wrong ruling is a compensating ledger entry, never a delete.** The
bar's Back button and the admin's manual adjustment both follow
"Balances are never stored" above — they insert the opposite entry,
they don't touch the original row.

**The bar, the public screen, the admin page and the finish page all
share the host passcode.** No new auth surface for any of them —
"bartender" and "admin" just mean the host, on a different screen.

## Open decisions

Tracked in `docs/halloween-game-design.md`, section 11. Still
genuinely open: how much a star is worth (nothing awards the `stars`
ledger kind at all yet); how many Acts a night runs, and whether it
ends on a set round or a set time (every round still lands in a single
Act 1); other penalty kinds beyond missed-time and failed-bounty.
Resolved by what got built, not by a doc edit: drink types/points/
costs, prize money and item pricing (placeholder curves — see
`src/lib/economy.ts`, `src/lib/catalogue.ts`), the bounty target and
reward, and whether the host presses Next or only the bartender
(same role in this build, no separate check exists).
