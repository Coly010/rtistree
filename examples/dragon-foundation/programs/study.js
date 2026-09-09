// 2D construction/value study. The joints and dependent finger tips are editable data.
// No raster inputs, landscape, colour or material texture.
const c = art.canvas(),
  x = c.getContext('2d');
x.scale(art.width / 1600, art.height / 1000);
x.fillStyle = '#ededed';
x.fillRect(0, 0, 1600, 1000);
const mode = parameters.mode ?? 'value',
  pose = parameters.pose ?? 'bank',
  revision = parameters.revision ?? 0;
const base = {
  hip: [664, 621],
  shoulder: [806, 495],
  neck: [932, 418],
  head: [1045, 451],
  tail1: [504, 727],
  tail2: [340, 782],
  tail3: [293, 887],
  tail4: [423, 851],
  nearElbow: [670, 358],
  nearWrist: [490, 326],
  nearTip: [175, 125],
  near2: [143, 387],
  near3: [298, 591],
  near4: [512, 681],
  farShoulder: [825, 452],
  farElbow: [1000, 303],
  farWrist: [1161, 214],
  farTip: [1454, 129],
  far2: [1420, 326],
  far3: [1255, 425],
  nearKnee: [737, 686],
  nearAnkle: [673, 765],
  nearFoot: [612, 783],
  farKnee: [744, 611],
  farAnkle: [774, 687],
  farFoot: [710, 724],
  armElbow: [833, 595],
  armWrist: [923, 600],
  armFoot: [951, 631],
};
const poses = {
  bank: {},
  climb: {
    shoulder: [803, 467],
    neck: [873, 366],
    head: [945, 350],
    nearElbow: [655, 415],
    nearWrist: [573, 222],
    nearTip: [267, 93],
    near2: [289, 290],
    near3: [411, 477],
    near4: [575, 654],
    farElbow: [935, 403],
    farWrist: [1112, 285],
    farTip: [1319, 159],
    far2: [1326, 403],
    far3: [1139, 482],
    tail1: [564, 769],
    tail2: [638, 880],
    tail3: [507, 895],
    tail4: [494, 798],
  },
  glide: {
    shoulder: [822, 487],
    neck: [951, 434],
    head: [1072, 426],
    nearElbow: [606, 385],
    nearWrist: [395, 415],
    nearTip: [95, 294],
    near2: [136, 512],
    near3: [304, 638],
    near4: [502, 703],
    farElbow: [1015, 321],
    farWrist: [1245, 251],
    farTip: [1521, 272],
    far2: [1398, 414],
    far3: [1180, 477],
    tail1: [495, 657],
    tail2: [335, 710],
    tail3: [215, 663],
    tail4: [274, 613],
  },
};
const points = { ...base, ...poses[pose], ...(parameters.points ?? {}) };
// A revision widens the wrist/body gap and brings the near shoulder underneath the arm.
if (revision) {
  points.neck = [902, 348];
  points.head = [1002, 325];
  points.nearElbow = [625, 386];
  points.nearWrist = [555, 223];
  points.farElbow = [946, 426];
  points.farWrist = [1180, 345];
  points.farTip = [1450, 200];
  points.far2 = [1433, 443];
  points.far3 = [1202, 525];
  points.tail1 = [558, 755];
  points.tail2 = [547, 858];
  points.tail3 = [417, 851];
  points.tail4 = [380, 797];
  points.nearAnkle = [704, 767];
  points.nearFoot = [660, 804];
  points.armElbow = [864, 556];
  points.armWrist = [937, 533];
  points.armFoot = [966, 557];
}
// Shared handles are defined as offsets from landmarks; moving a landmark changes dependent paths.
const definitions = {
  ...points,
  wingRoot: { anchor: 'shoulder', offset: [-65, 18] },
  farWingRoot: { anchor: 'shoulder', offset: [-32, -32] },
  nearElbowTop: { anchor: 'nearElbow', offset: [-5, -17] },
  nearElbowBottom: { anchor: 'nearElbow', offset: [20, 31] },
  nearWristTop: { anchor: 'nearWrist', offset: [-3, -9] },
  neckTop: { anchor: 'neck', offset: [0, -31] },
  neckBottom: { anchor: 'neck', offset: [5, 28] },
  hipBottom: { anchor: 'hip', offset: [10, 43] },
  shoulderTop: { anchor: 'shoulder', offset: [-7, -48] },
};
const guides = art.guides({
  points: definitions,
  paths: {
    nearArm: [
      { op: 'M', to: 'shoulder' },
      { op: 'Q', control: { anchor: 'nearElbow', offset: [20, 35] }, to: 'nearElbow' },
      { op: 'Q', control: { anchor: 'nearWrist', offset: [85, -10] }, to: 'nearWrist' },
    ],
    spine: [
      { op: 'M', to: 'tail4' },
      { op: 'C', control1: 'tail3', control2: 'tail2', to: 'tail1' },
      { op: 'Q', control: 'hip', to: 'shoulder' },
      { op: 'Q', control: 'neckTop', to: 'head' },
    ],
  },
});
const P = (n) => guides.points[n],
  fmt = (p) => p.join(' '),
  add = (p, a, b) => [p[0] + a, p[1] + b],
  blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function path(d, fill, stroke, width = 1) {
  const p = art.path(d);
  if (fill) {
    x.fillStyle = mode === 'silhouette' ? '#282828' : fill;
    x.fill(p);
  }
  if (stroke && mode !== 'silhouette') {
    x.strokeStyle = stroke;
    x.lineWidth = width;
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.stroke(p);
  }
  return p;
}
function grad(a, b, colours) {
  const g = x.createLinearGradient(...a, ...b);
  colours.forEach((col, i) => g.addColorStop(i / (colours.length - 1), col));
  return g;
}
function line(d, col, w = 1, alpha = 1) {
  if (mode === 'silhouette') return;
  x.save();
  x.globalAlpha = alpha;
  path(d, null, col, w);
  x.restore();
}
// Catmull construction tube. Tangent-normal offsets make a tapering, continuous organic mass.
function samples(p, w) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)],
      b = p[i],
      d = p[i + 1],
      e = p[Math.min(p.length - 1, i + 2)];
    for (let j = 0; j < 24; j++) {
      const t = j / 24;
      out.push({
        p: [0, 1].map(
          (k) =>
            0.5 *
            (2 * b[k] +
              (-a[k] + d[k]) * t +
              (2 * a[k] - 5 * b[k] + 4 * d[k] - e[k]) * t * t +
              (-a[k] + 3 * b[k] - 3 * d[k] + e[k]) * t * t * t),
        ),
        w: w[i] + (w[i + 1] - w[i]) * t,
      });
    }
  }
  out.push({ p: p.at(-1), w: w.at(-1) });
  return out;
}
function tube(p, w, fill) {
  const s = samples(p, w);
  if (revision && mode !== 'silhouette') {
    // Paint a smooth grayscale falloff inside a 2D tapered contour. No scene, camera or mesh.
    const left = Math.floor(Math.min(...s.map((v) => v.p[0] - v.w)) - 2),
      top = Math.floor(Math.min(...s.map((v) => v.p[1] - v.w)) - 2),
      right = Math.ceil(Math.max(...s.map((v) => v.p[0] + v.w)) + 2),
      bottom = Math.ceil(Math.max(...s.map((v) => v.p[1] + v.w)) + 2);
    const bins = new Map(),
      cell = 20;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i],
        b = s[i + 1],
        radius = Math.max(a.w, b.w) + 2;
      for (
        let yy = Math.floor((Math.min(a.p[1], b.p[1]) - radius - top) / cell);
        yy <= Math.floor((Math.max(a.p[1], b.p[1]) + radius - top) / cell);
        yy++
      )
        for (
          let xx = Math.floor((Math.min(a.p[0], b.p[0]) - radius - left) / cell);
          xx <= Math.floor((Math.max(a.p[0], b.p[0]) + radius - left) / cell);
          xx++
        ) {
          const key = xx + ',' + yy;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(i);
        }
    }
    const paint = art.raster(
      (xx, yy) => {
        const entries = bins.get(Math.floor(xx / cell) + ',' + Math.floor(yy / cell));
        if (!entries) return [0, 0, 0, 0];
        const px = xx + left,
          py = yy + top;
        let best = 100,
          nx = 0,
          ny = 0,
          radius = 1,
          bestDistance = Infinity;
        for (const i of entries) {
          const a = s[i],
            b = s[i + 1],
            dx = b.p[0] - a.p[0],
            dy = b.p[1] - a.p[1],
            len = dx * dx + dy * dy,
            t = art.clamp(((px - a.p[0]) * dx + (py - a.p[1]) * dy) / (len || 1)),
            cx = a.p[0] + dx * t,
            cy = a.p[1] + dy * t,
            rr = a.w + (b.w - a.w) * t;
          if (rr < 0.01) continue;
          const distance = Math.hypot(px - cx, py - cy),
            d = distance / rr;
          if (revision >= 2 ? distance < bestDistance : d < best) {
            bestDistance = distance;
            best = d;
            nx = (px - cx) / rr;
            ny = (py - cy) / rr;
            radius = rr;
          }
        }
        if (best > 1.02) return [0, 0, 0, 0];
        const curvature = Math.sqrt(Math.max(0, 1 - best * best)),
          light = art.clamp(-nx * 0.48 - ny * 0.65 + curvature * 0.58),
          v = 64 + light * 151;
        return [v, v, v, 255 * art.clamp((1 - best) * radius + 0.5)];
      },
      right - left,
      bottom - top,
    );
    x.drawImage(paint, left, top);
    return art.path('M' + s.map((v) => fmt(v.p)).join('L'));
  }
  const l = [],
    r = [];
  s.forEach((v, i) => {
    const a = s[Math.max(0, i - 1)].p,
      b = s[Math.min(s.length - 1, i + 1)].p,
      len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    l.push(add(v.p, n[0] * v.w, n[1] * v.w));
    r.push(add(v.p, -n[0] * v.w, -n[1] * v.w));
  });
  return path('M' + l.map(fmt).join('L') + 'L' + r.reverse().map(fmt).join('L') + 'Z', fill);
}
function wing(side) {
  const near = side === 'near',
    a = P(revision >= 2 ? (near ? 'wingRoot' : 'farWingRoot') : near ? 'shoulder' : 'farShoulder'),
    e = P(side + 'Elbow'),
    w = P(side + 'Wrist'),
    t = P(side + 'Tip'),
    f2 = P(side + '2'),
    f3 = P(side + '3'),
    f4 = near ? P('near4') : add(P('hip'), 88, -58),
    hip = near ? P('hip') : add(P('hip'), 43, -28);
  // Scallops are tension curves between the finger ends, with distinct arm and hand sections.
  const between = (a, b, amount) => blend(blend(a, b, 0.5), w, amount);
  const d = `M${fmt(a)} Q${fmt(add(e, 25, 5))} ${fmt(e)} Q${fmt(add(w, 80, -16))} ${fmt(w)} Q${fmt(blend(w, t, 0.55))} ${fmt(t)} Q${fmt(between(t, f2, 0.2))} ${fmt(f2)} Q${fmt(between(f2, f3, 0.25))} ${fmt(f3)} Q${fmt(between(f3, f4, 0.2))} ${fmt(f4)} Q${fmt(blend(f4, hip, 0.5))} ${fmt(hip)} Q${fmt(blend(a, hip, 0.5))} ${fmt(a)}Z`;
  const membrane = path(
    d,
    grad(
      add(w, 0, -80),
      add(hip, 0, 50),
      near ? ['#939393', '#bcbcbc', '#626262'] : ['#b7b7b7', '#cccccc', '#8f8f8f'],
    ),
  );
  if (mode === 'silhouette') return;
  x.save();
  x.clip(membrane);
  // Value fans and folds lie between anchored fingers. These describe membrane camber, not decoration.
  const tips = [t, f2, f3, f4, hip];
  for (let i = 0; i < tips.length - 1; i++) {
    const b = tips[i],
      d = tips[i + 1],
      middle = between(b, d, 0.2),
      control = blend(w, b, 0.55);
    path(
      `M${fmt(w)} Q${fmt(control)} ${fmt(b)} Q${fmt(middle)} ${fmt(d)} Q${fmt(blend(w, d, 0.45))} ${fmt(w)}Z`,
      grad(w, middle, near ? ['#787878', '#b6b6b6', '#999999'] : ['#b0b0b0', '#d8d8d8', '#aaaaaa']),
    );
    for (let j = 1; j < 9; j++) {
      const edge = blend(b, d, j / 9),
        end = blend(edge, w, 0.1 + 0.12 * Math.sin((j / 9) * Math.PI));
      line(
        `M${fmt(add(w, 0, 3))} Q${fmt(blend(blend(w, end, 0.56), middle, 0.05))} ${fmt(end)}`,
        near ? '#676767' : '#999999',
        0.65,
        0.2,
      );
    }
  }
  x.restore();
  tube(
    [a, e, w, t],
    near ? [25, 16, 7, 0] : [15, 10, 4, 0],
    grad(
      add(e, -50, -60),
      add(e, 50, 55),
      near ? ['#dedede', '#858585', '#444444'] : ['#c6c6c6', '#959595', '#777777'],
    ),
  );
  for (const [i, t] of [f2, f3, f4].entries()) {
    const mid = blend(w, t, 0.53);
    mid[0] += near ? 22 : -12;
    mid[1] -= 15;
    line(
      `M${fmt(w)} Q${fmt(mid)} ${fmt(t)}`,
      near ? '#535353' : '#8c8c8c',
      near ? 5 - i : 3 - i * 0.5,
      0.85,
    );
    line(
      `M${fmt(add(w, -1, -2))} Q${fmt(add(mid, -1, -2))} ${fmt(t)}`,
      near ? '#d1d1d1' : '#dedede',
      near ? 1.7 : 1,
      0.8,
    );
  }
  line(
    `M${fmt(a)} Q${fmt(add(e, 25, 5))} ${fmt(e)} Q${fmt(add(w, 80, -16))} ${fmt(w)} Q${fmt(blend(w, t, 0.55))} ${fmt(t)}`,
    near ? '#e0e0e0' : '#dedede',
    near ? 3 : 1.4,
    0.8,
  );
  // A small thumb at the wrist.
  path(
    `M${fmt(add(w, 9, 3))}Q${fmt(add(w, -8, -23))} ${fmt(add(w, 15, -39))}Q${fmt(add(w, 3, -19))} ${fmt(add(w, 22, 1))}Z`,
    near ? '#d5d5d5' : '#bbbbbb',
  );
}
wing('far');
// A broad pelvis and muscular taper into a long, weighted tail.
const hip = P('hip'),
  shoulder = P('shoulder'),
  neck = P('neck'),
  head = P('head');
