/**
 * The lunar surface: the top of a small sphere, drawn as a quiet SVG.
 * A soft grey disc with a handful of shallow craters, nothing more.
 */
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// Fixed crater layout as fractions: x across the width, d = depth below the
// horizon (0 = horizon, 1 = bottom edge), r = size.
const CRATERS = [
  [0.08, 0.55, 0.9], [0.2, 0.28, 0.55], [0.33, 0.7, 1.1], [0.47, 0.32, 0.6],
  [0.58, 0.62, 0.85], [0.7, 0.22, 0.45], [0.8, 0.5, 0.75], [0.92, 0.3, 0.5],
  [0.15, 0.85, 0.7], [0.63, 0.88, 0.95], [0.88, 0.8, 0.6],
];

/**
 * geo: { W, H, cx, cy, R } circle in px. clear: [x0, x1] px kept free under the hound.
 * shadow: { x, y, rx } a soft contact shadow under the hound's paws.
 */
export function drawMoon(svg, { W, H, cx, cy, R }, clear, shadow) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const defs = el('defs', {}, svg);
  const top = cy - R;
  const fill = el('linearGradient', { id: 'moon-fill', x1: 0, y1: top, x2: 0, y2: H, gradientUnits: 'userSpaceOnUse' }, defs);
  el('stop', { offset: 0, 'stop-color': '#5d677c' }, fill);
  el('stop', { offset: 1, 'stop-color': '#3a4357' }, fill);
  el('circle', { cx, cy, r: R, fill: 'url(#moon-fill)' }, svg);
  // a faint lit rim along the horizon
  el('circle', { cx, cy, r: R - 1, fill: 'none', stroke: '#8a93a6', 'stroke-width': 1.5, opacity: 0.6 }, svg);

  if (shadow) {
    const blur = el('radialGradient', { id: 'moon-shadow' }, defs);
    el('stop', { offset: 0, 'stop-color': '#121826', 'stop-opacity': 0.55 }, blur);
    el('stop', { offset: 1, 'stop-color': '#121826', 'stop-opacity': 0 }, blur);
    el('ellipse', { cx: shadow.x, cy: shadow.y, rx: shadow.rx, ry: shadow.rx * 0.09, fill: 'url(#moon-shadow)' }, svg);
  }

  const g = el('g', {}, svg);
  const unit = Math.min(W, 1400) / 1400;
  for (const [fx, d, s] of CRATERS) {
    const x = fx * W;
    if (clear && x > clear[0] && x < clear[1] && d < 0.45) continue;
    const horizon = cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));
    const y = horizon + 18 + d * (H - horizon - 24);
    const near = (y - top) / (H - top);
    const rx = (24 + 46 * near) * s * Math.max(unit, 0.55);
    const ry = rx * (0.22 + 0.2 * near);
    el('ellipse', { cx: x, cy: y, rx, ry, fill: '#323a4d' }, g);
    // the lower lip catches a little light
    el('ellipse', { cx: x, cy: y + ry * 0.18, rx: rx * 0.92, ry: ry * 0.78, fill: 'none', stroke: '#6b7489', 'stroke-width': 1.2, opacity: 0.55 }, g);
  }
}
