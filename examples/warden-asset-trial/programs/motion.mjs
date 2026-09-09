// Coordinates are authored in the sprite's 256 × 320 design space.
// The same function is baked into the art recipe and checked by verify.mjs.
export function walkPose(phase) {
  const stance = 0.6,
    travel = 52;
  function foot(offset, baseX, floorY) {
    const t = (((phase + offset) % 1) + 1) % 1;
    const contact = t < stance;
    const swing = (t - stance) / (1 - stance);
    // Contact moves backward relative to the body. Recovery moves forward aloft.
    const x = contact
      ? travel / 2 - (travel * t) / stance
      : -travel / 2 + travel * (swing * swing * (3 - 2 * swing));
    const lift = contact ? 0 : Math.sin(Math.PI * swing) * 12;
    return { ankle: [baseX + x, floorY - lift], contact, lift, phase: t };
  }
  const near = foot(0, 119, 271),
    far = foot(0.5, 132, 269);
  const bob = 1.2 * Math.cos(phase * Math.PI * 4);
  const hipNear = [122, 181 + bob],
    hipFar = [137, 181 + bob];
  function knee(hip, ankle) {
    const dx = ankle[0] - hip[0],
      dy = ankle[1] - hip[1];
    const d = Math.hypot(dx, dy),
      length = 48;
    const h = Math.sqrt(Math.max(0, length * length - (d * d) / 4));
    return [(hip[0] + ankle[0]) / 2 + (dy / d) * h, (hip[1] + ankle[1]) / 2 - (dx / d) * h];
  }
  return {
    legLength: 48,
    near,
    far,
    hipNear,
    hipFar,
    kneeNear: knee(hipNear, near.ankle),
    kneeFar: knee(hipFar, far.ankle),
    bob,
    speed: travel / stance,
    armSwing: Math.sin(phase * Math.PI * 2),
  };
}
