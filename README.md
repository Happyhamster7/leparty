# 🔒 Shifty Shen's Slammer

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

### The four acts

The night runs in four acts. A host moves to the next one with the act bar at the top of the host console. Every phone and the TV switch over at once: a big **ACT II** stamp, a new look, a briefing card explaining what changed, and a new name for the money (same balance). Each act's special items only appear in the shop during that act, at the top of the shelf. Hosts can go back an act if they flip too early.

**By default there are no acts:** the night runs one look all night, a pixel-art skin after the LeParty pixel kit (wooden frames, parchment, Jersey 10 and Pixelify Sans; the original sprites live in `public/pixel/` and the skin in `public/pixel.css`). Money is plain credits, the phone header shows the block's points, and there are no act changes or "Act I" labels anywhere. The host bar keeps only 🔒 Close shop and 📺 Play intro on TV. To bring the acts back, pick a four-act lineup under Settings → Act lineup.

There are two four-act lineups, picked under Settings → Act lineup. Each act runs one of four rule sets (GTA, Genshin, TFT or Among Us) and renames its money, items, prizes, roles and riddles.

**The Long Night (default).** One night at Slammer Penitentiary in four chapters. Guests keep the same **inmate tablet** all night, held upright; each act re-skins it and swaps in its own apps.

| Act | Look | Mechanics |
| --- | --- | --- |
| I · Booking Day (*Shawshank*) | Concrete, intake-form paper, jumpsuit orange, stencilled type; money is **🍜 soups** | **Cell Toss**: raid another block and pocket up to 10 soups (deflectable). Your rap sheet stars rise with owed drinks, open punishments, Holding and Solitary. |
| II · Arkham Asylum (Batman villains) | Night purple and toxic green, patient-file paper, Creepster type; money is **❓ Riddler tokens** | **Joker's Wild**: draw ×1 or ×10 for your gang (royal flush guaranteed every 8th). Four **Riddler's riddles** each in your Patient File. Every inmate has a **patron villain** (Joker, Riddler, Bane, Poison Ivy, Mr. Freeze, Scarecrow or Killer Croc); two of the same on a block is a gang bonus. |
| III · The Heist (*Money Heist*) | Heist red, Royal Mint cream, gold vault; money is **€** | Each crew picks a **heist role** (Berlin, Nairobi, Tokyo, the Professor…); **the printing press** pays 1 € per 10 saved after every game; heist streaks pay extra. |
| IV · The Great Escape (*Prison Break*) | Midnight blue, searchlight yellow; money is **favours** | Snitches are **rats** and the stakes double. Every Block Vote is a **Lockdown** ("… was a rat"). |

**Game Night.** The original lineup: Vice City (GTA), Wish Upon Teyvat (Genshin Impact), Convergence (TFT) and Emergency Meeting (Among Us), each with its own game-style interface (detailed below).

| Act | Look | Mechanics | Stamps |
| --- | --- | --- | --- |
| I · Vice City (GTA) | Neon sunset and palms; money is **$cash** | **Stick-Up** (12): steal up to 10 from another block; they can deflect it back. A **wanted level** in the top corner: Solitary 5 stars, Holding 3, owed drinks and open punishments 1 each. | MISSION PASSED / FAILED, BUSTED, WASTED |
| II · Wish Upon Teyvat (Genshin Impact) | Played **in landscape** like the game; money is **✦Primogems** | A **Wish** screen with the event banner: Wish ×1 (10) or Wish ×10 (100) for the party. 3★ (69%) is mostly trash, 4★ (25%) is decent, 5★ (6%) is a jackpot, and every party's 8th wish without one is a guaranteed 5★. Everyone in the party sees the wish animation (a shooting star in the best rarity's colour, then the results). Some wishes give the wisher drinks to hand out. **Daily Commissions**: four small party quests per inmate (toast another block, find your Vision twin, drink a glass of water…), each +2 Primogems for the party and 100 Adventure EXP; all four pay a Guild bonus (+5, 250 EXP). **Visions**: everyone gets an element; two of one element on a block is an Elemental Resonance worth +1 Primogem per commission. **Adventure Rank** rises with EXP from commissions, wishes, finished punishments and served drinks. | CHALLENGE COMPLETED / FAILED, FROZEN, PARTY DEFEATED |
| III · Convergence (TFT) | Hextech teal and gold; money is **🪙gold** | **Augments**: each block picks one of three (Shot Caller picks if there is one). **Interest**: after every game, +1 gold per 10 unspent, up to 5. **Streaks**: win or lose heats in a row for +1 at 2, +2 at 3, +3 at 4 or more. | 1ST / 2ND / … PLACE, BENCHED, ELIMINATED |
| IV · Emergency Meeting (Among Us) | Deep space and impostor red; money is **credits** | Snitches are Impostors and the stakes double: sabotage skims twice as much and catching one pays double. Opening Block Votes calls an **EMERGENCY MEETING** on every screen, and closing them shows "*Name* was / was not an Impostor." | VICTORY / DEFEAT, LOCKED IN MEDBAY, EJECTED |

