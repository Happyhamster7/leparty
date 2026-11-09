// Electron main process: the overlay window, the cursor feed, the tray.
//
// The overlay is a transparent, always-on-top, click-through strip that
// sits on the bottom edge of the work area (just above the taskbar). It
// can't see the mouse on its own once the pointer leaves it, so we poll
// the global cursor position and stream it to the renderer.

const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const cursor = require('./cursor');

const STRIP_HEIGHT = 170; // px of screen Fiona lives in, incl. room for hearts and Zs
const POLL_MS = 16; // ~60 cursor samples a second

let win = null;
let tray = null;
let currentDisplayId = null;
let hidden = false;
let settings = { foodCursor: true };
let fishImage = null; // rendered by the overlay page; see 'fish' below

// ---- settings -----------------------------------------------------------

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    // first run, or unreadable — keep defaults
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Could not save settings', err);
  }
}

// ---- food cursor --------------------------------------------------------

function setFoodCursor(on) {
  try {
    if (on && fishImage) cursor.apply(app.getPath('userData'), fishImage);
    else cursor.restore();
  } catch (err) {
    console.error('Food cursor failed', err);
  }
}

// Every way out must hand the user their normal cursor back.
function restoreCursorSafely() {
  try {
    cursor.restore();
  } catch {
    // nothing more we can do on the way out
  }
}
process.on('exit', restoreCursorSafely);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restoreCursorSafely();
    process.exit(0);
  });
}
process.on('uncaughtException', (err) => {
  restoreCursorSafely();
  console.error(err);
  process.exit(1);
});

// ---- overlay window -----------------------------------------------------

function stripBounds(display) {
  const wa = display.workArea; // excludes the taskbar
  return {
    x: wa.x,
    y: wa.y + wa.height - STRIP_HEIGHT,
    width: wa.width,
    height: STRIP_HEIGHT,
  };
}

function createWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  currentDisplayId = display.id;

  win = new BrowserWindow({
    ...stripBounds(display),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // never steal focus from what you're doing
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // keep animating while unfocused (always)
    },
  });

  // 'screen-saver' is the highest z-level; keeps her above normal windows.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
}

// Move the strip to whichever monitor the cursor is on, and tell the
// renderer which side she should walk in from.
function followDisplay(point) {
  const display = screen.getDisplayNearestPoint(point);
  if (display.id === currentDisplayId) return;
  const old = screen.getAllDisplays().find((d) => d.id === currentDisplayId);
  currentDisplayId = display.id;
  win.setBounds(stripBounds(display));
  const from = old && old.bounds.x > display.bounds.x ? 'right' : 'left';
  win.webContents.send('enter', from);
}

function startCursorFeed() {
  setInterval(() => {
    if (!win || win.isDestroyed() || hidden) return;
    const p = screen.getCursorScreenPoint();
    followDisplay(p);
    const b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, POLL_MS);
}

// The window is click-through, except while the pointer is over Fiona
// herself — then it accepts clicks so you can pet her.
ipcMain.on('interactive', (_e, on) => {
  if (!win || win.isDestroyed()) return;
  if (on) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

// The page draws the fish (it has a canvas; we don't) and sends the
// pixels here. It becomes both the system cursor and the tray icon.
ipcMain.on('fish', (_e, img) => {
  fishImage = { size: img.size, hotspot: img.hotspot, rgba: Buffer.from(img.rgba) };
  if (settings.foodCursor) setFoodCursor(true);
  if (tray) tray.setImage(trayIcon());
});

// ---- tray ---------------------------------------------------------------

function trayIcon() {
  if (!fishImage) return nativeImage.createEmpty();
  // Raw BGRA is Windows' native bitmap order.
  const { size, rgba } = fishImage;
  const bgra = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2];
    bgra[i + 1] = rgba[i + 1];
    bgra[i + 2] = rgba[i];
    bgra[i + 3] = rgba[i + 3];
  }
  return nativeImage.createFromBitmap(bgra, { width: size, height: size }).resize({ width: 16, height: 16, quality: 'best' });
}

function buildMenu() {
  const login = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: 'Fiona', enabled: false },
    { type: 'separator' },
    {
      label: hidden ? 'Let Fiona out' : 'Hide Fiona',
      click: () => {
        hidden = !hidden;
        if (hidden) win.hide();
        else win.showInactive();
        tray.setContextMenu(buildMenu());
      },
    },
    { label: 'Put her to sleep', click: () => win.webContents.send('command', 'sleep') },
    { type: 'separator' },
    {
      label: 'Fish cursor',
      type: 'checkbox',
      checked: settings.foodCursor,
      enabled: process.platform === 'win32',
      click: (item) => {
        settings.foodCursor = item.checked;
        saveSettings();
        setFoodCursor(item.checked);
      },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: login.openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Fiona');
  tray.setContextMenu(buildMenu());
}

// ---- lifecycle ----------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit(); // one Fiona is plenty
} else {
  app.whenReady().then(() => {
    loadSettings();
    createWindow();
    createTray();
    startCursorFeed();
    // The fish cursor goes on once the page has sent its picture.

    // Monitors plugged/unplugged or taskbar moved: re-fit the strip.
    const refit = () => {
      const d = screen.getAllDisplays().find((x) => x.id === currentDisplayId) || screen.getPrimaryDisplay();
      currentDisplayId = d.id;
      win.setBounds(stripBounds(d));
    };
    screen.on('display-metrics-changed', refit);
    screen.on('display-removed', refit);
    screen.on('display-added', refit);

    powerMonitor.on('shutdown', restoreCursorSafely);
  });

  app.on('will-quit', restoreCursorSafely);
  app.on('window-all-closed', () => app.quit());
}
