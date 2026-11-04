"""Draws every sprite for the pixel skin. All the art is original.

Run from the repo root:   python3 scripts/pixel-sprites.py

Writes:
  public/pixel/*.png               frames (pre-scaled 3x), icon sheet (1x),
                                   floor tile, cursor
  src/components/pixel/sprites.css frame classes and icon positions
  src/components/pixel/icons.ts    the IconName type, kept in sync

Conventions (see docs/pixel-ui-reference.md):
  - One art pixel = 3 CSS px. Frames are exported already scaled, so
    9-slice borders never get resampled by the browser.
  - Icons are 16x16 with a 1px dark outline added automatically. They
    are exported at 1x and scaled in CSS with image-rendering: pixelated,
    so one sheet serves every size (2x, 3x, 4x).
  - In the ASCII maps, '.' is transparent and gets outlined; ',' is
    transparent and never outlined (for holes like a mug handle).

Needs Pillow:  pip install pillow
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'pixel'
KIT = ROOT / 'src' / 'components' / 'pixel'
SCALE = 3  # CSS px per art pixel

# ---------------------------------------------------------------- palette
P = {
    'K': '#3b1d12',  # outline, darkest brown
    # wood
    'w': '#6e3416', 'W': '#a3521f', 'y': '#d07a34', 'Y': '#eaa65a', 'h': '#f6cf8a',
    # parchment
    'p': '#fde6b2', 'P': '#f2cd8a', 'q': '#dcab68',
    # slot
    's': '#f3c98a', 'S': '#cf9455',
    # gold
    'g': '#b8730f', 'G': '#f2b72c', 'j': '#ffe27a', 'J': '#fff6c8',
    # green
    'e': '#2f6b2c', 'E': '#4f9e3a', 'f': '#86cf4c', 'F': '#c4ef7c',
    # red
    'r': '#8a2222', 'R': '#c9402f', 't': '#ee6e4e', 'T': '#ffb08a',
    # blue
    'b': '#24477e', 'B': '#3b7bc7', 'c': '#72b6ee', 'C': '#c6e8ff',
    # purple
    'v': '#4d2a6e', 'V': '#7d45a8', 'x': '#b07ad8',
    # pumpkin
    'o': '#a8470f', 'O': '#e07a1d', 'n': '#f8a845',
    # iron
    'i': '#3d3a40', 'I': '#6d6a73', 'l': '#a5a3ab', 'L': '#dcdbe0', 'Z': '#ffffff',
    # baked
    'm': '#6b3a1c', 'M': '#a8652c', 'u': '#d79a52',
    # skin
    'a': '#f4c095', 'A': '#d48c5e',
    # floor
    'Q': '#2e1a10', 'd': '#4a2e1c', 'D': '#58371f', 'z': '#664127',
}


def rgba(ch):
    h = P[ch].lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


CLEAR = (0, 0, 0, 0)


def scaled(img, k=SCALE):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


# ----------------------------------------------------------------- frames
def frame(w, h, rings, fill, chamfer=0, open_bottom=False):
    """Concentric rings from the outside in, each (top-left, bottom-right)
    colour, so every frame gets the same light-from-top-left bevel."""
    img = Image.new('RGBA', (w, h), CLEAR)
    for y in range(h):
        for x in range(w):
            dx = min(x, w - 1 - x)
            dy = y if open_bottom else min(y, h - 1 - y)
            d = min(dx, dy)
            if chamfer:
                d = min(d, dx + dy - chamfer)
            if d < 0:
                continue
            if d >= len(rings):
                img.putpixel((x, y), rgba(fill))
                continue
            tl, br = rings[d]
            top = y <= h - 1 - y or open_bottom
            left = x <= w - 1 - x
            use_tl = (top and dy <= dx) or (left and dx < dy)
            img.putpixel((x, y), rgba(tl if use_tl else br))
    return img


# name: (rings, fill, chamfer, open_bottom). Slice = rings + 1 art px.
FRAMES = {
    'wood': ([('K', 'K'), ('h', 'y'), ('Y', 'W'), ('y', 'W'), ('w', 'w')], 'p', 2, False),
    'hud': ([('K', 'K'), ('h', 'y'), ('w', 'w')], 'p', 2, False),
    'board': ([('K', 'K'), ('Y', 'W'), ('y', 'W'), ('W', 'w'), ('w', 'w'), ('K', 'K')], 'M', 2, False),
    'paper': ([('q', 'q'), ('J', 'P')], 'p', 1, False),
    'tooltip': ([('K', 'K'), ('J', 'P')], 'p', 1, False),
    'slot': ([('M', 'M'), ('S', 's')], 's', 0, False),
    'slot-locked': ([('M', 'M'), ('m', 'q')], 'q', 0, False),
    'slot-active': ([('R', 'R'), ('t', 't')], 's', 0, False),
    'btn': ([('K', 'K'), ('h', 'W'), ('Y', 'y')], 'Y', 1, False),
    'btn-down': ([('K', 'K'), ('W', 'h'), ('y', 'Y')], 'y', 1, False),
    'btn-paper': ([('K', 'K'), ('J', 'q'), ('p', 'P')], 'p', 1, False),
    'btn-paper-down': ([('K', 'K'), ('q', 'J'), ('P', 'p')], 'P', 1, False),
    'btn-green': ([('K', 'K'), ('F', 'e'), ('f', 'E')], 'f', 1, False),
    'btn-green-down': ([('K', 'K'), ('e', 'F'), ('E', 'f')], 'E', 1, False),
    'btn-red': ([('K', 'K'), ('T', 'r'), ('t', 'R')], 't', 1, False),
    'btn-red-down': ([('K', 'K'), ('r', 'T'), ('R', 't')], 'R', 1, False),
    'tab': ([('K', 'K'), ('h', 'y'), ('Y', 'W')], 'p', 1, True),
    'tab-idle': ([('K', 'K'), ('Y', 'W'), ('y', 'W')], 'y', 1, True),
    'bar': ([('K', 'K'), ('w', 'w')], 'i', 1, False),
    'plank': ([('K', 'K'), ('Y', 'W'), ('y', 'w')], 'W', 0, False),
    # Shop cards: wood frame, and a gold ring when highlighted.
    'card': ([('K', 'K'), ('h', 'W'), ('w', 'w')], 'J', 1, False),
    'card-active': ([('K', 'K'), ('j', 'g'), ('G', 'G'), ('g', 'g')], 'J', 1, False),
    # Price tag on a card.
    'tag': ([('K', 'K'), ('h', 'W')], 'Y', 1, False),
    'tag-short': ([('K', 'K'), ('L', 'I')], 'l', 1, False),
}

# ------------------------------------------------------------------ icons
ICONS = {
    'coin': [
        '....gggggg....',
        '..ggGGGGGGgg..',
        '.gGGjjjjjjGGg.',
        '.gGjJJjjjjjGg.',
        'gGjJjjGGjjjjGg',
        'gGjjjGjjGjjjGg',
        'gGjjjGjjGjjjGg',
        'gGjjjGjjGjjjGg',
        'gGjjjGjjGjjjGg',
        'gGjjjjGGjjjjGg',
        '.gGjjjjjjjjGg.',
        '.gGGjjjjjjGGg.',
        '..ggGGGGGGgg..',
        '....gggggg....',
    ],
    'star': [
        '......jj......',
        '.....jJJj.....',
        '.....jJGj.....',
        '....jJGGGj....',
        'jjjjjJGGGGjjjj',
        'jJJJJGGGGGGGGj',
        '.jGGGGGGGGGGj.',
        '..jGGGGGGGGj..',
        '...gGGGGGGg...',
        '...gGGggGGg...',
        '..gGGg..gGGg..',
        '..gGg....gGg..',
        '.gGg......gGg.',
        '.gg........gg.',
    ],
    'heart': [
        '..rRR....RRr..',
        '.rRttR..RttRr.',
        'rRtTTtRRttttRr',
        'rRtTttttttttRr',
        'rRttttttttttRr',
        'rRttttttttttRr',
        '.rRttttttttRr.',
        '..rRttttttRr..',
        '...rRttttRr...',
        '....rRttRr....',
        '.....rRRr.....',
        '......rr......',
    ],
    'hourglass': [
        '.wwwwwwwwwwww.',
        '.wYYYYYYYYYYw.',
        '..lCCCCCCCCl..',
        '..lCjjjjjjCl..',
        '...lCjjjjCl...',
        '....lCjjCl....',
        '.....lCjl.....',
        '.....ljCl.....',
        '....lCCjCl....',
        '...lCCCjCCl...',
        '..lCCCjjjCCl..',
        '..lCjjjjjjjl..',
        '.wYYYYYYYYYYw.',
        '.wwwwwwwwwwww.',
    ],
    'mug': [
        '..ZZZZZZZZ....',
        '.ZZLZZZZLZZ...',
        '.ZZZZZZZZZZ...',
        '.wGGGGGGGGw...',
        '.wGjGGGGGGwwww',
        '.wGjGGGGGGw,,w',
        '.wGjGGGGGGw,,w',
        '.wGjGGGGGGw,,w',
        '.wGjGGGGGGwwww',
        '.wGjGGGGGGw...',
        '.wGGGGGGGGw...',
        '.wgggggggGw...',
        '.wwwwwwwwww...',
    ],
    'cocktail': [
        'CCCCCCCCCCCCCC',
        'cVVxxVVVVVVVVc',
        '.cVxVVVVVeVVc.',
        '..cVVVVVeEVc..',
        '...cVVVVVVc...',
        '....cVVVVc....',
        '.....cVVc.....',
        '......lL......',
        '......lL......',
        '......lL......',
        '......lL......',
        '....lLLLLl....',
        '...lLLLLLLl...',
    ],
    'shot': [
        '..CCCCCCCCCC..',
        '..CZnnnnnnLC..',
        '..CZnOOOOnLC..',
        '...CnOOOOnC...',
        '...CnOOOOnC...',
        '...CZOOOOLC...',
        '...CLLLLLLC...',
        '....CLLLLC....',
        '....CCCCCC....',
    ],
    'water': [
        '.....iiii.....',
        '.....IIII.....',
        '.....cCCc.....',
        '....cCCCCc....',
        '...cCBBBBCc...',
        '...cCBBBBBc...',
        '...cZZZZZZc...',
        '...cZbbbbZc...',
        '...cZZZZZZc...',
        '...cCBBBBBc...',
        '...cCBBBBBc...',
        '...cBBBBBBc...',
        '....cccccc....',
    ],
    'pie': [
        '....uuuuuu....',
        '..uuMuuuuMuu..',
        '.uMuuRRuuuuMu.',
        '.uuuRtRuRRuuu.',
        'uMuuuRuRtRuuMu',
        'uuuMuuuuRuuMuu',
        'mMMMMMMMMMMMMm',
        'mMuMuMuMuMuMum',
        '.mmmmmmmmmmmm.',
        '..LLLLLLLLLL..',
    ],
    'drumstick': [
        '...MMMMM......',
        '..MuuuuuMM....',
        '.MuuYYuuuuM...',
        '.MuYuuuuuuM...',
        'MuuuuuuuuuuM..',
        'MuuuuuuuuuMm..',
        'MMuuuuuuuMm...',
        '.mMMuuuMMm....',
        '..mmMMMmZZ....',
        '.......ZZLZ...',
        '......ZLZZLZ..',
        '.......ZLZL...',
        '........LL....',
    ],
    'salad': [
        '....F...F.....',
        '..fFEfFfFEf...',
        '.EfFRtEfFfEf..',
        'EfEtRfEfEfEfE.',
        'wWYYYYYYYYYYWw',
        'wWWYYYYYYYYWWw',
        '.wWWWWWWWWWWw.',
        '..wWWWWWWWWw..',
        '...wwwwwwww...',
        '.....wwww.....',
    ],
    'bread': [
        '....uuuuuu....',
        '..uuYYYYYYuu..',
        '.uYYhYYhYYYYu.',
        'uYYhYYhYYhYYYu',
        'uYhYYhYYhYYYYu',
        'uYYYYYYYYYYYYu',
        'uMMMMMMMMMMMMu',
        '.mMMMMMMMMMMm.',
        '..mmmmmmmmmm..',
    ],
    'pumpkin': [
        '......ee......',
        '......Ee......',
        '...OOOeOOO....',
        '..OnnOOOnnOO..',
        '.OnnOOnOOnnOO.',
        'OnnOOnnOOnnOOO',
        'OnOOnnOOOnnOOo',
        'OnOOnOOOOOnOOo',
        'OnOOnOOOOOnOOo',
        'OOOOnOOOOOnOOo',
        '.OOOOOOOOOOOo.',
        '.oOOOOOOOOOoo.',
        '..ooooooooo...',
    ],
    'envelope': [
        'PppppppppppppP',
        'PPppppppppppPP',
        'PpPppppppppPpP',
        'PppPppppppPppP',
        'PpppPpRRpPpppP',
        'PppppPRtPppppP',
        'PpppppRRpppppP',
        'PppppppppppppP',
        'PppppppppppppP',
        'PPPPPPPPPPPPPP',
    ],
    'key': [
        '..GGGG........',
        '.GjjjjG.......',
        'GjG,,GjG......',
        'GjG,,GjGGGGGGG',
        'GjG,,GjjjjjjjG',
        'GjG,,GjGGjGGjG',
        '.GjjjjG..G..G.',
        '..GGGG........',
    ],
    'camera': [
        '...IIII.......',
        '.iiiiiiiiiiii.',
        'iIIIIIIIIIIRIi',
        'iIIIIiiiiIIIIi',
        'iIIIiCcccciIIi',
        'iIIIiCcbBciIIi',
        'iIIIiCcbbciIIi',
        'iIIIiccccciIIi',
        'iIIIIiiiiIIIIi',
        'iiiiiiiiiiiiii',
    ],
    'shield': [
        '.bbbbbbbbbbbb.',
        'bBBBBBBBBBBBBb',
        'bBccBBBBBjBBBb',
        'bBcBBBBBjjjBBb',
        'bBcBBBBBBjBBBb',
        'bBBBBBBBBBBBBb',
        'bBBBBBBBBBBBBb',
        '.bBBBBBBBBBBb.',
        '.bBBBBBBBBBBb.',
        '..bBBBBBBBBb..',
        '...bBBBBBBb...',
        '....bBBBBb....',
        '.....bBBb.....',
        '......bb......',
    ],
    'scroll': [
        '.qqqqqqqqqqqq.',
        'qpPPPPPPPPPPpq',
        'qqqqqqqqqqqqqq',
        '.qppppppppppq.',
        '.qpMMMMMMppppq',
        '.qppppppppppq.',
        '.qpMMMMMMMMpq.',
        '.qppppppppppq.',
        '.qpMMMMMppppq.',
        '.qppppppppppq.',
        'qqqqqqqqqqqqqq',
        'qpPPPPPPPPPPpq',
        '.qqqqqqqqqqqq.',
    ],
    'trophy': [
        '..GGGGGGGGGG..',
        'GGGjJjjjjjgGGG',
        'G,GjJjjjjjgG,G',
        'GG,GjJjjjjgG,G',
        '.G,GjjjjjjgGG.',
        '..GGjjjjjjgG..',
        '....GjjjjgG...',
        '.....GjjgG....',
        '......GgG.....',
        '......GjG.....',
        '....GGjjjGG...',
        '....wWWWWWw...',
        '....wwwwwww...',
    ],
    'ok': [
        '...........ee.',
        '..........eFe.',
        '.........eFfe.',
        '........eFfe..',
        '.ee....eFfe...',
        'eFFe..eFfe....',
        'eFffeeFfe.....',
        '.eFffFfe......',
        '..eFffe.......',
        '...eFe........',
        '....e.........',
    ],
    'cancel': [
        '.rr......rr.',
        'rtRr....rtRr',
        'rRtRr..rRtRr',
        '.rRtRrrRtRr.',
        '..rRtRRtRr..',
        '...rRttRr...',
        '...rRttRr...',
        '..rRtRRtRr..',
        '.rRtRrrRtRr.',
        'rRtRr..rRtRr',
        'rtRr....rRtr',
        '.rr......rr.',
    ],
    'chest': [
        '..wwwwwwwwww..',
        '.wWYYYYYYYYWw.',
        'wWYhYYYYYYYYWw',
        'wWYYYYYYYYYYWw',
        'wwwwwwGGwwwwww',
        'wWWWWWGjWWWWWw',
        'wWYYYYGGYYYYWw',
        'wWYYYYYYYYYYWw',
        'wWYYYYYYYYYYWw',
        'wwwwwwwwwwwwww',
    ],
    'potion': [
        '.....wwww.....',
        '.....WYYW.....',
        '......ll......',
        '......LL......',
        '.....lLLl.....',
        '....lxxxxl....',
        '...lxVVVVxl...',
        '..lxVVZVVVxl..',
        '..lVVZVVVVVl..',
        '..lVVVVVVVVl..',
        '..lVVVVVVVVl..',
        '...lVVVVVVl...',
        '....llllll....',
    ],
    'skull': [
        '...LLLLLLLL...',
        '..LZZZZZZZZL..',
        '.LZZZZZZZZZZL.',
        '.LZZZZZZZZZZL.',
        '.LZiiiZZiiiZL.',
        '.LZiIiZZiIiZL.',
        '.LZiiiZZiiiZL.',
        '..LZZZZiZZZL..',
        '..LLZZZZZZLL..',
        '...LZLZLZLZL..',
        '...LZLZLZLZ...',
        '....LLLLLL....',
    ],
    'eye': [
        '....iiiiii....',
        '..iiZZZZZZii..',
        '.iZZZbBBbZZZi.',
        'iZZZbBccBbZZZi',
        'iZZZbBKKBbZZZi',
        '.iZZZbBBbZZZi.',
        '..iiZZZZZZii..',
        '....iiiiii....',
    ],
    'back': [
        '....Yy......',
        '...YhY......',
        '..YhYYYYYYYy',
        '.YhYYYYYYYYy',
        'YhYYYYYYYYYy',
        '.yYYyyyyyyyy',
        '..yYy.......',
        '...yy.......',
    ],
    'warden': [
        '....bbbbbb....',
        '..bbBBBBBBbb..',
        '.bBBBBGGBBBBb.',
        '.bBBBBBBBBBBb.',
        'bbbbbbbbbbbbbb',
        '..AaaaaaaaaA..',
        '..aaKaaaaKaa..',
        '..aaKaaaaKaa..',
        '..aaaaaaaaaa..',
        '..AaaaRRaaaA..',
        '...AaaaaaaA...',
        '..BBAAAAAABB..',
        '.BBBBBGBBBBBB.',
        '.BBBBBBBBBBBB.',
    ],
}


# Small 8x8 icons for inline use (prices, hearts, stars), still at 3x so
# they share the pixel grid with everything else.
SMALL_ICONS = {
    'coin-s': [
        '.gggg.',
        'gGjjGg',
        'gjJjjg',
        'gjjjGg',
        'gGjGGg',
        '.gggg.',
    ],
    'heart-s': [
        'rR..Rr',
        'RttRtR',
        'RtTttR',
        '.RttR.',
        '..RR..',
    ],
    'hourglass-s': [
        'wwwwww',
        '.lCCl.',
        '..lj..',
        '..jl..',
        '.ljjl.',
        'wwwwww',
    ],
    'star-s': [
        '..jj..',
        '.jjGj.',
        'jjGGGj',
        '.GGGg.',
        '.Gg.Gg',
    ],
}


def icon(rows, size=16):
    """Centre a <=14x14 map on a 16x16 canvas and add a 1px outline."""
    hgt = len(rows)
    wid = max(len(r) for r in rows)
    assert wid <= size - 2 and hgt <= size - 2, (wid, hgt)
    ox = (size - wid) // 2
    oy = (size - hgt) // 2
    grid = [[None] * size for _ in range(size)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row.ljust(wid, '.')):
            grid[oy + y][ox + x] = ch
    img = Image.new('RGBA', (size, size), CLEAR)
    for y in range(size):
        for x in range(size):
            ch = grid[y][x]
            if ch not in (None, '.', ','):
                img.putpixel((x, y), rgba(ch))
    # Outline: transparent '.' (or canvas) pixels touching a filled one.
    for y in range(size):
        for x in range(size):
            if grid[y][x] not in (None, '.'):
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < size and 0 <= ny < size and grid[ny][nx] not in (None, '.', ','):
                    img.putpixel((x, y), rgba('K'))
                    break
    return img


# ------------------------------------------------------------ floor tile
def floor():
    """Dark plank floor, 16x16, planks 4px tall with staggered seams."""
    img = Image.new('RGBA', (16, 16), CLEAR)
    seams = [5, 13, 1, 9]
    for y in range(16):
        band, row = divmod(y, 4)
        for x in range(16):
            if row == 3:
                c = 'Q'
            elif x == seams[band]:
                c = 'Q'
            elif row == 0:
                c = 'z'
            else:
                c = 'D' if (x + band) % 7 else 'd'
            img.putpixel((x, y), rgba(c))
    return img


CURSOR = [
    'K........',
    'KK.......',
    'KpK......',
    'KppK.....',
    'KpppK....',
    'KppppK...',
    'KpppppK..',
    'KppppppK.',
    'KpppKKKKK',
    'KpKppK...',
    'KK.KppK..',
    'K..KppK..',
    '....KK...',
]


def cursor():
    img = Image.new('RGBA', (len(CURSOR[0]), len(CURSOR)), CLEAR)
    for y, row in enumerate(CURSOR):
        for x, ch in enumerate(row):
            if ch != '.':
                img.putpixel((x, y), rgba(ch))
    return img


# ------------------------------------------------------------------ main
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    KIT.mkdir(parents=True, exist_ok=True)
    css = [
        '/* Generated by scripts/pixel-sprites.py — edit the script, not this file. */',
        '',
    ]

    for name, (rings, fill, chamfer, open_bottom) in FRAMES.items():
        sl = len(rings) + 1
        n = sl * 2 + 2
        img = frame(n, n, rings, fill, chamfer, open_bottom)
        if open_bottom:
            img = img.crop((0, 0, n, n - sl))
        scaled(img).save(OUT / f'frame-{name}.png')
        px = sl * SCALE
        bottom = 0 if open_bottom else px
        css.append(f'.pxf-{name} {{')
        css.append('  border-style: solid;')
        css.append(f'  border-width: {px}px {px}px {bottom}px;')
        css.append(f"  border-image: url('/pixel/frame-{name}.png') {px} {px} {bottom} fill / {px}px {px}px {bottom}px stretch;")
        css.append('}')

    names = list(ICONS) + list(SMALL_ICONS)
    sheet = Image.new('RGBA', (16 * len(names), 16), CLEAR)
    for i, name in enumerate(names):
        art = icon(ICONS[name]) if name in ICONS else icon(SMALL_ICONS[name], 8)
        sheet.paste(art, (i * 16, 0))
    sheet.save(OUT / 'icons.png')

    css += [
        '',
        '/* Icons: one 1x sheet, scaled by --icon-scale. Use 3 (one art pixel',
        '   = 3px, the same as every frame) or 6 for a feature icon. Other',
        '   scales break the pixel grid. Small icons (*-s) are 8x8. */',
        '.px-icon {',
        '  --icon-scale: 3;',
        '  display: inline-block;',
        '  flex-shrink: 0;',
        '  width: calc(16px * var(--icon-scale));',
        '  height: calc(16px * var(--icon-scale));',
        "  background-image: url('/pixel/icons.png');",
        '  background-repeat: no-repeat;',
        f'  background-size: calc({16 * len(names)}px * var(--icon-scale)) calc(16px * var(--icon-scale));',
        '  image-rendering: pixelated;',
        '  vertical-align: middle;',
        '}',
    ]
    for i, name in enumerate(names):
        small = ' width: calc(8px * var(--icon-scale)); height: calc(8px * var(--icon-scale));' if name in SMALL_ICONS else ''
        css.append(f'.px-icon--{name} {{ background-position: calc({-16 * i}px * var(--icon-scale)) 0;{small} }}')
    # Positions at 3x, for CSS that draws an icon as a background itself.
    css.append('')
    css.append(':root {')
    css.append(f'  --px-sheet: {16 * len(names) * SCALE}px {16 * SCALE}px;')
    for i, name in enumerate(names):
        css.append(f'  --px-at-{name}: {-16 * i * SCALE}px 0;')
    css.append('}')

    (KIT / 'sprites.css').write_text('\n'.join(css) + '\n')
    (KIT / 'icons.ts').write_text(
        '// Generated by scripts/pixel-sprites.py — edit the script, not this file.\n'
        'export const ICON_NAMES = [\n'
        + ''.join(f"  '{n}',\n" for n in names)
        + '] as const;\n\nexport type IconName = (typeof ICON_NAMES)[number];\n'
    )

    scaled(floor()).save(OUT / 'floor.png')
    scaled(cursor(), 2).save(OUT / 'cursor.png')

    # Contact sheet for reviewing the art (not used by the app).
    if '--sheet' in __import__('sys').argv:
        frames = [Image.open(OUT / f'frame-{n}.png') for n in FRAMES]
        big = scaled(sheet, 4)
        wd = max(big.width, sum(f.width + 12 for f in frames))
        out = Image.new('RGBA', (wd, big.height + 120), (90, 60, 40, 255))
        out.paste(big, (0, 0), big)
        x = 0
        for f in frames:
            out.paste(f, (x, big.height + 12), f)
            x += f.width + 12
        out.save(ROOT.parent / 'pixel-contact-sheet.png')

    print(f'{len(FRAMES)} frames, {len(names)} icons written to {OUT}')


if __name__ == '__main__':
    main()