On phones, each act turns the whole app into that game's own interface, with your profile in the corner:

- **Act I · GTA:** the in-game smartphone. A status bar with the clock, a Vice City wallpaper, a GTA Online-style player card (rank, crew, wanted stars, cash) and app icons: Texts (to-dos), Job List (games and matchups), Internet (the shop), Contacts (your block), Maze Bank (balance and account activity), LSPD (Rap Sheet and votes), Stats, Bleeter (the feed) and Snapmatic (the game briefing). Apps open with a coloured title bar and a back button.
- **Act II · Genshin Impact:** the Paimon Menu, in landscape (see below).
- **Act III · TFT:** the League client, in landscape. A PLAY button (the current game) and HOME / PROFILE / COLLECTION / STORE / RANKED tabs, gold and streak on top, and the social sidebar on the right: your summoner icon, status and rank, then every block as a friends group with live statuses (In Lobby, In Game, In Solitary).
- **Act IV · Among Us:** the lobby, in landscape. Your crewmate card in the corner, your block as the lobby code with its crewmates standing on the floor, and big Tasks / Schedule / Shop / Crew / Meeting / Stats / Chat buttons that open each screen as a tablet with a red ✕.

Phones held upright in a landscape act see a "Rotate your device" screen.

**Shot Cam.** Inmates on a block film their block taking its shots (up to 12 seconds) straight from the app: Snapmatic on the GTA phone, Camera on the Paimon Menu, the 🎥 Clip button in the League client, Cams in the Among Us lobby, or 🎥 Film it on the penalty-drink card. The camera records a small video for the TV (or you can pick one from your camera roll: up to 30 seconds and 60 MB), adds an optional caption and sends it. Before recording, the phone checks that it's allowed to post, so nobody films a clip that can't be sent. Live clips rotate on the TV in the right-hand column, newest first, with the block, caption and who filmed it; a new clip jumps the queue with a NEW badge. Hosts manage clips in the 🎥 Clips tab: switch Shot Cam off, require approval before clips hit the TV, or hide or delete any clip. Locally, phones post videos to the server and they're saved in `data/clips/`. On Vercel, phones upload straight to a Vercel Blob store with a one-off token from `/api/clip-token` (so videos never hit the 4.5 MB function limit), then register the clip; connect a Blob store in the project's Storage tab so `BLOB_READ_WRITE_TOKEN` is set. Without one, Shot Cam tells guests it isn't set up yet. The browser uploader is a pre-built copy of `@vercel/blob/client` in `public/vendor/blob-upload.js`; rebuild it with `npm run build:vendor` after upgrading `@vercel/blob`.

**TV intros.** Whenever a host changes act, the TV plays a ~25-second trailer for the new act, letterboxed like a cinema ad: a cold open, the act's painted scenery, three punchy title cards, its three new mechanics, tonight's top blocks as "Starring", the act's title card and a joke "Rated D for Drinking" card, with a synthesized sound sting per scene. Among Us opens with a "SHHHHHHH!" crewmate and an Emergency Meeting alarm. Hosts can replay it with **📺 Play intro on TV** in the act bar, and the TV has a Skip button. To show your own video instead, paste an https link (an .mp4/.webm file or a YouTube link) per act under Settings → Act intros on the TV. Browsers only play sound after someone taps the page, so tap the TV once at the start of the night.

The look of each act, in more detail:

