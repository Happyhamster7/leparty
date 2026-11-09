// Fiona's brain and body. Runs in the overlay page.
//
// States:
//   sit    – cursor is roughly above her; she faces it and blinks
//   walk   – cursor is a little way off
//   run    – cursor is far off
//   eat    – the fish cursor came down to her level; nom
//   sleep  – the mouse hasn't moved for a while
//   wake   – mouse moved while she was asleep; a startled moment, then on
//
// Everything is in CSS pixels; the canvas is scaled for the screen's DPI.

(() => {
  const { palette, frames } = window.FionaArt;
  const bridge = window.fiona || null; // absent when previewed in a plain browser

  // ---- tuning -----------------------------------------------------------

  const S = 3; // screen pixels per art pixel
  const WALK_SPEED = 110; // px/s
  const RUN_SPEED = 320;
  const RUN_DISTANCE = 240; // further than this and she runs
  const START_MOVING = 28; // hysteresis so she doesn't jitter under the cursor
  const STOP_MOVING = 6;
  const SLEEP_AFTER = 25; // s of no mouse movement
  const EAT_REACH = 34; // how close (x) the fish has to be
  const EAT_HEIGHT = 70; // how low (from the bottom of the strip) it has to come
  const EAT_TIME = 2.4;
  const EAT_COOLDOWN = 5;

  // ---- canvas -----------------------------------------------------------

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- sprites ----------------------------------------------------------

  const fxPalette = { '.': null, H: '#e0485a', Z: '#dfe9f5', Y: '#f2c94c', B: '#6f9fc8', K: '#2b2118' };
  const fxGrids = {
    heart: ['.H.H.', 'HHHHH', 'HHHHH', '.HHH.', '..H..'],
    z: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'],
    bang: ['Y', 'Y', 'Y', '.', 'Y'],
    crumb: ['B'],
  };

  // Paint a grid onto its own small canvas, 1 art px = 1 canvas px.
  // `outline` adds a dark 1px border so effects read on any wallpaper.
  function bake(grid, pal, outline) {
    const pad = outline ? 1 : 0;
    const c = document.createElement('canvas');
    c.width = grid[0].length + pad * 2;
    c.height = grid.length + pad * 2;
    const g = c.getContext('2d');
    const paint = (dx, dy, override) =>
      grid.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (!pal[ch]) return;
          g.fillStyle = override || pal[ch];
          g.fillRect(x + pad + dx, y + pad + dy, 1, 1);
        })
      );
    if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(dx, dy, '#2b2118');
    paint(0, 0);
    return c;
  }

  const sprites = {};
  for (const [name, grid] of Object.entries(frames)) sprites[name] = bake(grid, palette, false);
  const fx = {};
  for (const [name, grid] of Object.entries(fxGrids)) fx[name] = bake(grid, fxPalette, name !== 'crumb');

  const CAT_W = frames.sit[0].length * S;
  const CAT_H = frames.sit.length * S;

  // ---- state ------------------------------------------------------------

  const cat = {
    x: W / 2, // centre
    facing: 1, // 1 = right, -1 = left
    state: 'sit',
    stateTime: 0,
    animTime: 0,
    nextBlink: 3,
    eatCooldown: 0,
    zTimer: 0,
    hovered: false,
  };
  const mouse = { x: W / 2, y: -1000, lastMove: performance.now() };
  let particles = [];

  function setState(s) {
    if (cat.state === s) return;
    cat.state = s;
    cat.stateTime = 0;
    cat.animTime = 0;
  }

  function spawn(kind, x, y, vx, vy, life) {
    particles.push({ kind, x, y, vx, vy, life, age: 0 });
  }

  function hearts(n) {
    for (let i = 0; i < n; i++) {
      spawn('heart', cat.x + (Math.random() - 0.5) * CAT_W * 0.6, H - CAT_H, (Math.random() - 0.5) * 30, -40 - Math.random() * 30, 1.4);
    }
  }

  // ---- input ------------------------------------------------------------

  function onCursor(p) {
    if (Math.hypot(p.x - mouse.x, p.y - mouse.y) > 2) mouse.lastMove = performance.now();
    mouse.x = p.x;
    mouse.y = p.y;
  }

  if (bridge) {
    bridge.onCursor(onCursor);
    bridge.onEnter((side) => {
      cat.x = side === 'left' ? -CAT_W / 2 : W + CAT_W / 2;
      setState('run');
    });
    bridge.onCommand((c) => {
      if (c === 'sleep') {
        mouse.lastMove = performance.now() - SLEEP_AFTER * 1000;
        setState('sleep');
      }
    });
  } else {
    // Browser preview: use the page's own mouse.
    window.addEventListener('mousemove', (e) => onCursor({ x: e.clientX, y: e.clientY }));
  }

  // Petting. Only reachable while hovered, because the window is
  // click-through everywhere else.
  canvas.addEventListener('mousedown', () => {
    if (!cat.hovered) return;
    hearts(4);
    if (cat.state !== 'sleep') setState('sit');
  });

  function updateHover() {
    const over =
      Math.abs(mouse.x - cat.x) < CAT_W / 2 && mouse.y > H - CAT_H && mouse.y < H;
    if (over !== cat.hovered) {
      cat.hovered = over;
      if (bridge) bridge.setInteractive(over);
    }
  }

  // ---- behaviour --------------------------------------------------------

  function update(dt) {
    cat.stateTime += dt;
    cat.animTime += dt;
    cat.eatCooldown = Math.max(0, cat.eatCooldown - dt);

    const idle = (performance.now() - mouse.lastMove) / 1000;
    const target = Math.min(Math.max(mouse.x, CAT_W / 2), W - CAT_W / 2);
    const dx = target - cat.x;
    const dist = Math.abs(dx);

    switch (cat.state) {
      case 'sleep':
        cat.zTimer -= dt;
        if (cat.zTimer <= 0) {
          cat.zTimer = 1.1;
          spawn('z', cat.x + cat.facing * CAT_W * 0.3, H - CAT_H * 0.6, 8 * cat.facing, -18, 2.2);
        }
        if (idle < 0.3 && cat.stateTime > 0.5) {
          setState('wake');
          spawn('bang', cat.x + cat.facing * CAT_W * 0.25, H - CAT_H - 4, 0, -10, 0.7);
        }
        break;

      case 'wake':
        if (cat.stateTime > 0.7) setState('sit');
        break;

      case 'eat':
        if (Math.random() < dt * 8) {
          spawn('crumb', cat.x + cat.facing * CAT_W * 0.35, H - CAT_H * 0.55, (Math.random() - 0.3) * 60 * cat.facing, -30 - Math.random() * 30, 0.8);
        }
        if (cat.stateTime > EAT_TIME) {
          hearts(3);
          cat.eatCooldown = EAT_COOLDOWN;
          setState('sit');
        }
        break;

      default: {
        // sit / walk / run
        const fishIsDown = mouse.y > H - EAT_HEIGHT && mouse.y < H + 10;
        if (fishIsDown && dist < EAT_REACH && cat.eatCooldown === 0) {
          cat.facing = dx >= 0 ? 1 : -1;
          setState('eat');
          break;
        }
        const moving = cat.state === 'walk' || cat.state === 'run';
        if (dist > (moving ? STOP_MOVING : START_MOVING)) {
          cat.facing = dx > 0 ? 1 : -1;
          const run = dist > RUN_DISTANCE || (cat.state === 'run' && dist > 60);
          setState(run ? 'run' : 'walk');
          cat.x += cat.facing * Math.min((run ? RUN_SPEED : WALK_SPEED) * dt, dist);
        } else {
          setState('sit');
          if (dist > 2) cat.facing = dx > 0 ? 1 : -1;
          if (idle > SLEEP_AFTER) setState('sleep');
        }
      }
    }

    for (const p of particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'crumb') p.vy += 220 * dt; // crumbs fall
      if (p.kind === 'heart' || p.kind === 'z') p.x += Math.sin(p.age * 6) * 0.3; // drift
    }
    particles = particles.filter((p) => p.age < p.life && p.y < H + 10);

    updateHover();
  }

  // ---- drawing ----------------------------------------------------------

  function currentFrame() {
    const t = cat.animTime;
    switch (cat.state) {
      case 'walk':
        return { name: Math.floor(t / 0.18) % 2 ? 'walk2' : 'walk1', bob: 0 };
      case 'run': {
        const f = Math.floor(t / 0.09) % 2;
        return { name: f ? 'walk2' : 'walk1', bob: f ? -1 : 0 };
      }
      case 'sleep':
        return { name: 'sleep', bob: Math.floor(t / 1.2) % 2 ? 0 : -1 }; // breathing
      case 'eat': {
        const f = Math.floor(t / 0.16) % 2;
        return { name: f ? 'blink' : 'sit', bob: f ? -1 : 0 };
      }
      case 'wake':
        return { name: 'sit', bob: cat.stateTime < 0.15 ? -2 : 0 }; // little hop
      default: {
        // Blink now and then.
        if (t > cat.nextBlink) {
          if (t > cat.nextBlink + 0.14) {
            cat.animTime = 0;
            cat.nextBlink = 2 + Math.random() * 4;
          }
          return { name: 'blink', bob: 0 };
        }
        return { name: 'sit', bob: 0 };
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const { name, bob } = currentFrame();
    const left = Math.round(cat.x - CAT_W / 2);
    const top = H - CAT_H + bob * S;
    ctx.save();
    if (cat.facing < 0) {
      ctx.translate(left + CAT_W, top);
      ctx.scale(-1, 1);
      ctx.drawImage(sprites[name], 0, 0, CAT_W, CAT_H);
    } else {
      ctx.drawImage(sprites[name], left, top, CAT_W, CAT_H);
    }
    ctx.restore();

    for (const p of particles) {
      const img = fx[p.kind];
      const scale = p.kind === 'crumb' ? S : 2;
      ctx.globalAlpha = Math.min(1, (p.life - p.age) / 0.4);
      ctx.drawImage(img, Math.round(p.x - (img.width * scale) / 2), Math.round(p.y), img.width * scale, img.height * scale);
    }
    ctx.globalAlpha = 1;

    if (cat.hovered) {
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#2b2118';
      ctx.fillStyle = '#f6eedf';
      ctx.strokeText('Fiona', cat.x, H - CAT_H - 8);
      ctx.fillText('Fiona', cat.x, H - CAT_H - 8);
    }
  }

  // ---- loop -------------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp after sleep/hide
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Exposed for the browser preview / debugging only.
  window.__fiona = { cat, mouse, setState };
})();
