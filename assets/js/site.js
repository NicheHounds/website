/**
 * Site chrome: the phone menu, the pinned header's backdrop, which nav link is
 * current, and sections fading in as they scroll into view.
 * Smooth scrolling itself is CSS (scroll-behavior on <html>).
 */
// Smooth scrolling for in-page links, switched on once the page has loaded.
// Turned on any earlier, it stops the browser jumping to the #section in the
// address on arrival (so /team, which redirects to /#team, would land at the
// top). Arriving at a section is instant; clicking a link glides.
const smooth = () => setTimeout(() => document.documentElement.classList.add('smooth-scroll'), 0);
if (document.readyState === 'complete') smooth();
else window.addEventListener('load', smooth, { once: true });

const header = document.querySelector('.site-header');
const toggle = document.querySelector('.nav-toggle');

// Phone menu: the button shows and hides the nav. Choosing a link closes it.
if (header && toggle) {
  const set = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('nav-open', open);
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  header.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', () => set(false)));
}

// The header is clear over the hero and frosted once content scrolls under it.
if (header) {
  const frost = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  frost();
  window.addEventListener('scroll', frost, { passive: true });
}

// On the home page, underline the link for the section being read.
// Sections without a nav link (About) count as Home.
const links = [...document.querySelectorAll('.nav a[data-section]')];
const tracked = links
  .map((a) => document.getElementById(a.dataset.section))
  .filter(Boolean);
if (document.body.classList.contains('is-home') && tracked.length) {
  let ticking = false;
  const mark = () => {
    ticking = false;
    const line = window.innerHeight * 0.4;
    let current = 'top';
    for (const s of tracked) if (s.getBoundingClientRect().top <= line) current = s.id;
    for (const a of links) {
      if (a.dataset.section === current) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };
  mark();
  // Again once loaded: arriving at /#team scrolls the page after this runs.
  window.addEventListener('load', mark, { once: true });
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(mark); }
  }, { passive: true });
}

// Fade sections in as they arrive. Only things below the fold are hidden, so
// nothing on screen ever blinks out, and with reduced motion nothing moves.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!calm && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('.section-head, .section .panel').forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('reveal');
    io.observe(el);
  });
}
