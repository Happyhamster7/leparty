# LeParty — working context

Read this before changing anything. It carries the decisions behind the
code, which the code itself doesn't explain.

An app for running themed parties with games, teams, and a drinks
economy. Phase 1 (signup and intake) is built. Phase 2 (the game) is
designed but not built.

Full design, including the phase-2 tables: `docs/schema.md`. Keep it
updated when the schema or behaviour changes — it's the reference this
file summarises.

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
over the roster is `removeGuest`. There is deliberately no uniqueness
constraint on `people.display_name`, so two different people can share
a name; nothing currently stops that from being confusing on `/parties`
or the guest list, since there's no "different person, same name" check
on self-service signup the way the old host-driven add flow had.

**Block count is fixed, block size floats.** The big screen is the
constraint — eight rows read from across a room, fourteen don't.
Headcount is whoever checked in; nothing caps it.

**Blocks are created with the event, not with the draw.** All blocks
exist with names, colours, tokens and join codes before anyone RSVPs,
so cards can be printed in advance. The draw only fills rosters and
sets `in_play`.

**Balances are never stored** (phase 2). Sentence and commissary are
`sum(delta)` over an append-only ledger, so a wrong ruling is one
compensating row rather than a guess.

**No drink caps or limits anywhere.** Deliberate: pacing is managed in
the room, not by the app. The substitute menu (shot / slop / pay in
years) is the pressure valve, and it's a game mechanic, not a safety
feature. Don't add caps, cooldowns or confirmation prompts.

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
(invite, identity, potluck, mugshot, booked, declined), host console
(parties, create, edit, event, guest edit, check-in, draw, cards),
`/join` and `/b/<token>`.

Verified by driving it in a real browser against Postgres: migration
applies, inmate-number trigger works, photos downscale and upload,
balancer hits spread 0–1 across realistic headcounts, QR codes scan.

Not done in phase 1: clone a party, shareable potluck page, CSV export,
reminders (needs an email/SMS provider).

## Phase 2 — the game, designed not built

The night runs as Days. Each Day: **Yard time** (a game is played) →
**Lights out** (blocks secretly spend commissary and play contraband) →
**Roll call** (the reveal, on the big screen) → **Serve your time**
(take the shot, take a substitute, or pay in years). Wildcard events sit
between Days.

Tables to add: `days`, `games`, `groupings`, `game_results`,
`purchases`, `drinks`, `clips`, `ledger_entries`, `items`,
`substitutes`, `wildcards`, `theme_strings`.

**Phones write intents, not state.** A block's phone writes rows to
`purchases`. One server-side resolver turns them into `drinks` and
`ledger_entries` in a fixed order: take final intents → charge costs →
apply cancels → build sends → reflects → shields → multipliers → splits
→ write drinks → settle bounties → stamp the Day. That single
resolution step is what makes last-write-wins safe and gives Roll call
something to reveal. It must be idempotent, keyed on `day_id`.

Multiple devices per block are normal; last write wins, and every
device shows the current locked-in choice.

## Open decisions

- **Win condition**: race to zero sentence, or lowest after a fixed
  number of Days. Decides whether blocks hoard or spend commissary.
  Nothing else can be balanced until this is settled.
- Item pricing and balance — needs playtesting, not design.
- Whether sends are anonymous, with "reveal the sender" sold as an item.
- Whether rosters print on block cards (forces printing on the night) or
  not (cards become reusable between parties).
