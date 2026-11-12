/**
 * Earth as an astronaut on the Moon would see it: the live day/night
 * terminator, city lights on the night side, sunlit clouds, a faint sun glint
 * on the ocean and a thin blue limb. Drawn per pixel into a <canvas>, in an
 * orthographic view centered on the visitor (from the time zone), north up.
 * No dependencies, no network beyond three same-origin textures:
 *
 *   day.jpg     NASA Blue Marble: Next Generation, September 2004, with
 *               topography and shallow water (public domain)
 *   night.jpg   NASA Earth Observatory / Suomi NPP VIIRS "Earth at Night"
 *               2012, reduced to the city lights alone (public domain)
 *   clouds.jpg  Tom Patterson's fair-weather cloud map, shadedrelief.com,
 *               built from NASA Blue Marble clouds (public domain)
 *
 * All three are 2048x1024 equirectangular, -180..180 deg from the left edge.
 *
 * The canvas must get its size from CSS; the backing store follows it at
 * devicePixelRatio (max 2).
 */
import { sunPosition, browserLocation, now } from './astro.js';

const RAD = Math.PI / 180;
const FRAME = 0.075;          // margin around the disk, as a fraction of its radius
const GLOW = 0.04;            // how far the limb glow is drawn past the disk
const REFRESH_MS = 60000;
const RESIZE_DEBOUNCE_MS = 120;
const STRIDE = 6;             // bytes per sample: day rgb, city lights, cloud, ocean
const BAYER = [-0.375, 0.125, 0.375, -0.125];

// Lighting is done in a gamma-2 "linear" space: square going in, sqrt going out.
const LIN = Float32Array.from({ length: 256 }, (_, i) => (i / 255) ** 2);
const EXPOSURE = 1.35;
const CLOUD_ALBEDO = 0.78;
const LIGHTS_GAIN = 1.4;
const LIGHTS_TINT = [1, 0.72, 0.42];          // sodium and LED, seen from orbit
const NIGHT_AMBIENT = [0.0007, 0.0010, 0.0018];   // a hint of moonlight on the night side
const RAYLEIGH = [0.18, 0.42, 1.0];           // in-scattered sky light
const SUNSET = [1.0, 0.52, 0.26];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------------ */
/* Lookup tables, built once                                                 */
/* ------------------------------------------------------------------------ */

const MU_N = 2048;            // cos(solar zenith) in [-1, 1]
const muIndex = (mu) => ((mu + 1) * ((MU_N - 1) / 2) + 0.5) | 0;

/**
 * Everything that depends only on the local sun elevation, per channel:
 *   SUN    direct sunlight after the air mass (reddens toward the terminator)
 *   GROUND light on the surface: direct, plus skylight, plus twilight
 *   CLOUD  light on cloud tops, which see the sun a little longer
 *   AIR    light scattered by the atmosphere toward the viewer
 *   LIGHTS how much of the city lights show (only once the sun is down)
 */
const TABLES = (() => {
  const SUN = new Float32Array(MU_N * 3);
  const GROUND = new Float32Array(MU_N * 3);
  const CLOUD = new Float32Array(MU_N * 3);
  const AIR = new Float32Array(MU_N * 3);
  const LIGHTS = new Float32Array(MU_N);
  const K = [0.004, 0.012, 0.035];            // relative extinction per air mass, r g b
  // Irradiance with a soft shoulder: an exposure set for the bright side
  // keeps most of the disk lit, then drops off fast near the terminator.
  const shoulder = (m) => (1 - Math.exp(-m / 0.16)) / (1 - Math.exp(-1 / 0.16));
  const direct = (m, c) => (m <= 0 ? 0 : shoulder(m) * Math.exp(-K[c] * (1 / (m + 0.012) - 1 / 1.012)));
  for (let i = 0; i < MU_N; i++) {
    const m = (i / (MU_N - 1)) * 2 - 1;
    const sky = 0.035 * smooth(-0.06, 0.5, m);
    const dusk = 0.008 * smooth(-0.07, -0.005, m) * (1 - smooth(-0.005, 0.1, m));
    const warm = Math.exp(-(((m - 0.01) / 0.09) ** 2));
    const air = smooth(-0.09, 0.3, m);
    for (let c = 0; c < 3; c++) {
      SUN[i * 3 + c] = m > 0 ? direct(m, c) / m : 0;
      GROUND[i * 3 + c] = direct(m, c) + sky * RAYLEIGH[c] + dusk * SUNSET[c];
      const mc = m + 0.018;
      CLOUD[i * 3 + c] = direct(mc, c) + 0.6 * sky * RAYLEIGH[c] + 1.5 * dusk * SUNSET[c];
      AIR[i * 3 + c] = air * (RAYLEIGH[c] * (1 - 0.6 * warm) + SUNSET[c] * 0.45 * warm);
    }
    LIGHTS[i] = 1 - smooth(-0.07, 0.04, m);
  }
  return { SUN, GROUND, CLOUD, AIR, LIGHTS };
})();

