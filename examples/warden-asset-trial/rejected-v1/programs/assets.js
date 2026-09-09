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
  path(
    'M-21 -15Q-20 -34 0 -38Q19 -35 22 -18L20 7L9 21L-8 20L-22 6Z',
    grad(-21, -28, 23, 13, [P.light, P.steel, P.dark]),
  );
  path('M1 -36L7 -30L7 -10L2 -5L-3 -11L-3 -31Z', P.brass);
  path('M-21 -9L-2 -12L20 -8L22 1L3 4L-19 0Z', P.black);
  path('M-3 -11L4 -12L9 15L2 20L-3 14Z', P.steel);
  path('M-20 2L-6 7L-6 17L-16 13Z', P.light);
  path('M9 6L21 2L16 14L10 17Z', P.dark);
  if (detail) {
    line('M-18 -18Q-16 -30 -6 -32', P.glint, 1.5);
    line('M-19 -7L-5 -8M8 -8L18 -6', P.brass, 1);
    for (let i = 0; i < 3; i++) line(`M${-17 + i * 4} 5L${-17 + i * 4} 10`, P.dark, 0.9);
    rivet(-18, -13, 1.3);
    rivet(17, -12, 1.3);
  }
  // Small swept cloth crest, with a clear root at the crown.
  path('M-4 -37Q-22 -55 -36 -45Q-25 -43 -23 -29Q-17 -37 -4 -34Z', P.green);
  if (detail) line('M-7 -36Q-23 -46 -30 -44', P.moss, 1.2);
}
function knight() {
  const pose = parameters.pose ?? 'watch',
    phase = Number(parameters.phase ?? 0);
  const walking = pose === 'walk',
    s = walking ? Math.sin(phase * Math.PI * 2) : pose === 'stride' ? 1 : 0;
  const improvedWalk = walking && parameters.revision >= 2;
  const swing = improvedWalk ? Math.cos(phase * Math.PI * 2) : 0;
  const leftLift = improvedWalk ? Math.max(0, swing) * 14 : Math.max(0, -s) * 10;
  const rightLift = improvedWalk ? Math.max(0, -swing) * 14 : Math.max(0, s) * 10;
  const strideWidth = improvedWalk ? 16 : 24;
  const guard = pose === 'guard',
    bob = walking ? -Math.abs(Math.sin(phase * Math.PI * 2)) * 3 : guard ? 5 : 0;
  // Named rig landmarks; independent knees articulate the split stride.
  const g = art.guides({
    points: {
      pelvis: [126, 181 + bob],
      neck: [128, 103 + bob],
      leftHip: [113, 185 + bob],
      leftKnee: [
        (guard && parameters.revision !== 0 ? 101 : 109) - 10 * s,
        226 + bob - leftLift * 0.4,
      ],
      leftAnkle: [
        (guard && parameters.revision !== 0 ? 93 : 104) - strideWidth * s,
        271 - leftLift,
      ],
      rightHip: [140, 185 + bob],
      rightKnee: [
        (guard && parameters.revision !== 0 ? 154 : 146) + 10 * s,
        227 + bob - rightLift * 0.4,
      ],
      rightAnkle: [
        (guard && parameters.revision !== 0 ? 160 : 147) + (strideWidth - 1) * s,
        271 - rightLift,
      ],
      nearShoulder: [99, 121 + bob],
      nearElbow: guard ? [88, 142 + bob] : [77, 155 + bob],
      nearWrist: guard ? [105, 154 + bob] : [81 + 5 * s, 183 + bob],
      farShoulder: [152, 122 + bob],
      farElbow: guard ? [163, 147 + bob] : [173, 146 + bob],
      farWrist: guard ? [178, 124 + bob] : [185 - 4 * s, 167 + bob],
    },
    paths: {},
  });
  const q = g.points;
  // Cloak hangs behind the rig, with asymmetry following travel.
  path(
    `M102 ${107 + bob}Q127 99 151 ${112 + bob}L${177 - 10 * s} 244Q154 241 143 249L131 238L112 249L105 237L${76 - 8 * s} 244Q92 170 102 ${107 + bob}Z`,
    grad(90, 110, 165, 245, [P.green, P.cloth, P.black]),
  );
  path(`M106 ${118 + bob}Q92 182 ${85 - 8 * s} 236L105 231L116 137Z`, P.green, null);
  if (detail) {
    line(`M104 139Q98 204 ${97 - 7 * s} 231`, P.moss, 1);
    line('M146 138Q156 186 159 230', '#527567', 1.1);
  }
  leg(q.rightHip, q.rightKnee, q.rightAnkle, true);
  leg(q.leftHip, q.leftKnee, q.leftAnkle, false);
  segment(q.farShoulder, q.farElbow, 10, 8, true);
  segment(q.farElbow, q.farWrist, 8, 5, true);
  local(...q.farWrist, guard ? 0.61 : 0.1 + s * 0.05, 1, sword);
  hand(q.farWrist);
  // Gambeson and split surcoat establish the pelvis behind overlapping tassets.
  path(
    `M104 ${151 + bob}L149 ${151 + bob}L156 ${211 + bob}L133 ${221 + bob}L125 ${193 + bob}L118 ${224 + bob}L96 ${212 + bob}Z`,
    P.cloth,
  );
  path(`M103 ${173 + bob}L123 ${178 + bob}L116 ${214 + bob}L101 ${208 + bob}Z`, P.green, null);
  if (detail)
    line(
      `M104 ${188 + bob}L100 ${209 + bob}L115 ${218 + bob}M136 ${193 + bob}L141 ${212 + bob}`,
      P.brass,
      1.2,
    );
  // Breastplate: a broad lit left plane and narrower receding right plane.
  local(126, 139 + bob, guard ? 0.07 : 0, 1, () => {
    path(
      'M-21 -30L19 -27L29 -9L21 20Q0 33 -23 20L-29 -9Z',
      grad(-25, -25, 23, 26, [P.light, P.steel, P.dark]),
    );
    path('M2 -22L20 -23L25 -8L18 17L0 25Z', P.steel, null);
    line('M1 -23L-1 23', P.light, 1.3);
    path('M-22 13Q0 23 22 13L21 21Q0 32 -22 22Z', P.dark);
    if (detail) {
      line('M-21 -18L-24 -7L-19 8', P.glint, 1.2);
      local(-6, -5, 0, 0.42, () => oak(0, 0));
      rivet(-18, -24);
      rivet(17, -21);
      line('M9 3l5 -8M-15 7l4 -4', P.light, 0.8);
    }
  });
  local(126, 178 + bob, 0, 1, () => {
    path('M-25 -8Q0 -1 26 -8L25 1Q0 9 -26 0Z', P.leather);
    path('M-4 -4L6 -4L6 5L-4 5Z', P.brass);
    path('M-1 -1L3 -1L3 2L-1 2Z', P.dark, null);
    for (const [x, angle] of [
      [-16, 0.15],
      [15, -0.15],
    ])
      local(x, 12, angle, 1, () => {
        path('M-12 -8L12 -8L13 19L-11 17Z', P.steel);
        if (detail) {
          line('M-10 -3L10 -3M-10 4L11 4M-10 11L11 11', P.dark, 1);
          line('M-10 -6L-10 15', P.light, 1);
        }
      });
  });
  // Gorget, pauldrons and helmet share the upper torso's vertical displacement.
  path(
    `M113 ${101 + bob}L141 ${100 + bob}L151 ${111 + bob}Q130 ${126 + bob} 107 ${111 + bob}Z`,
    P.dark,
  );
  line(`M111 ${108 + bob}Q130 ${117 + bob} 147 ${108 + bob}`, P.light, 2);
  segment(q.nearShoulder, q.nearElbow, 11, 8);
  ellipse(...q.nearElbow, 9, 9, P.dark, P.ink);
  segment(q.nearElbow, q.nearWrist, 8, 5);
  for (const [p, far] of [
    [q.farShoulder, true],
    [q.nearShoulder, false],
  ])
    local(...p, far ? 0.24 : -0.28, 1, () => {
      path(
        'M-16 -9Q0 -22 16 -9L18 6L11 14L-16 9Z',
        far ? P.steel : grad(-15, -12, 17, 11, [P.light, P.steel, P.dark]),
      );
      path('M-17 3Q0 11 17 1L17 8Q0 18 -16 10Z', P.steel);
      if (detail) {
        line('M-13 -8Q0 -17 12 -7', P.gold, 1.6);
        rivet(-11, 0, 1.4);
        rivet(12, 0, 1.4);
      }
    });
  local(128, 86 + bob, guard ? 0.08 : 0, 1, helmet);
  hand(q.nearWrist);
  const shieldX = guard ? (parameters.revision === 0 ? 116 : 91) : 80 + 5 * s;
  local(shieldX, guard ? 161 + bob : 182 + bob, guard ? -0.16 : -0.12 + s * 0.035, 1, shield);
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
  path('M-66 -12L26 -25L67 -7L67 51L-27 68L-66 46Z', P.leather);
  path(
    'M-66 -12Q-62 -51 -38 -54L43 -64Q69 -56 67 -7L-27 12Z',
    grad(-10, -62, 10, 12, ['#ae8652', '#88643e', '#4d3c2c']),
  );
  path('M-27 12L67 -7L67 51L-27 68Z', '#684d34');
  path('M-66 -12L-27 12L-27 68L-66 46Z', '#453b2d');
  for (let i = 0; i < 4; i++) {
    const y = 20 + i * 11;
    line(`M-24 ${y}L64 ${y - 17}`, '#342e25', 1.2);
    line(`M-62 ${y - 23}L-31 ${y - 3}`, '#292d26', 1);
  }
  for (const x of [-46, 28]) {
    path(
      `M${x} -52L${x + 8} -53Q${x + 30} -45 ${x + 27} 2L${x + 27} 57L${x + 18} 59L${x + 18} 4Q${x + 21} -38 ${x} -52Z`,
      P.dark,
    );
    line(`M${x + 2} -51Q${x + 25} -37 ${x + 21} 2L${x + 21} 54`, P.steel, 1.6);
    rivet(x + 23, 18, 2);
    rivet(x + 23, 49, 2);
  }
  line('M-64 -13L-28 10L65 -9', P.brass, 2);
  path('M5 8L22 5L22 28L5 31Z', P.brass);
  ellipse(14, 17, 3, 3, P.dark);
  line('M14 18L14 23', P.dark, 3);
  line('M-57 -28Q-48 -48 -37 -46L37 -56', '#d1aa6c', 1.5);
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
