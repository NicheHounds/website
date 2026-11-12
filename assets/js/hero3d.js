/**
 * The 3D hero: ray-marched regolith, a 3D hound lit by the same sun, and the
 * logo's own hound at the start, which hands over to the 3D one.
 */
import { createScene, makeCamera, project } from './scene3d.js';
import { createBrain } from './dogbrain.js';
import { buildHound, applyPose } from './hound.js';
import { moonPhase, solarAltitude, browserLocation, now } from './astro.js';
import { lightTint } from './moon.js';

const NS = 'http://www.w3.org/2000/svg';
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

export function start3D(hero, { canvas, logoSvg, earthEl, reducedMotion, params, onLayout }) {
  const scene = createScene(canvas);
  if (!scene) return null;
  const still = () => reducedMotion.matches;
  const brain = createBrain({
    reducedMotion,
    hold: params.get('dog') || undefined,
    idleScale: Number(params.get('idle')) || 1,
  });

  // The logo's hound, drawn exactly as in the mark, fitted over the 3D one.
  logoSvg.removeAttribute('viewBox');
  const fit = document.createElementNS(NS, 'g');
  logoSvg.appendChild(fit);
  applyPose(buildHound(fit), {});

  let s = null;         // scene state for the shaders
  let dpr = 1;
  let ground = null;    // {next, strips} while the ground renders
  let groundReady = false;
  let handover = null;  // time the logo starts handing over
  let pointer = null;   // {x, y, t} in CSS px relative to the hero
  let raf = 0;
  let visible = true;
  let lastFrame = 0;
  let slow = 0;

  function light(camera) {
    const t = now();
    const loc = browserLocation();
    const phase = moonPhase(t);
    // Phase sets the sun: low with long shadows near new moon, high near full.
    const elev = (4 + 58 * Math.pow(phase.illumination, 0.8)) * Math.PI / 180;
    const side = phase.waxing !== (loc.lat < 0) ? 1 : -1;
    const az = 35 * Math.PI / 180;
    const sun = norm([side * Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)]);
    // The colour of the light follows the visitor's own time of day.
    const tint = lightTint(solarAltitude(loc.lat, loc.lon, t)).color.map((c) => c / 255);
    const sunColor = tint.map((c) => 0.45 + 0.55 * c / Math.max(...tint));
    // Earth's direction, for earthshine, through the globe's spot on screen.
    const r = earthEl.getBoundingClientRect();
    const h = hero.getBoundingClientRect();
    const ex = (r.left - h.left + r.width / 2) * dpr;
    const ey = (r.top - h.top + r.height / 2) * dpr;
    const earth = norm([(ex - camera.pp[0]) / camera.f, -(ey - camera.pp[1]) / camera.f, -1]);
    const bounce = Math.max(Math.sin(elev), 0.06) * 0.42;
    hero.dataset.moon = `${Math.round(phase.illumination * 100)}% ${phase.waxing ? 'waxing' : 'waning'}`;
    return {
      sun, sunColor, earth,
      shine: 0.02 + 0.05 * (1 - phase.illumination),
      groundColor: [0.44 * bounce, 0.43 * bounce, 0.41 * bounce].map((v, i) => v * sunColor[i]),
    };
  }

  function layout() {
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const Wd = Math.round(W * dpr);
    const Hd = Math.round(H * dpr);
    canvas.width = Wd;
    canvas.height = Hd;
    const mobile = W < 720;
    const camera = makeCamera(Wd, Hd, {
      crest: [mobile ? 0.62 : 0.68, mobile ? 0.76 : 0.7],
      paws: [mobile ? 0.42 : 0.245, 0.865],
      focal: mobile ? 1.25 : 1.6,
      heading: 2,
    });
    // The horizon in CSS px, for the stars and the stand-in 2D moon.
    const dip = Math.acos(camera.R / (camera.R + camera.cam[1]));
    const horizonY = (x) => {
      const phi = Math.atan((x * dpr - camera.pp[0]) / camera.f);
      return (camera.pp[1] + camera.f * Math.tan(dip) / Math.cos(phi)) / dpr;
    };
    onLayout({ W, H, horizonY, mobile });
    s = { camera, ...light(camera), dogAlpha: 0 };

    // fit the logo hound to where the 3D hound's near paws stand
    const P = (p) => project(camera, camera.dogToWorld(p)).map((v) => v / dpr);
    const a3 = P([-0.213, 0, 0.064]);
    const b3 = P([0.163, 0, 0.074]);
    const a2 = [160, 625];
    const b2 = [447, 612];
    const k = Math.hypot(b3[0] - a3[0], b3[1] - a3[1]) / Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
    const ang = (Math.atan2(b3[1] - a3[1], b3[0] - a3[0]) - Math.atan2(b2[1] - a2[1], b2[0] - a2[0])) * 180 / Math.PI;
    logoSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    fit.setAttribute('transform', `translate(${a3[0]} ${a3[1]}) rotate(${ang}) scale(${k}) translate(${-a2[0]} ${-a2[1]})`);

    // the ground renders in strips, a few per frame
    const strips = [];
    const step = 64;
    for (let y = 0; y < Hd; y += step) strips.push([y, Math.min(Hd, y + step)]);
    // only rows at or below the horizon need work
    const top = Math.max(0, Math.floor((Math.min(horizonY(0), horizonY(W)) - 40) * dpr / step) * step);
    ground = { strips: strips.filter(([y0, y1]) => y1 > Math.min(top, camera.pp[1] + 0)), i: 0 };
    groundReady = false;
    canvas.classList.remove('is-ready');
    wake();
  }

  function dogRect() {
    const c = s.camera;
    const pts = [];
    for (const x of [-0.5, 0.55]) for (const y of [0, 0.75]) for (const z of [-0.25, 0.25]) pts.push(c.dogToWorld([x, y, z]));
    // the shadow on the ground, away from the sun
    const L = Math.min(3, 0.65 / Math.max(s.sun[1], 0.08));
    const sh = norm([-s.sun[0], 0, -s.sun[2]]);
    for (const p of pts.slice(0)) pts.push([p[0] + sh[0] * L, c.dog[1], p[2] + sh[2] * L]);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) {
      const q = project(c, p);
      if (q[2] <= 0) continue;
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    const W = c.W, H = c.H;
    x0 = Math.max(0, x0 - 8); y0 = Math.max(0, y0 - 8); x1 = Math.min(W, x1 + 8); y1 = Math.min(H, y1 + 8);
    return [x0 / W * 2 - 1, 1 - y1 / H * 2, x1 / W * 2 - 1, 1 - y0 / H * 2];
  }

  function look() {
    if (!pointer || performance.now() - pointer.t > 8000) return null;
    const c = s.camera;
    const head = project(c, c.dogToWorld([0.33, 0.55, 0])).map((v) => v / dpr);
    return { x: pointer.x - head[0], y: pointer.y - head[1] };
  }

  function tick(t) {
    raf = 0;
    if (!s) return;
    // ground first, a few strips per frame
    if (ground && !groundReady) {
      const t0 = performance.now();
      while (ground.i < ground.strips.length && performance.now() - t0 < 10) {
        scene.renderGround(s, ground.strips[ground.i++]);
      }
      if (ground.i >= ground.strips.length) {
        groundReady = true;
        canvas.classList.add('is-ready');
        hero.classList.add('ground-ready');
        if (!handover) {
          handover = performance.now() + (still() ? 0 : 1400);
          brain.wake();   // the idle clock starts once the hound is on stage
        }
      }
    }
    // the logo hands over to the 3D hound
    let alpha = 0;
    if (handover) {
      const k = still() ? 1 : Math.min(1, Math.max(0, (performance.now() - handover) / 1100));
      alpha = k;
      logoSvg.style.opacity = String(1 - k);
    }
    // keep the frame rate honest on slow machines
    const dt = t - lastFrame;
    const budget = slow > 20 ? 50 : 0;
    if (dt >= budget) {
      lastFrame = t;
      const pose = alpha > 0 ? brain.step(look()) : brain.step(null);
      s.dogAlpha = alpha;
      const f0 = performance.now();
      scene.frame(s);
      if (alpha > 0) scene.drawDog(s, pose, dogRect());
      if (performance.now() - f0 > 30) slow++;
    }
    hero.dataset.pose = brain.state;
    const animating = !groundReady || !still() || (handover && alpha < 1);
    if (visible && animating) raf = requestAnimationFrame(tick);
    else if (visible) setTimeout(wake, 1000);
  }

  function wake() {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  }

  const onPointer = (e) => {
    const h = hero.getBoundingClientRect();
    if (e.pointerType !== 'touch') pointer = { x: e.clientX - h.left, y: e.clientY - h.top, t: performance.now() };
    brain.wake();
    wake();
  };
  const onActive = () => { brain.wake(); wake(); };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  for (const e of ['keydown', 'wheel', 'scroll', 'touchstart']) window.addEventListener(e, onActive, { passive: true });
  new IntersectionObserver((en) => {
    visible = en.some((x) => x.isIntersecting) && !document.hidden;
    wake();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; wake(); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); visible = false; });

  let lastSize = '';
  new ResizeObserver(() => {
    const key = `${hero.clientWidth}x${hero.clientHeight}`;
    if (key !== lastSize) { lastSize = key; layout(); }
  }).observe(hero);
  // the light moves slowly; re-light every few minutes
  setInterval(() => {
    if (document.hidden || !s) return;
    Object.assign(s, light(s.camera));
    ground = { strips: ground.strips, i: 0 };
    groundReady = false;
    wake();
  }, 5 * 60 * 1000);

  return { scene };
}
