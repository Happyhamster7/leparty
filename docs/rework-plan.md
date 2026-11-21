# The rework: one app, themes and game modules

LeParty and Shifty Shen's Slammer (SSS) grew as two apps. This is the
plan for making them one, the decisions behind it, and where it stands.
Read it before touching `src/themes`, `src/modules` or `legacy/sss`.

## Why

SSS ran the live night on a copy of LeParty's guests and blocks, pulled
over a one-way sync. The copy is what went wrong:

- **Duplicate people.** The sync matched by name when it had no id, and
  made "Name (2)" on a clash. A guest removed and re-added in LeParty
  got a new id and was imported twice.
- **Duplicate teams.** SSS minted its own block codes and could build
  its own blocks next to the imported ones, so there were two card
  systems.
- **Double-taps.** Nothing deduplicated actions. Pressing Next twice at
  the bar skipped a block; buying twice charged twice.

The fix is structural: one source of truth for people and groups, and a
game that reads it directly and never keeps its own copy.

## The shape

```
Person 1─* Participant *─1 Event 1─* Block (the group)
Event *─1 Theme (a code pack in src/themes)
Event 1─* GameSession *─1 GameModule (code in src/modules)
GameSession 1─* GameAction (append-only log)
```

- **A theme** is the look and the words: vocabulary, colours, later
  sprites, sounds and TV visuals. It works with no game running. An
  event picks one with `events.theme_key`.
- **A game module** is mechanics: rounds, scoring, a shop, a bar queue.
  It plugs into an event, takes its words from the event's theme, and
  keys everything on `participants.id` and `blocks.id`. It never creates
  a person or a group.
- **Game state** is one JSON document per session
  (`game_sessions.state`, with a `version` for compare-and-set), changed
  only through a pure reducer. Every action is logged with a
  client-generated id, which is what makes a double-tap harmless.
- **Live updates** are polling with a cheap version check. No
  browser-side Supabase client.

## Decisions

| Question | Decision |
| --- | --- |
| Which game engine survives | SSS's. The relational game LeParty had (migrations `0006`–`0009`) is retired. |
| Balances | Derived from a ledger inside the session document; a wrong ruling is a compensating entry. |
| Phones | The team phone plays. Guest phones vote and film. SSS's every-guest-plays mode is dropped. |
| SSS act lineups (GTA, Genshin, TFT, Among Us, Long Night) | Not ported. They imitate other companies' games and use a personal-use-only font. Acts stay as a grouping of rounds, with the mechanics hook. |
| Retired SSS mechanics | Only host-assigned drinks come across. Holding Cell drinks, bail, deflect, punishments and sentences, supplies, gifts, heats, Shot Callers and request-and-second spending are cut. So are the Winner's Bounty perks (bonus drinks, fewer drinks, +1 point per drink): no SSS screen could ever switch them on. |
| Roles | One host passcode. The TV and the bar each open with their own link (`events.display_token`, `events.bar_token`). |
| Live updates | Polling. Revisit only if a rehearsal shows the lag hurts timed games. |
| Clips | Supabase Storage, private bucket, signed URLs, capped at 50 MB. |
| The live night's SSS state | Archived as a file, not imported. No clips were made that night. |
| Games per event | Zero or more sessions, one live at a time. |
| Themes | Code packs. Per-event text overrides can come later if needed. |
| Standings | Per game session. |
| Mini-games (trivia, cold war, dilemma, two-thirds, anime, lying) | Written with no SSS dependencies so another game can reuse them. |

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 1 | **Archive and foundations.** SSS in the repo as `legacy/sss` with its history; a test runner; CI. | Done |
| 2 | **Core and themes.** Theme packs (Prison, Plain); no prison words outside the Prison pack; TV and bar links; the old relational game and the roster API removed. | Done |
| 3 | **Engine port.** `legacy/sss/lib/game.js` becomes a TypeScript reducer in `src/modules/sss`, keyed on participant and block ids, theme-neutral (structured feed events, not finished English), with the ledger, and without the cut mechanics. | Done |
| 4 | **Sessions and API.** `game_sessions`, `game_actions`, one atomic apply function, polling endpoints. | Done |
| 5 | **Screens in React.** Host, team phone, bar and TV against the new API; costume poll and clips as core features. | Done |
| 6 | **Rehearsal and shutdown.** A simulated night with 50 clients, then turn off the SSS Vercel project, Upstash and the Blob store. | Next |

There is no playable game between phases 2 and 5. The old SSS
deployment (branch `sss-points`) is untouched and still works until
phase 6.

## The engine, as built (phase 3)

`src/modules/sss/engine` is the rules and nothing else: no database, no
HTTP, no React, no clock and no dice of its own.

