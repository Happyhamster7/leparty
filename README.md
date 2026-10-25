# 🔒 Shifty Shen Slammer

A jailhouse-themed party game web app for a birthday night. Everyone plays from their phone, the host runs things from the **Warden** console, and a **TV** screen shows the standings.

It mixes three things:

- **Survivor-style team games.** Guests are booked into *cell blocks* (teams). The Warden runs games and pays the winners in commissary credits.
- **Prison commissary.** Each cell block spends its shared budget on mixers, drinks sent to rival cells, punishments for rival cells, and contraband (deflect cards and vote immunity).
- **Mafia-style "Snitch Game".** Secret roles are dealt to everyone. Snitches rat someone out at *Lights Out*, the guard frisks a suspect, the lawyer protects someone, and everyone votes in a *Lockdown Vote* to send a suspect to solitary.

## Screens

| URL       | Who         | What                                                                     |
| --------- | ----------- | ------------------------------------------------------------------------ |
| `/`       | Guests      | Book in with a name and play all night (the phone remembers you)         |
| `/warden` | Host/admins | PIN-protected control room                                               |
| `/tv`     | Projector   | Live standings, current game, vote tally, gossip feed, QR code to join   |

### Player tabs

- **Yard**: the game that's on now, tonight's schedule, the live gossip feed and Warden announcements.
- **Commissary**: spend your cell's credits. Gifts and punishments ask you to pick a target cell, and you can add a note ("vodka soda pls" or some trash talk).
- **My Cell**: budget, cellmates, your contraband stash (🔄 Snitch Slips, 💵 Bribes) and your cell's order history.
- **Rap Sheet**: your mugshot (inmate #, a random charge) and your secret role (tap to reveal). Night moves and voting happen here.
- **Board**: cell block standings and the roster.

### How the commissary works

| Type               | What happens                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| For your cell      | Goes into the Warden's queue to deliver (mixers, ice, etc.)                                                                               |
| Send to another cell | A drink gift for a rival cell, delivered by the Warden                                                                                  |
| Punishment         | The target cell gets a pulsing alert: **Take it** or **🔄 Deflect**. A deflect bounces it back to the sender, who can deflect again if they have a card. Once someone takes it, it goes to the Warden to enforce. An optional *credit drain* (e.g. Shakedown −15) is charged automatically. |
| Deflect card       | Goes into the buyer's stash. Other cells only see "a suspicious purchase".                                                                |
| Vote immunity      | 💵 Bribe the Guard. While a Lockdown Vote is open, use it on someone in your cell and votes against them don't count.                    |

The Warden can add, edit, hide, price and stock-limit any item, and can refund any order.

### The Snitch Game (mafia rules)

1. **Deal roles** (Warden → 🐀 Snitch Game). By default 1 snitch per ~5 players, 1 Crooked Guard and 1 Jailhouse Lawyer. Everyone else is an Inmate.
2. **🌙 Lights Out.** Everyone closes their eyes. On their phones, snitches pick a target and can see each other's picks. The guard frisks one person and gets an instant "snitch / clean" result. The lawyer protects one person.
3. **☀️ Lights On.** The snitches' top pick goes to solitary unless the lawyer protected them. Their role is revealed in the feed.
4. **🗳️ Lockdown Vote.** Everyone still in General Population votes, and the tally is live on phones and the TV. Close it and the top vote-getter goes to solitary. A tie, or a skip vote that matches the leader, means a hung jury.
5. Inmates win when every snitch is in solitary. Snitches win when they equal or outnumber everyone else.

Players in solitary stay on their team and can still shop. They just can't vote or make night moves. The Warden can release anyone.

## Running it

Requires Node 18+.

```bash
npm install
ADMIN_PIN=4321 npm start      # default PIN is 1234
```

Open `http://localhost:3000/warden` and log in. Then:

1. **🔐 Cells**: "Create 4" cell blocks (rename them and pick colors).
2. Put `/tv` on the TV. Guests scan the QR code and book in.
3. **🔐 Cells**: "Assign N unassigned" spreads guests evenly across the cells. You can also move individuals with the dropdown, or make someone 👑 Shot Caller.
4. **🏁 Games**: add tonight's schedule, hit ▶ Go live, then 🏆 Finish & pay out.
5. **🧾 Orders**: your bartender queue. Tap Delivered / Enforced as you go.

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

- `lib/game.js`: all game rules and per-viewer views. Players never receive other players' secret roles, other cells' stash, or login tokens.
- `server.js`: Express + Socket.io. Every mutation is saved and pushes fresh state to every connected screen.
- `public/`: a single-page client in vanilla JS (no build step).
