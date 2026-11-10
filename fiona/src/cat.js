// Fiona's body: a small vector rig drawn with canvas paths, in a
// pastel kawaii / chibi style — a white cat with a big round head,
// blob body, stubby legs, big sparkly eyes, blush, soft brown outline.
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
    fur: '#fffaf5', // warm white
    furFar: '#efe5dc', // far-side legs, slightly shaded
    stripe: '#f4e9df', // markings: barely-there cream, just enough to give her shape
    white: '#ffffff',
    whiteFar: '#f1e8df',
    outline: '#9a6248', // soft brown, never black
    nose: '#f28da2',
    earIn: '#fbc6c4',
    blush: '#f9a3b4',
    eye: '#3a2733', // dark plum
    eyeGlow: '#8f63b0',
  };
  const OUT = 1.8; // outline thickness

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

  // Chibi proportions: the head is as big as the body, the legs are stubs.
  const HEAD_RX = 22;
  const HEAD_RY = 20;
  const POSE = {
    stand: { hip: { x: -12, y: -22 }, shoulder: { x: 8, y: -23 }, head: { x: 18, y: -40 }, tail: { x: -25, y: -28 }, bodyR: 15, haunchR: 15, chestR: 14.5 },
    sit: { hip: { x: -5, y: -18.5 }, shoulder: { x: 3, y: -28 }, head: { x: 7, y: -47 }, tail: { x: -21, y: -8 }, bodyR: 15.5, haunchR: 18.5, chestR: 14.5 },
    lie: { hip: { x: -14, y: -15 }, shoulder: { x: 8, y: -15 }, head: { x: 21, y: -20.5 }, tail: { x: -27, y: -9 }, bodyR: 14.5, haunchR: 15, chestR: 14.5 },
  };

  // Tail shapes: absolute angle of the first segment, then how much each
  // further segment curls, plus a swish. Angles are kept between -4 and
  // -1.5 rad so blending between styles swings the tail round the back,
  // never through her body.
  const TAIL = {
    walk: { base: -2.1, curl: 0.16, amp: 0.16, freq: 4 },
    run: { base: -2.6, curl: 0.1, amp: 0.2, freq: 8 },
    sit: { base: -3.75, curl: -0.3, amp: 0.08, freq: 1.6 },
    eat: { base: -3.5, curl: -0.2, amp: 0.25, freq: 5 },
    sleep: { base: -3.35, curl: -0.36, amp: 0.025, freq: 0.8 },
  };
  const TAIL_N = 8;
  const TAIL_SEG = 4.6;
  const tailR = (i) => lerp(5, 4.2, i / (TAIL_N - 1)); // short and plump

  // ---- state ------------------------------------------------------------

  function makeCat() {
    return {
      sit: 1, lie: 0, eat: 0, run: 0,
      tilt: 0, lookX: 0, lookY: 0,
      blink: 0, happy: 0, mouth: 0, hop: 0, earTwitch: 0,
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
    c.happy = approach(c.happy, t.happy || 0, 16, dt);
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

    // A bouncy little trot.
    const moving = (1 - s) * (1 - l);
    const ph = c.phase;
    const bob = -Math.abs(Math.cos(ph)) * lerp(2, 3.4, c.run) * moving;
    const pitch = Math.sin(ph) * 1.8 * c.run * moving;
    P.hip = add(P.hip, 0, bob + pitch);
    P.shoulder = add(P.shoulder, 0, bob - pitch);
    P.head = add(P.head, 0, bob * 0.7 - pitch * 0.8);
    P.tail = add(P.tail, 0, bob + pitch);

    // Eating: lean the head down and forward.
    P.head = mix(P.head, add(POSE.sit.head, 9, 22 + Math.sin(c.time * 14) * 1.2 * c.eat), c.eat);
    P.shoulder = add(P.shoulder, 2 * c.eat, 3 * c.eat);

    // Breathing, stronger when lying down.
    const breath = 1 + 0.035 * Math.sin(c.time * 2.1) * (0.35 + 0.65 * l);
    P.bodyR *= breath;
    P.chestR *= breath;
    P.haunchR *= breath;

    // Little hop when startled awake.
    const hop = -c.hop * 9;
    for (const k of ['hip', 'shoulder', 'head', 'tail']) P[k] = add(P[k], 0, hop);

    // Legs. Trot = diagonal pairs; run = bound (fronts together, backs together).
    const stride = lerp(4.5, 7, c.run) * moving;
    const lift = lerp(3.5, 5.5, c.run) * moving;
    const FOOT_Y = -3.5; // leg ends at the ankle; the paw sits below it
    const gait = (x, p) => ({ x: x + Math.sin(p) * stride, y: FOOT_Y - Math.max(0, Math.cos(p)) * lift + hop });
    const legDefs = [
      { far: true, front: false, root: add(P.hip, 4, 5), stand: P.hip.x + 3, sit: P.hip.x + 15, p: ph + lerp(0, Math.PI + 0.4, c.run) },
      { far: true, front: true, root: add(P.shoulder, 3, 5), stand: P.shoulder.x + 4, sit: P.shoulder.x + 9, p: ph + lerp(Math.PI, 0.4, c.run) },
      { far: false, front: false, root: add(P.hip, 0, 6), stand: P.hip.x - 1, sit: P.hip.x + 12, p: ph + Math.PI },
      { far: false, front: true, root: add(P.shoulder, 0, 6), stand: P.shoulder.x + 1, sit: P.shoulder.x + 5, p: ph },
    ];
    P.legs = legDefs.map((d) => {
      const foot = mix(gait(d.stand, d.p), { x: d.sit, y: FOOT_Y + hop }, s);
      const l1 = d.front ? lerp(6, 9, s) : lerp(6, 7, s);
      const l2 = d.front ? lerp(6.5, 10, s) : lerp(6.5, 8, s);
      const { knee, end } = ik(d.root, foot, l1, l2, d.front ? 1 : -1);
      return { far: d.far, root: d.root, knee, end };
    });

    // Tail chain.
    P.tailPts = [P.tail];
    let ang = 0;
    let cur = P.tail;
    for (let i = 0; i < TAIL_N; i++) {
      ang += c.tail[i];
      cur = { x: cur.x + Math.cos(ang) * TAIL_SEG, y: Math.min(cur.y + Math.sin(ang) * TAIL_SEG, -tailR(i)) };
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
      // `round` fattens the stroke, which rounds the corners off.
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2 * grow + (sh.round || 2);
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
    const tilt = c.tilt + 0.12 * c.lie + 0.25 * c.eat;
    const Hd = (x, y) => rotAround({ x: P.head.x + x, y: P.head.y + y }, P.head, tilt);
    const tw = c.earTwitch;
    const showLegs = c.lie < 0.55;

    // Near half: body, head, ears, near legs — one silhouette.
    const near = [
      { t: 'cap', a: P.hip, b: P.shoulder, r: P.bodyR, col: COL.fur },
      { t: 'circ', c: P.hip, r: P.haunchR, col: COL.fur },
      { t: 'circ', c: P.shoulder, r: P.chestR, col: COL.fur },
      { t: 'cap', a: P.shoulder, b: mix(P.shoulder, P.head, 0.6), r: 9, col: COL.fur },
    ];
    const far = [];
    for (const leg of P.legs) {
      if (!showLegs) break; // lying down she's a loaf: legs tucked away
      const list = leg.far ? far : near;
      const fur = leg.far ? COL.furFar : COL.fur;
      list.push({ t: 'cap', a: leg.root, b: leg.knee, r: 5, col: fur });
      list.push({ t: 'cap', a: leg.knee, b: leg.end, r: 4.5, col: fur });
      list.push({ t: 'ell', c: add(leg.end, 1.4, 0.4), rx: 5.2, ry: 3.2, col: leg.far ? COL.whiteFar : COL.white });
    }
    // Head last, so it sits over the body and front legs.
    near.push(
      { t: 'poly', round: 5, pts: [Hd(-15.5, -10.5), Hd(-6, -17), Hd(-13.5, -26)], col: COL.fur },
      { t: 'poly', round: 5, pts: [Hd(5, -17), Hd(15.5, -10.5), Hd(14.5 + tw * 3, -26 + tw * 2)], col: COL.fur },
      { t: 'ell', c: P.head, rx: HEAD_RX, ry: HEAD_RY, rot: tilt, col: COL.fur },
      { t: 'ell', c: Hd(2, 7), rx: HEAD_RX + 2, ry: 13.5, rot: tilt, col: COL.fur } // mochi cheeks
    );

    layer(ctx, near, () => {
      // Back stripes, perpendicular to the spine.
      const ux = P.shoulder.x - P.hip.x;
      const uy = P.shoulder.y - P.hip.y;
      const ul = Math.hypot(ux, uy) || 1;
      const n = { x: uy / ul, y: -ux / ul };
      for (let i = 0; i < 3; i++) {
        const t = 0.02 + 0.34 * i;
        const p = mix(P.hip, P.shoulder, t);
        const r = lerp(P.haunchR, P.chestR, t);
        line(ctx, add(p, n.x * (r + 2), n.y * (r + 2)), add(p, n.x * (r - 6) - (ux / ul) * 2, n.y * (r - 6) - (uy / ul) * 2), 3, COL.stripe);
      }
      // Cream belly.
      ctx.fillStyle = COL.white;
      ctx.beginPath();
      ctx.ellipse(P.shoulder.x + P.chestR * 0.5, P.shoulder.y + 5, 8.5, 11, -0.15 * (1 - c.lie), 0, Math.PI * 2);
      ctx.fill();

      // Re-fill the head so body details don't show through it.
      shape(ctx, { t: 'ell', c: P.head, rx: HEAD_RX, ry: HEAD_RY, rot: tilt, col: COL.fur }, 0);
      shape(ctx, { t: 'ell', c: Hd(2, 7), rx: HEAD_RX + 2, ry: 13.5, rot: tilt, col: COL.fur }, 0);
      // A soft line under the chin, to separate head from body.
      ctx.strokeStyle = COL.outline;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(Hd(2, 7).x, Hd(2, 7).y, HEAD_RX + 2.6, 14.1, tilt, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Forehead stripes.
      line(ctx, Hd(-1, -20), Hd(-0.5, -14.5), 2.4, COL.stripe);
      line(ctx, Hd(3.5, -20.5), Hd(3.5, -14), 2.4, COL.stripe);
      line(ctx, Hd(8, -20), Hd(7.5, -14.5), 2.4, COL.stripe);
      // Cream lower face.
      ctx.fillStyle = COL.white;
      ctx.beginPath();
      ctx.ellipse(Hd(4, 11).x, Hd(4, 11).y, 13, 8, tilt, 0, Math.PI * 2);
      ctx.fill();
      // Blush.
      ctx.fillStyle = COL.blush;
      ctx.globalAlpha = 0.75;
      for (const [bx, by] of [[-12, 9.5], [19, 9.5]]) {
        const b = Hd(bx, by);
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 4, 2.4, tilt, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Inner ears.
      ctx.fillStyle = ctx.strokeStyle = COL.earIn;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      for (const pts of [
        [Hd(-13.5, -12.5), Hd(-8.5, -16.5), Hd(-13, -22)],
        [Hd(7.5, -16.5), Hd(13.5, -12.5), Hd(13 + tw * 2.5, -22 + tw * 1.5)],
      ]) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });

    layerBehind(ctx, far);

    // Tail, behind everything, with rings toward the tip.
    const tail = [];
    for (let i = 0; i < TAIL_N; i++) {
      tail.push({ t: 'cap', a: P.tailPts[i], b: P.tailPts[i + 1], r: tailR(i), col: i >= 2 && i % 2 === 0 ? COL.stripe : COL.fur });
    }
    layerBehind(ctx, tail);

    ctx.globalCompositeOperation = 'source-over';
    drawFace(ctx, c, Hd, tilt);
  }

  function drawFace(ctx, c, Hd, tilt) {
    const open = 1 - c.blink;
    ctx.lineCap = 'round';
    // Big eyes, set low and wide apart.
    for (const [ex, ey] of [[-5, 3], [13, 3]]) {
      const e = Hd(ex + c.lookX * 1.3, ey + c.lookY * 1.1);
      if (c.happy > 0.5) {
        // Happy: ^ ^
        ctx.strokeStyle = COL.eye;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(e.x, e.y + 2.5, 3.8, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      } else if (open > 0.2) {
        ctx.fillStyle = COL.eye;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 4.3, 5.2 * open, tilt, 0, Math.PI * 2);
        ctx.fill();
        // Coloured glow in the lower half, then the sparkles.
        ctx.fillStyle = COL.eyeGlow;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 2.2 * open, 2.9, 2.2 * open, tilt, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x - 1.3 + c.lookX * 0.6, e.y - 2 * open + c.lookY * 0.4, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e.x + 1.7 + c.lookX * 0.4, e.y + 2.3 * open, 0.9, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Closed: a soft sleepy curve.
        ctx.strokeStyle = COL.eye;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 1.5, 3.6, 0.18 * Math.PI, 0.82 * Math.PI);
        ctx.stroke();
      }
    }

    // Tiny nose and "w" mouth, tucked between the eyes.
    const n = Hd(4, 7);
    ctx.fillStyle = COL.nose;
    ctx.beginPath();
    ctx.ellipse(n.x, n.y, 1.5, 1.05, tilt, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COL.outline;
    ctx.lineWidth = 1.1;
    const mid = Hd(4, 8.6);
    const q = (x, y) => Hd(x, y);
    ctx.beginPath();
    ctx.moveTo(q(1.2, 9.2).x, q(1.2, 9.2).y);
    ctx.quadraticCurveTo(q(2.4, 11).x, q(2.4, 11).y, mid.x, mid.y);
    ctx.quadraticCurveTo(q(5.6, 11).x, q(5.6, 11).y, q(6.8, 9.2).x, q(6.8, 9.2).y);
    ctx.stroke();
    if (c.mouth > 0.05) {
      const m = Hd(4, 10.6);
      ctx.fillStyle = '#e07a8a';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 1.9, 1.7 * c.mouth, tilt, 0, Math.PI * 2);
      ctx.fill();
    }

    // Two short whiskers a side.
    ctx.strokeStyle = COL.outline;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const [from, to] of [
      [[-19, 6], [-24.5, 4.8]], [[-19.5, 9.5], [-24.5, 10.2]], // shorter at the back, so they don't cross her body
      [[23, 6], [31, 4]], [[23.5, 9.5], [31, 10.5]],
    ]) {
      const a = Hd(from[0], from[1]);
      const b = Hd(to[0], to[1]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
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
    ctx.strokeStyle = '#5b7fa6'; // a darker blue reads better than brown at cursor size

    // Tail fin.
    ctx.fillStyle = '#8fc0ea';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(14.5, -6);
    ctx.quadraticCurveTo(12, 0, 14.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body, with a lighter belly.
    ctx.fillStyle = '#a9d4f5';
    ctx.beginPath();
    ctx.ellipse(-1.5, 0, 10.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#e6f3fc';
    ctx.beginPath();
    ctx.ellipse(-1.5, 4.5, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Blush, to match Fiona.
    ctx.fillStyle = COL.blush;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(-5.5, 2.2, 2, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-1.5, 0, 10.5, 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Eye.
    ctx.fillStyle = COL.eye;
    ctx.beginPath();
    ctx.arc(-7, -1.4, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-7.5, -1.9, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const api = { makeCat, stepCat, drawCat, drawFish, FISH_HOTSPOT, COL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FionaCat = api;
})(this);
