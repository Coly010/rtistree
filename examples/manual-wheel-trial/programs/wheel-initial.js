// A hand-authored 2D digital painting. All image pixels originate here, without image inputs.
// Coordinates describe a curved wheel in a close-up camera crop; dimensions are design pixels.
const { width: W, height: H } = art;
const S = W / 1200,
  CX = 2780,
  CY = 1650,
  E = 1.07;
const pass = parameters.pass;
const detail = parameters.detail ?? 0;
const C = art.canvas(),
  ctx = C.getContext('2d');
ctx.scale(S, S);
const clamp = art.clamp;
const gauss = (v, centre, spread) => Math.exp(-(((v - centre) / spread) ** 2));
const wheel = (x, y) => {
  const dx = x - CX,
    dy = (y - CY) / E;
  return { d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
};
const point = (r, a) => [CX + r * Math.cos(a), CY + E * r * Math.sin(a)];
const colour = (r, g, b, a = 1) =>
  `rgba(${Math.round(clamp(r, 0, 255))},${Math.round(clamp(g, 0, 255))},${Math.round(clamp(b, 0, 255))},${clamp(a)})`;
const line = (a, b, stroke, w) => {
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w;
  ctx.stroke();
};
const ellipseStroke = (radius, from, to, stroke, w) => {
  ctx.beginPath();
  ctx.ellipse(CX, CY, radius, radius * E, 0, from, to);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w;
  ctx.stroke();
};
if (pass === 'background') {
  return art.raster((xx, yy) => {
    const x = xx / S,
      y = yy / S;
    const light = 22 * gauss(x, -100, 1500) * gauss(y, 200, 1400);
    const v =
      light -
      (13 * y) / 1600 +
      3 * art.fbm(x / 210, y / 210, 4) +
      0.7 * art.noise(x * 0.8, y * 0.8);
    return [171 + v, 159 + v, 137 + v, 255];
  });
}
if (pass === 'spokes') {
  for (const [a, offset] of [
    [-2.54, -110],
    [-2.86, 155],
    [-3.13, -160],
  ]) {
    const start = point(2455, a),
      end = [CX, CY + offset];
    ctx.save();
    ctx.shadowColor = '#17171460';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 7;
    line(start, end, '#101719', 9);
    ctx.restore();
    line([start[0], start[1] - 1.4], [end[0], end[1] - 1.4], '#78838a', 1.6);
    line([start[0], start[1] + 1.2], [end[0], end[1] + 1.2], '#22292b', 4.5);
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    ctx.save();
    ctx.translate(...start);
    ctx.rotate(angle);
    const metal = ctx.createLinearGradient(0, -8, 0, 8);
    metal.addColorStop(0, '#152028');
    metal.addColorStop(0.3, '#a8afb0');
    metal.addColorStop(0.5, '#4c575a');
    metal.addColorStop(1, '#0c1419');
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.roundRect(-7, -8, 43, 16, 3);
    ctx.fill();
    ctx.strokeStyle = '#141c20';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(22, -7, 5, 14);
    ctx.restore();
  }
  return C;
}
if (pass === 'tyre') {
  return art.raster((xx, yy) => {
    const x = xx / S,
      y = yy / S,
      { d, a } = wheel(x, y);
    if (d < 2518 || d > 2700) return [0, 0, 0, 0];
    const edge = clamp((d - 2518) * 1.5) * clamp((2700 - d) * 1.5);
    const q = (d - 2518) / 182;
    const round = 12 * Math.sin(q * Math.PI) + 10 * gauss(d, 2650, 35) - 7 * gauss(d, 2530, 16);
    const rubber = (art.fbm(x / 35, y / 35, 4) - 0.5) * 5 + (art.noise(x * 1.9, y * 1.9) - 0.5) * 3;
    let v = round + rubber + 5 * gauss(y, 200, 950);
    if (d < 2540) v += 3.5 * Math.sin(a * 1900) * Math.sin(d * 1.25);
    if (detail) {
      const dust = art.fbm(x / 5, y / 5, 3, 83),
        cracks = Math.abs(art.noise(a * 13000, d * 0.29, 8) - 0.48);
      v += clamp((dust - 0.53) * 35, 0, 8) - clamp((0.018 - cracks) * 200, 0, 3);
    }
    return [24 + v, 30 + v, 34 + v, edge * 255];
  });
}
if (pass === 'tread') {
  ctx.save();
  ctx.translate(CX, CY);
  ctx.scale(1, E);
  for (let a = -3.22; a < -2.36; a += 0.026) {
    ctx.save();
    ctx.translate(2684 * Math.cos(a), 2684 * Math.sin(a));
    ctx.rotate(a);
    ctx.shadowColor = '#02080bb0';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = -3;
    ctx.beginPath();
    ctx.roundRect(-10, -21, 61, 42, 5);
    ctx.fillStyle = '#132027';
    ctx.fill();
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(-5, -21, 44, 21);
    g.addColorStop(0, '#35444b');
    g.addColorStop(0.3, '#45545c');
    g.addColorStop(0.8, '#28383f');
    g.addColorStop(1, '#19282f');
    ctx.beginPath();
    ctx.roundRect(-8, -20, 53, 37, 4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#63727880';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(35, -5);
    ctx.lineTo(39, 4);
    ctx.strokeStyle = '#15252d';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (detail) {
      for (let k = 0; k < 45; k++) {
        ctx.fillStyle = colour(123, 127, 121, art.random() * 0.15);
        ctx.fillRect(-5 + art.random() * 46, -17 + art.random() * 30, art.random() * 1.4, 0.8);
      }
    }
    ctx.restore();
  }
  ctx.restore();
  return C;
}
if (pass === 'rim') {
  return art.raster((xx, yy) => {
    const x = xx / S,
      y = yy / S,
      { d, a } = wheel(x, y);
    if (d < 2448 || d > 2520) return [0, 0, 0, 0];
    const alpha = clamp(d - 2448) * clamp(2520 - d) * 255;
    const grain = (art.noise(a * 18000, d * 0.22) - 0.5) * 3;
    let v;
    if (d < 2460) v = 32 + gauss(d, 2453, 3) * 28 + grain;
    else if (d < 2508)
      v = 153 + gauss(d, 2489, 17) * 52 + gauss(d, 2464, 2) * 34 - 6 * Math.sin(d * 5.3) + grain;
    else v = 28 + gauss(d, 2513, 2) * 18 + grain;
    v += 12 * gauss(y, 250, 700);
    if (detail && d >= 2460 && d < 2508)
      v +=
        7 * gauss(d, 2503, 1) - 3 * gauss(d, 2472, 0.6) + 2 * (art.noise(x * 1.6, y * 1.6) - 0.5);
    return [v + (5 * y) / 1600, v + 2, v + 5 * (1 - y / 1600), alpha];
  });
}
if (pass === 'lettering') {
  function lettering(text, radius, angle, size) {
    ctx.font = `${size}px "Rtistree-inter-bold"`;
    let a = angle;
    for (const char of text) {
      const advance = ctx.measureText(char).width + 2.5;
      const p = point(radius, a);
      ctx.save();
      ctx.translate(...p);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#0b151955';
      ctx.fillText(char, 0, 1.3);
      ctx.fillStyle = '#85929436';
      ctx.fillText(char, 0, -0.6);
      ctx.fillStyle = '#243037';
      ctx.fillText(char, 0, 0);
      ctx.restore();
      a += advance / radius;
    }
  }
  lettering('ROAM  /  ALL TERRAIN', 2598, -3.02, 30);
  lettering('700 × 38C  •  40–65 PSI', 2586, -2.78, 16);
  if (detail) lettering('ROTATION  →', 2650, -2.88, 10);
  return C;
}
if (pass === 'wear') {
  if (!detail) return C;
  // Small, pressure-varied brush marks: dust, abrasions and isolated moulding hairs.
  for (let k = 0; k < 650; k++) {
    const a = -3.2 + art.random() * 0.83,
      r = 2545 + art.random() * 115,
      p = point(r, a),
      length = 2 + art.random() * 12;
    if (p[0] < -10 || p[0] > 1200 || p[1] < -10 || p[1] > 1600) continue;
    art.brush(
      C,
      [
        { x: p[0] * S, y: p[1] * S, pressure: 0.2 },
        { x: (p[0] + length * 0.5) * S, y: (p[1] - length) * S, pressure: 0.6 },
        { x: (p[0] + length) * S, y: (p[1] - length * 1.6) * S, pressure: 0 },
      ],
      {
        radius: (0.4 + art.random() * 1.8) * S,
        colour: '#a6a297',
        hardness: 0.5,
        opacity: 0.04 + art.random() * 0.09,
        spacing: 0.5,
      },
    );
  }
  // Scuffs near the shoulder have coherent direction, unlike generic white-noise grain.
  for (let k = 0; k < 28; k++) {
    const a = -3.0 + art.random() * 0.55,
      r = 2628 + art.random() * 38;
    ellipseStroke(r, a, a + 0.003 + art.random() * 0.005, '#a8aaa51a', 0.5 + art.random());
  }
  return C;
}
if (pass === 'valve') {
  const p = point(2448, -2.7),
    angle = -2.7 + Math.PI;
  ctx.save();
  ctx.translate(...p);
  ctx.rotate(angle);
  ctx.shadowColor = '#17202388';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#111b21';
  ctx.beginPath();
  ctx.ellipse(2, 0, 7, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, -6, 0, 6);
  g.addColorStop(0, '#424a49');
  g.addColorStop(0.35, '#bbbaa0');
  g.addColorStop(0.5, '#7e867a');
  g.addColorStop(1, '#303d3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, -6, 70, 12);
  for (let x = 8; x < 57; x += 3) {
    ctx.fillStyle = '#1e2e333f';
    ctx.fillRect(x, -6, 0.8, 12);
  }
  const cap = ctx.createLinearGradient(0, -8, 0, 8);
  cap.addColorStop(0, '#465357');
  cap.addColorStop(0.3, '#29373d');
  cap.addColorStop(1, '#0e181f');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.roundRect(54, -8, 27, 16, 3);
  ctx.fill();
  ctx.strokeStyle = '#101d24';
  ctx.lineWidth = 1;
  for (let y = -5; y <= 5; y += 2) {
    ctx.beginPath();
    ctx.moveTo(58, y);
    ctx.lineTo(78, y);
    ctx.stroke();
  }
  ctx.restore();
  return C;
}
throw new Error('Unknown painting pass');
