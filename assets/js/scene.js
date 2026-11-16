/**
 * The space background shared by every page: stars, a live Earth, and the
 * lunar surface. The home page also stands the hound on the moon.
 * Everything runs in the browser. The only location input is the time zone.
 */
import { mountEarth } from './earth.js';
import { drawMoon } from './moon.js';

const scene = document.querySelector('.scene');
if (scene) start(scene);

function start(scene) {
  const $ = (sel) => scene.querySelector(sel);
  const home = scene.dataset.scene === 'home';
  const moonSvg = $('.scene-moon');
  const hound = $('.scene-hound');
  const earth = $('.scene-earth');
  const starSvg = $('.scene-stars');

  mountEarth(earth, { textureBase: scene.dataset.textureBase });

  let lastW = 0;
  let lastH = 0;

  function layout(force) {
    const W = scene.clientWidth;
    const H = scene.clientHeight;
    if (!W || !H || (!force && W === lastW && H === lastH)) return;
    lastW = W;
    lastH = H;
    const mobile = W < 720;

    // The top of a small sphere: the horizon rises to a crest right of centre.
    // The crest is the same on every page -- between the old home and inner-page
    // heights -- so the ground does not shift as you navigate. A phone sees a
    // narrower slice of the same curve.
    const R = 2.6 * Math.max(W, 900);
    const cx = W * (mobile ? 0.62 : 0.68);
    const crest = H * (mobile ? 0.82 : 0.77);
    const cy = crest + R;
    const surfaceY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));

    let shadow = null;
    if (home && hound) {
      // The hound stands on the near ground, in front of the horizon.
      // The image is 600 x 545 units; nose-to-paw height is 505 units, and the
      // image top sits 525 units above the paws.
      const full = mobile ? Math.min(W * 0.56, H * 0.3) : Math.min(H * 0.37, W * 0.3);
      // Its ears stay clear of the subhead. On a short, wide window the words
      // reach far enough down to touch them, so there the hound is drawn a
      // little smaller -- never below 70% of its usual size. Measured in page
      // coordinates, since the page may load scrolled down to a section.
      const sub = document.querySelector('.hero-sub');
      const limit = sub ? sub.getBoundingClientRect().bottom + window.scrollY + 24 : -Infinity;
      let dogH = full;
      let k, dogX, ground;
      for (let i = 0; i < 4; i++) {
        k = dogH / 505;
        dogX = mobile ? W * 0.42 : Math.max(W * 0.25, 300 * k + 24);
        ground = Math.min(surfaceY(dogX) + dogH * 0.22, H - dogH * 0.06);
        const fits = ((ground - limit) / 525) * 505;
        if (dogH <= fits + 0.5 || dogH <= full * 0.7) break;
        dogH = Math.max(fits, full * 0.7);
      }
      Object.assign(hound.style, {
        left: `${dogX - (376 - 90) * k}px`,
        top: `${ground - (625 - 100) * k}px`,
        width: `${600 * k}px`,
        height: `${545 * k}px`,
      });
      shadow = { x: dogX - 40 * k, y: ground - 4 * k, rx: 290 * k };
    }

    // Earth: the same sphere in the same place on every page. It depends only on
    // the viewport, never on the page or its content, so it does not move or
    // resize as you navigate. On a phone it sits behind the words.
    const D = mobile ? Math.min(W * 0.56, H * 0.28) : Math.max(200, Math.min(W * 0.26, H * 0.48, 440));
    const ex = mobile ? W - D / 2 - 14 : W * 0.74;
    const ey = mobile ? Math.max(D / 2 + 70, H * 0.17) : Math.max(D / 2 + 70, H * 0.35);
    Object.assign(earth.style, { width: `${D}px`, height: `${D}px`, left: `${ex - D / 2}px`, top: `${ey - D / 2}px` });

    drawStars(W, H, surfaceY);
    drawMoon(moonSvg, { W, H, cx, cy, R }, { src: scene.dataset.moon, shadow });
  }

  function drawStars(W, H, surfaceY) {
    starSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let seed = 7;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const n = Math.round((W * H) / 6500);
    let out = '';
    for (let i = 0; i < n; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = 0.45 + rand() * rand() * 1.3;
      const a = 0.25 + rand() * 0.6;
      if (y > surfaceY(x) - 4) continue;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${a.toFixed(2)}"/>`;
    }
    starSvg.innerHTML = out;
  }

  layout(true);
  new ResizeObserver(() => layout(false)).observe(scene);
  scene.classList.add('is-live');
}