/** Share of the view filled by sunlit air, by z = cos(view angle): 0.05 at center, ~0.6 at the limb. */
const Z_N = 1024;
const HAZE = Float32Array.from({ length: Z_N + 1 }, (_, i) => {
  const z = i / Z_N;
  return 0.05 + 0.95 * (1 - Math.exp(-0.045 * (1 / (z + 0.05) - 1 / 1.05)));
});

/** Cloud map value -> opacity. Thin cirrus stays translucent, thick decks go opaque. */
const CLOUD_ALPHA = Float32Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return clamp01(1.12 * v ** 1.15);
});

/* ------------------------------------------------------------------------ */
/* Textures                                                                  */
/* ------------------------------------------------------------------------ */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Pack the three maps into one interleaved texture at the day map's resolution. */
async function loadTextures(base) {
  const [day, night, clouds] = await Promise.all(
    ['day', 'night', 'clouds'].map((name) => loadImage(`${base}${name}.jpg`)),
  );
  const W = day.naturalWidth;
  const H = day.naturalHeight;
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = H;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  const read = (img) => {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  };
  const d = read(day);
  const n = read(night);
  const c = read(clouds);

  const tex = new Uint8Array(W * H * STRIDE);
  for (let p = 0, i = 0, o = 0; p < W * H; p++, i += 4, o += STRIDE) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    tex[o] = r;
    tex[o + 1] = g;
    tex[o + 2] = b;
    tex[o + 3] = n[i];
    tex[o + 4] = c[i];
    // Open water in Blue Marble NG is a deep, uniform navy; shallows are teal.
    tex[o + 5] = 255 * clamp01((b - (r > g ? r : g) - 4) / 10);
  }
  return { W, H, tex };
}

/** One flat texel: a dark blue planet with no lights or clouds, used if loading fails. */
const FALLBACK = { W: 1, H: 1, tex: Uint8Array.from([8, 22, 52, 0, 0, 255]) };

/**
 * Sample the texture for every pixel of the disk (plus a 1px rim for the
 * anti-aliased edge). Depends only on size and view center, so it is cached
 * and reused for the once-a-minute relight. The view is mirror-symmetric about
 * the central meridian, so each projection solve serves two pixels.
 */
