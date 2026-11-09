// Fiona's brain. Runs in the overlay page: decides what she's doing,
// moves her, and hands pose targets to the rig in cat.js.
//
// States:
//   sit    – cursor is roughly above her; she faces it and watches it
//   walk   – cursor is a little way off
//   run    – cursor is far off
//   eat    – the fish cursor came down to her level; nom
//   sleep  – the mouse hasn't moved for a while
//   wake   – mouse moved while she was asleep; a startled hop, then on

(() => {
  const { makeCat, stepCat, drawCat, drawFish, FISH_HOTSPOT } = window.FionaCat;
  const bridge = window.fiona || null; // absent when previewed in a plain browser

  // ---- tuning -----------------------------------------------------------

  const SIZE = 1.1; // overall scale of the cat
  const WALK_SPEED = 95; // px/s
  const RUN_SPEED = 300;
  const RUN_DISTANCE = 240; // further than this and she runs
  const START_MOVING = 30; // hysteresis so she doesn't jitter under the cursor
  const STOP_MOVING = 6;
  const SLEEP_AFTER = 25; // s of no mouse movement
  const EAT_REACH = 40; // how close (x) the fish has to be
  const EAT_HEIGHT = 80; // how low (from the bottom of the strip) it has to come
  const EAT_TIME = 2.6;
  const EAT_COOLDOWN = 5;

  // ---- canvas -----------------------------------------------------------

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  // Fiona is drawn into her own small buffer first, so the outline and
  // clipping tricks in cat.js only ever see her, never the particles.
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');
  const BW = 220;
  const BH = 150;
  const OX = 110; // where her local (0, 0) sits in the buffer
  const OY = 140;
  const GROUND = 4; // px between her paws and the bottom edge, so outlines aren't clipped
  let W = 0;
  let H = 0;
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    buf.width = Math.round(BW * dpr);
    buf.height = Math.round(BH * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- the fish cursor --------------------------------------------------

  // Rendered here, where there's a canvas, then handed to the main
  // process to become the Windows cursor. Sized for the screen's DPI.
  function makeFish() {
    const size = Math.min(128, Math.round(32 * dpr));
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(size / 32, size / 32);
    drawFish(g);
    const hotspot = { x: Math.round((FISH_HOTSPOT.x * size) / 32), y: Math.round((FISH_HOTSPOT.y * size) / 32) };
    // In a plain browser preview, use it as the page cursor.
    document.documentElement.style.cursor = `url(${c.toDataURL()}) ${hotspot.x} ${hotspot.y}, auto`;
    if (bridge) {
      bridge.setFish({ size, hotspot, rgba: new Uint8Array(g.getImageData(0, 0, size, size).data) });
    }
  }
  makeFish();

  // ---- state ------------------------------------------------------------

  const rig = makeCat();
  const cat = {
    x: W / 2,
    facing: 1, // where she wants to face
    flip: 1, // where she's drawn facing; eases toward `facing` so turns are smooth
    state: 'sit',
    stateTime: 0,
    nextBlink: 2,
    blinkUntil: 0,
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
  }

  // Head position on screen, from the rig's last solved pose.
  function headOnScreen() {
    const p = rig.points ? rig.points.head : { x: 12, y: -58 };
    return { x: cat.x + p.x * SIZE * cat.flip, y: H - GROUND + p.y * SIZE };
  }

  function spawn(kind, x, y, vx, vy, life) {
    particles.push({ kind, x, y, vx, vy, life, age: 0 });
  }

  function hearts(n) {
    const h = headOnScreen();
    for (let i = 0; i < n; i++) {
      spawn('heart', h.x + (Math.random() - 0.5) * 30, h.y - 18, (Math.random() - 0.5) * 30, -35 - Math.random() * 25, 1.6);
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
      cat.x = side === 'left' ? -60 : W + 60;
      setState('run');
    });
    bridge.onCommand((c) => {
      if (c === 'sleep') {
        mouse.lastMove = performance.now() - SLEEP_AFTER * 1000;
        setState('sleep');
      }
    });
  } else {
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
    const tall = cat.state === 'sleep' ? 45 : 95;
    const over = Math.abs(mouse.x - cat.x) < 45 * SIZE && mouse.y > H - tall * SIZE && mouse.y < H;
    if (over !== cat.hovered) {
      cat.hovered = over;
      if (bridge) bridge.setInteractive(over);
    }
  }

  // ---- behaviour --------------------------------------------------------

  function update(dt) {
    cat.stateTime += dt;
    cat.eatCooldown = Math.max(0, cat.eatCooldown - dt);

    const now = performance.now() / 1000;
    const idle = now - mouse.lastMove / 1000;
    const margin = 50 * SIZE;
    const target = Math.min(Math.max(mouse.x, margin), W - margin);
    const dx = target - cat.x;
    const dist = Math.abs(dx);
    let moved = 0;

    switch (cat.state) {
      case 'sleep':
        cat.zTimer -= dt;
        if (cat.zTimer <= 0) {
          cat.zTimer = 1.3;
          const h = headOnScreen();
          spawn('z', h.x + cat.flip * 6, h.y - 14, 10 * cat.flip, -16, 2.4);
        }
        if (idle < 0.3 && cat.stateTime > 0.6) {
          setState('wake');
          rig.hop = 1;
          const h = headOnScreen();
          spawn('bang', h.x, h.y - 34, 0, -12, 0.8);
        }
        break;

      case 'wake':
        if (cat.stateTime > 0.8) setState('sit');
        break;

      case 'eat':
        if (Math.random() < dt * 7) {
          const h = headOnScreen();
          spawn('crumb', h.x + cat.flip * 10, h.y + 8, (Math.random() - 0.3) * 60 * cat.flip, -40 - Math.random() * 30, 0.9);
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
          // Don't set off walking backwards mid-turn.
          if (Math.abs(cat.flip - cat.facing) > 1) break;
          const run = dist > RUN_DISTANCE || (cat.state === 'run' && dist > 70);
          setState(run ? 'run' : 'walk');
          // Ease off as she arrives, rather than stopping dead.
          const speed = (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, 0.35 + dist / 60);
          moved = Math.min(speed * dt, dist);
          cat.x += cat.facing * moved;
        } else {
          setState('sit');
          if (dist > 3) cat.facing = dx > 0 ? 1 : -1;
          if (idle > SLEEP_AFTER) setState('sleep');
        }
      }
    }

    // Turning: squash through zero instead of snapping.
    cat.flip += (cat.facing - cat.flip) * (1 - Math.exp(-14 * dt));

    // Blinking.
    if (now > cat.nextBlink) {
      cat.blinkUntil = now + 0.13;
      cat.nextBlink = now + 2 + Math.random() * 4;
    }

    // Where the cursor is, relative to her head, for eyes and head tilt.
    const h = headOnScreen();
    const lx = ((mouse.x - h.x) * Math.sign(cat.flip || 1)) / 140;
    const ly = (mouse.y - h.y) / 90;
    const s = cat.state;
    const sitting = s === 'sit' || s === 'wake' || s === 'eat';
    rig.phase += moved / SIZE * (s === 'run' ? 0.075 : 0.12);
    stepCat(rig, dt, {
      sit: sitting ? 1 : 0,
      lie: s === 'sleep' ? 1 : 0,
      eat: s === 'eat' ? 1 : 0,
      run: s === 'run' ? 1 : 0,
      tail: s === 'wake' ? 'sit' : s,
      tilt: s === 'sit' ? Math.max(-0.35, Math.min(0.15, ly * 0.25)) : 0,
      lookX: Math.max(-1, Math.min(1, lx)),
      lookY: Math.max(-1, Math.min(1, ly)),
      blink: s === 'sleep' || now < cat.blinkUntil ? 1 : 0,
      mouth: s === 'eat' ? 0.5 + 0.5 * Math.sin(cat.stateTime * 14) : 0,
    });

    for (const p of particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'crumb') p.vy += 260 * dt; // crumbs fall
      else p.x += Math.sin(p.age * 5) * 0.35; // hearts and Zs drift
    }
    particles = particles.filter((p) => p.age < p.life && p.y < H + 10);

    updateHover();
  }

  // ---- drawing ----------------------------------------------------------

  function drawParticle(p) {
    const fade = Math.min(1, (p.life - p.age) / 0.5);
    const grow = Math.min(1, p.age / 0.2);
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(grow, grow);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a2a20';
    if (p.kind === 'heart') {
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-9, 0, -6, -7, 0, -3);
      ctx.bezierCurveTo(6, -7, 9, 0, 0, 6);
      ctx.fillStyle = '#ec5a6e';
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
    } else if (p.kind === 'crumb') {
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#7fb3e0';
      ctx.fill();
    } else {
      const text = p.kind === 'z' ? 'z' : '!';
      ctx.font = `bold ${p.kind === 'z' ? 11 + p.age * 4 : 18}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = p.kind === 'z' ? '#e8eef7' : '#f2c94c';
      ctx.fillText(text, 0, 0);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    // Fiona into her buffer.
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, buf.width, buf.height);
    bctx.setTransform(dpr * SIZE, 0, 0, dpr * SIZE, OX * dpr, OY * dpr);
    drawCat(bctx, rig);

    // Buffer onto the strip, mirrored when she faces left.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(cat.x, H - GROUND);
    const f = Math.abs(cat.flip) < 0.06 ? 0.06 * Math.sign(cat.flip || 1) : cat.flip;
    ctx.scale(f, 1);
    ctx.drawImage(buf, -OX * SIZE, -OY * SIZE, BW * SIZE, BH * SIZE);
    ctx.restore();

    for (const p of particles) drawParticle(p);

    if (cat.hovered) {
      const h = headOnScreen();
      ctx.font = '600 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#3a2a20';
      ctx.fillStyle = '#fbf4ea';
      ctx.strokeText('Fiona', h.x, h.y - 32);
      ctx.fillText('Fiona', h.x, h.y - 32);
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

  // For the browser preview and debugging only.
  window.__fiona = { cat, rig, mouse, setState };
})();