tube(
  [hip, P('tail1'), P('tail2'), P('tail3'), P('tail4')],
  revision >= 2 ? [32, 20, 10, 4, 0] : [40, 22, 12, 5, 0],
  grad([460, 650], [570, 810], ['#929292', '#525252', '#373737']),
);
// The rear limb remains behind the torso, with lower contrast and partial occlusion.
tube(
  [add(hip, 22, -18), P('farKnee'), P('farAnkle'), P('farFoot')],
  revision >= 2 ? [29, 21, 8, 4] : [31, 19, 10, 4],
  grad([690, 585], [785, 719], ['#777777', '#484848']),
);
const trunk = tube(
  [hip, blend(hip, shoulder, 0.42), shoulder, neck, head],
  revision >= 2 ? [42, 74, 59, 28, 22] : [47, 66, 62, 31, 22],
  grad([790, 398], [887, 621], ['#d8d8d8', '#aaaaaa', '#656565', '#393939']),
);
if (mode !== 'silhouette' && !revision) {
  x.save();
  x.clip(trunk);
  // Ribcage, pectoral and belly are large value masses with lost edges.
  path(
    `M${fmt(add(hip, -15, -20))} Q${fmt(add(shoulder, -80, -53))} ${fmt(add(shoulder, 20, -26))} Q${fmt(add(shoulder, -14, 19))} ${fmt(add(hip, 17, 24))}Z`,
    grad(add(hip, 0, -50), add(shoulder, 15, 45), ['#a8a8a8', '#bbbbbb', '#858585']),
  );
  path(
    `M${fmt(add(hip, 0, 15))}Q${fmt(add(shoulder, -42, 45))} ${fmt(add(neck, 15, 4))}L${fmt(add(head, 0, 32))}Q${fmt(add(shoulder, -2, 60))} ${fmt(add(hip, 10, 49))}Z`,
    grad(add(shoulder, 0, 0), add(shoulder, 0, 70), ['#929292', '#535353', '#333333']),
  );
  for (let i = 0; i < 9; i++) {
    const t = 0.1 + i * 0.081,
      p = blend(hip, shoulder, t);
    line(`M${fmt(add(p, -12, 6))}q20 -24 46 -32`, '#656565', 1.7, 0.26);
  }
  x.restore();
}
// Thigh, hock and small tucked hind foot. Different angular rhythms from the forelimb.
tube(
  [add(hip, 14, 6), P('nearKnee'), P('nearAnkle'), P('nearFoot')],
  [32, 26, 10, 5],
  grad(add(hip, 15, 0), add(P('nearAnkle'), 20, 25), ['#b6b6b6', '#8a8a8a', '#484848']),
);
if (mode !== 'silhouette' && !revision)
  line(
    `M${fmt(add(hip, 30, 15))}Q${fmt(add(P('nearKnee'), 16, -20))} ${fmt(P('nearKnee'))}L${fmt(P('nearAnkle'))}`,
    '#cccccc',
    3,
    0.6,
  );
