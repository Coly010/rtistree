// Rtistree studio program. Original path artwork; no image inputs.
// One equipment vocabulary serves both the character rig and inventory icons.
const canvas = art.canvas(),
  ctx = canvas.getContext('2d');
ctx.scale(art.width / 256, art.height / 320);
ctx.lineJoin = 'round';
ctx.lineCap = 'round';
const stage = parameters.stage ?? 'finish';
const detail = stage === 'finish';
const P = {
  ink: '#182b2e',
  dark: '#263c40',
  steel: '#708e91',
  light: '#c5d8cf',
  glint: '#edf0d9',
  brass: '#b99b5e',
  gold: '#e1c98a',
  green: '#386257',
  cloth: '#21463f',
  moss: '#648575',
  leather: '#654c38',
  black: '#142925',
};
function path(d, fill, stroke = P.ink, width = 1.4) {
  const p = art.path(d);
  ctx.fillStyle = fill;
  ctx.fill(p);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke(p);
  }
}
function line(d, col = P.light, w = 1) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.stroke(art.path(d));
}
function poly(points, col, stroke = P.ink, w = 1.4) {
  path('M' + points.map((p) => p.join(' ')).join('L') + 'Z', col, stroke, w);
}
function ellipse(x, y, rx, ry, col, stroke = null) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
function grad(x, y, x2, y2, colors) {
  const g = ctx.createLinearGradient(x, y, x2, y2);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
}
function local(x, y, angle, scale, fn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  fn();
  ctx.restore();
}
function rivet(x, y, r = 1.7) {
  ellipse(x, y, r, r, P.brass, P.ink);
  if (detail) ellipse(x - 0.35, y - 0.5, r * 0.38, r * 0.38, P.gold);
}
function oak(x, y, s = 1) {
  local(x, y, 0, s, () => {
    line('M0 17L0 -18', P.gold, 2);
    path(
      'M0 -15C-16 -25 -22 -11 -9 -8C-26 -7 -21 6 -8 3C-19 12 -7 18 0 11C7 18 19 12 8 3C21 6 26 -7 9 -8C22 -11 16 -25 0 -15Z',
      P.brass,
      null,
    );
    line('M0 12L0 -14M0 3L-9 -3M0 -3L10 -10', P.gold, 0.8);
  });
}
function shield() {
  path(
    'M-30 -36Q0 -46 30 -36L27 7Q19 30 0 45Q-19 30 -27 7Z',
    grad(-30, -40, 30, 30, [P.gold, P.brass, '#67583c']),
  );
  path(
    'M-25 -32Q0 -40 25 -32L22 6Q16 25 0 38Q-16 25 -22 6Z',
    grad(-25, -30, 25, 35, [P.moss, P.green, P.cloth]),
  );
  path('M0 -36L23 -31L20 7Q13 25 0 36Z', '#1a4039', null);
  if (detail) {
    line('M-27 -33L-24 5Q-16 25 0 41', P.gold, 1.1);
    oak(0, -2, 0.76);
    for (const [x, y] of [
      [-27, -34],
      [27, -34],
      [-23, 8],
      [23, 8],
      [0, 40],
    ])
      rivet(x, y, 1.3);
    line('M-18 15l4 -5M13 -24l-2 6M10 22l4 -5', '#8aaa90', 0.75);
  }
}
function sword() {
  path('M-4 -18L-6 -100L0 -121L6 -100L4 -18Z', P.light);
  poly(
    [
      [0, -119],
      [6, -100],
      [4, -19],
      [0, -18],
    ],
    P.steel,
    null,
  );
  line('M0 -113L0 -23', P.glint, 1.1);
  path('M-16 -18Q-8 -22 0 -20Q8 -22 16 -18L17 -13Q7 -16 0 -15Q-7 -16 -17 -13Z', P.brass);
  path('M-3 -14L3 -14L3 8L-3 8Z', P.leather);
  if (detail) for (let y = -11; y < 8; y += 4) line(`M-2 ${y}L2 ${y - 2}`, P.brass, 0.8);
  path('M0 6L5 11L0 18L-5 11Z', P.brass);
  ellipse(-1, 10, 1.5, 1.5, P.gold);
}
function axe() {
  path('M-4 -101L3 -103L5 78Q0 85 -4 78Z', grad(-4, 0, 5, 0, [P.brass, P.leather]));
  path('M-4 -82Q-25 -80 -45 -102Q-53 -72 -42 -46Q-24 -68 -4 -65Z', P.steel);
  path('M-45 -102Q-53 -72 -42 -46L-35 -55Q-43 -74 -39 -94Z', P.light);
  path('M3 -82Q20 -80 29 -88L24 -66L4 -65Z', P.dark);
  path('M-8 -84L8 -84L8 -62L-8 -62Z', P.brass);
  for (let y = 35; y < 76; y += 5) line(`M-3 ${y}L4 ${y - 2}`, P.black, 2);
  rivet(0, -74, 2);
  line('M-44 -91Q-46 -72 -40 -59', P.glint, 1);
}
// Tapered arm/leg plate between shared anatomical landmarks.
function segment(a, b, wa, wb, far = false) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy),
    nx = -dy / len,
    ny = dx / len;
  const v = (p, w) => [p[0] + nx * w, p[1] + ny * w];
  poly(
    [v(a, wa), v(a, -wa), v(b, -wb), v(b, wb)],
    grad(a[0] - wa, a[1], a[0] + wa, b[1], [far ? P.steel : P.light, P.steel, P.dark]),
  );
  line(`M${v(a, wa * 0.7)}L${v(b, wb * 0.7)}`, far ? P.steel : P.light, 1.1);
  if (detail) {
    const t = 0.7;
    const p = [a[0] + dx * t, a[1] + dy * t];
    line(`M${v(p, wb * 0.8)}L${v(p, -wb * 0.8)}`, P.dark, 1.1);
  }
}
function boot(ankle, far) {
  local(...ankle, 0, 1, () => {
    path(
      'M-8 -9L7 -9L10 1L21 7Q24 12 18 14L-9 13L-12 9Z',
      far ? P.dark : grad(-8, -8, 12, 12, [P.steel, P.dark]),
    );
    line('M-10 10L20 11', P.black, 3);
    if (detail) {
      line('M-4 -5L7 -5M-2 0L10 1', P.light, 0.9);
      line('M11 5L17 8', P.steel, 1.5);
    }
  });
}
function leg(hip, knee, ankle, far) {
  segment(hip, knee, 10, 8, far);
  ellipse(...knee, 10, 9, far ? P.dark : P.steel, P.ink);
  segment(knee, ankle, 8, 5, far);
  if (detail) {
    local(...knee, 0, 1, () => {
      poly(
        [
          [-9, -3],
          [0, -8],
          [10, -2],
          [0, 5],
        ],
        far ? P.steel : P.light,
      );
      rivet(0, -1, 1.2);
    });
  }
  boot(ankle, far);
}
function hand(p) {
  local(...p, 0, 1, () => {
    path('M-6 -6L4 -7L8 -2L6 8L-3 9L-8 2Z', P.steel);
    if (detail) line('M-5 -2L5 -3M-4 2L5 1', P.light, 1);
  });
}
function helmet() {
  // Three-quarter sallet: the projecting visor establishes an unambiguous right facing.
  path(
    'M-20 -9Q-24 -31 -8 -38Q7 -45 19 -31L23 -15L30 -5L19 2L13 17L-5 19L-21 7Z',
    grad(-20, -34, 22, 18, [P.light, P.steel, P.dark]),
  );
  path('M-18 -16Q-15 -32 -4 -34L7 -36L6 -14Z', P.light, null);
  path('M7 -37L12 -35L16 -17L9 -14Z', P.brass);
  path('M-16 -12L10 -16L29 -7L27 -2L8 -5L-16 -3Z', P.black);
  path('M7 -13L28 -6L26 0L11 -3L5 9L-2 7Z', P.steel);
  path('M-17 0L-6 3L-6 13L5 14L-3 19L-18 12Z', P.dark);
  path('M12 2L24 1L19 9L9 14L7 9Z', P.light);
  if (detail) {
    line('M-19 -18Q-18 -30 -7 -35', P.glint, 1.1);
    line('M9 -13L26 -6', P.gold, 0.9);
    for (let i = 0; i < 3; i++) line(`M${11 + i * 3} 3L${10 + i * 3} 6`, P.dark, 0.8);
    rivet(-15, -8, 2);
    line('M-17 5L-10 8', P.steel, 1);
  }
  path('M-5 -37Q-23 -57 -44 -39Q-26 -42 -24 -27Q-19 -36 -5 -34Z', P.cloth);
  path('M-7 -36Q-22 -48 -36 -41Q-25 -43 -20 -33Z', P.green, null);
}
function knight() {
  const pose = parameters.pose ?? 'watch',
    walking = pose === 'walk';
  const gait = walking ? walkPose(Number(parameters.phase ?? 0)) : null;
  const guard = pose === 'guard',
    stride = pose === 'stride';
  const bob = gait?.bob ?? 0;
  // Entirely distinct load-bearing arrangements, not rotations of one cutout.
  let q = guard
    ? {
        hipN: [125, 192],
        kneeN: [158, 231],
        ankleN: [170, 271],
        hipF: [110, 191],
        kneeF: [90, 235],
        ankleF: [68, 269],
        shoulderN: [123, 127],
        elbowN: [140, 153],
        wristN: [170, 149],
        shoulderF: [150, 124],
        elbowF: [124, 150],
        wristF: [99, 115],
        chest: [131, 149],
        head: [142, 98],
        shield: [174, 160],
        swordAngle: -0.62,
        lean: 0.16,
      }
    : stride
      ? {
          hipN: [125, 183],
          kneeN: [157, 222],
          ankleN: [175, 269],
          hipF: [139, 183],
          kneeF: [105, 224],
          ankleF: [86, 263],
          shoulderN: [109, 119],
          elbowN: [94, 151],
          wristN: [110, 177],
          shoulderF: [151, 116],
          elbowF: [169, 145],
          wristF: [181, 156],
          chest: [132, 140],
          head: [141, 83],
          shield: [107, 177],
          swordAngle: 0.34,
          lean: 0.1,
        }
      : {
          hipN: [120, 181],
          kneeN: [111, 226],
          ankleN: [102, 271],
          hipF: [137, 181],
          kneeF: [151, 225],
          ankleF: [153, 269],
          shoulderN: [103, 115],
          elbowN: [83, 146],
          wristN: [86, 175],
          shoulderF: [147, 113],
          elbowF: [168, 139],
          wristF: [177, 173],
          chest: [126, 137],
          head: [134, 81],
          shield: [80, 177],
          swordAngle: 2.94,
          lean: -0.055,
        };
  if (gait) {
    const swing = gait.armSwing;
    q = {
      hipN: gait.hipNear,
      kneeN: gait.kneeNear,
      ankleN: gait.near.ankle,
      hipF: gait.hipFar,
      kneeF: gait.kneeFar,
      ankleF: gait.far.ankle,
      shoulderN: [106, 117 + bob],
      elbowN: [100 - 6 * swing, 148 + bob],
      wristN: [100 - 9 * swing, 178 + bob],
      shoulderF: [150, 115 + bob],
      elbowF: [166 + 5 * swing, 141 + bob],
      wristF: [178 + 7 * swing, 165 + bob],
      chest: [131, 139 + bob],
      head: [139, 83 + bob],
      shield: [94 - 9 * swing, 180 + bob],
      swordAngle: 0.25 + swing * 0.065,
      lean: 0.07,
    };
  }
  q.head[1] += 6;
  const hip = [(q.hipN[0] + q.hipF[0]) / 2, (q.hipN[1] + q.hipF[1]) / 2];
  const wind = walking
    ? 7 * Math.sin(Number(parameters.phase) * Math.PI * 2 - 0.8)
    : stride
      ? 15
      : guard
        ? 7
        : 0;
  const capeTop = [q.chest[0] - 13, q.chest[1] - 36],
    capeBottom = [hip[0] - 53 - wind, 239];
  path(
    `M${capeTop}Q${q.chest[0] + 18} ${q.chest[1] - 37} ${q.chest[0] + 24} ${q.chest[1] - 14}L${hip[0] + 20 - wind} 231L${hip[0] + 4 - wind} 240L${hip[0] - 10 - wind} 228L${capeBottom}Q${hip[0] - 31} 185 ${capeTop}Z`,
    grad(90, 114, 135, 239, [P.green, P.cloth, P.black]),
  );
  path(
    `M${capeTop}Q${hip[0] - 35} 193 ${capeBottom[0] + 5} 231L${hip[0] - 30 - wind} 223L${q.chest[0] - 8} ${q.chest[1] - 8}Z`,
    P.green,
    null,
  );
  if (detail)
    line(
      `M${capeTop[0] - 1} ${capeTop[1] + 10}Q${hip[0] - 34} 189 ${capeBottom[0] + 15} 225`,
      P.moss,
      1,
    );
  leg(q.hipF, q.kneeF, q.ankleF, true);
  leg(q.hipN, q.kneeN, q.ankleN, false);
  segment(q.shoulderF, q.elbowF, 9, 7, true);
  ellipse(...q.elbowF, 8, 8, P.dark, P.ink);
  segment(q.elbowF, q.wristF, 7, 5, true);
  local(...q.wristF, q.swordAngle, 0.9, sword);
  hand(q.wristF);
  // Shorter divided skirt leaves leg articulation visible.
  local(hip[0], hip[1] - 10, guard ? 0.08 : -0.06, 1, () => {
    path('M-23 -14L21 -15L29 33L10 41L-1 16L-8 42L-28 30Z', P.cloth);
    path('M-20 -6L-4 -4L-12 36L-25 28Z', P.green, null);
    if (detail) line('M-24 24L-11 34M15 27L21 32', P.brass, 1.2);
    path('M-24 -2Q0 5 23 -3L24 6Q0 13 -24 7Z', P.leather);
    path('M3 2L12 1L12 9L3 10Z', P.brass);
    for (const [x, ang] of [
      [-15, 0.18],
      [15, -0.16],
    ])
      local(x, 20, ang, 1, () => {
        path('M-10 -9L9 -10L13 15L-10 19Z', grad(-10, -7, 13, 16, [P.light, P.steel, P.dark]));
        if (detail) {
          line('M-9 -3L9 -4M-9 4L11 3M-9 11L12 10', P.dark, 1);
          line('M-8 -7L-8 15', P.light, 0.8);
        }
      });
  });
  // Torso has a receding side, raised sternum and lower overlapping lames.
  local(...q.chest, q.lean, 1, () => {
    path(
      'M-23 -30Q-5 -39 19 -29L28 -9L21 26L-15 32L-29 8Z',
      grad(-26, -30, 26, 26, [P.light, P.steel, P.dark]),
    );
    path('M5 -31Q19 -29 26 -13L21 23L4 27Q12 -5 5 -31Z', P.dark, null);
    path('M-19 -26L0 -31L8 -8L1 21L-16 24L-23 4Z', grad(-20, -26, 7, 25, [P.light, P.steel]), null);
    line('M0 -28L8 -7L2 21', P.light, 1.3);
    path('M-18 20Q-1 25 22 16L21 24Q-1 34 -17 27Z', P.steel);
    line('M-18 21Q0 27 21 18', P.light, 1);
    if (detail) {
      local(-7, -5, -0.1, 0.33, () => oak(0, 0));
      rivet(-18, -24, 1.3);
      rivet(17, -23, 1.3);
      line('M-18 -20L-22 -9M-17 10l5 -5', P.glint, 0.8);
    }
  });
  segment(q.shoulderN, q.elbowN, 10, 7);
  ellipse(...q.elbowN, 8.5, 8, P.dark, P.ink);
  segment(q.elbowN, q.wristN, 8, 5);
  for (const [pt, far] of [
    [q.shoulderF, true],
    [q.shoulderN, false],
  ])
    local(...pt, far ? 0.2 : -0.32, 1, () => {
      path(
        'M-15 -8Q-7 -21 9 -13L16 -5L15 10L1 15L-17 8Z',
        far ? P.steel : grad(-14, -12, 14, 11, [P.light, P.steel, P.dark]),
      );
      path('M-17 1Q0 10 15 2L17 9Q-1 18 -17 8Z', P.steel);
      if (detail) {
        line('M-12 -9Q-3 -16 10 -7', P.gold, 1.3);
        rivet(-10, -2, 1.4);
        line('M-12 5Q0 12 12 6', P.light, 0.9);
      }
    });
  path(
    `M${q.head[0] - 13} ${q.head[1] + 14}L${q.head[0] + 9} ${q.head[1] + 12}L${q.chest[0] + 16} ${q.chest[1] - 27}Q${q.chest[0]} ${q.chest[1] - 17} ${q.chest[0] - 17} ${q.chest[1] - 27}Z`,
    P.dark,
  );
  local(...q.head, guard ? 0.13 : 0.015, 0.9, helmet);
  hand(q.wristN);
  local(...q.shield, guard ? 0.12 : -0.18, 0.91, () => {
    ctx.scale(guard ? 0.78 : 0.93, 1);
    shield();
  });
}
function lantern() {
  path('M-14 -46L-14 -64Q0 -82 14 -64L14 -46', P.dark, P.brass, 4);
  path('M-30 -34L0 -51L30 -34L23 -22L-24 -22Z', P.dark);
  path(
    'M-24 -23L24 -23L28 46L0 58L-28 46Z',
    grad(-26, -20, 27, 48, ['#ffe7a3', '#ca8e38', '#755733']),
  );
  path('M-17 -15L-3 -19L-3 44L-20 37Z', '#e6bd68', null);
  path('M4 -18L18 -15L21 35L4 44Z', '#946431', null);
  path('M-4 32Q-17 16 -2 -5Q-3 12 7 14Q15 27 4 32Z', '#fff4bc', null);
  for (const x of [-24, 0, 24]) line(`M${x} -23L${x * 1.13} 47`, P.dark, 5);
  path('M-30 44L0 55L30 44L28 56L0 67L-28 56Z', P.dark);
  line('M-28 -34L0 -46L26 -34M-26 49L0 59L26 49', P.brass, 2);
  for (const [x, y] of [
    [-25, -25],
    [0, -29],
    [25, -25],
    [-27, 45],
    [0, 55],
    [27, 45],
  ])
    rivet(x, y, 2);
}
function coffer() {
  // One parallel 2D construction grid. Every plank, band and rivet uses it.
  const pt = (u, d, h) => [-40 + 109 * u - 39 * d, 60 - 19 * u - 28 * d - h];
  const lid = (u, d) => pt(u, d, 62 + 27 * Math.sin(Math.PI * d));
  const face = (u0, u1, d, h0, h1, col) =>
    poly([pt(u0, d, h0), pt(u1, d, h0), pt(u1, d, h1), pt(u0, d, h1)], col);
  const curve = (u, d0 = 0, d1 = 1) =>
    Array.from({ length: 21 }, (_, i) => lid(u, d0 + ((d1 - d0) * i) / 20));
  // Front / left end share the same corner and horizontal plank levels.
  poly([pt(0, 0, 0), pt(0, 1, 0), pt(0, 1, 62), pt(0, 0, 62)], '#574532');
  face(0, 1, 0, 0, 62, '#957044');
  for (let row = 0; row < 4; row++) {
    const low = 3 + row * 14,
      high = low + 13;
    face(0.035, 0.965, 0, low, high, ['#8d663e', '#9d7546', '#936b40', '#a67e4d'][row]);
    line(
      'M' + [pt(0.04, 0, high), pt(0.96, 0, high)].map((p) => p.join(' ')).join('L'),
      '#c49a60',
      0.8,
    );
    poly(
      [pt(0, 0.04, low), pt(0, 0.96, low), pt(0, 0.96, high), pt(0, 0.04, high)],
      row % 2 ? '#614d35' : '#594730',
    );
  }
  // Left end cap sits under the curved roof. Roof slats follow its cross-section.
  poly([...curve(0), pt(0, 1, 62), pt(0, 0, 62)], '#78613e');
  for (let k = 7; k >= 0; k--) {
    const d0 = k / 8,
      d1 = (k + 1) / 8;
    poly(
      [
        lid(0, d0),
        lid(1, d0),
        ...curve(1, d0, d1).slice(1),
        lid(0, d1),
        ...curve(0, d1, d0).slice(1),
      ],
      ['#9f7745', '#b08751', '#be995f', '#c3a36a', '#b3945c', '#9e814f', '#896e43', '#6b5639'][k],
    );
    line('M' + [lid(0, d0), lid(1, d0)].map((p) => p.join(' ')).join('L'), '#59462e', 0.8);
    if (detail) {
      const p = lid(0.29, d0 + 0.038),
        p2 = lid(0.7, d0 + 0.025);
      line(`M${p}Q${(p[0] + p2[0]) / 2} ${p[1] - 3} ${p2}`, '#d4b277', 0.55);
    }
  }
  // Two continuous iron hoops traverse the roof and descend the front.
  for (const u of [0.13, 0.8]) {
    poly([...curve(u, 0, 0.6344), ...curve(u + 0.085, 0, 0.6344).reverse()], P.dark);
    line(
      'M' +
        curve(u + 0.015, 0, 0.6344)
          .map((p) => p.join(' '))
          .join('L'),
      P.steel,
      1.3,
    );
    face(u, u + 0.085, 0, 1, 62, P.dark);
    line(
      'M' + [pt(u + 0.016, 0, 3), pt(u + 0.016, 0, 60)].map((p) => p.join(' ')).join('L'),
      P.steel,
      1.2,
    );
    for (const h of [7, 29, 53]) rivet(...pt(u + 0.046, 0, h), 1.45);
    for (const d of [0.18, 0.58]) rivet(...lid(u + 0.043, d), 1.3);
  }
  // End straps, seam, base rail and latch all follow their actual supporting plane.
  poly([pt(0, 0, 3), pt(0, 1, 3), pt(0, 1, 10), pt(0, 0, 10)], P.dark);
  face(0, 1, 0, 0, 7, P.dark);
  line(
    'M' + [pt(0, 1, 62), pt(0, 0, 62), pt(1, 0, 62)].map((p) => p.join(' ')).join('L'),
    '#e0bd7e',
    1.5,
  );
  line('M' + [pt(0, 0, 59), pt(1, 0, 59)].map((p) => p.join(' ')).join('L'), P.black, 2.3);
  face(0.42, 0.57, 0, 34, 57, P.brass);
  face(0.45, 0.54, 0, 38, 53, '#d6b77c');
  const key = pt(0.495, 0, 45);
  ellipse(...key, 2.5, 3, P.black);
  line(`M${key}l0 5`, P.black, 2);
  face(0.475, 0.52, 0, 55, 68, P.dark);
  rivet(...pt(0.497, 0, 63), 1.3);
  const handle = pt(0, 0.48, 37);
  local(...handle, -0.2, 1, () => {
    path('M-8 -2L7 -9L9 -5L-6 3Z', P.steel);
    line('M-7 2Q-12 18 0 17Q12 14 8 -6', P.black, 4);
    line('M-6 4Q-8 14 0 14Q8 11 7 -3', P.steel, 1.5);
  });
}
function potion() {
  path(
    'M-12 -59L12 -59L12 -31Q43 -14 36 24Q31 53 0 57Q-31 53 -36 24Q-43 -14 -12 -31Z',
    grad(-35, -20, 34, 25, ['#b4c9b1', '#688e7e', '#304d49']),
  );
  path(
    'M-29 2Q0 12 29 2Q37 41 0 48Q-35 43 -29 2Z',
    grad(-24, 0, 24, 48, ['#a6c479', '#578964', '#305b49']),
  );
  ellipse(0, 3, 29, 7, '#b4d592');
  path('M-12 -70L12 -70L10 -53L-10 -53Z', P.leather);
  line('M-10 -66L9 -66', P.brass, 2);
  path('M-15 -52L15 -52L15 -42L-15 -42Z', P.brass);
  path('M-13 -20Q1 -27 16 -19L17 18L-11 23Z', '#d8cd9f');
  oak(2, 0, 0.5);
  line('M-18 -26Q-30 -16 -30 -3M-29 15Q-24 36 -13 40', '#ecedc7', 3);
  ellipse(-22, -9, 2, 3, P.glint);
  line('M14 -44Q35 -38 30 -18L21 -9', P.leather, 2);
}
const kind = parameters.kind ?? 'knight';
if (kind === 'knight') knight();
else if (kind === 'sword') local(126, 243, 0.26, 1.6, sword);
else if (kind === 'shield') local(128, 160, 0, 2.05, shield);
else if (kind === 'axe') local(140, 163, 0.28, 1.15, axe);
else if (kind === 'lantern') local(128, 162, 0, 1.5, lantern);
else if (kind === 'coffer') local(128, 164, 0, 1.35, coffer);
else if (kind === 'potion') local(128, 171, -0.08, 1.5, potion);
else throw new Error('Unknown asset kind: ' + kind);
if (stage === 'silhouette' || stage === 'values') {
  const p = art.pixels(canvas);
  for (let i = 0; i < p.data.length; i += 4) {
    const v =
      stage === 'silhouette'
        ? 29
        : 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
    p.data[i] = p.data[i + 1] = p.data[i + 2] = v;
  }
  art.put(canvas, p);
}
return canvas;