| File | What it holds |
| --- | --- |
| `types.ts` | The session document (`State`) and everything that goes in and out. |
| `index.ts` | `init`, `reduce`, `tick`, `nextDeadline`, and the table of actions with who may send each. |
| `engine.ts` | The rules, as one class that wraps a state for a single call. |
| `views.ts` | `hostView`, `displayView`, `teamView`: what each screen may know. Secrets are left out here. |
| `catalogue.ts` | The default shelf, settings, starter games and constants. |
| `text.ts` | Parsing host-typed trivia and openings; forgiving answer matching. |
| `../messages.ts` | The words for every feed line and error, written against a `Voice`. |
| `../voice.ts` | Builds a `Voice` from a theme pack and tonight's names. |

How it differs from the legacy engine, on purpose:

- **`reduce(state, action, ctx)` is pure.** It clones, settles any
  deadline that has passed, checks the sender's role, applies one
  action and returns the new state. A refused action throws
  `GameError` and changes nothing. Time and randomness come in through
  `ctx`, so a night can be replayed from its action log.
- **Who is playing comes from the roster in `ctx`**, on every call. A
  team is a `blocks.id`, a player a `participants.id`. A team's account
  opens (with the starting budget) the first time it appears with
  someone on it; a member marked `away` is not picked or counted.
- **Balances are sums over `state.ledger`.** Points can't be taken below
  zero: the entry written is what was actually taken.
- **No finished English.** The feed is `{kind, params}` and errors are a
  code and params; `messages.ts` has a template for each, and the
  compiler refuses a kind or code without one. Host-written text (item
  descriptions, game rules) may use `{group}` and `{groups}`.
- **Bar actions name their team**, and repeating one is harmless.
  `barNext` only accepts the team that is next in line.
- **A team's phone acts for the team that sent the action**, never for
  a team named in the arguments.
- **Ids are minted from a counter in the state**, not from random bytes.

Tested by 116 engine tests: 55 ported from the legacy suite by a
separate pass (as an independent check that the port is faithful) and
the rest new. The other 62 legacy tests cover what was cut.

Decided since: a bounty being hit is announced with the team's name
and the sends that completed it, Burner Phone or not.

An order a host cancels (or marks delivered by hand) after the bar
queue is built leaves the queue: the team's count drops, and a team
with nothing left drops out of line.

## Sessions and the API, as built (phase 4)

| Piece | Where |
| --- | --- |
| Tables and the atomic save | `supabase/migrations/0011_game_sessions.sql`; documented in `docs/schema.md` |
| What a module is, to the core | `src/modules/types.ts`; the registry is `src/modules/index.ts` |
| Start, dispatch, read | `src/lib/sessions/sessions.ts` |
| Storage | `store.ts` (the contract), `supabaseStore.ts` (Postgres), `memoryStore.ts` (tests) |
| Who is here | `src/lib/sessions/roster.ts`: every block, and everyone checked in |
| Who is asking | `src/lib/sessions/viewer.ts` |
| Endpoints | `GET /api/sessions/<id>/state?v=<version>` and `POST /api/sessions/<id>/action` |
| Adding a game to a party | The Games section of `/host/<eventId>` (`gameActions.ts`) |

- **Writes are optimistic.** An action is applied to the state as read
  and saved naming the version it read. A stale save is refused and the
  action is applied again to the fresh state, up to 12 times.
- **A tap carries an id** (`id` in the POST body). A repeat returns the
  first answer and changes nothing, whether it arrives later or at the
  same instant.
- **Polling moves the clock.** There is no cron. A read that finds
  `next_deadline_at` in the past settles it before answering, and logs
  it as a `tick` by `system`.
- **The caller's role is worked out on the server**: the host cookie;
  `x-screen-token` for the bar and the TV; `x-team-token` plus the
  device cookie for a team's phone, which must be the device that last
  scanned the card. The TV can read and never act.
- **A rule saying no** is a 200 with `ok: false`, a `code` and `params`;
  the screen turns it into words with `messages.ts`.

Checked end to end against the real Supabase project with a throwaway
party (then deleted): a host creating a party, a guest signing up and
joining, door registration, the draw, cards, the TV and bar links, team
phones with latest-scan-wins, switching the party's theme, adding the
game, and a full round through the two endpoints as host, bar, TV and
two teams, including a simultaneous double tap on Buy and ten writes at
once. Not covered by that run: photo upload, and any game screen (none
exist yet).

## The game's screens, as built (phase 5, first part)

A full night is playable. Each seat has one screen, in
`src/modules/sss/ui`, and each core page looks its game up in
`src/modules/ui.tsx`:

| Seat | Page | Screen |
| --- | --- | --- |
| Host | `/host/<eventId>/game` (linked from the event page) | `Host.tsx`: the round in front of you, standings, rulings, and the night's setup |
| Team phone | `/b/<join-token>` | `Team.tsx`: pick players, answer an app-run game, the shop, your place at the bar |
| Bar | `/bar/<bar-token>` | `Bar.tsx`: the queue only (`BarQueue.tsx`, shared with the host) |
| TV | `/tv/<display-token>` | `Display.tsx`: the round, standings as published, the feed |

- `GameScreen` (`ui/common.tsx`) holds the live connection
  (`useSession`), the party's words and names, and the one place a
  refusal is shown. A screen reads everything through `useGame()`.
- Phones poll every 2 seconds and the TV every second; a countdown
  ticks in the browser from the server's deadline.
- Every button that sends an action is disabled until it has answered,
  and each send carries its own id.
- The engine decides what each seat may know; the screens draw what
  they are given and hide nothing themselves.
- Every screen fits a 320px-wide phone: nothing is wider than the
  screen, and a table too wide for it scrolls sideways inside a
  `.scroller`. A new table in a game screen needs that wrapper.
- On the team's phone the roster is folded away at the bottom.
- A screen that names its seat (a team or screen token) gets that seat
  even in a browser signed in as host, so a host who picks up a team's
  phone sees what that team sees.

Played end to end against the real database through these screens,
with a host, three phones, the bar and the TV in separate browsers:
a picked-player round, the shop (including an anonymous send), the
bar (call up, clock, done, couldn't finish), Cold War and Trivia on
the phones, a fine, a refusal shown in the party's words, and a second
phone taking a team over.

A second run drove the other four phone games (Two-Thirds, Prisoner's
Dilemma, Name the opening, Truth or lie), shelf editing, and the
costume vote.

**The costume vote** is a core feature, not part of any game
(`src/lib/polls`, migration `0012`, documented in `docs/schema.md`).
The host opens it from the event page; the TV shows a code; each phone
votes at `/vote/<pollId>` with no sign-in, up to three best and three
worst, one vote per phone and changeable until it closes. Closing
fixes the result, shows it on the TV, and tells a running game what it
is worth: in Slammer, 10 points to the best costume's team and a shot
in the next queue for the worst's.

**Clips** are a core feature too (`src/lib/clips`, migration `0013`).
A team's phone is offered Film a clip only while that team is
drinking: from when the bar calls it up until the round ends. (The
page hands the control to the game, which decides when to show it, so
with no game running there is nowhere to film from.) The video
goes from the phone straight to the private `clips` bucket through a
signed link, and the newest clips loop muted in a corner of the TV. A
host can take a clip off the TV from the event page; the file is kept.

**The pixel look** is the Prison theme's skin: a stylesheet and sprite
kit in `public/themes/prison`, named by the pack's `skin` and loaded by
`ThemeStyle` on every Prison party's pages (screens only, so printed
cards stay plain). It dresses the ordinary components in the kit's
nine-slice frames and adds no components or behaviour: without it every
page still works in plain paper and ink, which is what Plain shows. The
pack's colour tokens are the kit's palette.

**Sounds** are cues the TV plays, made in the browser with no audio
files (`src/lib/sounds.ts`). The game says which moments play which
cue (`CUES` in `ui/Display.tsx`); the theme says what each cue sounds
like (`pack.sounds`; Prison's are square-wave). The TV is silent until
someone taps "Turn sound on", because browsers require a touch first.

The whole night was replayed against the real database under the skin
as a regression check.

## Reference points

- `legacy/sss/` is `sss-points` at `7b4062f`, read-only. Its rules are
  in `lib/game.js`; its 130 tests run with `npm run test:legacy` and are
  the behaviour spec for the port. About 70 port as they are, about 18
  (rosters, phones, the sync) are rewritten against the core, and the
  rest (old-save upgrades, act engines) are dropped.
- `legacy/sss/public/pixel/` and `pixel.css` are the pixel kit, which
  becomes Prison theme assets in phase 5. The `skins-trial` branch has
  the earlier LeParty-side experiment.
- `docs/halloween-game-design.md` still describes the round loop's
  intent (game, results, spending, drinks). Where it and SSS disagree,
  SSS is what ran.
- Before phase 6, export the live state once for the record: in the
  Upstash console, copy the value of the `sss:s` key into a file.

## Things the old code got wrong, to not repeat

- A check then a write is a race. `markServed` in the retired game could
  pay points twice; `buildDrinksQueue` could build two queues. Anything
  that must happen once goes through one SQL function or the session's
  compare-and-set.
- Actions name their target. "Serve the next block" double-fires;
  "serve block X" doesn't.
- One document, many writers, is fine for eight team phones and bad for
  fifty guests voting at once. Votes get their own table.
