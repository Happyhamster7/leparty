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

## Open gaps, resolved where possible

Found by running this doc through a design-system audit. Three are
resolved below with concrete rules; one is flagged because it needs a
decision, not more documentation.

### Text-on-fill contrast — resolved

The doc only stated one pairing ("dark brown on parchment"), but the
component list uses text on at least eight fills. Computed WCAG
relative luminance for each palette color and picked whichever of
Outline (`#3b1d12`) or Cream (`#fff6c8`) passes AA (4.5:1 normal text)
by the wider margin:

| Fill | Outline contrast | Cream contrast | Use |
| --- | --- | --- | --- |
| Parchment | 12.5:1 | 1.1:1 | **Outline** |
| Parchment shade | ~12:1 | ~1.2:1 | **Outline** |
| Tan | 7.4:1 | 1.9:1 | **Outline** |
| Wood light | 7.4:1 | 1.9:1 | **Outline** |
| Gold | 8.5:1 | 1.7:1 | **Outline** |
| Green | 4.6:1 | 3.1:1 | **Outline** (not Cream — green is the one fill where dark text wins) |
| Red | 3.1:1 | 4.5:1 | **Cream** (just clears AA — don't darken Red further) |
| Wood | 2.8:1 | 5.1:1 | **Cream** |
| Wood dark | 1.6:1 | 8.9:1 | **Cream** |

Rule of thumb that holds for every case above: **light fills take
Outline text, Wood/Wood dark/Red take Cream text.** Green is the
exception worth remembering — it looks as dark as Red but needs the
opposite text color. Blue isn't used as a text background anywhere in
the current component list (team-color swatches only), so it's
unverified — check it before using it as one.

### Multi-surface scale — resolved

The kit already parameterizes icon size with `--icon-scale` (seen at
`3` for inline UI and `6` for portraits) — this just formalizes that
existing mechanism into a per-surface rule instead of leaving it
per-instance guesswork:

| Surface | Viewing distance | Scale | Effective art pixel |
| --- | --- | --- | --- |
| Team phone | In hand | `--icon-scale: 3` | 9px |
| Cafeteria iPad | Arm's length | `--icon-scale: 4` | 12px |
| Big screen (TV/monitor) | Across the room | `--icon-scale: 6`–`8` | 18–24px |

Apply the same multiplier to frame borders and spacing tokens on each
surface, not just icons — a 3px hairline that's crisp on a phone is
invisible on a TV eight feet away.

### Interaction states — resolved

The kit's own CSS says buttons "lift on hover and press down one art
pixel," but that detail got dropped when this doc summarized the
component list. Restoring it, and extending the same convention to
every other interactive piece so there's one rule instead of
per-component guessing:

- **Press:** every clickable element (button, cycler arrow, stepper
  arrow, shop card, tab) translates down 1 art pixel (3px at
  phone scale) on `:active`, matching the existing non-pixel `.btn`
  convention (`transform: translate(4px, 4px)`) already in
  `globals.css` — same idea, pixel-grid distance instead of 4px.
- **Disabled:** dim to the icon set's existing `--dim` treatment
  (already defined for icons; extend it to text and borders on
  disabled buttons/slots, not just icon glyphs).
- **Focus:** reuse the existing `outline: 2px solid var(--rust)`
  focus-visible rule from the non-pixel stylesheet — rust-red works
  against both light and dark fills per the contrast table above, so
  it doesn't need a pixel-specific override.
- **Error:** not in the kit at all. Needs a decision, not a
  retrofit — see below.

### Type scale — resolved

Only font families were specified, no sizes. The kit's own title-screen
demo used `font-size: 54px`, so anchoring a scale to that real value
and keeping every step a multiple of 3 (matching the grid):

| Role | Size |
| --- | --- |
| Display / huge | 54px |
| H1 | 36px |
| H2 | 24px |
| Body | 15px |
| Label / mono | 12px |
| Micro (chips, tags) | 9px |

### Error states — needs a decision, not more documentation

Neither artifact shows a failed action (a purchase that can't be
afforded past the price tag, a rejected pick, a lost connection). The
non-pixel app already has `.error` (red text) and `.notice` styling to
draw from, but nobody's decided whether pixel errors are a shake
animation, a red flash on the frame, a toast, or something else. Pick
one before `src/` work starts on the shop or pick-form screens, since
both already have real failure paths (`submitPicks`'s error returns,
a shop purchase a team can't afford).

## Not yet built

- `scripts/pixel-sprites.py` — the actual sprite art generation.
- Any CSS/component implementation in `src/` — both artifacts are
  design references only; nothing from either has been wired into the
  running app yet.
