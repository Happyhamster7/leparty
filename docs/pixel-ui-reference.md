# Pixel skin — UI reference

The pixel skin takes its look and layout habits from Stardew Valley's
menus. All the art is original: frames, buttons and icons are drawn by
`scripts/pixel-sprites.py`. The game's sprites, font, logo and
characters are not copied. This doc covers what to borrow from each of
the game's screens and where it goes in LeParty.

For each screen:

- **Function** — the job the screen does for the player.
- **Placement** — where things sit, and why.
- **Spacing** — how it uses the pixel grid.
- **LeParty** — the screen it maps to, and the components it gives us
  (in `src/components/pixel/`).

## How the game lays things out, overall

These patterns show up on nearly every screen, so the kit follows them
everywhere.

1. **One pixel grid, never broken.** Every frame, icon, gap and line of
   text sits on whole art pixels, scaled up by one fixed factor. Nothing
   is ever 1.5 pixels or blurred. Our art pixel is **3 CSS px**, so
   125 art pixels fit across a 375px phone. Every spacing token is a
   multiple of 3 (see "Spacing scale" below).
2. **Thick frames, tight insides.** Wooden frames are heavy (about 4 art
   px) and the padding inside them is small. The frame does the work of
   separating content, so the inside doesn't need much air.
3. **Slots touch.** Inventory, toolbar and bundle slots sit edge to edge
   in a grid with no gap. The slot's own recessed border is the
   separator. Gaps only appear *between* groups.
4. **One window, centred.** Menus open as a single framed window in the
   middle of the screen with the world dimmed behind it. On a phone the
   window becomes the whole page, inset by a small margin.
5. **Close and confirm sit bottom right, outside the content.** The OK
   button sits at the bottom right of a window. The red close button
   hangs off the top right corner. Your thumb and eye learn where they
   are.
6. **Text is dark brown on parchment, never black on white.** Contrast
   comes from value, not hue. Titles get a dark outline or a drop shadow
   so they read over any background.
7. **Feedback is a small, quick pop.** Picking something up shows a
   toast with the icon and a "+1". Coins tick up. Buttons grow about
   one art pixel on hover. Nothing slides in from off screen.

## Spacing scale

All values are art pixels × 3.

| Token        | Art px | CSS px | Used for                                         |
| ------------ | ------ | ------ | ------------------------------------------------ |
| `--px`       | 1      | 3      | Hairlines, the 1-pixel pressed offset            |
| `--s-1`      | 2      | 6      | Icon to its label; stack count inset             |
| `--s-2`      | 4      | 12     | Padding inside rows, chips and tooltips          |
| `--s-3`      | 6      | 18     | Padding inside frames; gap between rows          |
| `--s-4`      | 8      | 24     | Gap between groups in one window                 |
| `--s-5`      | 12     | 36     | Gap between windows or page sections             |
| `--s-6`      | 16     | 48     | Space above a screen's title                     |
| `--slot`     | 22     | 66     | One inventory slot: a 16px icon inside a 3px frame |
| `--frame`    | 4      | 12     | Wooden frame thickness (9-slice border width)    |

Icons are drawn at the same 3× scale as everything else: 16 art px =
48 CSS px, and the small inline set (coin, heart, star) is 8 art px =
24 CSS px. Feature icons (portraits, title buttons) are exactly 6×.
Nothing is drawn at 2× or 4×, because that would put two pixel sizes
side by side.

Touch targets: buttons are at least 20 art px (60 CSS px) tall. Slots
(66px) clear the 44px minimum.

## The screens

### 1. Title screen
- **Function:** Start, load or join. A few large choices and nothing else.
- **Placement:** A logo high and centred over a scene. Below it, a single
  row of big square wooden buttons, centred, with an icon above each label.
- **Spacing:** Huge empty sky above. The buttons are close together
  (about 2 art px apart), so they read as one control.
- **LeParty:** `/` and the invite page's hero. → `TitleBanner`,
  `BigButton`.

### 2. Dialogue box
- **Function:** A character tells you something, one page at a time.
- **Placement:** A wide box across the bottom of the screen. The portrait
  sits in its own framed square at the right, with a name plate under it.
  The text fills the left. A small bouncing arrow at the bottom right
  means there's more.
- **Spacing:** Generous padding around the text (6 art px). The portrait
  is set off by a vertical divider, not a gap.
- **LeParty:** Warden announcements, rules, the "welcome back" notice,
  and phase 2 host messages on the big screen. → `Dialogue`.

### 3. Inventory (game menu)
- **Function:** See and arrange what you carry. Hover over an item to
  learn about it.
- **Placement:** A row of tabs along the top edge of the window (icons
  only, the active one raised). Under that, a grid of slots three rows by
  twelve. The character and equipment sit below. Trash and sort hang
  outside the right edge.
- **Spacing:** The slots touch. The tabs touch each other and overlap the
  frame by a pixel, so they look attached. The tooltip follows the pointer
  with a small offset.
