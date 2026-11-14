/**
 * The lunar surface as SVG: the top of a small sphere, lit low from the right.
 * Fine regolith relief comes from an SVG lighting filter; craters are shaded
 * bowls with a lit rim; a scatter of small rocks sits in the foreground.
 */
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
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

/**
 * geo: { W, H, cx, cy, R } circle in px.
 * clear: [x0, x1] px kept free of big craters (under the hound).
 * shadow: { x, y, rx } soft contact shadow under the hound's paws.
 */
export function drawMoon(svg, { W, H, cx, cy, R }, clear, shadow) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const defs = el('defs', {}, svg);
  const top = cy - R;
  const depth = H - top;

  // Base tone: grey regolith, a touch brighter toward the sunlit right and
  // toward the far ground, darker in the near foreground.
  const tone = el('linearGradient', { id: 'moon-tone', x1: 0, y1: top, x2: 0, y2: H, gradientUnits: 'userSpaceOnUse' }, defs);
  el('stop', { offset: 0, 'stop-color': '#9a9ca2' }, tone);
  el('stop', { offset: 0.35, 'stop-color': '#7f8188' }, tone);
  el('stop', { offset: 1, 'stop-color': '#5b5e66' }, tone);
  const side = el('linearGradient', { id: 'moon-side', x1: 0, y1: 0, x2: W, y2: 0, gradientUnits: 'userSpaceOnUse' }, defs);
  el('stop', { offset: 0, 'stop-color': '#121826', 'stop-opacity': 0.28 }, side);
  el('stop', { offset: 0.6, 'stop-color': '#121826', 'stop-opacity': 0.05 }, side);
  el('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': 0.06 }, side);

  // Regolith relief: fractal noise lit from the right, stretched sideways for
  // a grazing view, multiplied into the base tone.
  const f = el('filter', { id: 'moon-relief', x: 0, y: 0, width: 1, height: 1, 'color-interpolation-filters': 'sRGB' }, defs);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.004 0.018', numOctaves: 5, seed: 7, result: 'noise' }, f);
  const light = el('feDiffuseLighting', { in: 'noise', surfaceScale: 3.2, diffuseConstant: 1.15, 'lighting-color': '#ffffff', result: 'lit' }, f);
  el('feDistantLight', { azimuth: 330, elevation: 38 }, light);
  el('feComposite', { in: 'SourceGraphic', in2: 'lit', operator: 'arithmetic', k1: 1.05, k2: 0, k3: 0, k4: 0, result: 'shaded' }, f);
  el('feComposite', { in: 'shaded', in2: 'SourceGraphic', operator: 'in' }, f);

  el('circle', { cx, cy, r: R, fill: 'url(#moon-tone)', filter: 'url(#moon-relief)' }, svg);
  el('circle', { cx, cy, r: R, fill: 'url(#moon-side)' }, svg);
  // the bright limb where the surface meets the sky
  el('circle', { cx, cy, r: R - 0.75, fill: 'none', stroke: '#c9cbd0', 'stroke-width': 1.5, opacity: 0.55 }, svg);

  // Crater shading, shared: the sunward (right) inner wall falls into shadow,
  // the far (left) wall catches light, and the outer rim is lit on the right.
  const bowl = el('linearGradient', { id: 'crater-bowl', x1: 0, y1: 0, x2: 1, y2: 0.25 }, defs);
  el('stop', { offset: 0, 'stop-color': '#a2a4a9', 'stop-opacity': 0.75 }, bowl);
  el('stop', { offset: 0.45, 'stop-color': '#76797f', 'stop-opacity': 0.7 }, bowl);
  el('stop', { offset: 0.8, 'stop-color': '#3c3f46', 'stop-opacity': 0.85 }, bowl);
  el('stop', { offset: 1, 'stop-color': '#34373e', 'stop-opacity': 0.85 }, bowl);
  const rim = el('linearGradient', { id: 'crater-rim', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  el('stop', { offset: 0, 'stop-color': '#3a3d45', 'stop-opacity': 0.5 }, rim);
  el('stop', { offset: 0.55, 'stop-color': '#9ea0a6', 'stop-opacity': 0.2 }, rim);
  el('stop', { offset: 1, 'stop-color': '#d6d7da', 'stop-opacity': 0.55 }, rim);
  const halo = el('radialGradient', { id: 'crater-halo' }, defs);
  el('stop', { offset: 0.55, 'stop-color': '#c8cacf', 'stop-opacity': 0.1 }, halo);
  el('stop', { offset: 1, 'stop-color': '#c8cacf', 'stop-opacity': 0 }, halo);

  if (shadow) {
    const blur = el('radialGradient', { id: 'moon-shadow' }, defs);
    el('stop', { offset: 0, 'stop-color': '#121826', 'stop-opacity': 0.6 }, blur);
    el('stop', { offset: 1, 'stop-color': '#121826', 'stop-opacity': 0 }, blur);
    // the sun is low on the right, so the shadow stretches left
    el('ellipse', { cx: shadow.x - shadow.rx * 0.25, cy: shadow.y, rx: shadow.rx * 1.2, ry: shadow.rx * 0.08, fill: 'url(#moon-shadow)' }, svg);
  }

  const g = el('g', {}, svg);
  const rand = rng(0x6e68);
  const scale = Math.max(0.6, Math.min(W, 1600) / 1400);
  const placed = [];
  const count = Math.round(Math.min(38, 10 + W / 60));
  for (let i = 0; i < count * 8 && placed.length < count; i++) {
    const x = rand() * W;
    const d = Math.pow(rand(), 1.15);           // 0 at the horizon, 1 at the bottom
    const horizon = cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));
    const y = horizon + 6 + d * (H - horizon);
    if (y > H + 20) continue;
    const near = Math.min(1, (y - top) / depth);
    const big = rand() < 0.12 ? 2.4 : 1;
    let rx = (5 + 70 * near * near + 18 * near) * (0.35 + rand() * 0.9) * big * scale;
    if (clear && x > clear[0] - rx && x < clear[1] + rx && near < 0.5) rx = Math.min(rx, 10);
    const ry = rx * (0.16 + 0.26 * near);
    if (y - ry < horizon + 2) continue;
    if (placed.some((p) => Math.abs(p.x - x) < (p.rx + rx) * 0.9 && Math.abs(p.y - y) < (p.ry + ry) * 1.2)) continue;
    placed.push({ x, y, rx, ry });
  }
  placed.sort((a, b) => a.y - b.y);
  for (const c of placed) {
    el('ellipse', { cx: c.x, cy: c.y, rx: c.rx * 1.7, ry: c.ry * 1.7, fill: 'url(#crater-halo)' }, g);
    el('ellipse', { cx: c.x, cy: c.y, rx: c.rx, ry: c.ry, fill: 'url(#crater-bowl)' }, g);
    el('ellipse', { cx: c.x, cy: c.y - c.ry * 0.05, rx: c.rx * 1.03, ry: c.ry * 1.06, fill: 'none', stroke: 'url(#crater-rim)', 'stroke-width': Math.max(0.8, c.rx * 0.04) }, g);
  }

  // small rocks in the foreground, each with a shadow cast to the left
  for (let i = 0; i < Math.round(W / 70); i++) {
    const x = rand() * W;
    const horizon = cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));
    const y = horizon + (0.25 + 0.75 * rand()) * (H - horizon);
    const near = (y - top) / depth;
    const r = (1 + rand() * 3.2) * (0.4 + near * 1.4) * scale;
    if (clear && x > clear[0] && x < clear[1] && near < 0.5) continue;
    el('ellipse', { cx: x - r * 1.5, cy: y + r * 0.25, rx: r * 1.8, ry: r * 0.42, fill: '#1e2128', opacity: 0.45 }, g);
    el('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.62, fill: '#76797f' }, g);
    el('ellipse', { cx: x + r * 0.3, cy: y - r * 0.15, rx: r * 0.55, ry: r * 0.3, fill: '#a3a5aa', opacity: 0.55 }, g);
  }
}
