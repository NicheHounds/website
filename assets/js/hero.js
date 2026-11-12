/**
 * Home hero: the Niche Hounds mark come to life.
 * Everything runs in the browser. The only location input is the time zone.
 */
import { mountEarth } from './earth.js';
import { moonPhase, solarAltitude, browserLocation, now } from './astro.js';
import { drawMoon } from './moon.js';
import { runHound } from './hound.js';

const hero = document.querySelector('.hero');
if (hero) start(hero);

function start(hero) {
  const $ = (sel) => hero.querySelector(sel);
  const moonSvg = $('.hero-moon');
  const houndSvg = $('.hero-hound');
  const earth = $('.hero-earth');
  const starSvg = $('.hero-stars');
  const logoStars = $('.hero-logo-stars');
  const params = new URLSearchParams(location.search);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The hound's ground shadow sits under the rig, in rig units.
  const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  shadow.setAttribute('class', 'hound-shadow');
  shadow.setAttribute('cx', 390);
  shadow.setAttribute('cy', 627);
  shadow.setAttribute('rx', 255);
  shadow.setAttribute('ry', 13);
  houndSvg.appendChild(shadow);

  runHound(houndSvg, {
    reducedMotion,
    hold: params.get('dog') || undefined,
    idleScale: Number(params.get('idle')) || 1,
  });

  mountEarth(earth, { textureBase: hero.dataset.textureBase });

  let lastW = 0;
  let lastH = 0;

  function layout(force) {
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    if (!W || !H || (!force && W === lastW && H === lastH)) return;
    lastW = W;
    lastH = H;
    const mobile = W < 720;

    // A small sphere: the radius follows the width, so a phone sees a
    // narrower slice of the same curve.
    const R = 1.6 * Math.max(W, 900);
    const cx = W * (mobile ? 0.4 : 0.3);
    const horizon = H * (mobile ? 0.8 : 0.775);
    const cy = horizon + R;
    const surfaceY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));

    // The hound: rig units -> px. 505 rig units is nose-to-paw standing height.
    const dogH = mobile ? Math.min(W * 0.56, H * 0.3) : Math.min(H * 0.43, W * 0.31);
    const k = dogH / 505;
    const dogX = mobile ? W * 0.42 : Math.max(W * 0.285, 300 * k + 24);
    const ground = surfaceY(dogX) + dogH * 0.07;
    Object.assign(houndSvg.style, {
      left: `${dogX - (376 - 90) * k}px`,
      top: `${ground - (625 - 100) * k}px`,
      width: `${600 * k}px`,
      height: `${545 * k}px`,
    });

    // Earth: right of the copy on desktop, behind the copy on a phone.
    const D = mobile ? Math.min(W * 0.74, H * 0.4) : Math.min(W * 0.3, H * 0.5, 560);
    const ex = mobile ? W * 0.72 : W * 0.74;
    const ey = mobile ? H * 0.31 : Math.min(H * 0.42, horizon - D * 0.62);
    Object.assign(earth.style, { width: `${D}px`, height: `${D}px`, left: `${ex - D / 2}px`, top: `${ey - D / 2}px` });

    // The mark's two stars.
    const s = mobile ? W * 0.2 : Math.min(H * 0.17, W * 0.12);
    Object.assign(logoStars.style, {
      width: `${s}px`,
      // Up and to the left of Earth, as in the mark.
      left: mobile ? `${W * 0.07}px` : `${ex - D / 2 - s * 1.05}px`,
      top: mobile ? `${H * 0.53}px` : `${Math.max(64, ey - D / 2 - s * 0.35)}px`,
    });

    drawStars(W, H, surfaceY);
    paintMoon({ W, H, cx, cy, R }, [dogX - 330 * k, dogX + 330 * k]);
  }

  let geo = null;
  let clear = null;
  function paintMoon(g, keep) {
    if (g) { geo = g; clear = keep; }
    if (!geo) return;
    const loc = browserLocation();
    const t = now();
    const phase = moonPhase(t);
    const info = drawMoon(moonSvg, geo, {
      illumination: phase.illumination,
      waxing: phase.waxing,
      south: loc.lat < 0,
      sunAlt: solarAltitude(loc.lat, loc.lon, t),
    }, clear);
    hero.dataset.moon = `${Math.round(phase.illumination * 100)}% ${phase.waxing ? 'waxing' : 'waning'}`;
    // The hound's shadow falls away from the light.
    shadow.setAttribute('transform', `translate(${info.fromRight ? -26 : 26} 0)`);
  }

  function drawStars(W, H, surfaceY) {
    starSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const n = Math.round((W * H) / 7000);
    let out = '';
    for (let i = 0; i < n; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = 0.5 + rand() * rand() * 1.4;
      const a = 0.25 + rand() * 0.6;
      if (y > surfaceY(x) - 4) continue;
      const tw = rand() < 0.22 ? ` class="tw" style="animation-delay:${(-rand() * 6).toFixed(2)}s"` : '';
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${a.toFixed(2)}"${tw}/>`;
    }
    starSvg.innerHTML = out;
  }

  layout(true);
  new ResizeObserver(() => layout(false)).observe(hero);
  // Phase and the colour of the light move slowly; refresh every few minutes.
  setInterval(() => { if (!document.hidden) paintMoon(); }, 5 * 60 * 1000);
  hero.classList.add('is-live');
}
