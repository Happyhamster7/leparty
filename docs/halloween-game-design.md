# Halloween Game App: Design and Open Questions

**Source of truth for Phase 2.** Combined from the *Halloween Game App — Software Brief* and *Halloween Game App — Open Questions (Updated)*, as of 4 Nov 2026. It supersedes the earlier Phase 2 design (Days, sentence and commissary, substitutes). Database tables for it are in `docs/schema.md`.

---

## 1. Summary

A web app that runs a team-based Halloween party game. It tracks teams, money, points, items and drinks owed, and shows the live state on screens around the house.

**Goals**

- Everyone, in every room, can see what game is on, who's winning and who owes drinks.
- The host runs each round from one console, with no paper tracking.
- The app enforces the rules (cooldowns, drink order, item limits) so the host doesn't have to remember them.

**Non-goals**

- No user accounts or payments.
- The game livestream runs outside the app.
- The app doesn't judge games. The host enters the results.

---

## 2. Setup and screens

The app is an online web app. All guest, party, team and player data comes from **Phase 1 of the application**, the existing sign-up platform. Nothing is re-entered.

One laptop drives all the public screens. A Lemorele wireless HDMI kit (1 transmitter, 3 receivers) mirrors the laptop's extended display to 1 TV and 2 monitors. A camera operator livestreams the games from a Canon camera.

| View | Where | Who | Shows |
| --- | --- | --- | --- |
| Public display ("waiting page" during drinks) | Laptop's extended display, mirrored to all 3 screens | Everyone | Current phase, game, timer, leaderboard, cooldown list; during drinks, the team video grid |
| Host console | Laptop's own screen | Host | Tabbed admin view (see below) |
| Team phone | One phone per team, claimed by scanning the team's QR code | Whoever holds it | Player picks, balance, shop, secret drink orders, Eye Spy results, filming prompt |
| Cafeteria view | iPad at the bar | Bartender | The current team's order, with Next and Back buttons |

### Host console tabs

The admin view is split into tabs. Proposed tabs:

- **Game control:** phases and results.
- **Teams and phones:** which device is each team's phone and when it took over, plus reissuing a team's QR code.
- **Drink orders:** team orders plus drinks the admin assigns.
- **Drinks required per team:** how many drinks each team must drink this round.
- **Drink prep:** what to pour for the next team heading to the bar.

### Team phones

- **No captain.** Each team has one team phone: whichever device most recently scanned the team's QR code. Whoever holds it acts for the team.
- **Latest scan wins.** When a new device scans the QR code, it becomes the team phone straight away. The previous phone is signed out with a message saying the team has moved to another phone. This covers dead batteries and handovers without the host stepping in.
- **QR codes are printed cards** and never appear on the public screens. Because any scan takes over, a rival who sees a code could hijack that team's phone. If a code leaks, the host issues a new one, which appears on the host console, and the old one stops working. **Built:** `/host/<eventId>/game/admin` — reissuing rotates `join_token`/`join_code` and signs out whatever phone currently holds that team.

### Other requirements

- **Live sync:** every view polls the server for the current state about once a second, so changes show up within 1–2 seconds. Timers never depend on polling: the server stores a start or end time, and each device counts down locally. If polling feels slow, the server can send a data-free "something changed" ping over Supabase Realtime Broadcast so views refetch immediately. Phase 1's rule of no database access from the browser still holds.
- **Deadline lock:** orders and purchases lock when the host closes spending. Late orders are rejected.
- **Privacy:** a team phone only ever sees its own team's balance, orders and Eye Spy results.
- **Host override:** the host can view, edit or cancel any team's orders.
- **Network:** every device needs internet access, through the house Wi-Fi (confirmed fine) or mobile data.

### Livestream

A camera operator livestreams the games from a Canon camera. It won't be built into the app. It will run either as a **separate stream on the side** or **through OBS**. If it goes through OBS, the host must never switch the TVs with alt-tab, because that risks showing the host console, including secret orders, on every screen.

---

## 3. Before the game