- **LeParty:** The phase 2 team inventory (items owned, ready to use). →
  `Tabs`, `SlotGrid`, `Slot`, `Tooltip`, `ItemIcon`.

### 4. Shop
- **Function:** Buy things with the money you have.
- **Placement:** The game puts the shopkeeper's portrait and one line of
  dialogue at the top, a list of items in the middle and your money in
  its own small box. LeParty's team phone shop is built in five bands,
  top to bottom:
  1. **Top bar.** A back button, the title banner and the round on one
     row. Under that, one HUD strip with money, points and time left,
     evenly spaced and separated by grooves, like a cash box.
  2. **Category tabs.** Drinks and Items. The active tab is raised and
     joins the panel. On a narrow phone, only the active tab shows its
     label.
  3. **Card grid.** Two columns on a phone, more on wider screens. Each
     card has a chip at the top left (points, or the limit), the sprite
     in a slot, the name, one line about it, and a price tag. Tapping
     raises the card and rings it gold. A card you can't afford gets a
     grey tag. A sold-out card is a silhouette with a "Not yet" plate.
  4. **Details dialog.** Opens over a dimmed screen. It has the name
     banner, a big sprite, stats, a short description, "Send to" (for
     drinks), the quantity, the total, then Cancel and a green Buy or
     Send button showing the price. The red close button hangs off the
     top right corner. Esc or tapping the backdrop closes it.
  5. **Round bar.** What the team has bought this round and the total
     spent, with Done at the right.
- **Spacing:** The cards are 6px apart inside an 18px wood frame. The
  grid is the only place in the kit where frames sit this close,
  because it's a grid of things to pick, not a page of sections. The
  dialog uses `--s-2` between its rows, and every row has a groove
  above it.
- **Behaviour:** The Buy button places the order straight away. There's
  no "are you sure" step, because the dialog is already the order form
  (and CLAUDE.md rules out confirmation prompts for drinks). Buttons
  press down one art pixel.
- **LeParty:** Phase 2 spending, on the team phone. → `ShopScreen`, which
  is built from `ShopTopBar`, `ShopCard` and `ItemDetails` (in
  `src/components/pixel/shop.tsx`). `ShopRow` and `Stepper` are still
  used for simple lists such as the potluck.

### 5. HUD (in the world)
- **Function:** The few numbers you need while playing, without a menu.
- **Placement:** In the corners, away from the action. Clock, date and
  money in a box at the top right. Energy as a vertical bar at the bottom
  right. The toolbar is centred along the bottom edge.
- **Spacing:** Tucked tight to the screen edges (2 to 4 art px). Each HUD
  piece is its own small frame, never one big bar.
- **LeParty:** Team phone and big screen during the game: round timer,
  team money and points. → `Clock`, `Wallet`, `EnergyBar`, `Hotbar`.

### 6. Item pop-ups and toasts
- **Function:** Confirm that something happened.
- **Placement:** At the bottom left, stacked upwards. Each is a small
  parchment chip with the icon, the item name and a "+1".
- **Spacing:** Compact, about 4 art px of padding.
- **LeParty:** "Booked", "Drink sent", "Payout received". → `Toast`.

### 7. Mail (letters)
- **Function:** A message that arrives by post, sometimes with an item
  attached.
- **Placement:** One sheet of parchment, centred. The text is set like a
  handwritten letter with a greeting and a signature. Any attached item
  sits in a slot at the bottom.
- **Spacing:** The widest margins in the game. A letter breathes.
- **LeParty:** The invite page. A party invitation *is* a letter. →
  `Letter`.

### 8. Billboard and calendar
- **Function:** See what's happening this season, and pick up requests.
- **Placement:** A wooden board with the calendar pinned to it: a 7 × 4
  grid with a day number in the corner of each square. Events appear as
  small icons in the squares.
- **Spacing:** Squares touch, like slots. The board's frame is heavier
  than a menu frame.
- **LeParty:** `/parties` (open parties) and the host's party list. →
  `NoticeBoard`, `PinnedCard`.

### 9. Social tab
- **Function:** See everyone you know and how well you know them.
- **Placement:** One row per person: portrait at the left, then the name,
  then a row of hearts. Gift and talk markers sit at the right.
- **Spacing:** The rows are full width and one slot tall, separated by a
  thin line.
- **LeParty:** The host's guest list and check-in, and the members of a
  block in draw review. → `PersonRow`, `Hearts`.

### 10. Shipping summary (end of day)
- **Function:** Tally what you earned today, by category.
- **Placement:** A list of categories, each with an icon, a count and a
  coin total that ticks up. The grand total is at the bottom. OK is at
  the bottom right.
- **Spacing:** The numbers are right-aligned in a column. The total has a
  rule above it.
- **LeParty:** Phase 2 **Results**: placings and prize money paid. →
  `Tally`.

### 11. Collections
- **Function:** Show what you've found, and hint at what you haven't.
- **Placement:** A grid of slots. Undiscovered items are dark silhouettes,
  so you can see how many are left.
