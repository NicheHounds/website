/**
 * A realistic Earth with the live day/night terminator, drawn per pixel into a
 * <canvas>. Orthographic view centered on the visitor (from the time zone),
 * north up. No dependencies, no network beyond three same-origin textures.
 *
 * The canvas must get its size from CSS; the backing store follows it at
 * devicePixelRatio (max 2).
 */
import { sunPosition, browserLocation, now } from './astro.js';

const RAD = Math.PI / 180;
const HALO = 0.075;           // atmosphere halo width, as a fraction of the radius
const REFRESH_MS = 60000;
const RESIZE_DEBOUNCE_MS = 120;
const STRIDE = 8;             // bytes per sample: day rgb, night rgb, cloud, ocean
const BAYER = [-0.375, 0.125, 0.375, -0.125];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Fractal value noise in [0,1], tileable across the dateline, deterministic. */
function cloudDetail(W, H) {
  const out = new Float32Array(W * H);
  let seed = 0x2f6b9a31;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let amp = 1;
  let total = 0;
  for (let gx = 36; gx <= 576; gx *= 2) {
    const gy = gx / 2 + 1;
    const grid = new Float32Array(gx * gy).map(rand);
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * (gy - 1);
      const iy = fy | 0;
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      const r0 = iy * gx;
      const r1 = r0 + gx;
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * gx;
        const ix = fx | 0;
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const ix1 = ix + 1 === gx ? 0 : ix + 1;
        const top = grid[r0 + ix] + (grid[r0 + ix1] - grid[r0 + ix]) * tx;
        const bot = grid[r1 + ix] + (grid[r1 + ix1] - grid[r1 + ix]) * tx;
        out[y * W + x] += amp * (top + (bot - top) * ty);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/**
 * Red channel of an RGBA map, cross-faded over `band` texels on both sides of
 * the dateline so a map whose edges do not match still wraps without a seam.
 */
function seamless(rgba, W, H, band) {
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = rgba[i * 4];
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let d = 0; d < band; d++) {
      const l = row + d;
      const r = row + W - 1 - d;
      const mean = (out[l] + out[r]) / 2;
      const t = 1 - (d + 0.5) / band;
      out[l] += (mean - out[l]) * t;
      out[r] += (mean - out[r]) * t;
    }
  }
  return out;
}

/**
 * Pack the three equirectangular maps into one interleaved texture at the
 * day map's resolution, with the cloud curve, polar fade and ocean mask baked in.
 */
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

  // The source cloud map is blurry and harsh, with solid bands near the poles.
  // Break it up with fractal detail, threshold it softly, and fade it out at
  // high latitudes.
  const detail = cloudDetail(W, H);
  const cloudAt = seamless(c, W, H, 64);

  const tex = new Uint8Array(W * H * STRIDE);
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(90 - ((y + 0.5) / H) * 180);
    const polar = 1 - smooth(50, 72, lat);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const o = (y * W + x) * STRIDE;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      tex[o] = r;
      tex[o + 1] = g;
      tex[o + 2] = b;
      tex[o + 3] = n[i];
      tex[o + 4] = n[i + 1];
      tex[o + 5] = n[i + 2];
      const q = cloudAt[y * W + x] / 255 + (detail[y * W + x] - 0.5) * 1.1;
      tex[o + 6] = 255 * 0.75 * smooth(0.55, 1.05, q) * polar;
      tex[o + 7] = 255 * clamp01((b - 1.25 * Math.max(r, g) - 8) / 28);
    }
  }
  return { W, H, tex };
}

