// Fiona's body: a small vector rig drawn with canvas paths, styled as
// a smooth plush kitten — one soft egg shape, a soft edge instead of
// an outline, 3D-style shading, soft round blush and big glossy eyes.
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
    fur: '#fff8ee', // warm white
    furFar: '#f3e5d6', // far-side legs, slightly shaded
    stripe: '#f8e9da', // faint tabby markings
    white: '#ffffff',
    whiteFar: '#f5e9dc',
    rim: 'rgba(190, 150, 135, 0.5)', // soft edge so she reads on a white background
    shade: '228, 188, 168', // warm shadow tint (r, g, b), used at various strengths
    nose: '#f39aa9',
    mouth: '#b77a70',
    earIn: '#f9c3c4',
    blush: '255, 140, 165', // (r, g, b)
    eye: '#1a1115',
    iris: '#8a5a32', // brown ring at the bottom of the eye
  };
  const OUT = 0.9; // width of the soft rim

  // Repeatable pseudo-random number for index n, so fur doesn't flicker.
  const rnd = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

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

  // An egg: the head is the top half, the body the bottom, legs are nubs.
  const HEAD_RX = 23;
  const HEAD_RY = 19;
  const POSE = {
    stand: { hip: { x: -11, y: -22 }, shoulder: { x: 7, y: -23 }, head: { x: 14, y: -37 }, tail: { x: -25, y: -27 }, bodyR: 16, haunchR: 16, chestR: 15.5 },
    sit: { hip: { x: -3, y: -20 }, shoulder: { x: 2, y: -30 }, head: { x: 5, y: -44 }, tail: { x: -20, y: -8 }, bodyR: 18, haunchR: 20, chestR: 17 },
    lie: { hip: { x: -14, y: -15.5 }, shoulder: { x: 8, y: -15.5 }, head: { x: 20, y: -20 }, tail: { x: -27, y: -9 }, bodyR: 15, haunchR: 15.5, chestR: 15 },
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
  const TAIL_SEG = 4.2;
  const tailR = (i) => lerp(5.4, 4.6, i / (TAIL_N - 1)); // short and plump

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
      const l1 = d.front ? lerp(6, 10, s) : lerp(6, 7.5, s);
      const l2 = d.front ? lerp(6.5, 11.5, s) : lerp(6.5, 9, s);
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

  // Draw a set of shapes as one soft silhouette: fills first, then
  // `details` clipped to them, then a faint rim slid in behind.
  function layer(ctx, shapes, details) {
    ctx.globalCompositeOperation = 'source-over';
    for (const sh of shapes) shape(ctx, sh, 0);
    if (details) {
      ctx.globalCompositeOperation = 'source-atop';
      details();
    }
    ctx.globalCompositeOperation = 'destination-over';
    for (const sh of shapes) shape(ctx, sh, OUT, COL.rim);
  }

  // Same, but the whole layer goes behind what's already drawn.
  function layerBehind(ctx, shapes) {
    ctx.globalCompositeOperation = 'destination-over';
    for (const sh of shapes) shape(ctx, sh, 0);
    for (const sh of shapes) shape(ctx, sh, OUT, COL.rim);
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

  // Shade a round form like a ball lit from the upper left: clear in
  // the middle, tinted toward the far edge.
  function ball(ctx, cx, cy, r, strength) {
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.35, r * 0.15, cx, cy, r * 1.08);
    g.addColorStop(0, `rgba(${COL.shade}, 0)`);
    g.addColorStop(0.55, `rgba(${COL.shade}, 0)`);
    g.addColorStop(1, `rgba(${COL.shade}, ${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
  }

  // Fur texture: fine light and dark strokes scattered over an ellipse,
  // all combed outward and down from its top.
  function furTexture(ctx, c, rx, ry, seed, count) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.6;
    for (const [tone, offset] of [[`rgba(255, 255, 255, 0.3)`, 0], [`rgba(${COL.shade}, 0.07)`, 500]]) {
      ctx.strokeStyle = tone;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const n = seed + offset + i * 3;
        const a = rnd(n) * Math.PI * 2;
        const d = Math.sqrt(rnd(n + 1)) * 0.9;
        const x = c.x + Math.cos(a) * rx * d;
        const y = c.y + Math.sin(a) * ry * d;
        const flow = Math.atan2(y - (c.y - ry * 0.9), x - c.x);
        const len = 1.2 + rnd(n + 2) * 1.6;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(flow) * len, y + Math.sin(flow) * len);
      }
      ctx.stroke();
    }
  }

  function drawCat(ctx, c) {
    const P = solve(c);
    c.points = P;
    const tilt = c.tilt + 0.1 * c.lie + 0.22 * c.eat;
    const Hd = (x, y) => rotAround({ x: P.head.x + x, y: P.head.y + y }, P.head, tilt);
    const tw = c.earTwitch;
    const showLegs = c.lie < 0.55;
    const headShape = { t: 'ell', c: P.head, rx: HEAD_RX, ry: HEAD_RY, rot: tilt, col: COL.fur };

    // Near half: body, head, ears, near legs — one silhouette.
    const near = [
      { t: 'cap', a: P.hip, b: P.shoulder, r: P.bodyR, col: COL.fur },
      { t: 'circ', c: P.hip, r: P.haunchR, col: COL.fur },
      { t: 'circ', c: P.shoulder, r: P.chestR, col: COL.fur },
    ];
    const far = [];
    for (const leg of P.legs) {
      if (!showLegs) break; // lying down she's a loaf: legs tucked away
      const list = leg.far ? far : near;
      const fur = leg.far ? COL.furFar : COL.fur;
      list.push({ t: 'cap', a: leg.root, b: leg.knee, r: 5.2, col: fur });
      list.push({ t: 'cap', a: leg.knee, b: leg.end, r: 4.8, col: fur });
      list.push({ t: 'ell', c: add(leg.end, 1.2, 0.2), rx: 5.4, ry: 3.6, col: leg.far ? COL.whiteFar : COL.white });
    }
    // Head last, so it sits over the body and front legs. Small ears, set wide.
    near.push(
      { t: 'poly', round: 4, pts: [Hd(-18.5, -8), Hd(-10, -15.5), Hd(-17.5, -23.5)], col: COL.fur },
      { t: 'poly', round: 4, pts: [Hd(9, -15.5), Hd(18.5, -8.5), Hd(17.5 + tw * 2.5, -23.5 + tw * 1.5)], col: COL.fur },
      headShape
    );

    layer(ctx, near, () => {
      // Faint tabby stripes across the back.
      const ux = P.shoulder.x - P.hip.x;
      const uy = P.shoulder.y - P.hip.y;
      const ul = Math.hypot(ux, uy) || 1;
      const n = { x: uy / ul, y: -ux / ul };
      for (let i = 0; i < 3; i++) {
        const t = 0.02 + 0.34 * i;
        const p = mix(P.hip, P.shoulder, t);
        const r = lerp(P.haunchR, P.chestR, t);
        line(ctx, add(p, n.x * (r + 2), n.y * (r + 2)), add(p, n.x * (r - 7) - (ux / ul) * 2, n.y * (r - 7) - (uy / ul) * 2), 3.2, COL.stripe);
      }

      // Body: shaded as one ball, textured, darker where it meets the ground.
      const bc = mix(P.hip, P.shoulder, 0.45);
      const br = Math.max(P.haunchR, P.chestR) + ul * 0.5;
      ball(ctx, bc.x, bc.y, br, 0.75);
      furTexture(ctx, bc, br * 0.95, Math.max(P.haunchR, P.chestR), 9000, 30);
      const contact = ctx.createLinearGradient(0, -9, 0, 0);
      contact.addColorStop(0, `rgba(${COL.shade}, 0)`);
      contact.addColorStop(1, `rgba(${COL.shade}, 0.55)`);
      ctx.fillStyle = contact;
      ctx.fillRect(-120, -9, 240, 12);
      // The head's shadow on the chest.
      const under = Hd(1, 12);
      const drop = ctx.createRadialGradient(under.x, under.y, 4, under.x, under.y, HEAD_RX + 2);
      drop.addColorStop(0, `rgba(${COL.shade}, 0.6)`);
      drop.addColorStop(1, `rgba(${COL.shade}, 0)`);
      ctx.fillStyle = drop;
      ctx.fillRect(under.x - 30, under.y - 30, 60, 60);

      // The head: re-filled so body details don't show through it, then
      // shaded as its own ball. No chin line, no cheek tufts — just round.
      const hp = new Path2D();
      hp.ellipse(P.head.x, P.head.y, HEAD_RX, HEAD_RY, tilt, 0, Math.PI * 2);
      ctx.save();
      ctx.clip(hp);
      shape(ctx, headShape, 0);
      line(ctx, Hd(-1.5, -19), Hd(-1, -14), 2.4, COL.stripe);
      line(ctx, Hd(3.5, -19.5), Hd(3.5, -13.5), 2.4, COL.stripe);
      line(ctx, Hd(8.5, -19), Hd(8, -14), 2.4, COL.stripe);
      ball(ctx, P.head.x, P.head.y + 1, HEAD_RX + 1, 0.6);
      furTexture(ctx, P.head, HEAD_RX, HEAD_RY, 4000, 30);
      // Blush: big, soft, low on the cheeks, fading out with no edge.
      for (const [bx, by] of [[-13.5, 8.5], [20, 8.5]]) {
        const b = Hd(bx, by);
        const g = ctx.createRadialGradient(b.x, b.y, 0.5, b.x, b.y, 7.5);
        g.addColorStop(0, `rgba(${COL.blush}, 0.62)`);
        g.addColorStop(0.5, `rgba(${COL.blush}, 0.36)`);
        g.addColorStop(1, `rgba(${COL.blush}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(b.x - 8, b.y - 8, 16, 16);
      }
      ctx.restore();

      // Inner ears, pink fading toward the tip.
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.6;
      for (const pts of [
        [Hd(-16.5, -10.5), Hd(-11.5, -14.5), Hd(-16.3, -20.5)],
        [Hd(11, -14.5), Hd(16.5, -11), Hd(16.3 + tw * 2, -20.5 + tw * 1.2)],
      ]) {
        const g = ctx.createLinearGradient(pts[0].x, pts[0].y + 3, pts[2].x, pts[2].y);
        g.addColorStop(0, COL.earIn);
        g.addColorStop(1, '#fde3df');
        ctx.fillStyle = ctx.strokeStyle = g;
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });

    layerBehind(ctx, far);

    // Tail, behind everything, with faint rings toward the tip.
    const tail = [];
    for (let i = 0; i < TAIL_N; i++) {
      tail.push({ t: 'cap', a: P.tailPts[i], b: P.tailPts[i + 1], r: tailR(i), col: i >= 2 && i % 2 === 0 ? COL.stripe : COL.fur });
    }
    layerBehind(ctx, tail);

    // A soft shadow on the ground, under everything.
    ctx.globalCompositeOperation = 'destination-over';
    const sx = (P.hip.x + P.shoulder.x) / 2 + lerp(3, 8, c.lie);
    const shadow = ctx.createRadialGradient(sx, 0, 2, sx, 0, 36);
    shadow.addColorStop(0, 'rgba(70, 45, 50, 0.3)');
    shadow.addColorStop(1, 'rgba(70, 45, 50, 0)');
    ctx.save();
    ctx.translate(0, -0.5);
    ctx.scale(1, 0.11); // squash the round gradient into a flat ellipse
    ctx.fillStyle = shadow;
    ctx.fillRect(sx - 38, -38, 76, 76);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    drawFace(ctx, c, Hd);
  }

  function drawFace(ctx, c, Hd) {
    const open = 1 - c.blink;
    ctx.lineCap = 'round';
    // Big, round, glossy eyes, set wide.
    for (const [ex, ey] of [[-6, 2], [13, 2]]) {
      const e = Hd(ex + c.lookX * 1.3, ey + c.lookY * 1.1);
      if (c.happy > 0.5) {
        // Happy: ^ ^
        ctx.strokeStyle = COL.eye;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y + 3, 4.8, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      } else if (open > 0.2) {
        const r = 5.4;
        const ry = r * open;
        ctx.fillStyle = COL.eye;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, r, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        // Brown iris glowing through at the bottom.
        const glow = ctx.createRadialGradient(e.x, e.y + ry * 0.55, 0.5, e.x, e.y + ry * 0.3, r);
        glow.addColorStop(0, 'rgba(150, 100, 55, 0.95)');
        glow.addColorStop(0.6, 'rgba(110, 70, 40, 0.5)');
        glow.addColorStop(1, 'rgba(110, 70, 40, 0)');
        ctx.save();
        ctx.clip();
        ctx.fillStyle = glow;
        ctx.fillRect(e.x - r, e.y, r * 2, ry);
        ctx.restore();
        // Catchlights: one big, one small.
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(e.x - 1.5 + c.lookX * 0.5, e.y - 2.1 * open + c.lookY * 0.3, 2, 2 * open, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(e.x + 2.1 + c.lookX * 0.4, e.y + 2.4 * open, 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // Closed: a soft sleepy curve.
        ctx.strokeStyle = COL.eye;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(e.x, e.y - 1.5, 4.6, 0.18 * Math.PI, 0.82 * Math.PI);
        ctx.stroke();
      }
    }

    // Tiny nose and mouth, tucked between the eyes.
    const n = Hd(3.5, 6.4);
    ctx.fillStyle = COL.nose;
    ctx.beginPath();
    ctx.ellipse(n.x, n.y, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COL.mouth;
    ctx.lineWidth = 1;
    const mid = Hd(3.5, 8.2);
    ctx.beginPath();
    ctx.moveTo(Hd(1, 8.8).x, Hd(1, 8.8).y);
    ctx.quadraticCurveTo(Hd(2.1, 10.4).x, Hd(2.1, 10.4).y, mid.x, mid.y);
    ctx.quadraticCurveTo(Hd(4.9, 10.4).x, Hd(4.9, 10.4).y, Hd(6, 8.8).x, Hd(6, 8.8).y);
    ctx.stroke();
    if (c.mouth > 0.05) {
      const m = Hd(3.5, 10.2);
      ctx.fillStyle = '#e58492';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 1.9, 1.7 * c.mouth, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // A few fine whiskers.
    ctx.strokeStyle = 'rgba(160, 120, 110, 0.5)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [from, to] of [
      [[-19, 6.5], [-25.5, 5.5]], [[-19, 9.5], [-25.5, 10.5]],
      [[25, 6.5], [32, 5]], [[25, 9.5], [32, 10.5]],
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
    ctx.fillStyle = `rgb(${COL.blush})`;
    ctx.globalAlpha = 0.7;
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
