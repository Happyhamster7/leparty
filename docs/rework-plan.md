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
| Retired SSS mechanics | Only host-assigned drinks come across. Holding Cell drinks, bail, deflect, punishments and sentences, supplies, gifts, heats, Shot Callers and request-and-second spending are cut. |
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
| 3 | **Engine port.** `legacy/sss/lib/game.js` becomes a TypeScript reducer in `src/modules/sss`, keyed on participant and block ids, theme-neutral (structured feed events, not finished English), with the ledger, and without the cut mechanics. | Next |
| 4 | **Sessions and API.** `game_sessions`, `game_actions`, one atomic apply function, polling endpoints. | |
| 5 | **Screens in React.** Host, team phone, bar and TV against the new API; costume poll and clips as core features. | |
| 6 | **Rehearsal and shutdown.** A simulated night with 50 clients, then turn off the SSS Vercel project, Upstash and the Blob store. | |

There is no playable game between phases 2 and 5. The old SSS
deployment (branch `sss-points`) is untouched and still works until
phase 6.

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
