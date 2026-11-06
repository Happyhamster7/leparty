# Shifty Shen Slammer — Host Cheat Sheet

_Exported from the shared doc on 2026-10-26. Edit the shared doc first, then re-export._

Two hosts run the night with identical powers: the Warden and the Commissary Officer. Only hosts create or remove credits, approve sabotage, and move people between blocks, the Holding Cell and Solitary.

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
- [ ] Games tab: add every game with its How to play text, Holding and Solitary rules, and an optional custom sabotage
- [ ] Commissary tab: hide anything you can't actually serve, adjust prices, set stock limits
- [ ] Settings tab: party name, tagline, starting credits, max block size, who can spend (block decides by default)
- [ ] Lockup tab: check the Holding and Solitary rules and drinks per round
- [ ] Sabotage tab: check the sabotage list and the survivor prize
- [ ] Stock the real bar: mixers, ice, shot glasses, plenty of water
- [ ] Test with 3 or 4 phones, then wipe it: Settings tab, Fresh start (type RESET)

## Run of show

About 3 hours for 5 games. Snitch phases go every other game so Solitary doesn't fill up.

| # | Stage | Host does | Tab |
| --- | --- | --- | --- |
| 1 | Arrival (30 min) | Guests scan and book in; announce the house rules | TV, Settings |
| 2 | Blocks | Build blocks from Holding; make a Shot Caller per block so blocks can name themselves and approve spending | Blocks |
| 3 | Snitches | Plant snitches; tell everyone to check their Rap Sheet privately | Snitches |
| 4 | Game 1 | Go live, play, finish and pay out | Games |
| 5 | Game 2 + Lights Out | Game loop, then Lights Out and Lights On | Games, Snitches |
| 6 | Game 3 + Block Vote | Game loop, then open and close Block Votes | Games, Snitches |
| 7 | Game 4 + Lights Out | Game loop, then Lights Out and Lights On | Games, Snitches |
| 8 | Game 5 + Block Vote | Game loop, then Block Votes | Games, Snitches |
| 9 | Finale | Reveal all snitches; survivors hand out drinks; crown the top block | Snitches, TV |

Flip acts along the way: Act II after game 2, Act III after game 4, Act IV before the last Block Vote.

## The four acts (off by default)

Tonight runs one look all night with no acts: skip this section unless someone switches Settings → Act lineup back to a four-act lineup. If an older save still shows an act bar with a Next button, set Act lineup to "One look all night (no acts)".

The act bar at the top of your console shows the current act. Tap **Next** to move everyone on; phones and the TV switch over and every phone gets a briefing. Plan on about two games per act.

The default lineup is **The Long Night**: I · Booking Day (Cell Tosses, soups as money), II · Arkham Asylum (Joker's Wild draws, Riddler's riddles, patron villains), III · The Heist (heist roles, the printing press, streaks) and IV · The Great Escape (rats, Lockdowns, double stakes). Phones stay upright all night. To run the GTA / Genshin / TFT / Among Us lineup instead, pick it under Settings → Act lineup; the table below describes it.

| Act | Turn it on | What changes |
| --- | --- | --- |
| I · Vice City (GTA) | It's on from the start | Stick-Ups in the shop (rob 10 from a block), wanted levels |
| II · Wish Upon Teyvat (Genshin) | After about 2 games | Phones go landscape on the Paimon Menu. Wish ×1 / ×10 (guaranteed 5★ every 8th); four Daily Commissions each for Primogems and Adventure Rank; Vision resonance pays extra. Tell everyone to turn their phones sideways. |
| III · Convergence (TFT) | After about 4 games | Blocks pick an augment; interest after each game; streak gold after each heat |
| IV · Emergency Meeting (Among Us) | Before the last Block Vote | Sabotage skims and snitch bounties double; meetings and ejections take over every screen |