function sampleDisk(T, cw, ch, R, lat0, lon0) {
  const { W, H, tex } = T;
  const out = new Uint8Array(cw * ch * STRIDE);
  const cx = cw / 2;
  const cy = ch / 2;
  const sinL = Math.sin(lat0 * RAD);
  const cosL = Math.cos(lat0 * RAD);
  const invR = 1 / R;
  const reach = R + 1;
  const lim2 = (reach * invR) ** 2;
  const x0 = Math.max(0, Math.floor(cx - reach));
  const xMid = Math.ceil(cx);
  const y0 = Math.max(0, Math.floor(cy - reach));
  const y1 = Math.min(ch, Math.ceil(cy + reach));
  const lonScale = W / (2 * Math.PI);
  const latScale = H / Math.PI;
  const centerTx = ((lon0 + 180) / 360) * W - 0.5;

  // Bilinear fetch of all channels, wrapping across the dateline.
  const fetch = (tx, ty, o) => {
    tx -= Math.floor(tx / W) * W;
    if (tx >= W) tx -= W;
    const ix = tx | 0;
    const iy = ty | 0;
    const wx = ((tx - ix) * 256) | 0;
    const wy = ((ty - iy) * 256) | 0;
    const ix1 = ix + 1 === W ? 0 : ix + 1;
    const iy1 = iy + 1 < H ? iy + 1 : iy;
    const a = (iy * W + ix) * STRIDE;
    const b = (iy * W + ix1) * STRIDE;
    const c = (iy1 * W + ix) * STRIDE;
    const d = (iy1 * W + ix1) * STRIDE;
    const wa = (256 - wx) * (256 - wy);
    const wb = wx * (256 - wy);
    const wc = (256 - wx) * wy;
    const wd = wx * wy;
    for (let k = 0; k < STRIDE; k++) {
      out[o + k] = (tex[a + k] * wa + tex[b + k] * wb + tex[c + k] * wc + tex[d + k] * wd + 32768) >> 16;
    }
  };

  for (let y = y0; y < y1; y++) {
    const v = (cy - y - 0.5) * invR;
    for (let x = x0; x < xMid; x++) {
      let u = (x + 0.5 - cx) * invR;
      let w = v;
      const r2 = u * u + w * w;
      if (r2 > lim2) continue;
      let z = 0;
      if (r2 >= 1) {
        const k = 1 / Math.sqrt(r2);
        u *= k;
        w *= k;
      } else {
        z = Math.sqrt(1 - r2);
      }
      // Inverse orthographic projection, relative to the view center.
      const sinLat = z * sinL + w * cosL;
      const lat = Math.asin(sinLat > 1 ? 1 : sinLat < -1 ? -1 : sinLat);
      const dTx = Math.atan2(u, z * cosL - w * sinL) * lonScale;
      let ty = (Math.PI / 2 - lat) * latScale - 0.5;
      if (ty < 0) ty = 0;
      else if (ty > H - 1) ty = H - 1;

      fetch(centerTx + dTx, ty, (y * cw + x) * STRIDE);
      const xm = cw - 1 - x;
      if (xm !== x) fetch(centerTx - dTx, ty, (y * cw + xm) * STRIDE);
    }
  }
  return out;
}

