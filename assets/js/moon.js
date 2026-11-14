/**
 * The lunar surface: the top of a small sphere, filled with a real Apollo 17
 * photograph of the Taurus-Littrow valley floor (NASA, public domain) and cut
 * to a gently curved horizon. Drawn as SVG.
 */
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * geo: { W, H, cx, cy, R } circle in px. opts.src: the ground photograph.
 * opts.shadow: { x, y, rx } soft contact shadow under the hound's paws.
 */
export function drawMoon(svg, { W, H, cx, cy, R }, opts = {}) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const defs = el('defs', {}, svg);
  const top = cy - R;
  // highest and lowest horizon points across the width
  const hY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));
  const yTop = Math.min(hY(0), hY(W), top);

  const clip = el('clipPath', { id: 'moon-clip' }, defs);
  el('circle', { cx, cy, r: R }, clip);

  // Ground: a grey base in case the photograph is slow, then the photograph.
  const g = el('g', { 'clip-path': 'url(#moon-clip)' }, svg);
  el('rect', { x: 0, y: yTop, width: W, height: H - yTop, fill: '#6f7076' }, g);
  if (opts.src) {
    el('image', {
      href: opts.src, x: 0, y: yTop - 2, width: W, height: H - yTop + 2,
      preserveAspectRatio: 'xMidYMin slice',
    }, g);
  }
  // Settle the photo into the scene: a touch darker toward the foreground and
  // a soft falloff at the horizon, so the edge reads as a curve, not a cut.
  const shade = el('linearGradient', { id: 'moon-shade', x1: 0, y1: yTop, x2: 0, y2: H, gradientUnits: 'userSpaceOnUse' }, defs);
  el('stop', { offset: 0, 'stop-color': '#121826', 'stop-opacity': 0.35 }, shade);
  el('stop', { offset: 0.08, 'stop-color': '#121826', 'stop-opacity': 0 }, shade);
  el('stop', { offset: 0.7, 'stop-color': '#121826', 'stop-opacity': 0 }, shade);
  el('stop', { offset: 1, 'stop-color': '#121826', 'stop-opacity': 0.35 }, shade);
  el('rect', { x: 0, y: yTop, width: W, height: H - yTop, fill: 'url(#moon-shade)' }, g);

  if (opts.shadow) {
    const s = opts.shadow;
    const blur = el('radialGradient', { id: 'moon-shadow' }, defs);
    el('stop', { offset: 0, 'stop-color': '#0b0e15', 'stop-opacity': 0.75 }, blur);
    el('stop', { offset: 1, 'stop-color': '#0b0e15', 'stop-opacity': 0 }, blur);
    // the sun in the photograph is low on the right, so the shadow falls left
    el('ellipse', { cx: s.x - s.rx * 0.3, cy: s.y, rx: s.rx * 1.25, ry: s.rx * 0.085, fill: 'url(#moon-shadow)' }, g);
  }

  // the thin bright limb where the ground meets the sky
  el('circle', { cx, cy, r: R - 0.5, fill: 'none', stroke: '#d8d9dc', 'stroke-width': 1, opacity: 0.45 }, svg);
}
