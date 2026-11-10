# Fiona

A small animated cat who lives along the bottom of your screen and follows
your mouse. She's a white cat drawn in a pastel kawaii style: big round head, blob
body, stubby legs, sparkly eyes and blush. While she's running, your cursor is a fish. Windows only.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. Then, from this folder:

```bash
npm install
```

```bash
npm start
```

Fiona appears just above the taskbar. A fish icon appears in the tray
(the `^` area by the clock). Right-click it for the menu.

To build a single `Fiona.exe` you can double-click without Node:

```bash
npm run dist
```

The exe ends up in `dist/`.

## What she does

| You... | Fiona... |
| --- | --- |
| Move the mouse | Walks under it, or runs if it's far away |
| Stop moving | Sits and looks up at it, blinking |
| Bring the fish down to her | Eats it with happy eyes (crumbs, then hearts) |
| Hover over her | Shows her name |
| Click her | Hearts and happy eyes |
| Leave the mouse for 25 s | Curls up and sleeps |
| Move the mouse while she sleeps | Startles awake |
| Move to another monitor | Follows you, walking in from the side |

Tray menu: hide her, put her to sleep, turn the fish cursor on or off,
start with Windows, quit.

## How it works

| File | What it does |
| --- | --- |
| `src/main.js` | A transparent, always-on-top, click-through window, one strip tall, pinned to the bottom of the work area. Polls the global cursor about 60 times a second and sends it to the page. Tray menu. |
| `src/renderer.js` | Fiona's brain: the state machine (sit, walk, run, eat, sleep, wake), movement, eye and head tracking, particles. |
| `src/cat.js` | Fiona's body: a vector rig drawn with canvas paths. Also draws the fish. |
| `src/cursor.js` | Turns the rendered fish into a real `.cur` file and swaps it in as the Windows system cursor (arrow and link hand) through `user32.dll`. |
| `src/preload.js` | The bridge between the page and the main process. |

The window ignores the mouse everywhere except over Fiona herself, so
clicks go straight through to whatever is underneath.

### How she's animated

There are no image files. Fiona is a small rig of joints (hip,
shoulder, head, tail base), each with simple shapes on it: capsules for
the body and legs, circles, ellipses, and triangles for ears. All of it
is drawn every frame with canvas paths and one shared outline. Detail
is layered on top, clipped to her silhouette: gradient shading, fur
markings, blush, ear and chest fluff, toes, and eyes with a gradient
iris, lashes and sparkles.

- **Posture** is three key poses (stand, sit, lie) blended by two
  numbers that ease toward their targets. Sitting down, lying down and
  getting up are always smooth tweens, never cuts.
- **Legs** use two-bone IK: each foot follows a walk cycle (a trot when
  walking, a bound when running), and the knee works itself out.
- **The tail** is a chain of eight springy segments with a swish, each
  lagging the one before it, so it moves on its own.
- **Eyes and head** track the cursor. She blinks at random and turns
  around with a squash instead of snapping.

## The fish cursor

Windows doesn't let an app change the cursor just for itself while
hovering over other apps, so Fiona swaps the *system* cursor and puts
yours back when she quits. That covers the normal Quit, closing
from the terminal, crashes and shutdown.

The one case it can't cover is ending the process from Task Manager.
If your cursor stays a fish after that, go to **Settings → Bluetooth &
devices → Mouse → Additional mouse settings → Pointers** and click
**Apply**, or just sign out and back in.

## Tweaking

Speeds, distances and timings are constants at the top of
`src/renderer.js`. Her size is `SIZE` there too. The strip height is
`STRIP_HEIGHT` in `src/main.js`.

Her look lives in `src/cat.js`: colours in `COL` (swap the white for
peach, grey or lilac), proportions in `POSE` and `HEAD_RX`/`HEAD_RY`,
tail styles in `TAIL`.

You can also preview her in a browser without Electron: open
`src/index.html` and move the mouse over the page. The fish becomes the
page's cursor there too.
