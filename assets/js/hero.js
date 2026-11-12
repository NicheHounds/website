/**
 * Home hero: the Niche Hounds mark come to life.
 * Everything runs in the browser. The only location input is the time zone.
 */
import { mountEarth } from './earth.js';
import { moonPhase, solarAltitude, browserLocation, now } from './astro.js';
import { drawMoon } from './moon.js';
import { runHound } from './hound.js';
import { start3D } from './hero3d.js';

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

  mountEarth(earth, { textureBase: hero.dataset.textureBase });
  let geo = null;
  let clear = null;

  // The 3D scene when the browser can run it; the illustrated hero otherwise.
  let three = null;
  if (params.get('flat') !== '1') {
    try {
      three = start3D(hero, {
        canvas: $('.hero-lunar'),
        logoSvg: houndSvg,
        earthEl: earth,
        reducedMotion,
        params,
        onLayout: layout3D,
      });
    } catch (err) {
      console.warn('Niche Hounds hero: 3D scene unavailable, using the illustrated version.', err);
      three = null;
    }
  }
  if (three) {
    shadow.remove();
    hero.classList.add('is-3d', 'is-live');
    return;
  }

  runHound(houndSvg, {
    reducedMotion,
    hold: params.get('dog') || undefined,
    idleScale: Number(params.get('idle')) || 1,
  });

  let lastW = 0;
  let lastH = 0;

  function layout(force) {
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    if (!W || !H || (!force && W === lastW && H === lastH)) return;
    lastW = W;
    lastH = H;
    const mobile = W < 720;

    // A small sphere seen from just above its surface. The horizon rises to a
    // crest right of centre and runs behind the hound, as in the sketch. The
    // radius follows the width, so a phone sees a narrower slice of it.
    const R = 2.6 * Math.max(W, 900);
    const cx = W * (mobile ? 0.62 : 0.68);
    const crest = H * (mobile ? 0.76 : 0.7);
    const cy = crest + R;
    const surfaceY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));

    // The hound stands on the near ground, in front of the horizon.
    // Rig units -> px: 505 rig units is nose-to-paw standing height.
    const dogH = mobile ? Math.min(W * 0.56, H * 0.3) : Math.min(H * 0.37, W * 0.3);
    const k = dogH / 505;
    const dogX = mobile ? W * 0.42 : Math.max(W * 0.25, 300 * k + 24);
    const ground = Math.min(surfaceY(dogX) + dogH * 0.22, H - dogH * 0.06);
    Object.assign(houndSvg.style, {
      left: `${dogX - (376 - 90) * k}px`,
      top: `${ground - (625 - 100) * k}px`,
      width: `${600 * k}px`,
      height: `${545 * k}px`,
    });

    layoutSky(W, H, mobile);

    drawStars(W, H, surfaceY);
    paintMoon({ W, H, cx, cy, R }, [dogX - 330 * k, dogX + 330 * k]);
  }

  // Sky layout and a stand-in 2D moon while the 3D ground renders.
  function layout3D({ W, H, horizonY, mobile }) {
    layoutSky(W, H, mobile);
    drawStars(W, H, horizonY);
    const crestX = W * (mobile ? 0.62 : 0.68);
    const crestY = horizonY(crestX);
    const sag = Math.max(1, horizonY(0) - crestY);
    const R = (crestX * crestX + sag * sag) / (2 * sag);
    paintMoon({ W, H, cx: crestX, cy: crestY + R, R }, null);
  }

  function layoutSky(W, H, mobile) {
    const heroTop = hero.getBoundingClientRect().top;
    const textTop = hero.querySelector('.hero-copy h1').getBoundingClientRect().top - heroTop;
    const textBottom = hero.querySelector('.hero-sub').getBoundingClientRect().bottom - heroTop;
    const copyMid = (textTop + textBottom) / 2;
    const D = mobile ? Math.min(W * 0.74, H * 0.4) : Math.max(150, Math.min(W * 0.15, H * 0.3, 280));
    const ex = mobile ? W * 0.72 : W * 0.755;
    const ey = mobile ? H * 0.31 : copyMid;
    Object.assign(earth.style, { width: `${D}px`, height: `${D}px`, left: `${ex - D / 2}px`, top: `${ey - D / 2}px` });
    const s = mobile ? W * 0.2 : D * 0.62;
    Object.assign(logoStars.style, {
      width: `${s}px`,
      left: mobile ? `${W * 0.07}px` : `${ex - D / 2 - s * 0.95}px`,
      top: mobile ? `${H * 0.53}px` : `${Math.max(64, ey - D / 2 - s * 0.55)}px`,
    });
  }

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
