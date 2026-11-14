/**
 * Home hero: the Niche Hounds mark as a scene. Earth is live; the moon and the
 * hound are still. Everything runs in the browser. The only location input is
 * the time zone.
 */
import { mountEarth } from './earth.js';
import { drawMoon } from './moon.js';

const hero = document.querySelector('.hero');
if (hero) start(hero);

function start(hero) {
  const $ = (sel) => hero.querySelector(sel);
  const moonSvg = $('.hero-moon');
  const hound = $('.hero-hound');
  const earth = $('.hero-earth');
  const starSvg = $('.hero-stars');
  const logoStars = $('.hero-logo-stars');

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

    // The top of a small sphere: the horizon rises to a crest right of centre
    // and runs behind the hound. A phone sees a narrower slice of the same curve.
    const R = 2.6 * Math.max(W, 900);
    const cx = W * (mobile ? 0.62 : 0.68);
    const crest = H * (mobile ? 0.76 : 0.7);
    const cy = crest + R;
    const surfaceY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));

    // The hound stands on the near ground, in front of the horizon.
    // The image is 600 x 545 units; nose-to-paw height is 505 units.
    const dogH = mobile ? Math.min(W * 0.56, H * 0.3) : Math.min(H * 0.37, W * 0.3);
    const k = dogH / 505;
    const dogX = mobile ? W * 0.42 : Math.max(W * 0.25, 300 * k + 24);
    const ground = Math.min(surfaceY(dogX) + dogH * 0.22, H - dogH * 0.06);
    Object.assign(hound.style, {
      left: `${dogX - (376 - 90) * k}px`,
      top: `${ground - (625 - 100) * k}px`,
      width: `${600 * k}px`,
      height: `${545 * k}px`,
    });

    // Earth: beside the tagline on desktop, behind it on a phone.
    const heroTop = hero.getBoundingClientRect().top;
    const textTop = $('.hero-copy h1').getBoundingClientRect().top - heroTop;
    const textBottom = $('.hero-sub').getBoundingClientRect().bottom - heroTop;
    const D = mobile ? Math.min(W * 0.74, H * 0.4) : Math.max(150, Math.min(W * 0.15, H * 0.3, 280));
    const ex = mobile ? W * 0.72 : W * 0.755;
    const ey = mobile ? H * 0.31 : (textTop + textBottom) / 2;
    Object.assign(earth.style, { width: `${D}px`, height: `${D}px`, left: `${ex - D / 2}px`, top: `${ey - D / 2}px` });

    // The mark's two stars, up and to the left of Earth as in the logo.
    const s = mobile ? W * 0.2 : D * 0.62;
    Object.assign(logoStars.style, {
      width: `${s}px`,
      left: mobile ? `${W * 0.07}px` : `${ex - D / 2 - s * 0.95}px`,
      top: mobile ? `${H * 0.53}px` : `${Math.max(64, ey - D / 2 - s * 0.55)}px`,
    });

    drawStars(W, H, surfaceY);
    drawMoon(moonSvg, { W, H, cx, cy, R }, [dogX - 330 * k, dogX + 330 * k], { x: dogX - 40 * k, y: ground - 4 * k, rx: 290 * k });
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
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${a.toFixed(2)}"/>`;
    }
    starSvg.innerHTML = out;
  }

  layout(true);
  new ResizeObserver(() => layout(false)).observe(hero);
  hero.classList.add('is-live');
}
