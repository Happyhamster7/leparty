# LeParty — working context

Read this before changing anything. It carries the decisions behind the
code, which the code itself doesn't explain.

An app for running themed parties with games, teams, and a drinks
economy. Phase 1 (signup and intake) is built. Phase 2 (the game) is
designed but not built.

**Phase 2 source of truth: `docs/halloween-game-design.md`.** It
replaced an earlier design (Days, sentence and commissary, substitutes,
wildcards) — if you find traces of that anywhere, the design doc wins.
Tables for both phases: `docs/schema.md`. Keep both updated when the
schema or behaviour changes — they're the references this file
summarises.

**Visual direction: pixel art (Stardew Valley-inspired), permanent,**
bound to the jail theme. Reference: `docs/pixel-ui-reference.md`
(palette, type, sprite-sheet format, contrast rules). Implementation
is deferred until Phase 2 is functionally complete — don't start
wiring CSS or components from it before then.

## Stack

Next.js 14 App Router (TypeScript), Supabase (Postgres + Storage),
plain CSS in `src/app/globals.css`. No Tailwind, no component library,
no test framework yet.

`npm run dev` · `npm run build` · migration in
`supabase/migrations/0001_phase1.sql`.

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

## Phase 2 — the game, designed and partly built

Full spec: `docs/halloween-game-design.md`. Summary:

The night runs as rounds grouped into Acts. Each round: **Game** (teams
pick players on the team phone within a minute; picks revealed at once)
→ **Results** (host enters placings; prize money paid) → **Spending**
(teams secretly buy items and send drinks to other teams, which costs
money) → **Drinks** (queue built fewest drinks first, ties random; each
team drinks at the bar with 30 seconds on the clock, filmed on the
team phone; the clip loops muted on the public screen; missing the 30
seconds is an extra shot next round; auto-advances when every team is
done). Points go to the sender **when a drink is served**. Most points
wins. The holding cell, "on the bus", final items and game rules are
deferred.

Tables to add: `acts`, `games`, `rounds`, `round_players`,
`game_results`, `drink_types`, `drink_orders`, `items`, `item_uses`,
`serves`, `penalties`, `clips`, `ledger_entries`.

**Phones write intents, not state.** Team phones write `drink_orders`
and `item_uses`. One server-side function, idempotent on `round_id`,
builds the drinks queue when the host starts drinks: take orders →
apply Reflect → add penalty shots → count per team → build `serves`.

**One team phone, latest scan wins.** Scanning a block's QR makes that
device the team phone and signs the previous one out. The host can
rotate `join_token` if a card leaks. `blocks.captain_participant_id`
is unused — there are no captains.

**Live updates are polling, not a browser database client.** Views poll
the server about once a second; the rule above about no browser-side
Supabase client still holds. Timers store a start or end time on the
server and count down locally. If polling feels slow, add a data-free
"something changed" ping over Supabase Realtime Broadcast.

**Videos are not converted.** Phones upload straight to Supabase
Storage with a signed upload URL (never through a Vercel function).
Clips play as recorded, so the display laptop must be a Mac. Clips are
kept after the party.

## Open decisions

Tracked in `docs/halloween-game-design.md`, section 11. The big ones:
drink types, points and costs; prize money and star value; how many
Acts; other penalty kinds; whether the host can press Next as well as
the bartender.