/** Light the cached samples for the current sun and write RGBA pixels. */
function shade(px, S, cw, ch, cx, cy, R, lat0, lon0, sun) {
  px.fill(0);
  const { SUN, GROUND, CLOUD, AIR, LIGHTS } = TABLES;
  const la0 = lat0 * RAD;
  const sl = sun.lat * RAD;
  const dl = (sun.lon - lon0) * RAD;
  // Sun direction in view space (x right, y up, z toward the viewer).
  const sx = Math.cos(sl) * Math.sin(dl);
  const sy = Math.cos(la0) * Math.sin(sl) - Math.sin(la0) * Math.cos(sl) * Math.cos(dl);
  const sz = Math.sin(la0) * Math.sin(sl) + Math.cos(la0) * Math.cos(sl) * Math.cos(dl);
  // Half vector between sun and viewer, for the sun glint.
  const hl = Math.hypot(sx, sy, sz + 1) || 1;
  const hx = sx / hl, hy = sy / hl, hz = (sz + 1) / hl;

  const invR = 1 / R;
  const outer = R * (1 + GLOW);
  const x0 = Math.max(0, Math.floor(cx - outer));
  const x1 = Math.min(cw, Math.ceil(cx + outer));
  const y0 = Math.max(0, Math.floor(cy - outer));
  const y1 = Math.min(ch, Math.ceil(cy + outer));

  for (let y = y0; y < y1; y++) {
    const v = (cy - y - 0.5) * invR;
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - cx) * invR;
      const r2 = u * u + v * v;
      const rn = Math.sqrt(r2);
      const rp = rn * R;
      if (rp >= outer) continue;

      const cover = clamp01(R + 0.5 - rp);
      let red = 0, grn = 0, blu = 0;

      if (cover > 0) {
        let nu = u, nv = v, z = 0;
        if (r2 >= 1) {
          nu /= rn;
          nv /= rn;
        } else {
          z = Math.sqrt(1 - r2);
        }
        const mu = nu * sx + nv * sy + z * sz;           // cos(solar zenith)
        const k = muIndex(mu);
        const k3 = k * 3;
        const o = (y * cw + x) * STRIDE;
        const alpha = CLOUD_ALPHA[S[o + 4]];
        const clear = 1 - alpha;
        const ocean = S[o + 5] / 255;

        // Surface, lit by reddened sunlight plus a little skylight.
        const ar = LIN[S[o]], ag = LIN[S[o + 1]], ab = LIN[S[o + 2]];
        red = ar * (GROUND[k3] * EXPOSURE + NIGHT_AMBIENT[0]);
        grn = ag * (GROUND[k3 + 1] * EXPOSURE + NIGHT_AMBIENT[1]);
        blu = ab * (GROUND[k3 + 2] * EXPOSURE + NIGHT_AMBIENT[2]);

        // Sun glint on open water: a tight core in a broad, faint sheen.
        if (mu > 0 && ocean > 0 && clear > 0) {
          const nh = nu * hx + nv * hy + z * hz;
          if (nh > 0.8) {
            const p2 = nh * nh, p4 = p2 * p2, p8 = p4 * p4, p16 = p8 * p8, p32 = p16 * p16;
            const p64 = p32 * p32, p128 = p64 * p64, p256 = p128 * p128;
            const g = (0.006 * p32 + 0.08 * p256 * p256) * mu * ocean * clear * EXPOSURE;
            red += g * SUN[k3];
            grn += g * SUN[k3 + 1];
            blu += g * SUN[k3 + 2];
          }
        }

        // Clouds: opaque white tops in sunlight, faint grey by moonlight.
        if (alpha > 0) {
          const cl = CLOUD_ALBEDO * EXPOSURE;
          red = red * clear + alpha * (CLOUD[k3] * cl + NIGHT_AMBIENT[0] * 0.6);
          grn = grn * clear + alpha * (CLOUD[k3 + 1] * cl + NIGHT_AMBIENT[1] * 0.6);
          blu = blu * clear + alpha * (CLOUD[k3 + 2] * cl + NIGHT_AMBIENT[2] * 0.6);
        }

        // City lights, once the sun is down, dimmed under cloud.
        const lv = LIGHTS[k];
        if (lv > 0) {
          const l = LIN[S[o + 3]] * lv * (1 - 0.85 * alpha) * LIGHTS_GAIN;
          red += l * LIGHTS_TINT[0];
          grn += l * LIGHTS_TINT[1];
          blu += l * LIGHTS_TINT[2];
        }

        // Air between the ground and the Moon: dims and blues the view,
        // thickest toward the limb and only where the air is sunlit.
        const h = HAZE[(z * Z_N) | 0];
        const keep = 1 - 0.75 * h;
        const add = h * 0.32 * EXPOSURE;
        red = red * keep + AIR[k3] * add;
        grn = grn * keep + AIR[k3 + 1] * add;
        blu = blu * keep + AIR[k3 + 2] * add;

        red = Math.sqrt(red > 1 ? 1 : red) * 255;
        grn = Math.sqrt(grn > 1 ? 1 : grn) * 255;
        blu = Math.sqrt(blu > 1 ? 1 : blu) * 255;
      }

      // The atmosphere seen edge-on past the disk: a thin band, bright where sunlit.
      let gA = 0, gr = 0, gg = 0, gb = 0;
      if (cover < 1) {
        const lift = (rp - R) * invR;
        const muLimb = rn > 0 ? (u * sx + v * sy) / rn : 0;
        const k3 = muIndex(muLimb) * 3;
        const fall = Math.exp(-(lift > 0 ? lift : 0) / 0.0065);
        const ar = AIR[k3], ag = AIR[k3 + 1], ab = AIR[k3 + 2];
        const lum = ab > ar ? ab : ar;
        gA = fall * clamp01(lum * 0.95);
        if (gA > 0) {
          const inv = 1 / (lum || 1);
          gr = Math.sqrt(ar * inv) * 235;
          gg = Math.sqrt(ag * inv) * 235;
          gb = Math.sqrt(ab * inv) * 255;
        }
      }

      const alpha = cover + gA * (1 - cover);
      if (alpha <= 0.002) continue;
      const kk = (1 - cover) * gA;
      const i = (y * cw + x) * 4;
      const dither = BAYER[(x & 1) | ((y & 1) << 1)];   // hides banding in dark gradients
      px[i] = (red * cover + gr * kk) / alpha + dither;
      px[i + 1] = (grn * cover + gg * kk) / alpha + dither;
      px[i + 2] = (blu * cover + gb * kk) / alpha + dither;
      px[i + 3] = alpha * 255;
    }
  }
}