- **Spacing:** Slots touch, the same as the inventory.
- **LeParty:** "Who's going". Empty places show as silhouettes, not
  blanks. → `Slot` (`locked`).

### 12. Community Center bundles
- **Function:** A shared goal: fill these slots with these items.
- **Placement:** The bundle's name and icon at the top. Below that, the
  wanted items as slots, with the ones still needed greyed. Then a row of
  empty slots to drop items into, and progress shown as filled slots.
- **Spacing:** Two clear groups (wanted, and given), each tight inside
  and separated by about 8 art px.
- **LeParty:** The potluck "what's still short" meter. Each category is
  a bundle that fills as guests sign up. → `Bundle`.

### 13. Level up
- **Function:** Mark a milestone, then make one choice.
- **Placement:** A centred window with the skill and level at the top.
  Below that, two cards side by side, each an option with an icon and a
  short description. You pick one.
- **Spacing:** The two cards are equal width with a clear gap. The choice
  is the only thing on screen.
- **LeParty:** Phase 2 game picks: a team chooses who plays.
  → `ChoiceCard`.

### 14. Skills tab
- **Function:** Show your level in each skill.
- **Placement:** One row per skill: icon, name, then a bar of ten pips
  that fill as you level.
- **Spacing:** The pips are separated by one art pixel, so they count
  easily.
- **LeParty:** Capacity band at signup, and team totals in the draw. →
  `Pips`.

### 15. Options
- **Function:** Change settings.
- **Placement:** A scrolling list of rows: label at the left, control at
  the right (checkbox, slider or dropdown).
- **Spacing:** Even row height. The labels share one left edge and the
  controls share one right edge.
- **LeParty:** Host forms (create and edit a party). → `Field`,
  `Checkbox`, `Select`, `TextInput`.

### 16. Character creation
- **Function:** Make yourself: name and appearance.
- **Placement:** A preview of the character on the left. Text inputs and
  arrow cyclers on the right. OK at the bottom right.
- **Spacing:** Each input is its own row with its label above it.
- **LeParty:** `/signup` and identity. → `TextInput`, `Cycler`.

### 17. Quest log and special orders
- **Function:** Track what you've been asked to do, and the reward.
- **Placement:** A list of entries. The selected one opens to show its
  steps and its reward (with a coin) at the bottom. Special orders are
  pinned to a board as two cards side by side.
- **Spacing:** The entries are compact. The detail view gets more room.
- **LeParty:** "What happens next" on the booked page. → `QuestList`.

### 18. Day transition
- **Function:** Mark time passing.
- **Placement:** The screen fades out. A single centred line shows the
  new day, then the scene fades back in.
- **Spacing:** Nothing else on screen.
- **LeParty:** Phase 2 Act and round changes on the big screen. →
  `Interstitial`.

### 19. Festival and minigame scoreboards
- **Function:** Rank players at the end of a contest.
- **Placement:** A short ranked list with places down the left, names in
  the middle and scores right-aligned. First place is marked out.
- **Spacing:** Large text and few rows, so it reads from across a room.
- **LeParty:** The phase 2 big screen leaderboard. Eight teams read from
  across a room. → `Leaderboard`.

## The mapping, in one table

| LeParty screen                  | Game screen it borrows from      | Main components                         |
| ------------------------------- | -------------------------------- | --------------------------------------- |
| `/` home                        | Title screen                     | `TitleBanner`, `BigButton`              |
| `/signup`, identity             | Character creation               | `Field`, `TextInput`, `Pips`            |
| `/parties`, host party list     | Billboard                        | `NoticeBoard`, `PinnedCard`             |
| Invite `/i/[token]`             | Mail                             | `Letter`, `Dialogue`                    |
| Mugshot                         | Character creation preview       | `Window` (camera inside a frame)        |
| Potluck                         | Community Center bundles, shop   | `Bundle`, `ShopRow`                     |
| Booked                          | Quest log, item toast            | `QuestList`, `Toast`, `Stamp`           |
| Who's going                     | Collections                      | `SlotGrid`, `Slot` (`locked`)           |
| Host check-in                   | Social tab                       | `PersonRow`                             |
| Host draw review                | Social tab, skills               | `PersonRow`, `Pips`                     |
| Printable team cards            | (kept plain so they print and scan) | none                                 |
| Phase 2 team phone: spending    | Shop                             | `ShopScreen` (top bar, tabs, cards, details) |
| Phase 2 team phone: inventory   | Inventory                        | `Tabs`, `SlotGrid`, `Tooltip`, `Hotbar` |
| Phase 2 team phone: game picks  | Level up                         | `ChoiceCard`                            |
| Phase 2 results                 | Shipping summary                 | `Tally`                                 |
| Phase 2 big screen              | HUD, scoreboard, day transition  | `Clock`, `Leaderboard`, `Interstitial`  |
| Phase 2 drinks queue            | HUD energy bar                   | `EnergyBar` (30-second timer)           |