- Teams, players, tolerance and team balancing all come from Phase 1.
- Tolerance is private and is used only to balance teams.
- The host presses **Start game**. This locks the rosters, generates a QR code for each team and moves to round 1.

### What Phase 1 already provides

Phase 1 lives at [github.com/Happyhamster7/leparty](https://github.com/Happyhamster7/leparty). It is built with Next.js 14 (App Router, TypeScript) and Supabase (Postgres and Storage), and deploys to Vercel. This app should be built as Phase 2 in the same repo.

| This design | Phase 1 today |
| --- | --- |
| Team | `blocks`, created with the event (8 by default, `config.block_count`), each with a name and colour |
| Team QR code | `blocks.join_token` → `/b/<token>`, plus a typed `join_code` at `/join`; printable cards at `/host/<event>/cards` |
| Player | `participants`, one row per person per party, joined to `people` |
| Tolerance | `people.capacity_band` 1–5 (0 standard drinks … "the whole cabinet"), snapshotted to `participants.capacity_snapshot` |
| Team balancing | The draw at check-in: a snake draft by capacity, reviewed on `/host/<event>/draw` |
| Player photo | Mugshots in a private `mugshots` bucket (`participants.photo_path`) |
| Host console | `/host`, protected by a passcode cookie |
| Transaction log | Planned in `docs/schema.md`: balances are never stored, only an append-only `ledger_entries` table |

---

## 4. Round flow

The app works as a state machine. Rounds are grouped into **Acts**, which are groups of games.

| Phase | Host does | App does |
| --- | --- | --- |
| **1. Game** | Picks the game and starts the timer | Prompts each team phone to pick players within 1 minute, with ineligible players greyed out. Reveals all picks at once and shows the game and timer on the screens. |
| **2. Results** | Enters placings and any bonus money | Pays prize money and updates the leaderboard |
| **3. Spending** | Opens and closes the shop | Takes item purchases and secret drink orders from team phones, and checks balances and limits |
| **4. Drinks** | Starts the drinks phase | Resolves Reflect, builds the queue and runs the bar (see section 6). Moves to the next game automatically once every team has finished. |
| ~~Holding cell~~ | *Deferred* | |

### Player selection and cooldown

- Each team phone gets a prompt naming the game and how many players are needed. The team has **1 minute** to choose.
- Anyone on the team can be picked, including whoever holds the phone. Players who played in either of the **last 2 games** are greyed out, with the reason shown.
- Picks stay hidden until every team has confirmed or the minute runs out. They are then revealed on the public screens all at once.
- **If time runs out, the app auto-picks** from eligible players, favouring whoever has played the fewest games.
- Group games skip the prompt: the whole team plays, and no cooldown starts.
- The public screens show who is on cooldown.

---

## 5. Economy and scoring

- **Money** is earned from game placings, bonus awards and stars. It is spent on items and on **sending drinks, which costs money**.
- **Points** are earned for every drink a team sends. They are recorded **when the drink is served**, meaning when the bartender presses Next, not when the order is placed. Points are weighted by drink type.
- **Stars:** the team with the most drinks served at others in a round gets a star. A star is worth an amount of money.
- **Reflected drinks** score for **the team that played Reflect**.
- **Overall winner:** decided — the team with the most points wins, calculated by the system. Points are generated from drinks sent (see above), so sending drinks is the winning move. **Built:** the host confirms it from `/host/<eventId>/game/finish` — picks (or accepts the top scorer) from the final standings, which stamps `events.ended_at`/`winner_block_id` and takes over the public screen.
- The host can adjust any balance manually, and the reason is logged. **Built:** `/host/<eventId>/game/admin`, which writes a `host_adjust` ledger entry with a free-text `note` column (migration `0009`) for the reason, since none of the other ledger reasons carry one.

Stars still aren't built — nothing awards the `stars` ledger kind yet.

---

## 6. Drinks

### Orders

- During spending, each team places orders from its phone. Each order has a **target team**, a drink type and a quantity.
- **Drinks are sent to a team, never to a named player.** The receiving team decides among themselves who drinks what.
- **Drinks assigned by the admin go into the same queue** as the teams' orders. **Built:** `/host/<eventId>/game/admin`, as a plain `origin = 'admin'` order — but only before that round's queue is actually built (`drinks_started_at`); patching an already-built queue wasn't built.
- Orders are hidden from other teams and kept off the public screens.
- Per-person drink caps are not enforced by the app and are left to each team's judgement. The house rule still applies: non-drinkers swap to water at the counter, and the drink still scores for the sender.

### Queue and the bar

- The queue always runs **from the fewest drinks owed to the most**. Ties are ordered **randomly**.
- Teams come up one at a time and **drink at the bar** with the bartender.
- The cafeteria iPad shows one team at a time, with totals per drink type.
    - **Decided for now: every team can see who sent each drink.** Senders are shown by default, not hidden — this makes Eye Spy's real-time reveal redundant for now; its remaining value is the round-by-round history view (may revisit). The bartender's iPad still has its own separate "Show senders" toggle for serving purposes, and **resets to hidden for each new order**.
    - **Next** marks the team as served, records the points and calls the next team on the public screens. **Back** reopens the previous team if Next was pressed by mistake.
    - An "up next" preview lets the bartender start pouring ahead.
    - The bartender doesn't wait for videos to upload.
- Large text and big buttons, so it's usable with wet hands in dim light.

**Implementation note:** Next, Back, the up-next preview and the
per-type breakdown are built (`/host/<eventId>/game/bar`). Back
undoes whichever team was most recently served and is still mid-drink
(not yet finished) — it flips their orders back from `served` and
reverses the points with a compensating ledger entry rather than
deleting the original row, per "Balances are never stored" below. The
iPad's own "Show senders" toggle is built too — hidden by default,
resets to hidden for each new team called up. The broader
senders-shown-by-default policy for teams generally isn't built
anywhere yet; this toggle is the bartender's own tool, independent of
that.

### 30-second drink and video

- When the bartender serves a team, **a 30-second countdown starts**. It shows on the team phone and on the waiting page.
- The team phone shows a prompt to **film the team drinking**. Whoever holds it films, then presses **Punishment complete**, which uploads the video.
- A team that doesn't finish its drinks within 30 seconds gets **an extra shot next round**.
- A team counts as finished **when its timer ends, or when the host marks it done**, for example if a video won't upload.

### Waiting page (team video grid)

- During drinks, the public display becomes a grid with **one tile per team**, each showing the team's icon.
- When a team's video is uploaded, it replaces the icon and plays **on a loop, muted**.
- Teams with no drinks this round keep their icon, marked "Safe this round", and count as finished.
- **Auto-advance:** once every team has finished, the app moves straight on to the next game.
- The grid adapts to the number of teams and stays readable on the 24" monitors.
- The host can delete or replace a video.
- **Videos are kept after the party**, so guests should be told they will be filmed.

### Video technical notes

- Videos are filmed with the iPhone's built-in camera through a file input (`accept="video/*" capture`).
- **No conversion.** Clips are stored and played exactly as the iPhone recorded them (HEVC). Vercel can't practically run ffmpeg, so instead **the display laptop is a Mac** (Apple Silicon, M1 or later), whose Safari and Chrome play iPhone video natively and can loop all the tiles at once.
- **Direct upload.** Phones upload straight to Supabase Storage with a signed upload URL issued by the server. Clips never pass through a Vercel function, which can't accept bodies that large.
- Phones record at 1080p and 30 fps on the default "High Efficiency" format, not 4K and not "Most Compatible". That keeps a 30-second clip around 30 MB, under Supabase's 50 MB per-file limit on the free plan.
- Uploads show a progress bar with a Retry option and run in the background.
- **Storage:** clips are kept, so a full night can pass Supabase's free 1 GB. Either use the paid plan or download and clear the clips after the party.

---

## 6a. Drink catalogue

Decided. Base rate: **15 money and 3 points per standard drink**
(anchors to the earlier placeholder Shot — see
`docs/pixel-ui-reference.md`). Single shots/glasses are priced exactly
at that linear rate. Bundles and the Soju bottle get both a cost
discount and a small points bonus above linear — buying in bulk is
cheaper per unit AND scores slightly better per unit, not just cheaper
with scoring held flat.

| Drink type | Serve unit | Standards | Cost | Points |
| --- | --- | --- | --- | --- |
| Wine | Glass (~150mL) | 1.5 | 25 | 4 |
| Spirit | Shot | 1.0 | 15 | 3 |
| Mystery Spirit | Shot | 1.0 | 15 | 3 |
| Soju | Shot | 0.5 | 7 | 1 |
| Mystery Cocktail | Shot | 1.0 | 18 | 4 |

Wine's cost carries a volume premium above its linear standards rate
(1.5 standards × 15 = 22.5) — pouring and serving a glass takes more
of the bartender's time than a shot, so 25 rather than 22/23. Points
stay at the linear value (4); only cost gets the premium, same
principle as bundle discounts touching cost and not points.

**Mystery Spirit** is a blind variant of Spirit — same price, same
points, but what's poured is a surprise. **Mystery Cocktail** is a
step up from both: its specific recipe changes every Act, and it
costs and scores slightly more than a standard shot (18 cost / 4
points, instead of the 15/3 base rate) to reflect that premium — not
priced off standards content like everything else in this table.

**Bundles — cost discount AND a points bonus, applied at order time,
not separate catalogue rows.** Buying 5 or 10 in a single order
discounts the total cost (20%/30%) and bumps points above the linear
total (+10%/+15%, rounded up where it doesn't land clean). Mystery
Cocktail's totals are higher than Spirit/Mystery Spirit's only because
its per-unit price and points are higher — the discount and bonus
rates are identical across both:

| Drink type | Qty | Linear cost | Bundle cost | Discount | Linear points | Bundle points | Bonus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Spirit / Mystery Spirit | 5 | 75 | 60 | 20% | 15 | 17 | ~10% |
| Spirit / Mystery Spirit | 10 | 150 | 105 | 30% | 30 | 35 | ~15% |
| Mystery Cocktail | 5 | 90 | 72 | 20% | 20 | 22 | 10% |
| Mystery Cocktail | 10 | 180 | 126 | 30% | 40 | 46 | 15% |

**Soju bottle** — its own named option, not a 5/10 bundle, but the
same cheaper-and-worth-more principle applies. A bottle is 8 shots (4
standards):

| Drink type | Qty | Linear cost | Bottle cost | Discount | Linear points | Bottle points | Bonus |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Soju | 8 (bottle) | 56 | 42 | 25% | 8 | 9 | ~12% |

Wine has no bundle — glass only.

**Implementation note for whoever builds the shop:** the schema has no
bundle/tier-pricing field. Model this as order-time logic — when a
`drink_orders` row's `qty` for one of the bundle-eligible types hits
5, 10, or (for Soju) 8 in a single order, charge the bundle total
instead of `qty × drink_types.cost`. `qty` and `points` stay the real
serving count throughout — the cafeteria iPad and `serves.drink_count`
never need to know a bundle was involved.

**350-standards target, and what it implies for prize money.** The
target is ~350 standards sent across 12 games and 8 teams, excluding
special-event drinks — about 3.6 standards per team per round on
average. At the 15-money/standard base rate, that's roughly **50–55
average money income per team per round** needed to hit the target
naturally. Whoever sets prize money per placing (still open) should
aim for that ballpark, or the economy will land well under or over 350
regardless of how drinks are priced.

## 7. Item shop (placeholders)

These items are **placeholders**. Names, effects and limits will be finalised later. **Pricing model decided:** a single flat price per item, no dynamic scaling — exact values are still TBD.

| Item | Price | Who can buy | Effect | Limit (draft) |
| --- | --- | --- | --- | --- |
| Eye Spy | TBD | Any team | Privately shows a table, round by round since the start of the game, of which team sent drinks to whom and how many | 1 per team per round |
| Reflect | TBD | Any team | All drinks aimed at the buyer this round go back to their senders | 1 per team per night; only 1 Reflect per round across all teams |
| Bus ticket (dropped) | — | Bottom 4 only | Sends one top-team player "on the bus" | 1 per team per night |
| Lock-up (dropped) | — | Bottom 4 only | Sends one top-team player to the holding cell | 1 per team per night |
| Open Bounty | **50** | Any team | Commit to hitting a target this round (quantity + drink-type combo, rotates every Act — see below). Hit it within the round limit for a bonus. Miss it and the cost is still spent. | 1 per team per round; only 1 bounty (Open or Winner's) active per team at a time |
| Winner's Bounty | **50** | **Only the team that just won that round's game** | Same mechanic as Open Bounty, bigger or more varied payout. Unlocked by winning — re-available every time you win again, not a one-off. | 1 per team per round; only 1 bounty active per team at a time |

**Implementation note:** the Spending screen can sell Eye Spy
(placeholder price 40), Reflect (placeholder price 60) and both
Bounties (50 each, see below) — see `src/lib/catalogue.ts`. **Bus
ticket and Lock-up are dropped, not deferred** — decided against
rather than scheduled for later. They stay seeded (`price: null`,
permanently out of the shop UI) only so old events don't reference a
missing row; nothing builds their "on the bus"/holding-cell effects.
Reflect's "only one per round across all teams" rule and its own
"one per night" limit are both enforced in `buyItem`
(`src/app/b/[token]/actions.ts`), not just the `items` table's
per-item limit columns, since neither alone can express the
cross-team constraint. Reflect's redirect effect is wired in at
queue-build time (`buildDrinksQueue`, `src/lib/drinks.ts`): a drink
aimed at whoever played it bounces back to its sender and scores for
the reflector instead.

**Eligibility for Winner's Bounty is per-round, not the leaderboard.**
It's whoever placed 1st in *that round's* game — a different team
each round, potentially, and not necessarily the same team as the
shop's "top team" (the overall leaderboard leader, used for Bus
ticket/Lock-up). A team can be 4th overall and still unlock Winner's
Bounty by winning this round's game, and that unlock doesn't expire —
it comes back every time they win another game.

**Only one active bounty per team, of either kind, at a time.** A
team can't stack an Open Bounty and a Winner's Bounty, or two of the
same kind — buying one locks out buying another (either item greys
out) until the active one resolves (completed or expired).

**Every bounty has a round limit — a deadline to complete it, not
indefinite.** Expiring without completing counts as a miss (cost
spent, no payout), same as failing the target outright.

**Decided (supersedes the Act-rotation draft below): one fixed target
for every bounty, for now.** Acts aren't really built yet — every
round lands in a single Act 1 (see `startRound`,
`src/app/host/[eventId]/game/actions.ts`) — so there's nothing real
for a target to rotate against. Send 5 drinks of any type within
**3 rounds** of buying one (counted when sent, not served — resolves
the moment the deadline round's shop closes, without waiting on
Reflect/penalties to finish resolving in Drinks). Hit it: 100 money
for Open Bounty, 150 for Winner's. Miss it: owe 3 shots of Spirit next
round, via the same penalty-carryover mechanism a missed drinks timer
uses (`penalties.qty`/`drink_type_id`, added in migration `0008`,
override the usual "1 shot of the cheapest drink" default). No reward
choice, no permanent bonus — both pay flat money. Revisit the
Act-based version below once Acts are real.

**Bounty targets rotate every Act** (draft, not built), same idea as
Mystery Cocktail's rotating recipe. Draft targets and Open Bounty's
reward, scaling up as the night goes on to build tension:

| Act | Target | Open Bounty reward |
| --- | --- | --- |
| I | Send 3+ drinks this round, including at least 1 Spirit or Mystery Spirit | +15 points |
| II | Send 5+ drinks this round, including at least 1 Wine | +20 points |
| III | Send 4+ drinks this round, including at least 2 Mystery drinks (Mystery Spirit or Mystery Cocktail, any combination) | +25 points |

If the night runs more than 3 Acts, cycle back to Act I's target.

**Winner's Bounty uses the same per-Act targets but a richer reward —
the buying team picks (or the host assigns) one of three reward
types**, not always the same one:

| Reward type | Example |
| --- | --- |
| Points | A larger flat bonus than Open Bounty's for the same target, e.g. +25/+30/+35 by Act |
| Money | A money payout instead of points, e.g. 40/50/60 by Act |
| Permanent bonus | **+1 point per drink sent for the rest of the night**, stacking if won more than once — a passive multiplier, not a one-time payout |

**Decided and built:** Winner's Bounty's reward *is* the permanent
bonus — not a choice among the three options above, just what hitting
it does. `blocks.bonus_points_per_drink` (migration `0009`) is the
persistent per-team modifier, incremented by 1 on every hit;
`markServed` (`src/lib/drinks.ts`) checks it for every contributing
order's scoring block, multiplied by that order's qty, on top of the
normal bundle-adjusted points. Open Bounty keeps the flat-money
reward instead. No points/money/permanent choice menu was built —
simpler than the three-way draft above, and it's what actually
shipped.

**Implementation note:** built. `items.buyer_rule`'s `'game_winner'`
value (migration `0007`) gates Winner's Bounty to whoever placed 1st
in `game_results` for the round just played
(`isRoundWinner`, `src/lib/bounty.ts`). The one-active-bounty rule and
the round deadline are tracked in a new `bounties` table (migration
`0008`), keyed on the purchase's `item_use_id` and block, storing
`start_round_number`/`deadline_round_number` rather than round ids
(future rounds don't exist yet at purchase time).
`resolveBountiesForRound` runs from `closeShop`
(`src/app/host/[eventId]/game/actions.ts`) and sums `drink_orders.qty`
for the block across that window to decide hit or miss.

- ~~The bottom 4 and the top team are worked out from the live leaderboard when spending opens.~~ Moot now that Bus ticket and Lock-up — the only items that needed a bottom-4/top-team split — are dropped.
- Items that are sold out or used up are greyed out on the team phone.

---

## 8. Game catalogue (placeholders)

This list is a **placeholder**. Formats and rules will be finalised later.

| Game | Format | Group? | Result entered as |
| --- | --- | --- | --- |
| Chinese charades | Team relay | Yes | Placings |
| Chinese dance | All teams | Yes | Host-judged placings |
| Basketball | 1 per team | No | Score or placings |
| Cup shooting | 1 per team | No | Placings |
| Trivia | All teams | Yes | Score per team |
| Cold War drinking | 1 per team | No | Winner |
| Is Jason lying? | 1 per team | No | Correct / wrong per player |
| Dark room cuffs | TBD | TBD | TBD |
| Make Edwin laugh | 1 per team | No | Winner(s) |
| Flip cup | Team relay | Yes | Placings |
| 1 minute chess | Head-to-head | No | Winner per match |
| Lights off you move, lights on you freeze | All players | Yes | Last one standing |

---

## 9. Data model

A transaction log underpins money and points, so any balance can be rebuilt or corrected.

| Entity | Key fields |
| --- | --- |
| Player | id, name, tolerance (from Phase 1), team, status, games played, last game played |
| Team | id, name, colour, icon, QR token, team phone (device id, claimed at), money, points, stars |
| Act | number, name, games |
| Game | id, name, format, is group game, result type |
| Round | number, act, game, phase, participants, placings, pick deadline |
| Drink type | name, points value, cost |
| Drink order | round, sender (team or admin), target team, drink type, qty, status (pending / reflected / served), served at |
| Penalty | round, team, type (e.g. extra shot), reason, applied in round |
| Punishment video | round, team, file, duration, uploaded at, status (pending / shown / removed) |
| Item | name, price, buyer rule, limit per round, limit per night |
| Item use | round, team, item, target, result |
| Transaction | round, team, money change, points change, reason |

---

## 10. Non-functional requirements and scope

- **Online web app** that shares data with Phase 1.
- **Survives a crash:** state autosaves after every action, so a refresh or restart picks up mid-round.
- **Undo:** every host action can be undone or corrected, and is logged.
- **Readable at a distance:** the public display is legible at 1080p on a 24" monitor.
- **Private stays private:** orders and Eye Spy results never appear on public screens.

**MVP (must have for the night)**

- Phase 1 data feeding in, plus Start game
- Tabbed host console and public display
- Team phones: claim by QR (latest scan wins), 1-minute player picks, shop, secret drink orders, video upload
- Cafeteria iPad view with Next and Back
- Drinks queue (fewest first, random tiebreak, admin drinks included), 30-second timer, extra-shot penalty
- Waiting page with looping muted videos and auto-advance
- Money, points (on serve), stars, leaderboard
- Cooldown tracking
- Item shop with placeholder items

**Deferred**

- Holding cell, including late or no-cosplay guests and cell games
- "On the bus", which will be a set of punishments
- Final items, prices and limits
- Game rules and formats
- Party extras: potluck wanted board, and the comedy, trivia and charades segment

---

## 11. Open questions

**Build**

- [ ] How much build time is left, and who is building it? (Stack settled: Next.js 14 and Supabase on Vercel, as in Phase 1.)
- [ ] Player cooldowns conflict with the repo rule "don't add caps, cooldowns or confirmation prompts". Was that rule meant for drinks only?
- [ ] One active team phone (latest scan signs the others out) conflicts with the repo's "multiple devices per block are normal". Which should win?
- [ ] `blocks.captain_participant_id` exists but this design has no captain. Remove it, or leave it unused?
- [ ] Livestream: separate stream on the side, or through OBS?

**Structure**

- [ ] How many Acts and rounds? Does the night end on a set round or at a set time?
- [ ] Final list of host console tabs.
- [ ] Can the host also press Next on the drinks queue, or only the bartender? Only the bartender is recommended, so the two screens can't fall out of step.

**Scoring and economy**

- [ ] Prize money for each placing. **Implementation note:** the Results
      screen pays out a placeholder curve (90, 75, 65, 55, 45, 40, 30, 20
      across 8 placings, repeating the last tier beyond that) in
      `src/lib/economy.ts`, scaled to the section 6a income target —
      swap the array when real numbers are decided.
- [ ] How much money a star is worth.
- [ ] What earns bonus money (best cosplay, host's pick, other). The
      Results screen takes a free-form bonus amount and note per block
      in the meantime, so the host can award it ad hoc.

**Penalties**

- [ ] Besides the extra shot for not finishing in 30 seconds, what other penalties can the admin apply, what do they do, and is there a limit?
      **Implementation note:** the missed-time extra shot is built —
      missing the 30 seconds without the host marking a team done
      auto-writes the penalty on the next page load (same lazy-check
      pattern as the pick deadline), and the next round's queue build
      turns it into a drink order. What drink type a penalty shot
      pours was never decided here either, so it defaults to the
      event's cheapest drink type (`src/lib/drinks.ts`) rather than
      guessing a name.

### Resolved

| Question | Decision |
| --- | --- |
| Who acts for a team? | No captain. The latest device to scan the team QR is the team phone. |
| QR hand-out | Printed cards. A leaked code is reissued on the host console. |
| Drink targeting | Teams only. The team decides who drinks. |
| Where drinks happen | At the bar with the bartender, 30 seconds per team, filmed on the team phone |
| Timer start | When the bartender serves the team |
| Not finishing in time | An extra shot next round |
| When a team is "finished" | Its timer ends, or the host marks it done |
| After drinks | Auto-advance to the next game |
| Videos after the party | Kept |
| Does the bartender wait for videos? | No |
| Show-senders toggle | Resets to hidden for each order |
| Drink caps and water swaps | Team judgement, with water swaps at the counter |
| Admin-assigned drinks | Go into the same queue as team orders |
| "Drinks required per team" | The number of drinks a team must drink |
| Pick timeout | The app auto-picks, favouring whoever has played the fewest games |
| Eye Spy | A round-by-round table, from the start of the game, of who sent drinks to whom and how many |
| Sending a drink costs money? | Yes |
| Points awarded | On serve |
| Reflected drinks score for | The team that played Reflect |
| Queue tiebreak | Random |
| Overall winner | Most points, calculated by the system |
| Sender visibility | Shown to every team by default, for now — not hidden |
| Item pricing model | A single flat price per item; exact values still TBD |
| Drink types, points and cost | Wine, Spirit, Mystery Spirit, Soju, Mystery Cocktail. See section 6a, "Drink catalogue". |
| Guests, teams, players, tolerance | All from Phase 1 |
| Wi-Fi | Works |
| Hosting | Online web app |
| Source of truth | This document. It replaces the Phase 2 design in the repo's `CLAUDE.md` and `docs/schema.md` (Days, sentence and commissary, substitutes). |
| Stack | Next.js 14 and Supabase on Vercel, as in Phase 1 |

---

## 12. User workflows

What each person does, start to finish. Steps marked *(every round)* repeat until the night ends.

### Guest (their own phone, Phase 1)

```mermaid
flowchart TD
  G1[Open the signup link] --> G2[Enter name and tolerance]
  G2 --> G3[Join the party and RSVP]
  G3 --> G4[Mugshot and potluck]
  G4 --> G5[Check in at the door]
  G5 --> G6[Placed on a team by the draw]
  G6 --> G7["Play when picked (every round)"]
  G7 --> G8["Drink at the bar with the team (every round)"]
  G8 -->|next round| G7
```

### Host (laptop, tabbed console)

```mermaid
flowchart TD
  H1[Create the party] --> H2[Run check-in and the draw]
  H2 --> H3[Print the team QR cards]
  H3 --> H4[Press Start game]
  H4 --> H5["Pick the game, start the timer (every round)"]
  H5 --> H6[Enter placings and bonus money]
  H6 --> H7[Open, then close the shop]
  H7 --> H8[Start drinks: app builds the queue]
  H8 -->|auto-advance when every team is done| H5
  H8 -->|last round| H9[Confirm the winner]
```

Any time: add admin drinks, adjust balances, mark a team done, reissue a leaked QR code.

### Team phone (whoever last scanned the team's QR)

```mermaid
flowchart TD
  T1[Scan the team QR card: latest scan takes over] --> T2["Pick players within 1 minute (every round)"]
  T2 --> T3[See balance after results]
  T3 --> T4[Shop: buy items, send drinks in secret]
  T4 --> T5[Called up to the bar]
  T5 --> T6[Film the team drinking: 30-second countdown]
  T6 --> T7[Press Punishment complete: clip uploads]
  T7 -->|next round| T2
```

### Bartender (cafeteria iPad)

```mermaid
flowchart TD
  B1[Open the cafeteria view with its own code] --> B2["See the next team's order (every drinks phase)"]
  B2 --> B3[Pour ahead from Up next]
  B3 --> B4[Serve and press Next: starts that team's 30 seconds]
  B4 -->|more teams in the queue| B2
  B4 -->|queue done| B5[Wait for the next drinks phase]
  B5 --> B2
```

Back undoes a mistaken Next.

### Public display (TV and 2 monitors)

```mermaid
flowchart TD
  P1["Game, timer, livestream (every round)"] --> P2[All picks revealed at once]
  P2 --> P3[Results and leaderboard]
  P3 --> P4[Shop open, cooldown list]
  P4 --> P5[Waiting page: team video grid, calls each team to the bar]
  P5 -->|every team finished| P1
```

### Drinks phase hand-offs

The one place everyone hands off to each other. Only the host and the bartender press anything to move the night on; the public display reacts on its own.

```mermaid
sequenceDiagram
  participant H as Host
  participant B as Bartender
  participant T as Team phone
  participant D as Public display
  H->>D: Start drinks (queue built, waiting page shows a tile per team)
  loop For each team, fewest drinks first
    B->>T: Serve, press Next (points recorded, filming prompt opens)
    B->>D: Calls the team, shows the 30-second countdown
    T->>D: Upload clip (loops muted on the team's tile)
    Note over B: Moves to the next team without waiting for clips
  end
  D->>D: Every team finished (timer ended or host marked done)
  D->>H: Auto-advance to the next game
```

Each team's 30 seconds starts when the bartender presses Next, not when filming starts. A team that doesn't finish in time gets an extra shot next round.