- Each act changes guests' phones into that game's interface: Act I a GTA smartphone (upright), Act II the Genshin Paimon Menu, Act III the League client and Act IV the Among Us lobby (all three sideways). Tell the room to rotate their phones when you flip to Acts II–IV.
- Shot Cam: blocks film their shots from the app and the clips rotate on the TV. Check the 🎥 Clips tab now and then; hide anything that shouldn't be on the big screen, or tick "A host okays each clip" to approve them first.
- Flipping an act plays a ~25-second intro trailer on the TV. Replay it with **📺 Play intro on TV**; swap in your own video per act in Settings. Tap the TV once when you set it up so the intros have sound.
- Go back with ◀ if you flipped too early. Augments picked in Act III stay picked.
- Warp odds and pity live in Settings. Limit any shop item to one act in the Commissary tab.
- In Act III, remind Shot Callers to pick their augment (it's at the top of their Now tab).

## Every game

1. **Games tab, set matchups.** Tap **Pairs** (or Threes, Fours, All blocks). A leftover block joins the last heat, so nobody plays alone. Use **Custom heat** for a final between winners.
2. **Start heat 1.** The game goes live: the briefing pops up on every phone, the TV shows the rules and who's playing, and each hidden snitch gets a sabotage in their Classified box. Phones show "You're up," "Up next" or "Sitting this one out."
3. **Explain it out loud** while people read. Point out the Holding and Solitary rules for this game.
4. **During play:** one host referees; the other works the Orders tab (deliver drinks, enforce punishments) and the Sabotage tab (judge claims).
5. **Score heat** after each heat (for example 30 / 10), then **Start heat** on the next one.
6. **Finish and pay out** once the last heat is scored. Heat credits are already paid, so add only bonuses. Leave "Apply round penalties" ticked: Holding owes 1 drink, Solitary 2, and sentences drop by one.
7. **Snitch phase** if it's due (see Running the snitch game).

No heats set? Everyone plays at once and you pay out in Finish and pay out, as before.

## Calls you make

| Situation | Tab | Do |
| --- | --- | --- |
| Snitch claims a sabotage | Sabotage | Approve only if they really did it without being obvious; Reject hands the orders back |
| An approved sabotage was wrong | Sabotage | Void: refunds the block |
| A drink or mixer was ordered | Orders | Make it, deliver it, tap Delivered |
| A block took a punishment | Orders | Make sure it happens, tap Enforced |
| A block is stalling on a punishment | Orders | Force it |
| An order you can't fill | Orders | Refund |
| Close or open the shop | Act bar | 🔒 Close shop / 🛒 Open shop. Every phone and the TV show COMMISSARY CLOSED; buying and request approvals are refused |
| A point is wrong | Payouts | +1 pt / −1 pt, or Correct points with a reason. Refunding a sent drink in Orders takes its point back on its own |
| Bonus or fine | Payouts | +1 / +5 / +10 / +25, or a custom amount with a reason (it shows in the feed) |
| Someone deserves a shot or a dare | Punish / Lockup | Hand out a punishment: one inmate, a block, Holding, Solitary or everyone; drinks, a written punishment, or both |
| Someone breaks a rule | Punish / Lockup | Send to solitary: person, rounds, reason |
| Solitary is overcrowded | Punish / Lockup | Release |
| Someone earns their way out of Holding | Blocks or Punish / Lockup | Pick their block in the dropdown |
| The drink tab is wrong | Punish / Lockup | Drink +1 or -1 for that person |
| Everyone needs to hear something | Settings | PA announcement: shows on every phone and the TV |

Nobody else can change credits, so every dispute ends with you.

## Running the snitch game

The Snitches tab shows every secret role, so keep your screen away from guests.

1. **Plant snitches** once blocks are built. Each block gets one with a 50% chance; "at least one overall" is on. Planting again wipes every role.
2. **Lights Out.** Tell everyone to pick a name on their Rap Sheet. You see snitch tips and suspicions arrive live. Give it about a minute.
3. **Lights On.** Each tipped player goes to Solitary for 1 round. The feed whispers the most suspected names.
4. **Open Block Votes.** Each block votes on its own members. The tab shows votes per block and the majority line. Bribed players show a shield.
5. **Close block votes.** Majority kicks are applied: catching a snitch pays +25 plus whatever they skimmed; kicking an innocent costs 10 and sends them to Holding.
6. **Reveal all snitches** at the finale. Uncaught snitches get 3 drinks plus 1 per approved sabotage to hand out from their phones. Read out their prize.

If every snitch gets caught early, the snitch game ends itself and the blocks win.

## Default numbers

| Setting | Default | Tab |
| --- | --- | --- |
| Starting credits per block | 20 | Settings |
| Max inmates per block | 5 | Settings |
| Who can spend | Block decides (Shot Caller approves or blockmates second) | Settings |
| Seconds needed | 2 | Settings |
| Holding Cell drinks per round | 1 | Lockup |
| Solitary drinks per round | 2 | Lockup |
| Snitch chance per block | 50% | Snitches |
| Bounty for catching a snitch | 25 | Snitches |
| Fine for kicking an innocent | 10 | Snitches |
| Solitary from a tip | 1 round | Snitches |
| Solitary for a caught snitch | 1 round | Snitches |
| Credits skimmed per sabotage | 5 | Sabotage |
| Survivor drinks to hand out | 3 + 1 per sabotage | Sabotage |

## When things go wrong

| Problem | Fix |
| --- | --- |
| A guest's phone forgot them (new phone, cleared browser) | Blocks tab: remove their old entry, have them book in again, put them back on their block; reset their role in the Snitches tab if they were a snitch |
| "Someone is already booked under that name" | Add a last initial |
| Phones show "Lost signal" | Check the Wi-Fi or tunnel and that the server is running; phones reconnect on their own |
| The TV's QR code doesn't work | Reopen `/tv` using the laptop's IP or the tunnel URL |
| A host got logged out | Re-enter the PIN |
| Remove test or duplicate inmates | Blocks tab: tick them, then Remove selected (their phones get logged out) |
| Need a clean slate | Settings tab: Fresh start (type RESET). Keeps games, shop, settings and host logins |

## Still to decide

- [x] **How the winning block is chosen.** Most points wins. A block gets +1 point every time it sends a drink (gifts, and punishments with penalty drinks), whatever it cost. Ties fall back to credits earned.
- [ ] **The top block's prize.** Surviving snitches have one; the winning block doesn't yet.
- [ ] **The survivor prize wording.** Default: "A drink on the birthday inmate + eternal bragging rights."
- [ ] **A Holding Cell way out besides bail.** For example, a parole mini-challenge where the winner gets placed on a block by a host.
