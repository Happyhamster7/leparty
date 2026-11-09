// All of Fiona's pixel art, as text grids. One character = one pixel.
// Shared by the main process (cursor file, tray icon) and the renderer
// (the cat herself), so it has no dependencies.
//
// Sprites face RIGHT; the renderer mirrors them when she walks left.
// To redraw her, edit the grids — every row in a frame must be the
// same width (checkArt() below throws if not).

(function (root) {
  const palette = {
    '.': null, // transparent
    K: '#2b2118', // outline, eyes
    F: '#e8a25a', // ginger fur
    f: '#b8733a', // darker stripes
    W: '#f6eedf', // white chest and paws
    P: '#e8889a', // nose
    B: '#6f9fc8', // fish body
    L: '#cfe3f0', // fish belly
  };

  const head = {
    walk: [
      '......................',
      '......................',
      '..............K....K..',
      '.K...........KFK..KFK.',
      'KFK..........KFFKKFFK.',
      'KFK.........KFFFFFFFFK',
      '.KFK........KFFKFFFKFK',
      '..KFK.......KFFFFPFFFK',
      '...KKKKKKKKKKWWWWWWWK.',
      '...KFfFFfFFfFFWWWWWK..',
      '...KFFFFFFFFFFFWWWWK..',
      '...KFFFFFFFFFFFFFFFK..',
      '....KFFKKKKKKKFFK.....',
    ],
  };

  const frames = {
    walk1: head.walk.concat([
      '...KFFK.......KFFK....',
      '..KWWK.........KWWK...',
      '..KKKK.........KKKK...',
    ]),
    walk2: head.walk.concat([
      '....KFFK....KFFK......',
      '....KWWK....KWWK......',
      '....KKKK....KKKK......',
    ]),
    sit: [
      '......................',
      '......................',
      '............K....K....',
      '...........KFK..KFK...',
      '...........KFFKKFFK...',
      '..........KFFFFFFFFK..',
      '..........KFFKFFFKFK..',
      '..........KFFFFPFFFK..',
      '...........KWWWWWWK...',
      '.........KFFWWWWWWFK..',
      '........KFFFWWWWWFFK..',
      '.......KFFFFWWWWWFFK..',
      '.......KFFFFFWWWFFFK..',
      'KKKKKKKKFFFFFKWWKFFK..',
      'KFFFFFFKFFFFFKWWKFFK..',
      'KKKKKKKKKKKKKKKKKKKK..',
    ],
    sleep: [
      '......................',
      '......................',
      '......................',
      '......................',
      '......................',
      '......................',
      '......................',
      '..............K...K...',
      '.............KFK.KFK..',
      '....KKKKKKKKKFFFKFFFK.',
      '...KFfFFfFFfFFFFFFFFFK',
      '..KFFFFFFFFFFFKKFFKKFK',
      '..KFFFFFFFFFFFFFFPFFFK',
      '..KFFFFFFFFFFFFWWWWWK.',
      'KKKKFFFFFFFFFFFWWWWWK.',
      'KKKKKKKKKKKKKKKKKKKKK.',
    ],
  };
  // Blink: the sit frame with the eyes filled in.
  frames.blink = frames.sit.map((row, i) =>
    i === 6 ? '..........KFFFFFFFFK..' : row
  );

  // The food cursor. Hotspot is the fish's mouth (left middle).
  const fish = {
    hotspot: { x: 0, y: 7 },
    grid: [
      '................',
      '................',
      '................',
      '....KKKKK.......',
      '..KKBBBBBKK...KK',
      '.KBBKBBBBBBK.KBK',
      'KBBBBBBBBBBBKBBK',
      'KBBBBBBBBBBBBBK.',
      'KLLLLLLLLLLLKBBK',
      '.KLLLLLLLLLK.KBK',
      '..KKLLLLLKK...KK',
      '....KKKKK.......',
      '................',
      '................',
      '................',
      '................',
    ],
  };

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function checkArt() {
    const all = Object.assign({}, frames, { fish: fish.grid });
    for (const [name, grid] of Object.entries(all)) {
      const w = grid[0].length;
      grid.forEach((row, i) => {
        if (row.length !== w) {
          throw new Error(`art: ${name} row ${i} is ${row.length} wide, expected ${w}`);
        }
        for (const ch of row) {
          if (!(ch in palette)) throw new Error(`art: ${name} row ${i} has unknown pixel "${ch}"`);
        }
      });
    }
  }

  const art = { palette, frames, fish, hexToRgb, checkArt };
  if (typeof module !== 'undefined' && module.exports) module.exports = art;
  else root.FionaArt = art;
})(this);
