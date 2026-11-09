// Fiona's body: a small vector rig drawn with canvas paths.
//
// She's built from simple shapes (capsules, circles, ellipses, ear
// triangles) placed on a handful of joints. Three key poses — stand,
// sit, lie — are blended by two numbers (`sit`, `lie`), so every
// change of posture is a smooth tween, never a cut. Legs are solved
// with two-bone IK onto feet driven by a walk cycle; the tail is a
// chain of springy segments that lag behind, so it swishes on its own.
//
// Coordinates are local to the cat: facing right, ground at y = 0,
// y up is negative (canvas convention). The renderer mirrors her.
//
// No dependencies; shared by the overlay page only.

(function (root) {
  const COL = {
    fur: '#eba35e',
    furFar: '#cf8848',
    stripe: '#c8743a',
    white: '#fbf4ea',
    whiteFar: '#e6d9c6',
    outline: '#3a2a20',
    nose: '#e98ea0',
    earIn: '#f3b2aa',
    iris: '#8cc152',
    pupil: '#1d1a17',
  };
  const OUT = 2.2; // outline thickness

  // ---- small maths ------------------------------------------------------

  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (p, q, t) => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
  const add = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
  const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  function rotAround(p, c, a) {
    const s = Math.sin(a);
    const k = Math.cos(a);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
  }

  // Two-bone IK: where the knee goes so root->knee->foot reaches `foot`.
  // bend = +1 puts the knee behind (toward the tail), -1 in front.
  function ik(rootP, foot, l1, l2, bend) {
    const dx = foot.x - rootP.x;
    const dy = foot.y - rootP.y;
    let d = Math.hypot(dx, dy);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
    const base = Math.atan2(dy, dx);
    const a = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
    const ang = base + bend * a;
    const knee = { x: rootP.x + Math.cos(ang) * l1, y: rootP.y + Math.sin(ang) * l1 };
    const fa = Math.atan2(foot.y - knee.y, foot.x - knee.x);
    return { knee, end: { x: knee.x + Math.cos(fa) * l2, y: knee.y + Math.sin(fa) * l2 } };
  }

  // ---- poses ------------------------------------------------------------

  const POSE = {
    stand: { hip: { x: -20, y: -30 }, shoulder: { x: 16, y: -33 }, head: { x: 30, y: -48 }, tail: { x: -30, y: -36 }, bodyR: 11.5, haunchR: 12, chestR: 12 },
    sit: { hip: { x: -8, y: -15 }, shoulder: { x: 6, y: -38 }, head: { x: 11, y: -58 }, tail: { x: -18, y: -6 }, bodyR: 12, haunchR: 15, chestR: 11.5 },
    lie: { hip: { x: -16, y: -13 }, shoulder: { x: 12, y: -13 }, head: { x: 27, y: -19 }, tail: { x: -29, y: -8 }, bodyR: 12.5, haunchR: 13, chestR: 12 },
  };

  // Tail shapes: absolute angle of the first segment, then how much each
  // further segment curls, plus a swish. Angles are kept between -4 and
  // -1.5 rad so blending between styles swings the tail round the back,
  // never through her body.
  const TAIL = {
    walk: { base: -2.2, curl: 0.2, amp: 0.14, freq: 3 },
    run: { base: -2.75, curl: 0.09, amp: 0.2, freq: 7 },
    sit: { base: -3.75, curl: -0.33, amp: 0.07, freq: 1.4 },
    eat: { base: -3.6, curl: -0.26, amp: 0.22, freq: 4.5 },
    sleep: { base: -3.35, curl: -0.4, amp: 0.025, freq: 0.8 },
  };
  const TAIL_N = 8;
  const TAIL_SEG = 6;

  // ---- state ------------------------------------------------------------

  function makeCat() {
    return {
      sit: 1, lie: 0, eat: 0, run: 0,
      tilt: 0, lookX: 0, lookY: 0,
      blink: 0, mouth: 0, hop: 0, earTwitch: 0,
      phase: 0, time: 0,
      tail: Array.from({ length: TAIL_N }, (_, i) => (i === 0 ? TAIL.sit.base : TAIL.sit.curl)),
      points: null, // last solved keypoints, for hit-testing
    };
  }

  // Ease every pose number toward its target; run the tail springs.
  function stepCat(c, dt, t) {
    c.time += dt;
    c.sit = approach(c.sit, t.sit, 7, dt);
    c.lie = approach(c.lie, t.lie, 3.5, dt);
    c.eat = approach(c.eat, t.eat, 6, dt);
    c.run = approach(c.run, t.run, 5, dt);
    c.tilt = approach(c.tilt, t.tilt, 6, dt);
    c.lookX = approach(c.lookX, t.lookX, 12, dt);
    c.lookY = approach(c.lookY, t.lookY, 12, dt);
    c.blink = approach(c.blink, t.blink, 30, dt);
    c.mouth = approach(c.mouth, t.mouth, 20, dt);
    c.hop = approach(c.hop, 0, 7, dt);
    c.earTwitch = approach(c.earTwitch, 0, 9, dt);
    if (Math.random() < dt * 0.2) c.earTwitch = 1;

    const ts = TAIL[t.tail] || TAIL.sit;
    for (let i = 0; i < TAIL_N; i++) {
      const swish = ts.amp * Math.sin(c.time * ts.freq - i * 0.6) * (0.3 + i / TAIL_N);
      const target = (i === 0 ? ts.base : ts.curl) + swish;
      c.tail[i] = approach(c.tail[i], target, 14 - i * 1.2, dt); // tip lags
    }
  }

  // ---- solving the body -------------------------------------------------

  function solve(c) {
    const s = c.sit;
    const l = c.lie;
    const blend = (k) => mix(mix(POSE.stand[k], POSE.sit[k], s), POSE.lie[k], l);
    const blendN = (k) => lerp(lerp(POSE.stand[k], POSE.sit[k], s), POSE.lie[k], l);
    const P = {
      hip: blend('hip'), shoulder: blend('shoulder'), head: blend('head'), tail: blend('tail'),
      bodyR: blendN('bodyR'), haunchR: blendN('haunchR'), chestR: blendN('chestR'),
    };

    const moving = (1 - s) * (1 - l);
    const ph = c.phase;
    const bob = -Math.abs(Math.cos(ph)) * lerp(1.4, 2.8, c.run) * moving;
    const pitch = Math.sin(ph) * 2.4 * c.run * moving;
    P.hip = add(P.hip, 0, bob + pitch);
    P.shoulder = add(P.shoulder, 0, bob - pitch);
    P.head = add(P.head, 0, bob * 0.6 - pitch * 0.8);
    P.tail = add(P.tail, 0, bob + pitch);

    // Eating: lean the head down and forward.
    P.head = mix(P.head, add(POSE.sit.head, 10, 22 + Math.sin(c.time * 14) * 1.2 * c.eat), c.eat);
    P.shoulder = add(P.shoulder, 3 * c.eat, 4 * c.eat);

    // Breathing, stronger when lying down.
    const breath = 1 + 0.035 * Math.sin(c.time * 2.1) * (0.35 + 0.65 * l);
    P.bodyR *= breath;
    P.chestR *= breath;

    // Little hop when startled awake.
    const hop = -c.hop * 9;
    for (const k of ['hip', 'shoulder', 'head', 'tail']) P[k] = add(P[k], 0, hop);

    // Legs. Trot = diagonal pairs; run = bound (fronts together, backs together).
    const stride = lerp(7, 12, c.run) * moving;
    const lift = lerp(5, 8, c.run) * moving;
    const FOOT_Y = -3.5; // leg ends at the ankle; the paw sits below it
    const gait = (x, p) => ({ x: x + Math.sin(p) * stride, y: FOOT_Y - Math.max(0, Math.cos(p)) * lift + hop });
    const legDefs = [
      { far: true, front: false, root: add(P.hip, 4, 3), stand: P.hip.x + 3, sit: P.hip.x + 16, p: ph + lerp(0, Math.PI + 0.4, c.run) },
      { far: true, front: true, root: add(P.shoulder, 3, 4), stand: P.shoulder.x + 4, sit: P.shoulder.x + 9, p: ph + lerp(Math.PI, 0.4, c.run) },
      { far: false, front: false, root: add(P.hip, 0, 4), stand: P.hip.x - 1, sit: P.hip.x + 13, p: ph + Math.PI },
      { far: false, front: true, root: add(P.shoulder, 0, 5), stand: P.shoulder.x + 1, sit: P.shoulder.x + 5, p: ph },
    ];
    P.legs = legDefs.map((d) => {
      const foot = mix(gait(d.stand, d.p), { x: d.sit, y: FOOT_Y + hop }, s);
      const l1 = d.front ? lerp(12, 15, s) : lerp(12, 13, s);
      const l2 = d.front ? lerp(14, 16, s) : lerp(13, 14, s);
      const { knee, end } = ik(d.root, foot, l1, l2, d.front ? 1 : -1);
      return { far: d.far, root: d.root, knee, end };
    });

    // Tail chain.
    P.tailPts = [P.tail];
    let ang = 0;
    let cur = P.tail;
    for (let i = 0; i < TAIL_N; i++) {
      ang += c.tail[i];
      const r = lerp(4.6, 2.8, i / (TAIL_N - 1));
      cur = { x: cur.x + Math.cos(ang) * TAIL_SEG, y: Math.min(cur.y + Math.sin(ang) * TAIL_SEG, -r) };
      P.tailPts.push(cur);
    }
    return P;
  }

  // ---- drawing ----------------------------------------------------------

  function shape(ctx, sh, grow, colour) {
    ctx.fillStyle = ctx.strokeStyle = colour || sh.col;
    ctx.beginPath();
    if (sh.t === 'cap') {
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * (sh.r + grow);
      ctx.moveTo(sh.a.x, sh.a.y);
      ctx.lineTo(sh.b.x + 0.01, sh.b.y);
      ctx.stroke();
    } else if (sh.t === 'circ') {
      ctx.arc(sh.c.x, sh.c.y, sh.r + grow, 0, Math.PI * 2);
      ctx.fill();
    } else if (sh.t === 'ell') {
      ctx.ellipse(sh.c.x, sh.c.y, sh.rx + grow, sh.ry + grow, sh.rot || 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (sh.t === 'poly') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2 * grow + 2;
      sh.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Draw a set of shapes as one silhouette with one shared outline:
  // fills first, then `details` clipped to the fills, then the outline
  // slid in *behind* everything already on the canvas.
  function layer(ctx, shapes, details) {
    ctx.globalCompositeOperation = 'source-over';
    for (const sh of shapes) shape(ctx, sh, 0);
    if (details) {
      ctx.globalCompositeOperation = 'source-atop';
      details();
    }
    ctx.globalCompositeOperation = 'destination-over';
    for (const sh of shapes) shape(ctx, sh, OUT, COL.outline);
  }

  // Same, but the whole layer goes behind what's already drawn.
  function layerBehind(ctx, shapes) {
    ctx.globalCompositeOperation = 'destination-over';
    for (const sh of shapes) shape(ctx, sh, 0);
    for (const sh of shapes) shape(ctx, sh, OUT, COL.outline);
  }

  function line(ctx, a, b, w, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawCat(ctx, c) {
    const P = solve(c);
    c.points = P;
    const tilt = c.tilt + 0.15 * c.lie + 0.35 * c.eat;
    const Hd = (x, y) => rotAround({ x: P.head.x + x, y: P.head.y + y }, P.head, tilt);
    const tw = c.earTwitch;
    const showLegs = c.lie < 0.55;

    // Near half: body, head, ears, near legs — one silhouette.
    const near = [
      { t: 'cap', a: P.hip, b: P.shoulder, r: P.bodyR, col: COL.fur },
      { t: 'circ', c: P.hip, r: P.haunchR, col: COL.fur },
      { t: 'circ', c: P.shoulder, r: P.chestR, col: COL.fur },
      { t: 'cap', a: P.shoulder, b: mix(P.shoulder, P.head, 0.7), r: 8, col: COL.fur },
      { t: 'poly', pts: [Hd(-12, -4), Hd(-3, -11), Hd(-10, -22)], col: COL.fur },
      { t: 'poly', pts: [Hd(2, -11), Hd(12, -5), Hd(10 + tw * 3, -22 + tw * 2)], col: COL.fur },
      { t: 'ell', c: P.head, rx: 15, ry: 13, rot: tilt, col: COL.fur },
      { t: 'ell', c: Hd(5, 5), rx: 10, ry: 7, rot: tilt, col: COL.fur }, // cheeks
    ];
    const far = [];
    for (const leg of P.legs) {
      const list = leg.far ? far : near;
      const fur = leg.far ? COL.furFar : COL.fur;
      const paw = leg.far ? COL.whiteFar : COL.white;
      if (showLegs) {
        list.push({ t: 'cap', a: leg.root, b: leg.knee, r: 4.6, col: fur });
        list.push({ t: 'cap', a: leg.knee, b: leg.end, r: 3.8, col: fur });
        list.push({ t: 'ell', c: add(leg.end, 1.6, 0.6), rx: 4.6, ry: 3, col: paw });
      }
    }
    if (!showLegs) {
      // Lying down: just the front paws peeking out.
      near.push({ t: 'ell', c: add(P.shoulder, 13, 9.5), rx: 5, ry: 3, col: COL.white });
      far.push({ t: 'ell', c: add(P.shoulder, 8, 9), rx: 5, ry: 3, col: COL.whiteFar });
    }

    layer(ctx, near, () => {
      // Back stripes, perpendicular to the spine.
      const ux = P.shoulder.x - P.hip.x;
      const uy = P.shoulder.y - P.hip.y;
      const ul = Math.hypot(ux, uy) || 1;
      const n = { x: uy / ul, y: -ux / ul };
      for (let i = 0; i < 4; i++) {
        const t = 0.12 + 0.24 * i;
        const p = mix(P.hip, P.shoulder, t);
        const r = lerp(P.haunchR, P.chestR, t);
        line(ctx, add(p, n.x * (r + 2), n.y * (r + 2)), add(p, n.x * (r - 6) - (ux / ul) * 2, n.y * (r - 6) - (uy / ul) * 2), 2.6, COL.stripe);
      }
      // Head stripes.
      line(ctx, Hd(-5, -12), Hd(-4, -6.5), 1.8, COL.stripe);
      line(ctx, Hd(-1, -13), Hd(-0.5, -7.5), 1.8, COL.stripe);
      line(ctx, Hd(3, -12.5), Hd(2.8, -7.5), 1.8, COL.stripe);
      // White chest and muzzle.
      ctx.fillStyle = COL.white;
      ctx.beginPath();
      ctx.ellipse(P.shoulder.x + P.chestR * 0.6, P.shoulder.y + 2, 6.5, 9.5, -0.2 * (1 - c.lie), 0, Math.PI * 2);
      ctx.fill();
      const m = Hd(6.5, 6);
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 7.5, 5, tilt, 0, Math.PI * 2);
      ctx.fill();
      // Inner ears.
      ctx.fillStyle = COL.earIn;
      for (const pts of [
        [Hd(-10, -6), Hd(-5, -10), Hd(-9.5, -17)],
        [Hd(4, -10), Hd(10, -6.5), Hd(9 + tw * 2.5, -17.5 + tw * 1.5)],
      ]) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.fill();
      }
    });

    layerBehind(ctx, far);

    // Tail, behind everything. Ringed every other segment near the tip.
    const tail = [];
    for (let i = 0; i < TAIL_N; i++) {
      tail.push({
        t: 'cap', a: P.tailPts[i], b: P.tailPts[i + 1],
        r: lerp(4.6, 2.8, i / (TAIL_N - 1)),
        col: i >= 3 && i % 2 === 1 ? COL.stripe : COL.fur,
      });
    }
    layerBehind(ctx, tail);

    ctx.globalCompositeOperation = 'source-over';
    drawFace(ctx, c, Hd);
  }

  function drawFace(ctx, c, Hd) {
    const open = 1 - c.blink;
    for (const [ex, ey] of [[-1, -2], [10, -2.5]]) {
      const e = Hd(ex, ey);
      if (open > 0.2) {
        ctx.fillStyle = COL.iris;
        ctx.strokeStyle = COL.outline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 2.9, 3.4 * open, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COL.pupil;
        ctx.beginPath();
        ctx.ellipse(e.x + c.lookX * 0.9, e.y + c.lookY * 1.1 * open, 1.3, 2.8 * open, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x - 0.9 + c.lookX * 0.5, e.y - 1.3 * open, 0.9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Closed: a soft downward curve.
        ctx.strokeStyle = COL.outline;
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(e.x, e.y - 1.2, 2.8, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
      }
    }

    // Nose and mouth.
    const n1 = Hd(4.9, 1.6);
    const n2 = Hd(7.7, 1.6);
    const n3 = Hd(6.3, 3.4);
    ctx.fillStyle = ctx.strokeStyle = COL.nose;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(n2.x, n2.y);
    ctx.lineTo(n3.x, n3.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = COL.outline;
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    const mid = Hd(6.3, 5);
    ctx.beginPath();
    ctx.moveTo(n3.x, n3.y);
    ctx.lineTo(mid.x, mid.y);
    const l = Hd(4, 6);
    const r = Hd(8.6, 6);
    ctx.quadraticCurveTo(Hd(5, 6.6).x, Hd(5, 6.6).y, l.x, l.y);
    ctx.moveTo(mid.x, mid.y);
    ctx.quadraticCurveTo(Hd(7.6, 6.6).x, Hd(7.6, 6.6).y, r.x, r.y);
    ctx.stroke();
    if (c.mouth > 0.05) {
      const m = Hd(6.3, 6.6);
      ctx.fillStyle = '#7a3b3b';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 1.8, 1.6 * c.mouth, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Whiskers.
    ctx.strokeStyle = 'rgba(58, 42, 32, 0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const [from, to] of [
      [[1, 5], [-12, 2]], [[1, 6], [-12, 6]], [[1.5, 7], [-10.5, 10]],
      [[11, 5], [23, 2.5]], [[11, 6], [23, 6.5]], [[10.5, 7], [21.5, 10]],
    ]) {
      const a = Hd(from[0], from[1]);
      const b = Hd(to[0], to[1]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  // ---- the fish (cursor) ------------------------------------------------

  // Drawn into a 32x32 box (scale the context for bigger), pointing up
  // and left like an arrow cursor. Its nose — the click point — is at
  // FISH_HOTSPOT.
  const FISH_HOTSPOT = { x: 7, y: 7 };

  function drawFish(ctx) {
    ctx.save();
    ctx.translate(15.5, 15.5);
    ctx.rotate(Math.PI / 4);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = COL.outline;

    // Tail fin.
    ctx.fillStyle = '#5d93c4';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(14.5, -6);
    ctx.quadraticCurveTo(12, 0, 14.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body, with a lighter belly.
    ctx.fillStyle = '#7fb3e0';
    ctx.beginPath();
    ctx.ellipse(-1.5, 0, 10.5, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#d4e8f6';
    ctx.beginPath();
    ctx.ellipse(-1.5, 4.5, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-1.5, 0, 10.5, 6.2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Gill and eye.
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-3, 0, 4, -0.9, 0.9);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-7, -1.6, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.pupil;
    ctx.beginPath();
    ctx.arc(-7.3, -1.6, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const api = { makeCat, stepCat, drawCat, drawFish, FISH_HOTSPOT, COL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FionaCat = api;
})(this);
