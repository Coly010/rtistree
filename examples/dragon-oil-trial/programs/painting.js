// Entirely hand-authored 2D paths and seeded brushwork. No source images.
const c = art.canvas(),
  ctx = c.getContext('2d');
ctx.scale(art.width / 1500, art.height / 1000);
const R = art.random,
  mix = art.techniques.mix,
  detail = parameters.detail ?? 1,
  variant = parameters.variant ?? 0;
function path(d, colour, stroke, width = 1) {
  const p = art.path(d);
  if (colour) {
    ctx.fillStyle = colour;
    ctx.fill(p);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke(p);
  }
  return p;
}
function mark(x, y, dx, dy, size, col, alpha = 0.6, preset = 'oil') {
  art.techniques.stroke(
    c,
    [
      { x, y, pressure: 0.8 },
      { x: x + dx * 0.45, y: y + dy * 0.35, pressure: 1 },
      { x: x + dx, y: y + dy, pressure: 0.35 },
    ],
    {
      size,
      colour: col,
      opacity: alpha,
      preset,
      smoothing: detail > 1 ? 1 : 0,
      bristles: detail > 0.5 ? 9 : 4,
      dryness: detail > 0.5 ? 0.18 : 0.02,
    },
  );
}
function curve(d, col, width, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(d, null, col, width);
  ctx.restore();
}
function paintShape(d, base, colours, bounds, angle = 0, count = 400, size = 15) {
  const p = path(d, base);
  if (detail < 0.2) return p;
  if (detail > 0.45) {
    ctx.save();
    ctx.clip(p);
    const g = ctx.createLinearGradient(
      bounds[0],
      bounds[1],
      bounds[0] + bounds[2] * 0.2,
      bounds[1] + bounds[3],
    );
    g.addColorStop(0, mix(base, colours[colours.length - 1], 0.55));
    g.addColorStop(0.4, base);
    g.addColorStop(1, mix(base, colours[0], 0.65));
    ctx.fillStyle = g;
    ctx.fillRect(...bounds);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(p);
  const [x, y, w, h] = bounds;
  for (let i = 0; i < count * detail; i++) {
    const xx = x + R() * w,
      yy = y + R() * h,
      n = art.clamp(0.15 + art.fbm(xx / 150, yy / 120, 3) * 0.55 + (1 - (yy - y) / h) * 0.3),
      ramp = n * (colours.length - 1),
      index = Math.min(colours.length - 2, Math.floor(ramp)),
      shade = mix(colours[index], colours[index + 1], ramp - index);
    const a = angle + (R() - 0.5) * 0.8,
      len = size * (1 + R() * 2.5);
    mark(
      xx,
      yy,
      Math.cos(a) * len,
      Math.sin(a) * len,
      size * (0.35 + R()),
      shade,
      0.3 + R() * 0.45,
    );
  }
  ctx.restore();
  return p;
}
function dragonTransform() {
  const scale = variant === 1 ? 0.83 : variant === 2 ? 1.09 : 1;
  ctx.translate(
    variant === 1 ? 65 : variant === 2 ? -65 : 0,
    variant === 1 ? 65 : variant === 2 ? 15 : 0,
  );
  ctx.translate(700, 400);
  ctx.scale(scale, scale);
  ctx.translate(-700, -400);
}
if (parameters.pass === 'landscape') {
  const sky = ctx.createLinearGradient(0, 0, 250, 850);
  sky.addColorStop(0, '#263a47');
  sky.addColorStop(0.47, '#9caaa4');
  sky.addColorStop(0.76, '#d1c7a1');
  sky.addColorStop(1, '#617464');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1500, 1000);
  // Broad moving cloud masses, then broken lit edges. Strokes stay at the scale of forms.
  for (let i = 0; i < 1800 * Math.max(0.25, detail); i++) {
    const x = R() * 1600 - 50,
      y = R() * 690,
      n = art.fbm(x / 420, y / 160, 4),
      light = art.clamp(y / 900 + n * 0.55);
    const col = mix('#253b4a', '#d4d0b5', light);
    mark(x, y, 55 + R() * 130, -20 + R() * 28, 20 + R() * 50, col, 0.18 + R() * 0.32, 'filbert');
  }
  for (let i = 0; i < 150 * detail; i++) {
    const x = R() * 800,
      y = 130 + R() * 270;
    mark(x, y, 65 + R() * 110, -20, 18 + R() * 22, mix('#c3c8b5', '#e6d9b4', R()), 0.16, 'scumble');
  }
  // Five distinct hill planes. Lighter and less detailed as they recede.
  const hills = [
    [
      'M-40 685 Q160 470 330 625 Q480 620 660 536 Q820 495 1020 625 Q1220 526 1540 617 L1540 1000 L-40 1000Z',
      '#9dafa1',
      ['#99afa3', '#abb6a3', '#c3bea0'],
      [0, 535, 1500, 180],
      30,
    ],
    [
      'M-40 785 Q50 658 195 682 Q380 521 545 687 Q719 748 930 658 Q1200 592 1550 737 L1550 1000 L-40 1000Z',
      '#6e8a7b',
      ['#668377', '#799787', '#94a393'],
      [0, 645, 1500, 230],
      35,
    ],
    [
      'M-40 748 Q130 710 320 834 Q475 935 730 812 Q950 670 1150 768 Q1330 823 1560 707 L1560 1000 L-40 1000Z',
      '#48695d',
      ['#38584f', '#587567', '#78907a'],
      [0, 740, 1500, 280],
      25,
    ],
    [
      'M-40 870 Q200 765 395 894 Q586 1023 835 899 Q1110 793 1510 882 L1510 1000 L-40 1000Z',
      '#304d45',
      ['#233e38', '#3f5d4c', '#677655'],
      [0, 845, 1500, 160],
      24,
    ],
  ];
  for (let h = 0; h < hills.length; h++) {
    const [d, base, cols, bounds, size] = hills[h];
    const p = paintShape(d, base, cols, bounds, -0.15 + h * 0.12, 900, size);
    if (detail > 0.2) {
      ctx.save();
      ctx.clip(p);
      for (let i = 0; i < (h + 1) * 70 * detail; i++) {
        let x = R() * 1500,
          y = bounds[1] + R() * bounds[3];
        mark(x, y, 25 + R() * 55, -5 + R() * 10, 3 + R() * 9, cols[Math.floor(R() * 3)], 0.45);
      }
      ctx.restore();
    }
  }
  // A pale winding stream and its reflection in the valley establish depth and scale.
  curve('M900 744 Q862 772 956 794 Q1017 809 883 856 Q819 872 828 884', '#a7b39a', 3, 0.45);
  curve('M900 746 Q857 773 956 795', '#d3caa3', 1, 0.6);
  if (detail > 0.5) {
    // Small irregular tree clumps; they recede with the hill contours.
    for (let i = 0; i < 220; i++) {
      const x = R() * 1500,
        y = 865 + 65 * Math.sin(x / 180) + R() * 50,
        s = 3 + R() * 8;
      mark(x, y, 1, -s * 2, s, '#263e36', 0.8);
      mark(x - s, y - s, s * 2, -s * 0.4, s * 0.6, '#4a6147', 0.6);
    }
    for (let i = 0; i < 700; i++) {
      const x = R() * 1500,
        y = 934 + R() * 80;
      mark(
        x,
        y,
        -7 + R() * 14,
        -10 - R() * 22,
        1 + R() * 3,
        R() > 0.6 ? '#89916a' : '#526146',
        0.6,
      );
    }
    // A tiny abandoned watchtower against a far ridge, only a scale cue.
    path(
      'M282 675 L284 647 L288 647 L288 641 L293 641 L293 647 L298 647 L298 641 L304 641 L304 647 L310 647 L311 674Z',
      '#687e70',
    );
    curve('M286 650L285 672', '#a6ac89', 2, 0.7);
  }
  return c;
}
if (parameters.pass === 'dragon') {
  dragonTransform();
  // Far wing is cooler and softened behind the body.
  const far =
    'M705 430 Q739 338 852 157 L891 101 Q895 222 1026 318 Q976 296 934 337 Q900 331 870 386 Q813 369 756 459Z';
  paintShape(far, '#34474b', ['#33464b', '#4d605d', '#63746c'], [700, 90, 335, 390], 1.8, 650, 19);
  curve('M714 421 Q793 266 891 101 Q895 220 1026 318', '#a3ab8b', 5, detail > 0.45 ? 0.36 : 0.7);
  curve('M891 104 Q849 257 756 449', '#243737', 6, 0.75);
  curve('M891 104 Q884 257 870 386 M891 104 Q925 235 934 337', '#7b8b79', 3, 0.5);
  // Serpentine tail counterbalances the neck and jet of fire.
  const tail =
    'M669 437 C564 440 507 490 400 521 C289 554 239 531 230 484 C221 443 268 428 275 455 C248 444 244 466 260 483 C297 525 394 470 449 442 C526 399 570 397 646 413Z';
  paintShape(
    tail,
    '#3b4a40',
    ['#334237', '#596449', '#8b8860'],
    [210, 405, 470, 145],
    -0.15,
    520,
    10,
  );
  curve(
    'M650 420 C550 410 486 464 399 499 C295 541 241 510 243 475',
    '#a3a175',
    4,
    detail > 0.45 ? 0.32 : 0.6,
  );
  // Two trailing hind legs with a readable hock, toes and claws.
  paintShape(
    'M658 463 Q669 503 635 539 L613 560 L647 594 L635 611 L597 568 Q588 557 601 544 L620 503 L613 466Z',
    '#343e33',
    ['#344537', '#566449', '#858764'],
    [588, 460, 90, 160],
    1,
    210,
    9,
  );
  paintShape(
    'M724 464 Q756 500 722 549 L706 572 L743 592 L738 606 L690 585 Q679 578 688 559 L692 526 L682 473Z',
    '#4c533b',
    ['#344537', '#6d7550', '#a7a271'],
    [675, 465, 80, 150],
    1.5,
    280,
    10,
  );
  for (const d of [
    'M636 600L648 616L651 607',
    'M641 596L663 603L660 594',
    'M734 599L750 615L750 603',
    'M740 593L766 600L759 590',
  ])
    path(d, '#cec39a');
  // Ribcage and long rising neck, deliberately one continuous mass.
  const body =
    'M537 430 C552 378 646 362 721 390 C777 411 796 435 840 421 C873 409 874 367 913 350 C951 334 990 347 1007 372 L1025 402 L1007 421 L981 404 C958 382 940 378 929 398 C908 464 870 492 818 491 C758 490 747 463 702 479 C647 509 565 490 537 459Z';
  const bodyp = paintShape(
    body,
    '#566047',
    ['#344635', '#546448', '#7c8258', '#a4a276'],
    [530, 336, 500, 178],
    0.12,
    1800,
    13,
  );
  ctx.save();
  ctx.clip(bodyp);
  curve(
    'M548 440 C625 396 699 408 762 453 C806 486 883 465 904 408 Q922 355 976 379',
    '#a7a676',
    20,
    detail > 0.45 ? 0.2 : 0.4,
  );
  curve(
    'M559 463 Q650 500 713 462 Q750 444 792 462 Q866 499 911 429',
    '#243c31',
    14,
    detail > 0.45 ? 0.28 : 0.65,
  );
  if (detail > 0.3) {
    // Broken scale groups follow the body instead of an all-over noise layer.
    for (let i = 0; i < 1000 * detail; i++) {
      const x = 545 + R() * 438,
        y = 359 + R() * 133,
        n = art.noise(x / 47, y / 29);
      if (n < 0.45) continue;
      const s = 2 + R() * 4;
      curve(
        `M${x - s} ${y}q${s} ${-s * 1.1} ${s * 2} 0`,
        R() > 0.55 ? '#b1aa73' : '#243c30',
        0.8 + R(),
        0.22 + R() * 0.3,
      );
    }
  }
  ctx.restore();
  if (detail > 0.45) {
    ctx.save();
    ctx.clip(bodyp);
    // Long interrupted strokes model the top and belly planes without a graphic outline.
    art.techniques.stroke(
      c,
      [
        { x: 550, y: 428 },
        { x: 595, y: 408 },
        { x: 649, y: 411 },
        { x: 701, y: 432 },
        { x: 760, y: 462 },
        { x: 819, y: 467 },
        { x: 867, y: 447 },
        { x: 905, y: 393 },
        { x: 935, y: 368 },
        { x: 971, y: 377 },
      ],
      { preset: 'filbert', size: 15, colour: '#bbc093', opacity: 0.35, dryness: 0.3 },
    );
    art.techniques.stroke(
      c,
      [
        { x: 555, y: 464 },
        { x: 596, y: 478 },
        { x: 650, y: 480 },
        { x: 711, y: 454 },
        { x: 764, y: 481 },
        { x: 818, y: 486 },
        { x: 865, y: 473 },
        { x: 900, y: 436 },
      ],
      { preset: 'oil', size: 13, colour: '#253f36', opacity: 0.45, dryness: 0.4 },
    );
    ctx.restore();
  }
  // Dorsal spines vary in size; a thin lit edge separates them from the sky.
  for (let i = 0; i < 13; i++) {
    const x = 530 + i * 20,
      y = 408 - 21 * Math.sin((i / 13) * Math.PI),
      s = 8 + R() * 13;
    path(`M${x} ${y}L${x + 4} ${y - s}L${x + 17} ${y + 1}Z`, '#3c4a39');
    curve(`M${x + 4} ${y - s}L${x + 17} ${y + 1}`, '#afb084', 1.5, 0.65);
  }
  // Near wing: four stretched fingers and scalloped membrane, painted on top of shoulder.
  const near =
    'M700 439 C631 363 544 294 427 118 C451 219 393 306 307 369 Q397 326 450 419 Q499 370 563 454 Q619 403 675 480 Q697 467 700 439Z';
  const membrane = paintShape(
    near,
    '#586050',
    ['#35483f', '#55614c', '#7b805d', '#a5a17b'],
    [303, 112, 410, 375],
    0.9,
    1800,
    20,
  );
  ctx.save();
  ctx.clip(membrane);
  // Long translucent warm planes between wing fingers; ragged scumble leaves underpainting visible.
  for (let i = 0; i < 340 * detail; i++) {
    const t = R(),
      x = 426 + (690 - 426) * t,
      y = 139 + (445 - 139) * t;
    mark(
      x + R() * 65 - 85,
      y + R() * 100,
      -15 - R() * 55,
      28 + R() * 55,
      5 + R() * 11,
      R() > 0.45 ? '#a19a68' : '#354c42',
      0.25,
      'scumble',
    );
  }
  ctx.restore();
  curve('M696 454 C640 369 540 278 427 118', '#263c35', 12, detail > 0.45 ? 0.6 : 0.9);
  curve('M694 449 C632 361 526 261 427 118', '#acaf83', 4, detail > 0.45 ? 0.5 : 0.85);
  curve(
    'M427 122 Q452 249 450 419 M427 122 Q504 291 563 454 M427 122 Q535 338 675 480',
    '#293f36',
    5,
    detail > 0.45 ? 0.55 : 0.8,
  );
  curve(
    'M430 130 Q454 253 452 411 M431 133 Q505 294 564 448 M431 131 Q536 337 672 470',
    '#c2b68a',
    2.4,
    detail > 0.45 ? 0.42 : 0.63,
  );
  curve(
    'M427 119 C451 218 393 307 307 369 Q397 326 450 419 Q499 370 563 454 Q619 403 675 480',
    '#869378',
    3,
    detail > 0.45 ? 0.45 : 0.8,
  );
  if (detail > 0.45) {
    ctx.save();
    ctx.clip(membrane);
    for (let i = 0; i < 180 * detail; i++) {
      const t = R(),
        x = 430 + 230 * t + (R() - 0.5) * 70,
        y = 146 + 299 * t;
      mark(
        x,
        y,
        -15 + R() * 20,
        25 + R() * 45,
        2 + R() * 7,
        mix('#bfb48b', '#4d6253', R()),
        0.25,
        'scumble',
      );
    }
    // Brush-lit tendons have broken edges, not uniformly stroked contours.
    art.techniques.stroke(
      c,
      [
        { x: 430, y: 138 },
        { x: 479, y: 220 },
        { x: 550, y: 301 },
        { x: 627, y: 382 },
        { x: 683, y: 444 },
      ],
      { size: 9, colour: '#c1bb92', opacity: 0.4, dryness: 0.4 },
    );
    ctx.restore();
  }
  // Claw at the carpal joint.
  path('M425 133 Q411 92 434 79 Q425 99 442 128Z', '#c3bc98');
  // Forelimbs reach forward and fold under the chest.
  paintShape(
    'M817 454 Q837 455 844 480 L844 515 L890 521 L899 535 L870 539 L826 529 Q813 524 816 511 L811 482Z',
    '#4b6042',
    ['#334b34', '#657d4e', '#a3af72'],
    [807, 450, 100, 100],
    1.2,
    250,
    7,
  );
  path('M886 522L909 523L918 533L899 530L909 543L891 536Z', '#bcc599');
  curve('M821 464 Q833 482 828 512 L879 528', '#a6b878', 3, 0.75);
  // Skull: brow, two swept horns, open jaw, teeth and emerald fire reflected in the planes.
  paintShape(
    'M931 365 L947 343 L973 349 L991 363 L1027 366 L1047 386 L1039 399 L1008 398 L992 388 L978 393 L980 409 L1017 417 L1034 411 L1029 429 L1003 438 L969 422 L949 395Z',
    '#64704d',
    ['#43583d', '#7a8955', '#b3b780'],
    [930, 339, 125, 108],
    0.2,
    430,
    6,
  );
  path('M996 391 L1041 395 L1028 414 L1004 410 L979 400Z', '#172b23');
  path('M947 356 Q909 340 904 318 Q932 337 962 346Z', '#c1ba8f');
  path('M964 350 Q951 320 970 296 Q963 327 982 352Z', '#d0c49d');
  curve('M960 352 Q950 329 960 312', '#665f48', 2, 0.8);
  path('M982 370L1002 378L983 383Z', '#293a2c');
  curve('M980 369L1002 376', '#d3c490', 3, 0.9);
  path('M985 374L994 377L986 379Z', '#e1ef9b');
  curve('M989 374L989 379', '#142c24', 1.3);
  path(
    'M1010 395L1015 405L1018 397 M1025 397L1028 406L1031 397 M990 402L995 410L998 405',
    '#dce0ac',
  );
  curve('M1009 420L1027 424L1031 417', '#b9d883', 4, 0.85);
  curve('M997 369L1030 375L1038 388', '#c0c38a', 2, 0.8);
  path('M1028 383L1034 385L1030 389Z', '#203d29');
  if (detail > 0.45) {
    mark(957, 359, 28, 7, 8, '#c2bc8f', 0.6, 'filbert');
    mark(966, 383, 14, 11, 9, '#334e36', 0.5, 'filbert');
    mark(970, 411, 28, 17, 7, '#a3bf73', 0.55, 'filbert');
    curve('M953 352 Q924 340 915 330', '#706a4d', 3, 0.6);
    curve('M970 347 Q961 331 968 310', '#f0ddae', 1.7, 0.7);
  }
  if (detail > 0.6) {
    for (let i = 0; i < 24; i++) {
      const x = 946 + R() * 36,
        y = 369 + R() * 38;
      mark(x, y, 5, 3, 1.5, '#b5b889', 0.55);
    }
  }
  return c;
}
if (parameters.pass === 'fire') {
  dragonTransform();
  // Multiple irregular tongues of paint, darker outer flame and pale hot interior.
  const outer =
    'M1032 401 C1086 382 1097 433 1169 425 Q1145 447 1202 459 Q1275 471 1281 504 Q1242 497 1273 525 Q1355 542 1403 612 Q1350 590 1340 609 Q1388 650 1457 679 Q1356 678 1309 635 Q1251 625 1238 601 Q1271 612 1272 588 Q1224 577 1206 549 Q1163 541 1148 514 Q1096 493 1082 459 Q1061 431 1032 421Z';
  ctx.save();
  ctx.shadowColor = '#a5d65a';
  ctx.shadowBlur = (18 * art.width) / 1500;
  path(outer, '#5e993e');
  ctx.restore();
  const fp = paintShape(
    outer,
    '#659c3e',
    ['#3d783e', '#7fa943', '#b5cf5a', '#d7e28d'],
    [1030, 385, 440, 300],
    0.55,
    1300,
    14,
  );
  ctx.save();
  ctx.clip(fp);
  for (let i = 0; i < 260 * Math.max(0.3, detail); i++) {
    const t = R(),
      x = 1040 + t * 360 + (R() - 0.5) * t * 90,
      y = 411 + t * 245 + (R() - 0.5) * t * 65;
    mark(
      x,
      y,
      25 + R() * 65,
      5 + R() * 33,
      3 + R() * 13,
      R() > 0.5 ? '#d0e580' : '#8fbd45',
      0.6,
      'filbert',
    );
  }
  ctx.restore();
  path(
    'M1037 406 Q1088 410 1118 452 Q1132 438 1148 464 L1140 466 Q1167 499 1204 505 Q1172 510 1204 534 Q1138 512 1106 471 Q1075 438 1037 417Z',
    '#d2ed96',
  );
  curve('M1041 413 Q1091 421 1112 454 Q1138 491 1182 502', '#f0f4be', 7, 0.95);
  if (detail > 0.45)
    art.techniques.stroke(
      c,
      [
        { x: 1043, y: 414 },
        { x: 1080, y: 429 },
        { x: 1113, y: 465 },
        { x: 1147, y: 490 },
        { x: 1201, y: 516 },
      ],
      { preset: 'filbert', size: 19, colour: '#f0f4be', opacity: 0.55, dryness: 0.25 },
    );
  for (let i = 0; i < 70 * detail; i++) {
    const t = R(),
      x = 1080 + t * 375,
      y = 450 + t * 190 + (R() - 0.5) * 130;
    mark(x, y, 4 + R() * 20, 2 + R() * 8, 0.7 + R() * 2.2, R() > 0.5 ? '#d2e984' : '#86a95d', 0.65);
  }
  return c;
}
if (parameters.pass === 'finish') {
  ctx.drawImage(art.input('landscape'), 0, 0, 1500, 1000);
  ctx.drawImage(art.input('dragon'), 0, 0, 1500, 1000);
  ctx.drawImage(art.input('fire'), 0, 0, 1500, 1000);
  if (detail > 0.5) {
    // Local reflected green light on the valley and a restrained warm glaze connect the subjects.
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 90; i++) {
      const x = 1130 + R() * 310,
        y = 736 + R() * 60;
      mark(x, y, 15 + R() * 60, -4, 3 + R() * 12, '#bdd56d', 0.15, 'scumble');
    }
    ctx.restore();
    art.techniques.glaze(c, '#b89a66', 0.035);
    ctx.save();
    ctx.resetTransform();
    art.techniques.weave(c, { spacing: 3, opacity: 0.006 });
    ctx.restore();
  }
  if (detail > 1)
    return art.warp(
      c,
      (x, y) => [
        x + (art.noise(x / 12, y / 12, 41) - 0.5) * 2.2,
        y + (art.noise(x / 12, y / 12, 81) - 0.5) * 2.2,
      ],
      'clamp',
    );
  return c;
}
throw new Error('Unknown painting pass');