- **GTA VI:** painted key-art scenery (an indigo → violet → pink → peach sunset, mauve palms, pastel Art Deco hotels on Ocean Drive) and titles in the VI logo's pink-to-gold gradient. Type: Outfit, set with wide tracking, standing in for the GTA VI marketing face ("GTA Art Deco"), which isn't publicly available.
- **Genshin Impact:** phones held upright see a "Rotate your device" screen; sideways, the app opens on the Paimon Menu: your profile card in the corner (avatar with Vision, nickname, signature, Adventure Rank and EXP bar, World Level, UID) and round icons for Adventurer Handbook, Wish, Paimon's Bargains, Party Setup, Events, Archive, Leaderboard and Mail. Each screen has the game's title bar, Primogem/Fate counters and ✕ back to the menu; cream panels with slate text, round confirm/cancel buttons, rarity-backed shop cards, centred purchase dialogs, and the wish banner and animation. Colours come from the game's settings screen. Type: the game's own HYWenHei-85W (`public/fonts/hywenhei-latin.woff2`, cut down to Latin text and symbols), with Noto Sans as the fallback. The font belongs to Hanyi and is licensed for personal use, which fits a private party; don't reuse it on anything commercial.
- **TFT:** the client's featured-set banner on Home (a painted "Convergence" nebula with a gold-ringed portal and a floating hex arena), a hexagonal crest by PLAY, a Riot ID under your summoner icon, gold diamond ornaments on panels, League-client panels with gold borders, hextech buttons, hexagon tab icons, and shop items as champion cards bordered in cost colours (grey, green, blue, purple, gold). Type: Cinzel and Source Sans 3, standing in for the client's Beaufort for LOL (headings and buttons) and Spiegel (body and labels), which are Riot-only.
- **Among Us:** chunky black-outlined UI, the Now tab becomes a task list with a TOTAL TASKS COMPLETED bar, voting looks like the meeting tablet with a coloured crewmate per player, and a flashing red meeting banner. Type: Fredoka (in place of the game's rounded UI font).

Augments (Act III): Windfall (+20 now), Rich Get Richer (+5 now and an interest cap of 10), Hustler (25% off the shop), Thrill of the Hunt (+4 per heat win), Built Different (a free Deflect and Bribe), Cursed Crown (+30 now, but 2 drinks each).

Warp odds and pity are in Settings. Any shop item can be limited to one act in the Commissary tab ("On the shelf during").

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

**Points decide the winner.** Blocks send drinks to other blocks (or the Holding Cell) from the Commissary's **Send drinks** shelf: pick a drink and how many (1–10). Each drink costs credits and scores points, and ordering a deal's exact amount is cheaper and scores extra:

| Drink | Each | Points | Deals |
| --- | --- | --- | --- |
| 🥃 Spirit | 15 | 3 | 5 for 60 (17 pts), 10 for 105 (35 pts) |
| ❓ Mystery Spirit (blind pour) | 15 | 3 | 5 for 60 (17 pts), 10 for 105 (35 pts) |
| 🍶 Soju | 7 | 1 | Bottle of 8 for 42 (9 pts) |
| 🍷 Wine (glass) | 25 | 4 | None |
| 🍹 Mystery Cocktail | 18 | 4 | 5 for 72 (22 pts), 10 for 126 (46 pts) |

The drinks go to the block as one order in the hosts' 🧾 Orders tab ("5× Spirit, Block A → Block B"); the receiving block decides who drinks them, and nobody gets a personal tab for them. Points land when the order goes through (a block request scores once it's approved), stay with the buyer, and come back off if a host refunds the order. A Shot Penalty still puts a penalty drink on each person in the target block and scores 1. Standings rank by points, then credits earned. Hosts can change a drink's price and points in the 🛒 Commissary tab (deal prices are fixed) and correct points in 💰 Payouts.

**Opening and closing the shop.** The act bar in the host console has 🔒 Close shop / 🛒 Open shop. While it's closed every phone and the TV show COMMISSARY CLOSED, and purchases and request approvals are refused. Requests already waiting stay put and can go through once it reopens.

### Built for blocks (about 40 guests)

- **Matchups and heats.** For each game, hosts can split the blocks into heats (pairs, threes, fours, or everyone at once) or build a custom heat, such as a final between the winners. A block left over joins the previous heat, so nobody plays alone. Hosts start each heat and score it, and credits are paid per heat. Phones say *You're up*, *Up next (1 heat before yours)*, *Your heat is done* or *Sitting this one out*. The TV shows the heat being played and what's next.
- **Block decisions.** By default spending is a block decision: a blockmate's purchase becomes a request that goes through when the Shot Caller approves it or 2 blockmates second it. The asker can withdraw it and the Shot Caller can veto it. Blockmates get a phone alert for each new request. Hosts can switch to *Shot Caller only* or *anyone, instantly* in Settings.
- **Block identity.** The Shot Caller (or anyone, if the block has none) names the block and sets a motto. It shows on phones, the Board and the TV, and the block's color tints its members' screens.
- **Less clutter.** Bookings roll up into one feed line. Lights Out names are grouped by block, with your own block first. Host inmate lists are sorted block by block.

