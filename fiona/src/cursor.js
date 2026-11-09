// The food cursor: builds a Windows .cur file from the fish image the
// overlay page renders, then swaps it in as the system cursor while
// Fiona is running.
//
// Windows only. Swapping is global — it changes the pointer in every
// app, not just ours — so restore() must run on every way out. If the
// process is killed hard (Task Manager), the fish stays until you sign
// out or open Settings > Mouse pointer and re-apply your scheme.

const fs = require('fs');
const path = require('path');

// Windows cursor ids we replace (OCR_* constants from winuser.h).
const OCR_NORMAL = 32512; // the arrow
const OCR_HAND = 32649; // the link-hover hand
const SPI_SETCURSORS = 0x0057;

// ---- .cur file ----------------------------------------------------------

// `fish` is { size, hotspot: {x, y}, rgba } — straight RGBA pixels,
// top-down, as canvas getImageData() returns them.
function buildCurFile(fish) {
  const { size, hotspot, rgba } = fish;
  if (!(size > 0 && size < 256) || rgba.length !== size * size * 4) throw new Error('Bad fish image');
  const xorBytes = size * size * 4; // 32-bit BGRA
  const andRow = Math.ceil(size / 32) * 4; // 1bpp rows padded to 4 bytes
  const andBytes = andRow * size;
  const imageBytes = 40 + xorBytes + andBytes;

  const buf = Buffer.alloc(6 + 16 + imageBytes);
  let o = 0;
  // ICONDIR
  buf.writeUInt16LE(0, o); o += 2; // reserved
  buf.writeUInt16LE(2, o); o += 2; // type 2 = cursor
  buf.writeUInt16LE(1, o); o += 2; // one image
  // ICONDIRENTRY
  buf.writeUInt8(size, o++);
  buf.writeUInt8(size, o++);
  buf.writeUInt8(0, o++); // colour count
  buf.writeUInt8(0, o++); // reserved
  buf.writeUInt16LE(hotspot.x, o); o += 2;
  buf.writeUInt16LE(hotspot.y, o); o += 2;
  buf.writeUInt32LE(imageBytes, o); o += 4;
  buf.writeUInt32LE(22, o); o += 4; // image starts right after the header
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, o); o += 4;
  buf.writeInt32LE(size, o); o += 4;
  buf.writeInt32LE(size * 2, o); o += 4; // XOR + AND masks stacked
  buf.writeUInt16LE(1, o); o += 2; // planes
  buf.writeUInt16LE(32, o); o += 2; // bits per pixel
  buf.writeUInt32LE(0, o); o += 4; // BI_RGB
  buf.writeUInt32LE(xorBytes + andBytes, o); o += 4;
  o += 16; // resolution + palette fields, all zero

  const xorStart = o;
  const andStart = o + xorBytes;
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y; // bitmaps are stored bottom-up
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const p = xorStart + (row * size + x) * 4;
      buf[p] = rgba[s + 2]; // B
      buf[p + 1] = rgba[s + 1]; // G
      buf[p + 2] = rgba[s]; // R
      buf[p + 3] = rgba[s + 3]; // A — soft edges stay soft
      // Fully transparent: set the AND-mask bit too, for older cursor paths.
      if (rgba[s + 3] === 0) buf[andStart + row * andRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return buf;
}

// ---- Windows system cursor swap ----------------------------------------

let user32 = null;
let swapped = false;

function loadUser32() {
  if (user32) return user32;
  const koffi = require('koffi');
  const lib = koffi.load('user32.dll');
  user32 = {
    LoadCursorFromFileW: lib.func('void* __stdcall LoadCursorFromFileW(const char16_t *name)'),
    SetSystemCursor: lib.func('bool __stdcall SetSystemCursor(void *hcur, uint32_t id)'),
    SystemParametersInfoW: lib.func(
      'bool __stdcall SystemParametersInfoW(uint32_t action, uint32_t param, void *pv, uint32_t winIni)'
    ),
  };
  return user32;
}

function apply(dir, fish) {
  if (process.platform !== 'win32') return false;
  const file = path.join(dir, 'fiona-fish.cur');
  fs.writeFileSync(file, buildCurFile(fish));
  const u = loadUser32();
  // SetSystemCursor takes ownership of (and destroys) the handle it's
  // given, so each cursor id needs its own freshly loaded copy.
  for (const id of [OCR_NORMAL, OCR_HAND]) {
    const handle = u.LoadCursorFromFileW(file);
    if (!handle) throw new Error(`Couldn't load ${file}`);
    u.SetSystemCursor(handle, id);
  }
  swapped = true;
  return true;
}

function restore() {
  if (!swapped || process.platform !== 'win32') return;
  // Reloads the user's own cursor scheme from the registry.
  loadUser32().SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0);
  swapped = false;
}

module.exports = { buildCurFile, apply, restore, isSwapped: () => swapped };
