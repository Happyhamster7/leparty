# Fiona

A small pixel cat who lives along the bottom of your screen and follows
your mouse. While she's running, your cursor is a fish. Windows only.

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
| Bring the fish down to her | Eats it (crumbs, then hearts) |
| Hover over her | Shows her name |
| Click her | Hearts |
| Leave the mouse for 25 s | Curls up and sleeps |
| Move the mouse while she sleeps | Startles awake |
| Move to another monitor | Follows you, walking in from the side |

Tray menu: hide her, put her to sleep, turn the fish cursor on or off,
start with Windows, quit.

## How it works

| File | What it does |
| --- | --- |
| `src/main.js` | A transparent, always-on-top, click-through window, one strip tall, pinned to the bottom of the work area. Polls the global cursor about 60 times a second and sends it to the page. Tray menu. |
| `src/renderer.js` | Fiona's state machine (sit, walk, run, eat, sleep, wake), animation and particles, drawn on a canvas. |
| `src/art.js` | All the pixel art as text grids: one character is one pixel. Edit these to redraw her. |
| `src/cursor.js` | Builds a real `.cur` file from the fish grid and swaps it in as the Windows system cursor (arrow and link hand) through `user32.dll`. |
| `src/preload.js` | The bridge between the page and the main process. |

The window ignores the mouse everywhere except over Fiona herself, so
clicks go straight through to whatever is underneath.

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
`src/renderer.js`. The size is `S` (screen pixels per art pixel,
default 3). The strip height is `STRIP_HEIGHT` in `src/main.js`.

To redraw her, edit the grids in `src/art.js`. Every row of a frame
must be the same width. Check them with:

```bash
node -e "require('./src/art').checkArt()"
```

You can also preview her in a browser without Electron: open
`src/index.html` and move the mouse over the page.