/** One flat texel: a blue planet with no lights or clouds, used if loading fails. */
const FALLBACK = { W: 1, H: 1, tex: Uint8Array.from([28, 78, 150, 4, 10, 34, 0, 255]) };

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

  // Bilinear fetch of all eight channels, wrapping across the dateline.
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
  const la0 = lat0 * RAD;
  const sl = sun.lat * RAD;
  const dl = (sun.lon - lon0) * RAD;
  // Sun direction in view space (x right, y up, z toward the viewer).
  const sx = Math.cos(sl) * Math.sin(dl);
  const sy = Math.cos(la0) * Math.sin(sl) - Math.sin(la0) * Math.cos(sl) * Math.cos(dl);
  const sz = Math.sin(la0) * Math.sin(sl) + Math.cos(la0) * Math.cos(sl) * Math.cos(dl);
  // Half vector between sun and viewer, for the ocean glint.
  const hl = Math.hypot(sx, sy, sz + 1) || 1;
  const hx = sx / hl, hy = sy / hl, hz = (sz + 1) / hl;

  const invR = 1 / R;
  const halo = R * HALO;
  const outer = R + halo;
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
        const day = smooth(-0.09, 0.04, mu);             // ~7.5 deg twilight band
        const o = (y * cw + x) * STRIDE;
        const cloud = S[o + 6] / 255;
        const ocean = S[o + 7] / 255;

        // Day side: softened Lambert so the subsolar point does not blow out.
        const lit = mu > 0 ? 0.14 + mu * (1.7 - 0.72 * mu) : 0.14;
        const cloudLum = 238 * lit;
        let dr = S[o] * lit * 1.08, dg = S[o + 1] * lit * 1.05, db = S[o + 2] * lit;
        dr += (cloudLum - dr) * cloud;
        dg += (cloudLum - dg) * cloud;
        db += (cloudLum * 1.02 - db) * cloud;

        // Ocean glint.
        const nh = nu * hx + nv * hy + z * hz;
        if (nh > 0.75 && ocean > 0) {
          const p2 = nh * nh, p4 = p2 * p2, p8 = p4 * p4, p16 = p8 * p8;
          const g = p16 * p16 * p2 * ocean * (1 - cloud) * 90;
          dr += g;
          dg += g * 0.96;
          db += g * 0.88;
        }

        // Night side: dim Black Marble base, warm city lights under thin cloud.
        const veil = 1 - cloud * 0.75;
        const lights = Math.max(0, S[o + 3] - 22) * veil * (1 - day) * 1.5;
        let nr = S[o + 3] * 0.35 * veil + lights * 1.0 + cloud * 16;
        let ng = S[o + 4] * 0.38 * veil + lights * 0.8 + cloud * 19;
        let nb = S[o + 5] * 0.5 * veil + lights * 0.5 + cloud * 28;

        red = nr + (dr - nr) * day;
        grn = ng + (dg - ng) * day;
        blu = nb + (db - nb) * day;

        // Warm, slightly dimmed twilight.
        const tw = 4 * day * (1 - day);
        red *= 1 + 0.06 * tw;
        grn *= 1 - 0.05 * tw;
        blu *= 1 - 0.12 * tw;

        // Limb darkening, then blue atmospheric haze on the lit limb.
        const limb = 0.72 + 0.28 * z;
        const edge = 1 - z;
        const haze = edge * edge * (0.25 + 0.75 * edge) * 0.85 * smooth(-0.25, 0.35, mu);
        red = red * limb * (1 - haze) + 95 * haze;
        grn = grn * limb * (1 - haze) + 155 * haze;
        blu = blu * limb * (1 - haze) + 255 * haze;
      }

      // Halo outside the disk, brighter over the day side.
      let gA = 0;
      if (cover < 1) {
        const t = clamp01((rp - R) / halo);
        const f = 1 - t;
        const lit = smooth(-0.35, 0.4, (u * sx + v * sy) / (rn || 1));
        gA = f * f * f * (0.08 + 0.5 * lit);
      }

      const alpha = cover + gA * (1 - cover);
      if (alpha <= 0) continue;
      const k = (1 - cover) * gA;
      const i = (y * cw + x) * 4;
      const dither = BAYER[(x & 1) | ((y & 1) << 1)];   // hides banding in dark gradients
      px[i] = (red * cover + 110 * k) / alpha + dither;
      px[i + 1] = (grn * cover + 170 * k) / alpha + dither;
      px[i + 2] = (blu * cover + 255 * k) / alpha + dither;
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
    const R = (Math.min(cw, ch) / 2) / (1 + HALO) - 1;
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