/**
 * Mount the globe on a canvas.
 * opts.textureBase  URL prefix for day.jpg, night.jpg, clouds.jpg (trailing slash)
 * opts.lat, opts.lon  optional view center; defaults to browserLocation()
 * opts.onRender      optional callback({ ms, width, height, resampled }) after each draw
 */
export function mountEarth(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Earth, showing day and night right now');
  if (!ctx) return { destroy() {} };

  const base = opts.textureBase ?? '/assets/img/earth/';
  const here = browserLocation(now());
  const lat0 = Number.isFinite(opts.lat) ? opts.lat : here.lat;
  const lon0 = Number.isFinite(opts.lon) ? opts.lon : here.lon;

  let texture = null;
  let cache = null;      // { key, samples, image }
  let cssW = 0, cssH = 0;
  let resizeTimer = 0;
  let destroyed = false;

  function render() {
    if (destroyed || !texture || cssW < 1 || cssH < 1) return;
    const t0 = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(cssW * dpr));
    const ch = Math.max(1, Math.round(cssH * dpr));
    const R = (Math.min(cw, ch) / 2) / (1 + FRAME) - 1;
    if (R < 2) return;
    const cx = cw / 2, cy = ch / 2;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const key = `${cw}x${ch}`;
    const resampled = !cache || cache.key !== key;
    if (resampled) {
      cache = {
        key,
        samples: sampleDisk(texture, cw, ch, R, lat0, lon0),
        image: ctx.createImageData(cw, ch),
      };
    }
    shade(cache.image.data, cache.samples, cw, ch, cx, cy, R, lat0, lon0, sunPosition(now()));
    ctx.putImageData(cache.image, 0, 0);
    opts.onRender?.({ ms: performance.now() - t0, width: cw, height: ch, resampled });
  }

  const observer = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1].contentRect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // A canvas without a CSS size reports its own backing size; ignore that
    // echo so the canvas does not keep doubling at high DPR.
    if (dpr !== 1 && box.width === canvas.width && box.height === canvas.height && cssW) return;
    const first = cssW === 0;
    cssW = box.width;
    cssH = box.height;
    clearTimeout(resizeTimer);
    if (first) render();
    else resizeTimer = setTimeout(render, RESIZE_DEBOUNCE_MS);
  });
  observer.observe(canvas);

  const tick = setInterval(() => {
    if (!document.hidden) render();
  }, REFRESH_MS);
  const onVisible = () => {
    if (!document.hidden) render();
  };
  document.addEventListener('visibilitychange', onVisible);

  loadTextures(base)
    .catch(() => FALLBACK)
    .then((tex) => {
      texture = tex;
      cache = null;
      render();
    });

  return {
    destroy() {
      destroyed = true;
      observer.disconnect();
      clearInterval(tick);
      clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', onVisible);
      cache = null;
      texture = null;
    },
  };
}
