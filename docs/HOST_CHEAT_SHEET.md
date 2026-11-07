# Shifty Shen's Slammer — Host Cheat Sheet

_Exported from the shared doc on 2026-10-26. Edit the shared doc first, then re-export._

Two hosts run the night with identical powers: the Warden and the Commissary Officer. Only hosts create or remove credits and move people between blocks and the Holding Cell.

## Logins and screens

| Screen | Address | Who | Notes |
| --- | --- | --- | --- |
| Guest app | `/` | Everyone | Book in with a name; the phone remembers them |
| Warden console | `/warden` | Host | PIN 1234 by default (set `WARDEN_PIN`) |
| Commissary Officer console | `/officer` | Host | PIN 5678 by default (set `OFFICER_PIN`) |
| TV | `/tv` | The room | Standings, game rules, lockup, feed, join QR code |

Either PIN works on either page; the PIN decides your title, which only changes how the feed names you. The two PINs must be different. Open the TV using the same address guests will use (the laptop's IP or a tunnel URL, not `localhost`), or the QR code points nowhere.

## Before guests arrive

- [ ] Pick hosting: a laptop on the party Wi-Fi, a tunnel (`npx cloudflared tunnel --url http://localhost:3000`), or a cloud host
- [ ] Set `WARDEN_PIN` and `OFFICER_PIN`, then `npm start`
- [ ] Put `/tv` on the TV; both hosts log in on their phones
- [ ] Games tab: add every game with its How to play text and an optional Holding Cell rule
- [ ] Commissary tab: hide anything you can't actually serve, adjust prices, set stock limits
- [ ] Settings tab: party name, tagline, starting cash, max block size, who can spend (block decides by default)
- [ ] Lockup tab: check the Holding Cell rules and drinks per round
- [ ] Stock the real bar: mixers, ice, shot glasses, plenty of water
- [ ] Test with 3 or 4 phones, then wipe it: Settings tab, Fresh start (type RESET)

## Run of show

About 3 hours for 5 games.

| # | Stage | Host does | Tab |
| --- | --- | --- | --- |
| 1 | Arrival (30 min) | Guests scan and book in; announce the house rules | TV, Settings |
| 2 | Blocks | Build blocks from Holding; make a Shot Caller per block so blocks can name themselves and approve spending | Blocks |
| 3 | Game 1 | Go live, play, finish and pay out | Games |
| 4 | Game 2 | Game loop | Games |
| 5 | Game 3 | Game loop | Games |
| 6 | Game 4 | Game loop | Games |
| 7 | Game 5 | Game loop | Games |
| 8 | Finale | Crown the top block | TV |

Flip acts along the way: Act II after game 2, Act III after game 4, Act IV before the last game.

## The four acts (off by default)

Tonight runs one look all night with no acts: skip this section unless someone switches Settings → Act lineup back to a four-act lineup. If an older save still shows an act bar with a Next button, set Act lineup to "One look all night (no acts)".

The act bar at the top of your console shows the current act. Tap **Next** to move everyone on; phones and the TV switch over and every phone gets a briefing. Plan on about two games per act.

The default lineup is **The Long Night**: I · Booking Day (Cell Tosses, soups as money), II · Arkham Asylum (Joker's Wild draws, Riddler's riddles, patron villains), III · The Heist (heist roles, the printing press, streaks) and IV · The Great Escape. Phones stay upright all night. To run the GTA / Genshin / TFT / Among Us lineup instead, pick it under Settings → Act lineup; the table below describes it.

| Act | Turn it on | What changes |
| --- | --- | --- |
| I · Vice City (GTA) | It's on from the start | Stick-Ups in the shop (rob 10 from a block), wanted levels |
| II · Wish Upon Teyvat (Genshin) | After about 2 games | Phones go landscape on the Paimon Menu. Wish ×1 / ×10 (guaranteed 5★ every 8th); four Daily Commissions each for Primogems and Adventure Rank; Vision resonance pays extra. Tell everyone to turn their phones sideways. |
| III · Convergence (TFT) | After about 4 games | Blocks pick an augment; interest after each game; streak gold after each heat |
| IV · Emergency Meeting (Among Us) | Before the last game | A new look for the final act |

- Each act changes guests' phones into that game's interface: Act I a GTA smartphone (upright), Act II the Genshin Paimon Menu, Act III the League client and Act IV the Among Us lobby (all three sideways). Tell the room to rotate their phones when you flip to Acts II–IV.
- Shot Cam: blocks film their shots from the app and the clips rotate on the TV. Check the 🎥 Clips tab now and then; hide anything that shouldn't be on the big screen, or tick "A host okays each clip" to approve them first.
- Flipping an act plays a ~25-second intro trailer on the TV. Replay it with **📺 Play intro on TV**; swap in your own video per act in Settings. Tap the TV once when you set it up so the intros have sound.
- Go back with ◀ if you flipped too early. Augments picked in Act III stay picked.
- Warp odds and pity live in Settings. Limit any shop item to one act in the Commissary tab.
- In Act III, remind Shot Callers to pick their augment (it's at the top of their Now tab).

## Before guests arrive: block phones

1. 🔐 Blocks → **Add guests**: paste everyone's names, one per line. Then **Build blocks**.
2. **🖨 Print block cards** (QR + 4-letter code per block) and hand one to each block. Never put a code on the TV.
3. Each block scans its card on one phone. Latest scan wins; if a card leaks, tap **New code**.

## Host-run vs app-run games

In 🏁 Games, set **Run by** on each game. Host-run: you enter placings after the game. App-run (Cold War drinking, Trivia, Is Jason lying?, Anime opening guessing): the block phones play and the app places the blocks and pays prizes when you tap **Finish**. For Trivia, type the questions on the game first (`Question | a | b | c | d | right letter`); for Is Jason lying?, set how many stories; for Anime openings, type one per line as `Label | anime | other spellings`, tap ▶ Play opening, play the song, and the first block to type it right scores (or tap Give it to… / Nobody got it). During an app-run game the Round tab shows its controls: Reveal now (Cold War), Next question / Reveal (Trivia), Open the vote / It was the TRUTH / It was a LIE (Is Jason lying?). **Enter results by hand instead** is always there if something goes wrong.

## Every round (🎲 Round tab)

The night is **4 acts × 3 rounds**: Act 1 · Round 1, Act 1 · Round 2, Act 1 · Final round, then Act 2, and so on. Put the 12 games in the 🏁 Games tab in the order you want to play them: the first three are Act 1. The Round tab shows the whole plan and pre-selects the next game.

1. **Start round:** pick the game. Players per block is set on each game in the Games tab (0 = group game). Phones get 60 seconds to lock in their players; the briefing pops up too.
2. **Explain it out loud** while blocks pick. **Reveal now** auto-picks for any block that's dawdling.
3. **Play the game,** then tap **Game's over: enter results.**
4. **Results:** ranking and reward are separate. Set each block's **place** (1st unlocks the Winner's Bounty); its **reward** fills in with that place's prize ($44 / 36 / 30 / 25 / 21 / 18 / 15 / 11). Lower a reward to award less (0 pays nothing), then **Pay rewards and open the shop.** App-run games fill in the places for you and wait here, so you can check the rewards before paying.
5. **Spending:** power-ups bought now (Reflect, Eye Spy, bounties) start next round; the Round tab shows who has Reflect lined up. Give blocks a minute or two to send drinks and buy items. Then **Close shop and start drinks.**
**Standings:** you see live points; the TV and blocks see them as of the last act's end (a block always sees its own live).

**Pace:** the Round tab shows standard drinks sent against the 400 target and where the night is heading. Running hot: lower the prizes on Results or the income step in Setup.

6. **The bar:** tap **Next** to call the next block (fewest drinks first). Pour what the panel says. Tap **Done in time ✓** if they finish inside 30 seconds: that pays their drink income, $5 more than last time (the button shows the amount). If the clock runs out they owe an extra shot next round and their income drops back to $0, automatically. **Back** undoes a Next pressed by mistake. The round ends when every block is done.

The night ends itself: when the last act's final round finishes, the block with the most points is crowned on every screen.

## Calls you make

| Situation | Tab | Do |
| --- | --- | --- |
| A drink or mixer was ordered | Orders | Make it, deliver it, tap Delivered |
| A block took a punishment | Orders | Make sure it happens, tap Enforced |
| A block is stalling on a punishment | Orders | Force it |
| An order you can't fill | Orders | Refund |
| Close or open the shop | Act bar | 🔒 Close shop / 🛒 Open shop. Every phone and the TV show COMMISSARY CLOSED; buying and request approvals are refused |
| A point is wrong | Payouts | +1 pt / −1 pt, or Correct points with a reason. Refunding a sent drink in Orders takes its point back on its own |
| Bonus or fine | Payouts | +1 / +5 / +10 / +25, or a custom amount with a reason (it shows in the feed) |
| Someone deserves a shot or a dare | Punish / Lockup | Hand out a punishment: one inmate, a block, Holding or everyone; drinks, a written punishment, or both |
| Someone earns their way out of Holding | Blocks or Punish / Lockup | Pick their block in the dropdown |
| The drink tab is wrong | Punish / Lockup | Drink +1 or -1 for that person |
| Everyone needs to hear something | Settings | PA announcement: shows on every phone and the TV |

Nobody else can change credits, so every dispute ends with you.

## Default numbers

| Setting | Default | Tab |
| --- | --- | --- |
| Starting cash per block | $40 | Setup |
| Game prizes by place | $44 / 36 / 30 / 25 / 21 / 18 / 15 / 11 | Setup |
| Drink income step | +$5 a round | Setup |
| Bounty stake | 5–30 points; Open pays ×3, Winner's ×5 | Setup |
| Standard drinks target | 400 | Setup |
| Max inmates per block | 5 | Settings |
| Who can spend | Block decides (Shot Caller approves or blockmates second) | Settings |
| Seconds needed | 2 | Settings |
| Holding Cell drinks per round | 1 | Lockup |

## When things go wrong

| Problem | Fix |
| --- | --- |
| A guest's phone forgot them (new phone, cleared browser) | Blocks tab: remove their old entry, have them book in again, put them back on their block |
| "Someone is already booked under that name" | Add a last initial |
| Phones show "Lost signal" | Check the Wi-Fi or tunnel and that the server is running; phones reconnect on their own |
| The TV's QR code doesn't work | Reopen `/tv` using the laptop's IP or the tunnel URL |
| A host got logged out | Re-enter the PIN |
| Remove test or duplicate inmates | Blocks tab: tick them, then Remove selected (their phones get logged out) |
| Need a clean slate | Settings tab: Fresh start (type RESET). Keeps games, shop, settings and host logins |

## Still to decide

- [x] **How the winning block is chosen.** Most points wins. Points come from drinks sent: Spirit 3, Mystery Spirit 3, Soju 1, Wine 4, Mystery Cocktail 4 each, more for 5/10 deals and the Soju bottle. A Shot Penalty scores 1. Ties fall back to credits earned. Drink orders land in the Orders tab as one line per order ("5× Spirit, Block A → Block B"); pour them for that block and tap Delivered.
- [ ] **The top block's prize.**
- [ ] **A Holding Cell way out besides bail.** For example, a parole mini-challenge where the winner gets placed on a block by a host.
