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
    // On inner pages it sits lower, leaving the sky for content. A phone sees a
    // narrower slice of the same curve.
    const R = 2.6 * Math.max(W, 900);
    const cx = W * (mobile ? 0.62 : 0.68);
    const crest = H * (home ? (mobile ? 0.76 : 0.7) : (mobile ? 0.88 : 0.84));
    const cy = crest + R;
    const surfaceY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));

    let clear = null;
    let shadow = null;
    if (home && hound) {
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
      clear = [dogX - 330 * k, dogX + 330 * k];
      shadow = { x: dogX - 40 * k, y: ground - 4 * k, rx: 290 * k };
    }

    // Earth: beside the tagline on the home page, up and to the right on inner
    // pages, and behind the words on a phone.
    let D, ex, ey;
    if (home) {
      const copy = document.querySelector('.hero-copy');
      const box = copy ? copy.getBoundingClientRect() : { top: H * 0.2, bottom: H * 0.45 };
      D = mobile ? Math.min(W * 0.86, H * 0.46) : Math.max(200, Math.min(W * 0.26, H * 0.48, 440));
      ex = mobile ? W * 0.74 : W * 0.74;
      ey = mobile ? H * 0.3 : Math.max(D / 2 + 70, (box.top + box.bottom) / 2);
    } else {
      D = mobile ? Math.min(W * 0.7, H * 0.36) : Math.max(180, Math.min(W * 0.22, H * 0.36, 360));
      ex = mobile ? W * 0.8 : W * 0.78;
      ey = mobile ? H * 0.2 : Math.max(D / 2 + 80, H * 0.3);
    }
    Object.assign(earth.style, { width: `${D}px`, height: `${D}px`, left: `${ex - D / 2}px`, top: `${ey - D / 2}px` });

    drawStars(W, H, surfaceY);
    drawMoon(moonSvg, { W, H, cx, cy, R }, clear, shadow);
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
