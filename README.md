# 🔒 Shifty Shen Slammer

A jailhouse-themed party game web app for a birthday night. Everyone plays from their phone. Two hosts, the **Warden** and the **Commissary Officer**, run the night from their consoles, and a **TV** screen shows the standings.

It mixes three things:

- **Survivor-style blocks.** Guests are split into teams of 4–5 called *Block A, Block B…*. The Warden runs games and pays winning blocks in commissary credits.
- **Prison commissary.** Each block spends its shared budget on mixers, drinks for other blocks, punishments, bail bonds and contraband.
- **Snitches (mafia-style).** About half the blocks secretly have a snitch. Blocks vote to kick suspects out. Get it wrong and an innocent cellmate ends up in the Holding Cell.

Plus two places nobody wants to be:

- **🕳️ Holding Cell:** late arrivals and anyone kicked off a block. No commissary account, extra penalty drinks every round, tougher rules each game, and any block can punish them (they can't deflect). **Goal: get onto a block**, either bailed out by a block (🔑 Bail Bond) or paroled by the Warden.
- **🔒 Solitary:** a timed sentence (in rounds) for rule-breakers, caught snitches and anonymous tip-offs. More penalty drinks, the toughest rules, no shopping, no voting. When the sentence is up they go back to their block, or to the Holding Cell if they were kicked out.

> **House rules:** every drink can be swapped for a water or a sip, no questions asked. This line shows next to every drink owed and can be edited by the Warden.

## Hosts

There are two hosts: the **Warden** and the **Commissary Officer**. They have **identical powers**, and the title is purely for show: it changes the console header and how they're named in the feed ("The Commissary Officer paid Block A 10 credits"). Each logs in with their own PIN.

**Only hosts can give or take credits**, through payouts, fines, game results and refunds. Hosts also **judge every task**: a player tapping Done only files a claim, and nothing happens until a host approves it (📋 Tasks tab). Rejecting a claim hands the task back so the player can try again. Approved claims can be voided later, which undoes their effect.

Players still spend their block's credits at the commissary themselves, and track their own penalty drinks on the honor system. Hosts can correct the drink tab at any time.

## Screens

| URL       | Who         | What                                                                                         |
| --------- | ----------- | -------------------------------------------------------------------------------------------- |
| `/`       | Guests      | Book in with a name and play all night (the phone remembers you)                             |
| `/warden` | Warden      | Host console (Warden PIN)                                                                    |
| `/officer`| Commissary Officer | Host console (Officer PIN)                                                            |
| `/tv`     | Projector   | Standings, current game and its lockup rules, Holding/Solitary with drinks owed, block-vote progress, gossip feed, QR code to join |

### Player tabs

- **Yard**: the game that's on now (including its extra Holding/Solitary rules), the schedule and the gossip feed. Holding and Solitary inmates see their standing rules at the top.
- **Commissary**: spend your block's credits.
- **My Block / Holding / Solitary**: the tab changes with where you are. It shows your budget, blockmates, contraband stash, wiretap results, who's in Holding (people you could bail), and your block's orders.
- **Rap Sheet**: your mugshot (inmate #, a random charge), your secret role and your secret task for this game (each one is tap to reveal). Lights Out picks and block votes happen here.
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

Hosts can add, edit, hide, price and stock-limit any item, and can refund any order.

### Rounds

**Finishing a game** in a host console pays out credits and counts as a round:

- everyone in the Holding Cell owes `+1` drink, and everyone in Solitary owes `+2` (both configurable),
- solitary sentences tick down by one, and anyone whose time is up walks out.

Each game can also carry its own extra rule for Holding and for Solitary (e.g. "flip with your off hand" or "full cup every flip"). There's also an "End round now" button if you want penalties without a game.

### Snitches and secret tasks (Among Us style)

1. **🐀 Plant snitches** (host console → Snitches). Each block independently gets one hidden snitch with the chance you set (default 50%), so some blocks have one and some don't. "At least one overall" is on by default.
2. **📋 Secret tasks.** When a game goes ▶ live, *everyone* gets a secret task on their Rap Sheet, and every task card looks the same.
   - **Inmates** get harmless tasks ("high-five someone from every other block"). Once a host approves the claim, their block earns **+3**.
   - **The snitch** gets a **sabotage** for that game ("volunteer to go first, then choke", "talk your block into the worst strategy"). You can also write a game-specific one, e.g. "miss your first two flips". Once a host approves it, it **skims 5 credits** from their block. The host judges whether they really pulled it off.
   - **Holding Cell** inmates get tasks too. Completing one earns parole points, so blocks can see who's hustling before they bail someone out.
   - The feed line is identical for both ("✅ Someone in Block A finished their task"). But the block's **account activity** shows either *+3 Task completed* or *−5 Unexplained withdrawal*, and that withdrawal is the clue. Who just tapped their phone?
   - Everyone gets one reroll per game. Hosts approve or reject every claim, and can void an approved one.
3. **🌙 Lights Out.** *Everyone* picks a name on their phone, so you can't spot a snitch by who's tapping. Snitch picks are tip-offs. Everyone else's picks are anonymous suspicions.
4. **☀️ Lights On.** Each snitch's target goes to solitary for 1 round ("an anonymous tip"). The feed whispers who was most suspected.
5. **🗳️ Block Votes.** Each block votes only on its own members, and a **majority of the block** is needed to kick someone.
   - Kicked the snitch: the block gets **+25 plus every credit the snitch skimmed**. The snitch is exposed, serves 1 round in solitary, then goes to the Holding Cell.
   - Kicked an innocent: the block pays **−10**, and the innocent goes to the Holding Cell, where they have to earn their way back.
6. **🎭 Reveal** at the end of the night unmasks every snitch who got away with it. **Surviving snitches cash in:** they get **3 drinks + 1 per successful sabotage** to hand out to anyone from their phone, plus a prize you set (default "a drink on the birthday inmate + eternal bragging rights").

All the numbers, both task lists and the prize are editable in the host console (Snitches and Tasks tabs).

## Running it

Requires Node 18+.

```bash
npm install
WARDEN_PIN=4321 OFFICER_PIN=8765 npm start   # defaults: 1234 and 5678
```

The Warden opens `http://localhost:3000/warden` and the Commissary Officer opens `/officer`. Either PIN works on either page; the PIN decides which title you get. Then:

1. Put `/tv` on the TV. Guests scan the QR code and book in. Everyone starts in the Holding Cell.
2. **🔐 Blocks**: "Build blocks from Holding" splits everyone into Block A, B, C… of up to 5. Late arrivals stay in Holding until a block bails them out or you parole them with the dropdown.
3. **🐀 Snitches**: plant snitches. Tweak the task lists and survivor prize if you like.
4. **🏁 Games**: add the schedule (with optional Holding/Solitary rules), hit ▶ Go live, then 🏆 Finish & pay out after each one.
5. **🧾 Orders**: your bartender queue. Tap Delivered / Enforced as you go.
6. **📋 Tasks**: approve or reject task claims as they come in.
7. **⛓️ Lockup**: throw rule-breakers into solitary, release people, fix the drink tab, and edit the standing rules.

Environment variables:

| Var         | Default             | Notes                                                    |
| ----------- | ------------------- | -------------------------------------------------------- |
| `PORT`      | `3000`              |                                                          |
| `WARDEN_PIN` | `1234`             | **Change this** before the party (`ADMIN_PIN` also works) |
| `OFFICER_PIN` | `5678`            | **Change this** too; must differ from the Warden's        |
| `DATA_FILE` | `data/state.json`   | All game state is saved here and survives restarts        |

To start fresh, stop the server and delete `data/state.json`.

### Hosting for the party

Everyone's phone needs to reach the server. Options, easiest first:

- **Same Wi-Fi**: run it on a laptop at the party and share `http://<laptop-ip>:3000`. The TV QR code uses whatever address the TV opened, so open `/tv` via the IP, not `localhost`.
- **Tunnel**: `npx cloudflared tunnel --url http://localhost:3000` (or ngrok) gives you a public https URL that works on cellular too.
- **Cloud**: any Node host that supports WebSockets (Render, Railway, Fly.io). Start command is `npm start`. Set `WARDEN_PIN` and `OFFICER_PIN`. Without a persistent disk, state resets on redeploy, which is fine for one night.

## Development

```bash
npm run dev   # restarts on file changes
npm test      # rules engine tests (node:test)
```

- `lib/game.js`: all game rules and per-viewer views. Players never receive other players' secret roles, which kind of task anyone has, the task lists, other blocks' stash/ledger/wiretap results, or login tokens.
- `server.js`: Express + Socket.io. Every mutation is saved and pushes fresh state to every connected screen.
- `public/`: a single-page client in vanilla JS (no build step).
