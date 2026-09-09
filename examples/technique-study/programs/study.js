const c = art.canvas(),
  ctx = c.getContext('2d');
ctx.fillStyle = '#e4dfd0';
ctx.fillRect(0, 0, 1000, 720);
ctx.fillStyle = '#243d3e';
ctx.font = '32px Rtistree-display';
ctx.fillText('The 2D painting bench', 36, 50);
ctx.font = '15px Rtistree-inter';
ctx.fillText('Seeded marks · pressure · clipping · dry paint · palette and atmosphere', 36, 79);
for (const [i, preset] of ['oil', 'filbert', 'scumble', 'ink'].entries()) {
  const x = 36 + (i % 2) * 486,
    y = 108 + Math.floor(i / 2) * 190;
  ctx.fillStyle = '#304247';
  ctx.fillRect(x, y, 456, 160);
  art.techniques.stroke(
    c,
    [
      { x: x + 30, y: y + 120, pressure: 0.2 },
      { x: x + 138, y: y + 55, pressure: 1 },
      { x: x + 280, y: y + 110, pressure: 0.7 },
      { x: x + 410, y: y + 50, pressure: 0.05 },
    ],
    { preset, smoothing: 1, size: 42, colour: '#d0b774' },
  );
  art.techniques.stroke(
    c,
    [
      { x: x + 55, y: y + 133, pressure: 0.2 },
      { x: x + 180, y: y + 88, pressure: 0.8 },
      { x: x + 380, y: y + 130, pressure: 0.1 },
    ],
    { preset, smoothing: 1, size: 19, colour: '#a7c1ab', opacity: 0.45 },
  );
  ctx.fillStyle = '#e7e3d7';
  ctx.font = '16px Rtistree-inter';
  ctx.fillText(preset, x + 15, y + 25);
}
ctx.fillStyle = '#243d3e';
ctx.font = '18px Rtistree-inter';
ctx.fillText('Atmospheric colour: the same earth colour recedes into haze', 36, 530);
for (let i = 0; i < 10; i++) {
  ctx.fillStyle = art.techniques.atmosphere('#31493e', '#d3d1ae', i / 9);
  ctx.fillRect(36 + i * 94, 550, 88, 64);
}
ctx.fillStyle = '#243d3e';
ctx.font = '15px Rtistree-inter';
ctx.fillText(
  'Use large masses first. Follow the form. Reserve small sharp marks for the focal point.',
  36,
  654,
);
ctx.fillText(
  'Native Canvas paths, masks and pixel buffers remain available at every stage.',
  36,
  680,
);
return c;