### Rounds (LeParty's game loop)

The night runs in **4 acts of 3 rounds** (12 games), from the host console's **🎲 Round** tab. Rounds are labelled by act: Act 1 · Round 1, Act 1 · Round 2, Act 1 · Final round, Act 2 · Round 1, and so on to Act 4 · Final round, after which the console asks you to crown the winner. Games play in the order of the 🏁 Games tab (game 1 is Act 1 · Round 1), and the Round tab shows the whole plan. Acts, rounds per act, the pick and bar timers, the cooldown and the streak rate are in ⚙️ Settings → Acts and rounds. Acts only group the rounds; the look stays the same all night. Each round has four phases, shown as a strip on phones, the TV and the host console:

1. **Game.** A host picks a game from the schedule and taps **Start round**. Each game says how many players a block sends (0 = group game, everyone plays). Every phone shows its block's roster and gets **60 seconds** to lock in its players. Anyone who played either of the last **2** non-group games sits out, greyed out with "Played recently". When every block has picked, or the minute runs out, the picks show on every screen at once; blocks that didn't pick get an automatic pick, favouring whoever has played least. The shop is closed.
2. **Results.** The host enters each block's placing, plus an optional bonus. Prize money is paid by place: **90 / 75 / 65 / 55 / 45 / 40 / 30 / 20** credits. First place unlocks the Winner's Bounty.
3. **Spending.** The shop opens. Blocks send drinks (each scores its menu points when it's served, not when it's bought) and buy power-ups. **Every power-up starts the round after it's bought** (or, for a Winner's Bounty reward, the round after it's picked); each block's My Block tab lists what's coming and when. The power-ups: **🪞 Reflect** (60, one per block per night, one block per round) bounces every drink aimed at you this round back to its sender, with the points going to you; **👁️ Eye Spy** (40, one per round) shows who sent what to whom, round by round; **🎯 Open Bounty** and **🏅 Winner's Bounty** (50 each, one running per block) ask the block to send 5 drinks within 3 rounds, and cost 3 Spirit shots the next round if it doesn't. Bounties pay points, never credits: the Open Bounty pays **+25 points** the moment it's hit; hitting the Winner's Bounty lets the block pick one reward on a phone for the rest of the night (stacks if won again): **🎁 Bonus drinks** (+1 free drink lands on the target of every order it sends; it scores only what was paid for), **🛡️ Fewer drinks** (every order sent to it lands with 1 fewer drink; an order knocked to 0 never reaches the bar, and its sender still scores) or **⭐ +1 point per drink** it sends.
4. **Drinks.** The host taps **Close shop and start drinks**. Every block that was sent drinks queues for the bar, fewest drinks first (ties random), with penalties owed from earlier rounds added in. The host console becomes the bar: what to pour for whoever's up and who's next, a Show senders toggle, **Next** (serves the next block, starts its **30-second** clock and pays the senders' points), **Back** (undo a Next pressed by mistake) and **Done in time**. A block whose clock runs out owes an extra shot of the cheapest drink next round. **Drinking streak:** each time the bartender taps Done in time, the block's streak grows by the drinks it just finished and it earns **5 credits × its streak** (2 drinks: +10; 3 more next round: streak 5, +25). Running out of time resets the streak to 0. Phones show "Safe this round", your place in line, or the countdown with a Film it button; the TV becomes a wall of block tiles, each playing its Shot Cam clip once one is filmed. The round ends by itself when every block is done.

When a round ends, the Holding Cell owes `+1` drink each and Solitary `+2` (configurable), and solitary sentences tick down. Hosts can drop drinks straight into the next queue (**Assign drinks**), and at the end of the night **Crown the winner** puts the winning block on every screen.

The older tools still work outside rounds: heats and **Finish & pay out** in the Games tab, and **End round now** for Holding/Solitary penalties without a game.

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

To clear out test data, use **Settings → Fresh start** (type RESET). It removes every inmate, block, order and feed line but keeps your games, shop, settings and host logins. To remove only some people, tick them on the Blocks tab and tap **Remove selected**. For a total wipe, including settings, stop the server and delete `data/state.json`.

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

Phones check for updates every 2 seconds. A 40-guest, 3-hour night is roughly 200–300k function calls and Redis reads, which fits the Vercel Hobby and Upstash free tiers. To clear test data on Vercel, use **Settings → Fresh start**. For a total wipe including settings, delete the `sss:v` and `sss:s` keys in the Upstash console (or set a new `STATE_KEY`).

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
