# LeParty — working context

Read this before changing anything. It carries the decisions behind the
code, which the code itself doesn't explain.

An app for running themed parties for large groups. A host sets up a
party, picks a **theme** (the look and the words) and, optionally,
**games** that plug into it. The core is built: signup, intake,
check-in, the draw into blocks, cards, the team page, the TV. Games are
mid-rework: the old relational game is gone and Shifty Shen's Slammer is
being ported in as the first game module.

**The plan of record is `docs/rework-plan.md`**: why, the target shape,
every decision, and which phase is next. Read it before working on
themes, game modules or `legacy/sss`. Tables: `docs/schema.md`. Keep
both updated when the schema or behaviour changes.

`docs/halloween-game-design.md` is no longer a build spec. It's kept
for the intent behind the round loop.

**Visual direction: pixel art (Stardew Valley-inspired)** for the
Prison theme. Reference: `docs/pixel-ui-reference.md`. The sprite kit
SSS built from it is in `legacy/sss/public/pixel/` and `pixel.css`; it
becomes Prison theme assets when the screens are rebuilt (phase 5).
Nothing in `src` is wired to it yet.

## Stack

Next.js 14 App Router (TypeScript), Supabase (Postgres + Storage),
plain CSS in `src/app/globals.css`. No Tailwind, no component library.
Tests are `node:test`, run through `tsx`, in `*.test.ts` files next to
the code.

`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` ·
`npm run test:legacy` (the original SSS engine's 130 tests). CI
(`.github/workflows/ci.yml`) runs all of them.

Migrations are in `supabase/migrations/`, numbered `0001`–`0010`, run in order against the Supabase SQL editor.
Each new one must actually be run before its feature works — nothing
auto-applies them. If `npm run build` hangs right after the
`Next.js 14.2.35` banner with no further output, it's not your code:
kill stray `node.exe` processes (Windows doesn't always clean these up
from a killed `next dev`/`next build`) and retry.

Env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`HOST_PASSCODE`, `NEXT_PUBLIC_SITE_URL`, and optionally `SITE_THEME`.

## Decisions that are load-bearing

**All data access is server-side with the service role key.** RLS is on
with *zero policies*, which denies the anon key everything. Never add a
browser-side Supabase client, and never prefix the service key with
`NEXT_PUBLIC_`. This is simpler than writing policies for an app with
no accounts, and fails safe.

**Theme and game are separate, and stay that way.** A theme pack
(`src/themes`) owns every themed word and colour; nothing outside the
Prison pack may say Warden, inmate, mugshot or cell block. Pages read
words with `getTheme(event.theme_key)` and pass plain strings to client
components. Pages that belong to no party (home, `/signup`, `/join`,
the party list) use `sitePack()`, which is Plain unless `SITE_THEME`
says otherwise. A game module must run under any theme, and a theme
must work with no game. Database names (`blocks`, `inmate_number`,
`charge`) are internal and were not renamed.

**One source of truth for people and groups.** `participants` and
`blocks` are the only record of who is here and which group they are
in. A game refers to them by id. It never creates, copies or syncs
people or groups — that is exactly what produced duplicate guests and
duplicate teams at the live event.

**No auth, two cookies and three links.** A guest's whole identity is
their browser's `leparty_profile` cookie, which carries `people.profile_token` — set at
`/signup`, the one link the host hands out for everything. A specific
party invite carries `participants.invite_token` the same way. The
host console is a passcode in an httpOnly cookie. A block's card
carries `blocks.join_token`; the TV and the bar each open with their
own token (`events.display_token`, `events.bar_token`, see
`src/lib/screens.ts`) so neither ever holds the host passcode. Right
for a private party, wrong for anything else.

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

**Balances are never stored.** A game's money and points are
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
- Copy is plain and direct, sentence case, no exclamation marks.
  Themed words come from the theme pack, never from a component.
- Design tokens are CSS custom properties in `globals.css`: `--paper`,
  `--ink`, one accent `--rust` (named for Prison's colour; under Plain
  it's blue). A theme pack overrides them, and `ThemeStyle` writes them
  into the page: the root layout for the site theme, then a party's
  layout (`host/[eventId]`, `i/[token]`) or page (`b/`, `tv/`, `bar/`)
  for its own. Oswald for display, IBM Plex Mono for anything that
  reads as data, IBM Plex Sans for body.
- Adding a theme: write a pack in `src/themes`, register it in
  `index.ts`. `themes.test.ts` fails if it leaves a word or token out.

## State of play

Built: self-service signup (`/signup`, `/parties`), party signup
(invite, identity, mugshot, potluck, booked, declined), host console
(parties, create, edit, event, guest edit, check-in, draw, cards),
`/join` and `/b/<token>` (claims the team phone; latest scan wins),
the TV (`/tv/<display-token>`) and a bar page that waits for a game
(`/bar/<bar-token>`). Two themes: Prison (`jail`) and Plain.

Verified by driving it in a real browser against Postgres, before the
rework: migration applies, inmate-number trigger works, photos
downscale and upload, balancer hits spread 0–1 across realistic
headcounts, QR codes scan. Since the rework: all ten migrations apply
to a fresh Postgres 16, and the pages that need no database render
under both site themes. The database-backed pages have been
typechecked and built but **not yet re-driven in a browser** since the
theme changes — do that against a real Supabase project before relying
on them.

Not done in the core: clone a party, shareable potluck page, CSV
export, reminders (needs an email/SMS provider), reissuing a TV or bar
link.

## Games

No game is playable from this codebase right now. `legacy/sss` is the
original Shifty Shen's Slammer app, read-only, kept as the behaviour
spec for the port; the deployed SSS (branch `sss-points`) still works
on its own. What's next, and every decision already made, is in
`docs/rework-plan.md` — don't re-decide those here.

Three rules for whoever builds the game layer, learned from the two
apps it replaces:

- **Anything that must happen once goes through one atomic step** (a
  SQL function, or the session's compare-and-set). The retired game
  checked then wrote, so a double-tap could pay points twice.
- **Actions carry a client-generated id and name their target.**
  "Serve the next block" double-fires; "serve block X" doesn't.
- **A game never touches a Vercel function with a video.** Phones get a
  signed upload URL and PUT straight to storage.
