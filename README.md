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

Printable copies: [Inmate Rules](docs/INMATE_RULES.md) for guests, and the [Host Cheat Sheet](docs/HOST_CHEAT_SHEET.md) for the Warden and Commissary Officer.

## Hosts

There are two hosts: the **Warden** and the **Commissary Officer**. They have **identical powers**, and the title is purely for show: it changes the console header and how they're named in the feed ("The Commissary Officer paid Block A 10 credits"). Each logs in with their own PIN.

**Hosts can sentence anyone** from the ⚖️ Punish / Lockup tab: one inmate, a block, the Holding Cell, everyone in Solitary, or everyone. They can hand out drinks, a written punishment (with presets like "10 push-ups" or "Waterfall"), or both, plus a reason that shows in the feed. Drinks go on the drink tab. The punishment sits on the person's Now tab until they tap Done, and hosts can clear it. Dare-style commissary punishments (Yard Drills, Chain Gang, Confession Booth) also land on each victim's Now tab.

**Only hosts can give or take credits**, through payouts, fines, game results and refunds. Hosts also **judge every snitch sabotage**: a snitch tapping Done only files a claim, and nothing happens until a host approves it (🕵️ Sabotage tab).

Players still spend their block's credits at the commissary themselves, and track their own penalty drinks on the honor system. Hosts can correct the drink tab at any time.

## Screens

| URL       | Who         | What                                                                                         |
| --------- | ----------- | -------------------------------------------------------------------------------------------- |
| `/`       | Guests      | Book in with a name and play all night (the phone remembers you)                             |
| `/warden` | Warden      | Host console (Warden PIN)                                                                    |
| `/officer`| Commissary Officer | Host console (Officer PIN)                                                            |
| `/tv`     | Projector   | Standings, current game and its lockup rules, Holding/Solitary with drinks owed, block-vote progress, gossip feed, QR code to join |

### Player tabs