for (let i = 0; i < 3; i++) {
  const foot = add(P('nearFoot'), i * 6, -i * 2);
  tube([foot, add(foot, -24, 5 + i * 5), add(foot, -29, 14 + i * 5)], [4, 2, 0], '#515151');
}
wing('near');
// Lower forelimb folds under the chest, with a clear negative-space gap after revision.
tube(
  [add(shoulder, 20, 20), P('armElbow'), P('armWrist'), P('armFoot')],
  [23, 18, 9, 5],
  grad(add(shoulder, 0, 40), add(P('armElbow'), 35, 50), ['#c5c5c5', '#868686', '#4d4d4d']),
);
for (let i = 0; i < 3; i++) {
  const foot = add(P('armFoot'), 0, i * 5);
  tube([foot, add(foot, 18, 7 + i * 3), add(foot, 18, 19 + i * 3)], [3.5, 2, 0], '#575757');
}
// Bony skull and closed jaw are built around the head landmark, not an emoji-like open mouth.
x.save();
x.translate(head[0], head[1]);
x.rotate(pose === 'climb' ? -0.28 : 0.14);
path(
  'M-42 -12 Q-38 -41 -13 -43 L8 -31 Q23 -28 32 -14 L80 -5 Q91 4 90 15 L57 27 L36 29 Q11 46 -17 29 L-28 12Z',
  grad([-20, -35], [15, 40], ['#d4d4d4', '#9d9d9d', '#666666']),
);
path(
  'M-25 2 Q0 -3 15 13 L70 15 L86 8 L85 20 L55 28 L31 29 Q10 38 -14 27Z',
  grad([0, 5], [0, 34], ['#999999', '#555555']),
);
path(
  'M-29 -29 C-60 -59 -75 -68 -89 -64 C-65 -48 -64 -28 -37 -16Z',
  grad([-53, -57], [-42, -15], ['#d8d8d8', '#797979']),
);
path(
  'M-8 -36 C-18 -72 -31 -89 -52 -94 C-39 -75 -43 -53 -27 -29Z',
  grad([-33, -72], [-20, -30], ['#dfdfdf', '#929292']),
);
path('M-35 -13 Q-54 -22 -61 -15 L-43 0 L-23 5Z', '#8e8e8e');
if (mode !== 'silhouette') {
  path('M-4 -16 Q10 -23 26 -10 L13 -6 L-1 -8Z', '#4c4c4c');
  path('M3 -13 Q12 -17 19 -11 Q12 -7 3 -13Z', '#d6d6d6');
  line('M11 -15L12 -9', '#303030', 1.6);
  line('M-9 -19Q9 -28 30 -9', '#dedede', 3, 0.9);
  path('M66 0Q79 -3 80 3L73 7L66 4Z', '#4b4b4b');
  line('M20 19Q46 22 81 12', '#3c3c3c', 2, 0.8);
  line('M-15 28Q10 37 30 27', '#b8b8b8', 2, 0.8);
  path('M-18 -6Q-2 7 -7 21L-20 14Z', '#bababa');
  line('M35 -8L61 -4', '#c9c9c9', 2, 0.7);
}
x.restore();
// Sparse dorsal scutes describe the gesture, tapering into the tail.
const spine = samples(
  [P('tail1'), hip, add(shoulder, -12, -42), add(neck, -1, -30)],
  [2, 7, 13, 4],
);
for (let i = 3; i < spine.length; i += 5) {
  const v = spine[i],
    a = spine[i - 1].p,
    b = spine[i + 1]?.p ?? v.p,
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy),
    n = [dy / l, -dx / l];
  path(
    `M${fmt(v.p)}l${n[0] * v.w - 7} ${n[1] * v.w - 5}l${7 - n[0] * v.w + 7} ${5 - n[1] * v.w}Z`,
    '#6c6c6c',
  );
}
if (mode === 'construction') {
  // Inspectable 2D skeleton overlay. Excluded from the delivered value study.
  x.save();
  x.globalAlpha = 0.75;
  for (const chain of [
    ['hip', 'shoulder', 'neck', 'head'],
    [revision >= 2 ? 'wingRoot' : 'shoulder', 'nearElbow', 'nearWrist', 'nearTip'],
    [revision >= 2 ? 'farWingRoot' : 'farShoulder', 'farElbow', 'farWrist', 'farTip'],
    ['hip', 'nearKnee', 'nearAnkle', 'nearFoot'],
    ['shoulder', 'armElbow', 'armWrist', 'armFoot'],
  ]) {
    line('M' + chain.map((n) => fmt(P(n))).join('L'), '#222222', 2);
    for (const n of chain) {
      x.fillStyle = '#eeeeee';
      x.beginPath();
      x.arc(...P(n), 5, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#333333';
      x.stroke();
    }
  }
  for (const side of ['near', 'far'])
    for (const n of [side + '2', side + '3', ...(side === 'near' ? ['near4'] : [])])
      line(`M${fmt(P(side + 'Wrist'))}L${fmt(P(n))}`, '#555555', 1);
  x.restore();
}
return c;
