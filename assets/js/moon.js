/**
 * The lunar surface: the top of a small cratered sphere.
 *
 * Light follows the real moon phase. The lit share of the visible surface is
 * the moon's illuminated fraction tonight, lit from the right while waxing and
 * from the left while waning (mirrored for the southern hemisphere), so the
 * terminator crosses the ground the way it crosses the moon in the sky. Crater
 * shadows lengthen toward the terminator. The colour of the light follows the
 * visitor's own time of day: warm at dawn and dusk, cool at night.
 */
const NS = 'http://www.w3.org/2000/svg';

const NAVY = [18, 24, 38];
const CREAM = [245, 243, 238];

const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Light colour for the visitor's local sun altitude (degrees). */
export function lightTint(sunAlt) {
  const day = CREAM;
  const golden = [248, 228, 204];
  const night = [214, 224, 242];
  if (sunAlt >= 14) return { color: day, strength: 1 };
  if (sunAlt >= -2) return { color: mixc(golden, day, smooth(-2, 14, sunAlt)), strength: 0.97 };
  const t = smooth(-14, -2, sunAlt);
  return { color: mixc(night, golden, t), strength: 0.86 + 0.11 * t };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * Draw the surface into `svg`.
 * geo: { W, H, cx, cy, R } circle in px. light: { illumination, waxing, south, sunAlt }.
 * keepClear: [x0, x1] px range where big craters are avoided (under the hound's paws).
 */
export function drawMoon(svg, geo, light, keepClear) {
  const { W, H, cx, cy, R } = geo;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();

  const fromRight = light.waxing !== light.south;
  const lit = Math.min(1, Math.max(0, light.illumination));
  const tint = lightTint(light.sunAlt);
  const earthshine = 1 - lit; // Earth is full from the moon when the moon is new.
  const dark = mixc([30, 38, 58], [52, 62, 88], earthshine);
  const litColor = mixc(dark, tint.color, tint.strength);

  // The terminator is a wide arc, not a straight line: it crosses the horizon
  // where the lit share says, and bends away from the sun toward the viewer.
  const sign = fromRight ? 1 : -1;
  const horizon = cy - R;
  const soft = Math.max(70, W * 0.16);
  const edge = fromRight ? W * (1 - lit) : W * lit;
  const Rt = 1.4 * Math.max(H, W * 0.6);
  const sx = edge + sign * Rt * 0.6;
  const sy = horizon + Rt * 0.8;
  const into = (x, y) => Rt - Math.hypot(x - sx, y - sy);
  const shine = (x, y) => (lit >= 0.995 ? 1 : lit <= 0.005 ? 0 : smooth(-soft / 2, soft / 2, into(x, y)));
  const sunAt = (x, y) => Math.max(0, Math.min(90, 6 + (into(x, y) / W) * 150 + lit * 40));

  const defs = el('defs', {}, svg);
  const R2 = Rt + soft;
  const grad = el('radialGradient', { id: 'moon-light', gradientUnits: 'userSpaceOnUse', cx: sx, cy: sy, r: R2 }, defs);
  const full = lit >= 0.995 ? litColor : lit <= 0.005 ? dark : null;
  const stops = full ? [[0, full], [1, full]] : [];
  if (!full) {
    for (let i = 0; i <= 8; i++) {
      const d = -soft / 2 + (soft * i) / 8; // distance into the lit side
      stops.push([(Rt - d) / R2, mixc(dark, litColor, smooth(-soft / 2, soft / 2, d))]);
    }
    stops.reverse();
    stops.unshift([0, litColor]);
    stops.push([1, dark]);
  }
  for (const [o, c] of stops) el('stop', { offset: Math.max(0, Math.min(1, o)).toFixed(4), 'stop-color': css(c) }, grad);
  // Curvature: the ground darkens a little toward the limb, like a small sphere.
  const limb = el('radialGradient', { id: 'moon-limb', gradientUnits: 'userSpaceOnUse', cx, cy, r: R }, defs);
  el('stop', { offset: 0.9, 'stop-color': css(NAVY), 'stop-opacity': 0 }, limb);
  el('stop', { offset: 0.985, 'stop-color': css(NAVY), 'stop-opacity': 0.1 }, limb);
  el('stop', { offset: 1, 'stop-color': css(NAVY), 'stop-opacity': 0.28 }, limb);

  el('circle', { cx, cy, r: R, fill: 'url(#moon-light)' }, svg);
  el('circle', { cx, cy, r: R, fill: 'url(#moon-limb)' }, svg);

  // Craters, flattened by the grazing view and smaller toward the horizon.
  const g = el('g', { class: 'moon-craters' }, svg);
  const rand = rng(0x4e48 + Math.round(W / 40));
  const top = cy - R;
  const depth = H - top;
  const count = Math.round(Math.min(46, 10 + W / 55));
  const placed = [];
  for (let i = 0; i < count * 6 && placed.length < count; i++) {
    const x = rand() * W;
    const v = Math.pow(rand(), 0.85); // 0 at horizon, 1 at the bottom edge
    const horizonY = cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));
    const y = horizonY + 10 + v * (H - horizonY - 4);
    if (y > H + 10) continue;
    const near = (y - top) / depth;
    let rx = (W < 720 ? 10 : 14) + rand() * (W < 720 ? 26 : 44) * (0.35 + near);
    if (keepClear && x > keepClear[0] && x < keepClear[1] && y < horizonY + depth * 0.35) rx *= 0.45;
    const ry = rx * (0.2 + 0.24 * near);
    if (y - ry < horizonY + 3) continue;
    if (placed.some((p) => Math.abs(p.x - x) < p.rx + rx + 6 && Math.abs(p.y - y) < p.ry + ry + 6)) continue;
    placed.push({ x, y, rx, ry });
  }
  for (const c of placed) {
    const s = shine(c.x, c.y);
    const alt = sunAt(c.x, c.y);
    const ground = mixc(dark, litColor, s);
    const pit = mixc(mixc(dark, NAVY, 0.55), NAVY, s);
    const floor = mixc(ground, NAVY, 0.1 + 0.08 * (1 - s));
    el('ellipse', { cx: c.x, cy: c.y, rx: c.rx, ry: c.ry, fill: css(pit) }, g);
    if (s > 0.02) {
      // The sunward rim shades the floor; the rest of the floor is lit.
      const reach = Math.max(0.16, Math.min(1, 1.15 - Math.sin((alt * Math.PI) / 180)));
      const shift = (fromRight ? -1 : 1) * c.rx * reach * 1.15;
      const clip = el('clipPath', { id: `crater-${Math.round(c.x)}-${Math.round(c.y)}` }, defs);
      el('ellipse', { cx: c.x, cy: c.y, rx: c.rx, ry: c.ry }, clip);
      el('ellipse', {
        cx: c.x + shift, cy: c.y + c.ry * 0.12, rx: c.rx, ry: c.ry,
        fill: css(floor), 'fill-opacity': s.toFixed(3), 'clip-path': `url(#${clip.id})`,
      }, g);
    }
  }

  // A thin bright rim where sunlight grazes the horizon.
  const rim = el('path', {
    d: `M0 ${cy - Math.sqrt(R * R - cx * cx)} A ${R} ${R} 0 0 1 ${W} ${cy - Math.sqrt(R * R - (W - cx) * (W - cx))}`,
    fill: 'none', stroke: 'url(#moon-light)', 'stroke-width': 2.5, opacity: 0.9,
  }, svg);
  rim.setAttribute('vector-effect', 'non-scaling-stroke');

  return { shine, sunAt, dark, litColor, fromRight };
}