- **Now** (the home screen): your to-do list (penalty drinks to pay off, punishments to serve with a Done button, incoming punishments, Lights Out picks, votes and purchase requests waiting on you), then your matchup, the game that's on now with its heats, the schedule and the gossip feed.
- **My Block**: your block's name, nickname and motto, its rank, credits, your current matchup, purchase requests waiting on a second, account activity (watch for unexplained withdrawals), blockmates, contraband stash, wiretap results, who's in Holding (people you could bail), and your block's orders. The tab becomes **Holding** or **Solitary** when that's where you are.
- **Commissary**: spend, or ask your block to spend, the block's credits.
- **Rap Sheet**: your mugshot (inmate #, a random charge), your secret role (tap to reveal) and the current game's briefing with its Classified box. Lights Out picks and block votes happen here.
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

### Built for blocks (about 40 guests)

- **Matchups and heats.** For each game, hosts can split the blocks into heats (pairs, threes, fours, or everyone at once) or build a custom heat, such as a final between the winners. A block left over joins the previous heat, so nobody plays alone. Hosts start each heat and score it, and credits are paid per heat. Phones say *You're up*, *Up next (1 heat before yours)*, *Your heat is done* or *Sitting this one out*. The TV shows the heat being played and what's next.
- **Block decisions.** By default spending is a block decision: a blockmate's purchase becomes a request that goes through when the Shot Caller approves it or 2 blockmates second it. The asker can withdraw it and the Shot Caller can veto it. Blockmates get a phone alert for each new request. Hosts can switch to *Shot Caller only* or *anyone, instantly* in Settings.
- **Block identity.** The Shot Caller (or anyone, if the block has none) names the block and sets a motto. It shows on phones, the Board and the TV, and the block's color tints its members' screens.
- **Less clutter.** Bookings roll up into one feed line. Lights Out names are grouped by block, with your own block first. Host inmate lists are sorted block by block.

### Rounds

**Finishing a game** in a host console pays out credits and counts as a round:

- everyone in the Holding Cell owes `+1` drink, and everyone in Solitary owes `+2` (both configurable),
- solitary sentences tick down by one, and anyone whose time is up walks out.

Each game can also carry its own extra rule for Holding and for Solitary (e.g. "flip with your off hand" or "full cup every flip"). There's also an "End round now" button if you want penalties without a game.

### Game briefings

When a host hits ▶ Go live on a game, **every phone pops up a briefing**. It shows how to play (the "How to play" text you write for each game), plus the extra Holding Cell and Solitary rules for that game. Tap *Got it* to dismiss it. It stays on the Rap Sheet and shows on the TV too. If a host edits the rules while the game is live, the briefing pops up again on every phone.

### Snitches and sabotage (Among Us style)

1. **🐀 Plant snitches** (host console → Snitches). Each block independently gets one hidden snitch with the chance you set (default 50%), so some blocks have one and some don't. "At least one overall" is on by default.
2. **🗂️ Sabotage hides inside the briefing.** Every briefing has a *Classified* box that looks the same on every phone.
   - **Inmates** who open it see "No orders for you this round. Play it straight."
   - **The snitch** sees their secret sabotage for that game ("volunteer to go first, then choke", "talk your block into the worst strategy"). You can also write a game-specific one, e.g. "miss your first two flips".
   - Everyone gets the same pop-up and taps the same things, so you can't spot the snitch by who's looking at their phone. Only snitches get tasks.
3. **The hosts judge it.** When the snitch thinks they pulled it off, they tap Done, and that goes to the 🕵️ Sabotage tab. If a host approves, **5 credits are skimmed from the snitch's block**.
   - There's no public feed line. Only that block sees an **"Unexplained withdrawal"** in its account activity, plus a "credits just vanished" alert on their phones. That's the clue.
   - Rejecting hands the orders back to the snitch. An approved sabotage can be voided, which refunds the block.
   - The snitch gets one reroll per game.
4. **🌙 Lights Out.** *Everyone* picks a name on their phone. Snitch picks are tip-offs. Everyone else's picks are anonymous suspicions.
5. **☀️ Lights On.** Each snitch's target goes to solitary for 1 round ("an anonymous tip"). The feed whispers who was most suspected.
6. **🗳️ Block Votes.** Each block votes only on its own members, and a **majority of the block** is needed to kick someone.
   - Kicked the snitch: the block gets **+25 plus every credit the snitch skimmed**. The snitch is exposed, serves 1 round in solitary, then goes to the Holding Cell.
   - Kicked an innocent: the block pays **−10**, and the innocent goes to the Holding Cell, where they have to earn their way back.
7. **🎭 Reveal** at the end of the night unmasks every snitch who got away with it. **Surviving snitches cash in:** they get **3 drinks + 1 per approved sabotage** to hand out to anyone from their phone, plus a prize you set.

All the numbers, the sabotage list and the prize are editable in the host console (Snitches and Sabotage tabs).

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
4. **🏁 Games**: add the schedule with **how-to-play rules** for each game (plus optional Holding/Solitary rules and a custom sabotage). Tap **Pairs** (or Threes, Fours, or a custom heat) to set matchups. **▶ Start heat** makes the game live and pops the briefing up on every phone. **🏁 Score heat** pays out each heat. **🏆 Finish & pay out** closes the game and applies the round penalties.
5. **🧾 Orders**: your bartender queue. Tap Delivered / Enforced as you go.
6. **🕵️ Sabotage**: approve or reject snitch sabotage claims as they come in.
7. **⛓️ Lockup**: throw rule-breakers into solitary, release people, fix the drink tab, and edit the standing rules.

Environment variables:

| Var         | Default             | Notes                                                    |
| ----------- | ------------------- | -------------------------------------------------------- |
| `PORT`      | `3000`              |                                                          |
| `WARDEN_PIN` | `1234`             | **Change this** before the party (`ADMIN_PIN` also works) |
| `OFFICER_PIN` | `5678`            | **Change this** too; must differ from the Warden's        |
| `DATA_FILE` | `data/state.json`   | Local saves; survives restarts (not used when Redis is set) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | — | Upstash Redis (required on Vercel; set by the integration) |

To start fresh, stop the server and delete `data/state.json`.

### Hosting for the party

Everyone's phone needs to reach the server. Options:

#### Vercel

The repo deploys to Vercel as static files (`public/`) plus three serverless functions (`api/`). Game state lives in Upstash Redis, because Vercel functions don't keep anything in memory between requests.

1. **Project settings → Build and Deployment:**
   - Framework Preset: **Other** (not Next.js). `vercel.json` also sets this, so it applies even if the dashboard says otherwise.
   - Build Command: leave empty.
   - Output Directory: `public`.
   - Install Command: default.
2. **Storage → Create Database → Upstash Redis** (free tier is enough), then connect it to this project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. A direct Upstash database works too: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. **Environment Variables:** add `WARDEN_PIN` and `OFFICER_PIN` (different from each other).
4. Deploy, then open `/warden` on your phone and `/tv` on the TV.

Phones check for updates every 2 seconds. A 40-guest, 3-hour night is roughly 200–300k function calls and Redis reads, which fits the Vercel Hobby and Upstash free tiers. To wipe the game on Vercel, delete the `sss:v` and `sss:s` keys in the Upstash console (or set a new `STATE_KEY`).

#### Anywhere else

- **Same Wi-Fi**: run it on a laptop at the party and share `http://<laptop-ip>:3000`. The TV QR code uses whatever address the TV opened, so open `/tv` via the IP, not `localhost`.
- **Tunnel**: `npx cloudflared tunnel --url http://localhost:3000` (or ngrok) gives you a public https URL that works on cellular too.
- **Cloud**: any long-running Node host (Render, Railway, Fly.io). Start command is `npm start`. Set `WARDEN_PIN` and `OFFICER_PIN`. Without a persistent disk (or the Redis variables above), state resets on redeploy, which is fine for one night.

## Development

```bash
npm run dev   # restarts on file changes
npm test      # rules engine + API tests (node:test)
```

- `lib/game.js`: all game rules and per-viewer views. Players never receive other players' secret roles, anyone's sabotage, the sabotage list, other blocks' stash/ledger/wiretap results, or login tokens.
- `lib/api.js`: the HTTP API. Phones poll `GET /api/state` (a cheap version check when nothing changed) and send every change to `POST /api/action`. Each change reloads the state, applies it and saves with compare-and-set, retrying if someone else saved first.
- `lib/store.js`: where state lives: Upstash Redis when its variables are set, otherwise memory mirrored to `DATA_FILE`.
- `api/`: the Vercel functions. `server.js`: the same handlers behind Express for `npm start`.
- `public/`: a single-page client in vanilla JS (no build step).
