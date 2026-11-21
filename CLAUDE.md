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
Prison theme, and it is wired in: the pack's `skin` names
`public/themes/prison/skin.css`, which dresses the app's ordinary
components in the sprite kit beside it. Reference:
`docs/pixel-ui-reference.md`. The skin adds no components and no
behaviour; a page must still work without it, which is what the Plain
theme shows. Style a new component in `globals.css` first, then give
it a frame in the skin.

## Stack

Next.js 14 App Router (TypeScript), Supabase (Postgres + Storage),
plain CSS in `src/app/globals.css`. No Tailwind, no component library.
Tests are `node:test`, run through `tsx`, in `*.test.ts` files next to
the code.

`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` ·
`npm run test:legacy` (the original SSS engine's 130 tests). CI
(`.github/workflows/ci.yml`) runs all of them.

Migrations are in `supabase/migrations/`, numbered `0001`–`0013`, run in order against the Supabase SQL editor.
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
  A pack may also bring a `skin` (a stylesheet under `public/themes`),
  `sounds` for the TV's cues, and `gameWords`.

## State of play

Built: self-service signup (`/signup`, `/parties`), party signup
(invite, identity, mugshot, potluck, booked, declined), host console
(parties, create, edit, event, guest edit, check-in, draw, cards),
`/join` and `/b/<token>` (claims the team phone; latest scan wins),
the TV (`/tv/<display-token>`), the bar (`/bar/<bar-token>`), and the
costume vote (opened from the event page; guests vote at
`/vote/<pollId>`; see `src/lib/polls`), and clips (a team films on
its phone, the TV loops them; see `src/lib/clips`). Two themes: Prison (`jail`)
and Plain.

Verified by driving it in a real browser against the real Supabase
project, with a throwaway party, after the theme and session work:
host sign-in, creating a party, guest signup and joining, the invite
pages, door registration (six in a row, none lost), the draw, cards,
the TV and bar links (each refused the other's token), team phones
with latest scan wins, switching a party between Prison and Plain, and
a full game round through `/api/sessions` as host, bar, TV and two
teams, with a simultaneous double tap charged once and ten concurrent
writes all landing. All eleven migrations apply to a fresh Postgres
16. **Not re-driven since the rework:** photo capture and upload, and
QR scanning on a real phone.

Not done in the core: clone a party, shareable potluck page, CSV
export, reminders (needs an email/SMS provider), reissuing a TV or bar
link.

## Games

A game is a module under `src/modules/<key>`, registered in
`src/modules/index.ts` (rules) and `src/modules/ui.tsx` (screens). The
first, Shifty Shen's Slammer, is playable: a host adds it to a party
from the event page and runs it at `/host/<eventId>/game`; the team
phones (`/b/<token>`), the bar (`/bar/<token>`) and the TV
(`/tv/<token>`) each show its screen for their seat. Rules are in
`src/modules/sss/engine`, screens in `src/modules/sss/ui`, and
`src/lib/sessions` stores the state and serves each viewer its view.
Phases 1 to 5 of `docs/rework-plan.md` are done; phase 6 (a
rehearsal under load, then shutting the old SSS down) is next. That
doc records every decision already made — don't re-decide those here. The deployed SSS (branch
`sss-points`) still runs on its own; `legacy/sss` is that app,
read-only, kept as the behaviour spec.

Rules for the game layer, learned from the two apps it replaces:

- **The engine is pure.** `reduce(state, action, ctx)` reads no clock,
  no dice and no database; time, randomness, the roster and the sender
  come in through `ctx`. Keep it that way: it is what makes the 100-odd
  engine tests possible and a night replayable.
- **The engine never names a theme or writes a sentence.** It emits a
  code and parameters; `messages.ts` holds the words, written against a
  `Voice` built from the party's theme. `messages.test.ts` fails if the
  Plain theme ever says a prison word.
- **`src/lib/sessions` is the only code that writes a session**, and
  it never trusts a role or team id from the browser: `viewer.ts`
  works out who is asking from the cookie or token.
- **Anything that must happen once goes through one atomic step** (a
  SQL function, or the session's compare-and-set). The retired game
  checked then wrote, so a double-tap could pay points twice.
- **Actions carry a client-generated id and name their target.**
  "Serve the next block" double-fires; "serve block X" doesn't.
- **A team's phone acts for the team that sent the action**, taken from
  who is signed in, never from an argument.
- **Screens draw what the engine gives them.** What a seat may know is
  decided in `engine/views.ts`, on the server. A screen never filters
  out a secret itself, because the data would already be in the page.
- **A game never touches a Vercel function with a video.** Phones get a
  signed upload URL and PUT straight to storage.
