# 🔒 Shifty Shen Slammer

A jailhouse-themed party game web app for a birthday night. Everyone plays from their phone, the host runs things from the **Warden** console, and a **TV** screen shows the standings.

It mixes three things:

- **Survivor-style blocks.** Guests are split into teams of 4–5 called *Block A, Block B…*. The Warden runs games and pays winning blocks in commissary credits.
- **Prison commissary.** Each block spends its shared budget on mixers, drinks for other blocks, punishments, bail bonds and contraband.
- **Snitches (mafia-style).** About half the blocks secretly have a snitch. Blocks vote to kick suspects out. Get it wrong and an innocent cellmate ends up in the Holding Cell.

Plus two places nobody wants to be:

- **🕳️ Holding Cell:** late arrivals and anyone kicked off a block. No commissary account, extra penalty drinks every round, tougher rules each game, and any block can punish them (they can't deflect). **Goal: get onto a block**, either bailed out by a block (🔑 Bail Bond) or paroled by the Warden.
- **🔒 Solitary:** a timed sentence (in rounds) for rule-breakers, caught snitches and anonymous tip-offs. More penalty drinks, the toughest rules, no shopping, no voting. When the sentence is up they go back to their block, or to the Holding Cell if they were kicked out.

> **House rules:** every drink can be swapped for a water or a sip, no questions asked. This line shows next to every drink owed and can be edited by the Warden.

## Screens

| URL       | Who         | What                                                                                         |
| --------- | ----------- | -------------------------------------------------------------------------------------------- |
| `/`       | Guests      | Book in with a name and play all night (the phone remembers you)                             |
| `/warden` | Host/admins | PIN-protected control room                                                                   |
| `/tv`     | Projector   | Standings, current game and its lockup rules, Holding/Solitary with drinks owed, block-vote progress, gossip feed, QR code to join |

### Player tabs

- **Yard**: the game that's on now (including its extra Holding/Solitary rules), the schedule and the gossip feed. Holding and Solitary inmates see their standing rules at the top.
- **Commissary**: spend your block's credits.
- **My Block / Holding / Solitary**: the tab changes with where you are. It shows your budget, blockmates, contraband stash, wiretap results, who's in Holding (people you could bail), and your block's orders.
- **Rap Sheet**: your mugshot (inmate #, a random charge) and your secret role (tap to reveal). Lights Out picks and block votes happen here.
- **Board**: standings, the full roster and the 🍺 drink tab.

A **🍺 drinks owed** card appears on every tab whenever you owe penalty drinks. Tap *Drank one ✅* as you pay them off. It's the honor system, but the whole room can see the tab on the TV.

### How the commissary works

| Type            | What happens                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| For your block  | Goes into the Warden's queue to deliver (mixers, ice, etc.)                                                                                                   |
| Send a drink    | A gift for another block or the Holding Cell, delivered by the Warden                                                                                         |
| Punishment      | The target block gets a pulsing alert: **Take it** or **🔄 Deflect**. A deflect bounces it back to the sender, who can deflect again. The **Holding Cell can't deflect**, so it lands immediately. Penalty drinks (e.g. Shot Penalty = 1 each) go straight onto the drink tab, and credit drains (Shakedown −15) are charged automatically. The rest goes to the Warden to enforce. |
| Bail bond       | 🔑 Pull a specific inmate out of the Holding Cell onto your block (blocks max out at 5, which is configurable)                                                 |
| Deflect card    | Into your block's stash. Other blocks only see "a suspicious purchase".                                                                                       |
| Vote immunity   | 💵 Bribe the Guard. During a block vote, use it on a blockmate and votes against them don't count.                                                            |
| Intel           | 📡 Wiretap. Tells your block whether it has a hidden snitch right now (not who). Careful: the snitch sees the result too.                                     |

The Warden can add, edit, hide, price and stock-limit any item, and can refund any order.

### Rounds

**Finishing a game** in the Warden console pays out credits and counts as a round:

- everyone in the Holding Cell owes `+1` drink, and everyone in Solitary owes `+2` (both configurable),
- solitary sentences tick down by one, and anyone whose time is up walks out.

Each game can also carry its own extra rule for Holding and for Solitary (e.g. "flip with your off hand" or "full cup every flip"). There's also an "End round now" button if you want penalties without a game.

### Snitches

1. **🐀 Plant snitches** (Warden → Snitches). Each block independently gets one hidden snitch with the chance you set (default 50%), so some blocks have one and some don't. "At least one overall" is on by default.
2. **🌙 Lights Out.** *Everyone* picks a name on their phone, so you can't spot a snitch by who's tapping. Snitch picks are tip-offs. Everyone else's picks are anonymous suspicions.
3. **☀️ Lights On.** Each snitch's target goes to solitary for 1 round ("an anonymous tip"). The feed whispers who was most suspected.
4. **🗳️ Block Votes.** Each block votes only on its own members, and a **majority of the block** is needed to kick someone.
   - Kicked the snitch: the block gets **+25**. The snitch is exposed, serves 1 round in solitary, then goes to the Holding Cell.
   - Kicked an innocent: the block pays **−10**, and the innocent goes to the Holding Cell, where they have to earn their way back.
5. **🎭 Reveal** at the end of the night unmasks every snitch who got away with it. If every snitch is caught earlier, the game ends with the blocks winning.

All the numbers (chance, bounty, fine and sentence lengths) are editable in the Warden console.

## Running it

Requires Node 18+.

```bash
npm install
ADMIN_PIN=4321 npm start      # default PIN is 1234
```

Open `http://localhost:3000/warden` and log in. Then:

1. Put `/tv` on the TV. Guests scan the QR code and book in. Everyone starts in the Holding Cell.
2. **🔐 Blocks**: "Build blocks from Holding" splits everyone into Block A, B, C… of up to 5. Late arrivals stay in Holding until a block bails them out or you parole them with the dropdown.
3. **🐀 Snitches**: plant snitches.
4. **🏁 Games**: add the schedule (with optional Holding/Solitary rules), hit ▶ Go live, then 🏆 Finish & pay out after each one.
5. **🧾 Orders**: your bartender queue. Tap Delivered / Enforced as you go.
6. **⛓️ Lockup**: throw rule-breakers into solitary, release people, fix the drink tab, and edit the standing rules.

Environment variables:

| Var         | Default             | Notes                                                    |
| ----------- | ------------------- | -------------------------------------------------------- |
| `PORT`      | `3000`              |                                                          |
| `ADMIN_PIN` | `1234`              | **Change this** before the party                         |
| `DATA_FILE` | `data/state.json`   | All game state is saved here and survives restarts        |

To start fresh, stop the server and delete `data/state.json`.

### Hosting for the party

Everyone's phone needs to reach the server. Options, easiest first:

- **Same Wi-Fi**: run it on a laptop at the party and share `http://<laptop-ip>:3000`. The TV QR code uses whatever address the TV opened, so open `/tv` via the IP, not `localhost`.
- **Tunnel**: `npx cloudflared tunnel --url http://localhost:3000` (or ngrok) gives you a public https URL that works on cellular too.
- **Cloud**: any Node host that supports WebSockets (Render, Railway, Fly.io). Start command is `npm start`. Set `ADMIN_PIN`. Without a persistent disk, state resets on redeploy, which is fine for one night.

## Development

```bash
npm run dev   # restarts on file changes
npm test      # rules engine tests (node:test)
```

- `lib/game.js`: all game rules and per-viewer views. Players never receive other players' secret roles, other blocks' stash or wiretap results, or login tokens.
- `server.js`: Express + Socket.io. Every mutation is saved and pushes fresh state to every connected screen.
- `public/`: a single-page client in vanilla JS (no build step).
