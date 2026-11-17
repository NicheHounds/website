/**
 * Lets a visitor turn the Earth by hand.
 *
 *   Mouse or trackpad: press on the Earth and drag. The cursor shows a hand
 *   over the Earth.
 *   Touch: press and hold on the Earth for a moment, then drag. A quick swipe
 *   still scrolls the page, so the Earth never traps a thumb.
 *
 * North stays up. Let go mid-drag and the Earth coasts to a stop (unless the
 * visitor asks for reduced motion). It stays where it was left until the page
 * reloads; day and night keep updating on the new view.
 *
 * The background sits behind the page and takes no pointer events, so this
 * listens on the document and asks two questions about each press: is it on
 * the Earth's disk, and is anything the visitor might want to use or read in
 * the way? Links, buttons, the header, cards and the words themselves win;
 * empty space over the Earth does not.
 */
const HOLD_MS = 220;          // touch: how long to hold before the Earth takes the drag
const SLOP = 10;              // touch: how far a finger may wander during the hold, px
const FRICTION_MS = 450;      // coasting speed halves roughly every 0.3 s
const MIN_SPEED = 0.004;      // deg/ms; slower than this, coasting stops
const DEG = 180 / Math.PI;

const IN_THE_WAY = 'a, button, input, select, textarea, label, summary, [contenteditable], [tabindex], .site-header, .panel';
const WORDS = 'h1, h2, h3, h4, p, li, dt, dd, blockquote, figcaption';

/** True when the point lands on the text or inline boxes of el, not the empty part of its block. */
function onWords(el, x, y) {
  const range = document.createRange();
  range.selectNodeContents(el);
  for (const r of range.getClientRects()) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

export function makeSpinnable(globe) {
  const root = document.documentElement;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  const free = (x, y, target) => {
    if (!globe.contains(x, y)) return false;
    if (!(target instanceof Element)) return true;
    if (target.closest(IN_THE_WAY)) return false;
    const words = target.closest(WORDS);
    return !(words && onWords(words, x, y));
  };

  /* ---------- turning ---------- */

  let drag = null;            // { x, y, t, vLat, vLon }
  let coast = 0;

  function begin(x, y) {
    cancelAnimationFrame(coast);
    coast = 0;
    drag = { x, y, t: performance.now(), vLat: 0, vLon: 0 };
    root.classList.add('earth-spinning');
  }

  // The point under the pointer follows it across the middle of the disk.
  function step(x, y) {
    if (!drag) return;
    const r = globe.radius() || 1;
    const now = performance.now();
    const dt = Math.max(1, now - drag.t);
    const dLat = ((y - drag.y) / r) * DEG;
    const dLon = (-(x - drag.x) / r) * DEG;
    const v = globe.view();
    globe.setView(v.lat + dLat, v.lon + dLon, true);
    // Smoothed velocity, for the coast after letting go.
    const k = Math.min(1, dt / 50);
    drag.vLat += (dLat / dt - drag.vLat) * k;
    drag.vLon += (dLon / dt - drag.vLon) * k;
    drag.x = x;
    drag.y = y;
    drag.t = now;
  }

  function end() {
    if (!drag) return;
    const { t } = drag;
    let { vLat, vLon } = drag;
    drag = null;
    root.classList.remove('earth-spinning');
    // A pause before letting go means the visitor meant to stop there.
    const still = performance.now() - t > 80;
    if (calm.matches || still || Math.hypot(vLat, vLon) < MIN_SPEED) {
      globe.settle();
      return;
    }
    let last = performance.now();
    const glide = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      const decay = Math.exp(-dt / FRICTION_MS);
      vLat *= decay;
      vLon *= decay;
      const v = globe.view();
      globe.setView(v.lat + vLat * dt, v.lon + vLon * dt, true);
      if (Math.hypot(vLat, vLon) < MIN_SPEED) {
        coast = 0;
        globe.settle();
      } else {
        coast = requestAnimationFrame(glide);
      }
    };
    coast = requestAnimationFrame(glide);
  }

  /* ---------- mouse and trackpad ---------- */

  let hoverQueued = false;
  let lastMove = null;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || drag) return;
    lastMove = e;
    if (hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      root.classList.toggle('earth-grab', free(lastMove.clientX, lastMove.clientY, lastMove.target));
    });
  }, { passive: true });

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !free(e.clientX, e.clientY, e.target)) return;
    e.preventDefault();       // no text selection while dragging
    begin(e.clientX, e.clientY);
    const move = (ev) => step(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  /* ---------- touch: hold, then drag ---------- */

  // Touch events rather than pointer events: only a touchmove listener can
  // stop the page scrolling once a hold has turned into a turn.
  let hold = null;            // { id, x, y, timer, armed }
  const find = (list, id) => {
    for (const t of list) if (t.identifier === id) return t;
    return null;
  };
  const release = () => {
    if (!hold) return;
    clearTimeout(hold.timer);
    if (hold.armed) end();
    hold = null;
  };

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) {
      release();
      return;
    }
    const t = e.touches[0];
    if (!free(t.clientX, t.clientY, e.target)) return;
    const h = { id: t.identifier, x: t.clientX, y: t.clientY, armed: false };
    h.timer = setTimeout(() => {
      h.armed = true;
      begin(h.x, h.y);
      navigator.vibrate?.(8);
    }, HOLD_MS);
    hold = h;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!hold) return;
    const t = find(e.changedTouches, hold.id);
    if (!t) return;
    if (!hold.armed) {
      // Moved before the hold finished: it's a scroll, let the page have it.
      if (Math.hypot(t.clientX - hold.x, t.clientY - hold.y) > SLOP) release();
      return;
    }
    if (e.cancelable) e.preventDefault();
    step(t.clientX, t.clientY);
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (hold && find(e.changedTouches, hold.id)) release();
  }, { passive: true });
  document.addEventListener('touchcancel', release, { passive: true });

  // While a hold or drag is live, iOS shouldn't start a text selection or callout.
  document.addEventListener('contextmenu', (e) => {
    if (hold?.armed || drag) e.preventDefault();
  });
}
