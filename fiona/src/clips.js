// Clip mode: Fiona as pre-made video clips instead of the drawn rig.
//
// Each action (sit, walk, run, eat, sleep, wake) can have one short
// looping clip of her on a plain solid background — normally bright
// green. Every frame, the current clip is drawn to a small canvas, the
// background colour is removed pixel by pixel (chroma key), and the
// result is drawn onto the overlay. So the clips can be ordinary MP4s
// straight out of a video tool; no conversion step, no transparency
// needed in the file. Clips that already have real transparency (WebM
// with alpha) are detected and left alone.
//
// Clips face RIGHT; the renderer mirrors them. See clips/README.md.

(function (root) {
  // Which clip to use for a state when its own is missing.
  const FALLBACK = {
    sit: ['sit'],
    walk: ['walk', 'run'],
    run: ['run', 'walk'],
    eat: ['eat', 'sit'],
    sleep: ['sleep', 'sit'],
    wake: ['wake', 'sit'],
  };
  const DEFAULTS = {
    height: 200, // how tall a clip's full frame is drawn, in screen px
    key: 'auto', // 'auto' (read it from the top corners), '#rrggbb', or 'none'
    tolerance: 70, // how far from the key colour still counts as background
    softness: 60, // width of the soft edge beyond that
    clips: {}, // per-clip overrides: { walk: { scale, dx, dy, speed } }
  };
  const ANCHOR_FRAMES = 20; // frames spent learning where her feet are

  function parseHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // Average the two top corners. Transparent corners mean the clip has
  // real alpha and needs no keying.
  function detectKey(img) {
    const { data, width, height } = img;
    const patch = Math.max(2, Math.round(Math.min(width, height) * 0.04));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (const x0 of [0, width - patch]) {
      for (let y = 0; y < patch; y++) {
        for (let x = x0; x < x0 + patch; x++) {
          const i = (y * width + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
          n++;
        }
      }
    }
    if (a / n < 20) return 'none';
    return { r: r / n, g: g / n, b: b / n };
  }

  // Remove the key colour in place. Two tests, and a pixel is only as
  // opaque as the stricter one says:
  //   1. plain distance from the key colour;
  //   2. for a saturated key (green/blue screen), how much the key's
  //      dominant channel sticks out — this catches lighter and darker
  //      shades of the background that the distance test misses.
  // Then "despill": cap the dominant channel so edges don't glow green.
  function keyOut(data, key, tolerance, softness) {
    const ch = [key.r, key.g, key.b];
    const dom = ch.indexOf(Math.max(...ch));
    const o1 = (dom + 1) % 3;
    const o2 = (dom + 2) % 3;
    const keyExcess = ch[dom] - Math.max(ch[o1], ch[o2]);
    const saturated = keyExcess > 60;
    const hi = keyExcess * 0.6;
    const lo = keyExcess * 0.25;
    const t1 = tolerance + softness;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const dr = data[i] - key.r;
      const dg = data[i + 1] - key.g;
      const db = data[i + 2] - key.b;
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      let alpha = d <= tolerance ? 0 : d >= t1 ? 1 : (d - tolerance) / softness;
      if (saturated && alpha > 0) {
        const others = Math.max(data[i + o1], data[i + o2]);
        const excess = data[i + dom] - others;
        if (excess >= hi) alpha = 0;
        else if (excess > lo) alpha = Math.min(alpha, (hi - excess) / (hi - lo));
        if (data[i + dom] > others) data[i + dom] = others; // despill
      }
      data[i + 3] = Math.round(data[i + 3] * alpha);
    }
  }

  // Bounding box of what's left, as fractions of the frame.
  function findBox(img) {
    const { data, width, height } = img;
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 128) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < 0 || (right - left) * (bottom - top) < 16) return null;
    return { left: left / width, right: (right + 1) / width, top: top / height, bottom: (bottom + 1) / height };
  }

  function create() {
    const work = document.createElement('canvas');
    const wctx = work.getContext('2d', { willReadFrequently: true });
    let cfg = { ...DEFAULTS };
    let clips = {};
    let current = null;

    const usable = (c) => c && !c.failed;

    function load(list, config) {
      for (const c of Object.values(clips)) {
        c.video.pause();
        URL.revokeObjectURL(c.video.src);
      }
      clips = {};
      current = null;
      cfg = { ...DEFAULTS, ...(config || {}) };
      for (const item of list || []) {
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        const clip = {
          state: item.state, video, failed: false,
          key: null, box: null, frames: 0,
          opts: (cfg.clips && cfg.clips[item.state]) || {},
        };
        video.addEventListener('error', () => {
          clip.failed = true;
          console.error(`Fiona: couldn't play the "${item.state}" clip. Use H.264 MP4 or WebM.`);
        });
        video.src = URL.createObjectURL(new Blob([item.data], { type: item.mime }));
        clips[item.state] = clip;
      }
    }

    function pick(state) {
      for (const s of FALLBACK[state] || [state]) if (usable(clips[s])) return clips[s];
      if (usable(clips.sit)) return clips.sit;
      return Object.values(clips).find(usable) || null;
    }

    function setState(state) {
      const clip = pick(state);
      if (!clip) return;
      if (clip !== current) {
        if (current) current.video.pause();
        current = clip;
        clip.video.currentTime = 0;
        clip.video.play().catch(() => {});
      }
      // Running on the walk clip: just play it faster.
      const borrowed = state === 'run' && clip.state !== 'run' ? 1.8 : 1;
      clip.video.playbackRate = borrowed * (clip.opts.speed || 1);
    }

    // Draws the current clip with her feet at (x, groundY). Returns false
    // if there's nothing to draw yet (clip still loading).
    function draw(ctx, x, groundY, flip, dpr) {
      const clip = current;
      if (!clip) return false;
      const v = clip.video;
      if (v.readyState < 2 || !v.videoWidth) return false;

      const scale = (cfg.height / v.videoHeight) * (clip.opts.scale || 1);
      const w = Math.max(1, Math.round(v.videoWidth * scale * dpr));
      const h = Math.max(1, Math.round(v.videoHeight * scale * dpr));
      if (work.width !== w || work.height !== h) {
        work.width = w;
        work.height = h;
      }
      wctx.clearRect(0, 0, w, h);
      wctx.drawImage(v, 0, 0, w, h);
      const img = wctx.getImageData(0, 0, w, h);

      if (!clip.key) {
        clip.key = cfg.key === 'none' ? 'none' : parseHex(cfg.key) || detectKey(img);
      }
      if (clip.key !== 'none') keyOut(img.data, clip.key, cfg.tolerance, cfg.softness);

      // Learn where she stands in the frame over the first few frames,
      // then hold it, so she doesn't slide about as she animates.
      if (clip.frames < ANCHOR_FRAMES) {
        const b = findBox(img);
        if (b) {
          clip.box = clip.box
            ? { left: Math.min(clip.box.left, b.left), right: Math.max(clip.box.right, b.right), top: Math.min(clip.box.top, b.top), bottom: Math.max(clip.box.bottom, b.bottom) }
            : b;
          clip.frames++;
        }
      }
      wctx.putImageData(img, 0, 0);

      const box = clip.box || { left: 0, right: 1, top: 0, bottom: 1 };
      const cw = w / dpr;
      const chh = h / dpr;
      ctx.save();
      ctx.translate(x, groundY + (clip.opts.dy || 0));
      ctx.scale(flip, 1);
      ctx.drawImage(work, -((box.left + box.right) / 2) * cw + (clip.opts.dx || 0), -box.bottom * chh, cw, chh);
      ctx.restore();
      api.size = { w: (box.right - box.left) * cw, h: (box.bottom - box.top) * chh };
      return true;
    }

    const api = {
      load, setState, draw,
      size: null, // on-screen size of the cat in the current clip, once known
      get active() {
        return Object.values(clips).some(usable);
      },
      get states() {
        return Object.keys(clips).filter((s) => usable(clips[s]));
      },
    };
    return api;
  }

  const lib = { create, keyOut, detectKey, findBox, FALLBACK };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else root.FionaClips = lib;
})(this);
