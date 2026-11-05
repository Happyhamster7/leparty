# LeParty — pixel UI reference

Decided: the pixel-art, Stardew Valley-inspired skin is the chosen
visual direction for LeParty, for now. This file mirrors the design
work done in two Claude artifacts so it travels with the code.

Source docs:
- Kit: https://claude.ai/code/artifact/39c09bc5-1b58-4c64-8a02-9bf720c4e797
- Skin comparison (pixel vs. the "Fantasy RPG" alternative, before pixel was chosen): https://claude.ai/code/artifact/95a85e19-e96a-4f6f-8444-e26940f87825

The kit's own intro says the art is drawn by `scripts/pixel-sprites.py`.
**That script doesn't exist in the repo yet** — this doc is the design
reference; generating the actual sprite assets is separate, unstarted
work.

## Foundations

One art pixel is 3 CSS px. Every size is a multiple of it.

**Palette**

| Name | Hex |
| --- | --- |
| Outline | `#3b1d12` |
| Wood dark | `#6e3416` |
| Wood | `#a3521f` |
| Wood light | `#eaa65a` |
| Parchment | `#fde6b2` |
| Parchment shade | `#f2cd8a` |
| Tan | `#dcab68` |
| Cream | `#fff6c8` |
| Gold | `#f2b72c` |
| Green | `#4f9e3a` |
| Red | `#c9402f` |
| Blue | `#24477e` |

**Spacing** — all multiples of the 3px base unit:

| Token | Value | Use |
| --- | --- | --- |
| `--px` | 3px | Hairlines, pressed offset |
| `--s-1` | 6px | Icon to label |
| `--s-2` | 12px | Inside rows and chips |
| `--s-3` | 18px | Inside frames, between rows |
| `--s-4` | 24px | Between groups |
| `--s-5` | 36px | Between sections |
| `--s-6` | 48px | Above a title |

**Type:** Jersey 10 for titles and numbers; Pixelify Sans for body text.
Dark brown on parchment, never black on white.

## Frames (9-slice sprites, light from top-left)

`wood`, `hud`, `board`, `paper`, `tooltip`, `slot`, `slot-locked`,
`slot-active`, `btn`, `btn-paper`, `btn-green`, `btn-red`, `plank`.

## Icons

16 art px, drawn at 3x; small inline icons at 8 art px. Set includes:
coin, star, heart, hourglass, mug, cocktail, shot, water, pie,
drumstick, salad, bread, pumpkin, envelope, key, camera, shield,
scroll, trophy, ok, cancel, chest, potion, skull, eye, back, warden,
plus small (`-s`) and dimmed variants.

## Components the kit builds

Buttons (primary/paper/confirm/danger/disabled, plus big icon nav
buttons), SlotGrid/Slot with floating tooltips, Tabs, Hotbar, HUD
(Clock, Wallet with digit readout, EnergyBar, Pips, Hearts), Feedback
(Toast, Dialogue box with portrait, Interstitial act-transition
screen), Forms (text/select/checkbox-as-slot, Costume cycler, Quantity
stepper), Shop (ShopStatus, item cards with price tags and sold-out
state, ItemDetails dialog with team-target cycler + stepper + total),
Lists (ShopRow, PersonRow, Tally, Bundle, QuestList, ChoiceCard,
Leaderboard), NoticeBoard/PinnedCard, Letter.

The kit also mocks up full screens, not just components: the existing
Phase 1 guest flow re-skinned (using the current `cellblock`/`tier`/
`cell` classes already in `globals.css`), the host console, and new
Phase 2 screens (shop, player-pick, round results, big-screen
leaderboard and "at the bar" drinks queue).

## Content that answers open design questions

The kit proposes concrete numbers not yet decided anywhere else in the
docs:

- **Drink types**: Beer (10 money, +2 pts), Shot (15, +3 pts),
  Cocktail (25, +5 pts), Water (5, +1 pt).
- **Item prices**: Reflect 40, Eye Spy 25.
- **Prize money example breakdown**: placing 60, star 30, best-costume
  bonus 20.

These are proposals from the kit, not yet confirmed decisions — treat
them as a starting point for `docs/halloween-game-design.md`'s open
"drink types, points and cost" question, not as settled numbers.

## Known drift to reconcile

The kit's Act-transition Interstitial screen reads "Lights out" — the
*old* phase name from before the jail-economy redesign. The current
design (`docs/halloween-game-design.md`) uses Spending → Drinks, not
Lights out. Fix this when the pixel skin is actually implemented.

## Not yet built

- `scripts/pixel-sprites.py` — the actual sprite art generation.
- Any CSS/component implementation in `src/` — both artifacts are
  design references only; nothing from either has been wired into the
  running app yet.
