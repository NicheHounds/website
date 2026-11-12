import { browserLocation, locationFromTimezone, moonPhase, solarView, sunPosition } from "./astro.js";

/*
 * Earth textures, self-hosted, no runtime third-party requests.
 * Day: NASA Visible Earth Blue Marble "land, ocean, ice" (public domain),
 *   Wikimedia Commons File:Land_ocean_ice_2048.jpg
 * Night: NASA city lights, April–October 2012 (public domain),
 *   Wikimedia Commons File:City_Lights_2012_-_Flat_map.jpg
 * Clouds: NASA Blue Marble cloud map (public domain), stored locally.
 */

const params = new URLSearchParams(location.search);
const POSES = ["standing", "sitting", "lying", "sleeping"];
const SIT_MS = 8000;
const LIE_MS = 20000;
const SLEEP_MS = 40000;

let maps = null;
let mapsPromise = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t)
  ];
}

function hex(color) {
  const n = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${n(color[0])}${n(color[1])}${n(color[2])}`;
}

function clock() {
  const raw = params.get("at");
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function viewerLocation(date) {
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  if (latRaw !== null && lonRaw !== null) {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, timeZone: "preview" };
    }
  }
  const zone = params.get("tz");
  if (zone) return locationFromTimezone(zone, date);
  return browserLocation(date);
}

function loadImageData(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function ensureMaps(canvas) {
  if (maps) return Promise.resolve(maps);
  if (!mapsPromise) {
    mapsPromise = Promise.all([
      loadImageData(canvas.dataset.day),
      loadImageData(canvas.dataset.night),
      loadImageData(canvas.dataset.clouds)
    ]).then(([day, night, clouds]) => {
      maps = { day, night, clouds };
      return maps;
    });
  }
  return mapsPromise;
}

function sample(image, u, v) {
  if (!image) return [0, 0, 0];
  const uu = ((u % 1) + 1) % 1;
  const vv = clamp(v, 0, 0.9999);
  const x = uu * (image.width - 1);
  const y = vv * (image.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (px, py) => {
    const o = (py * image.width + px) * 4;
    return [image.data[o], image.data[o + 1], image.data[o + 2]];
  };
  const a = at(x0, y0);
  const b = at(x1, y0);
  const c = at(x0, y1);
  const d = at(x1, y1);
  return [0, 1, 2].map((i) => {
    const top = a[i] + (b[i] - a[i]) * tx;
    const bot = c[i] + (d[i] - c[i]) * tx;
    return top + (bot - top) * ty;
  });
}

function ll(lat, lon) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  return [
    Math.cos(phi) * Math.cos(lambda),
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi)
  ];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function paintEarth(canvas, loc, sun, textures) {
  const css = canvas.clientWidth || 320;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.max(48, Math.round(css * dpr));
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const inset = size * 0.07;
  const radius = size / 2 - inset;
  const cx = size / 2;
  const cy = size / 2;
  const view = normalize(ll(loc.lat, loc.lon));
  let east = cross([0, 0, 1], view);
  if (Math.hypot(east[0], east[1], east[2]) < 1e-4) east = [0, 1, 0];
  east = normalize(east);
  const north = normalize(cross(view, east));
  const sunVec = ll(sun.lat, sun.lon);
  const sx = dot(sunVec, east);
  const sy = dot(sunVec, north);
  const sz = dot(sunVec, view);

  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    const dy = (cy - y) / radius;
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / radius;
      const rr = dx * dx + dy * dy;
      const index = (y * size + x) * 4;
      if (rr > 1) {
        data[index + 3] = 0;
        continue;
      }
      const dz = Math.sqrt(1 - rr);
      const px = east[0] * dx + north[0] * dy + view[0] * dz;
      const py = east[1] * dx + north[1] * dy + view[1] * dz;
      const pz = east[2] * dx + north[2] * dy + view[2] * dz;
      const lat = Math.asin(clamp(pz, -1, 1));
      const lon = Math.atan2(py, px);
      const u = (lon / Math.PI + 1) / 2;
      const v = 0.5 - lat / Math.PI;
      const incidence = sx * dx + sy * dy + sz * dz;
      const light = smoothstep(-0.18, 0.2, incidence);
      const day = sample(textures.day, u, v);
      const nightTex = sample(textures.night, u, v);
      const night = [
        nightTex[0] * 0.35 + 8,
        nightTex[1] * 0.32 + 10,
        nightTex[2] * 0.55 + 22
      ];
      const lights = Math.max(nightTex[0], nightTex[1], nightTex[2]) / 255;
      let color = mixColor(night, day, light);
      color = [
        color[0] + lights * (1 - light) * 210,
        color[1] + lights * (1 - light) * 180,
        color[2] + lights * (1 - light) * 90
      ];
      const cloud = textures.clouds ? sample(textures.clouds, u, v)[0] / 255 : 0;
      const cloudAmt = cloud * (0.28 + 0.62 * light);
      color = mixColor(color, [248, 250, 252], cloudAmt);
      const limb = 0.72 + 0.28 * dz;
      color = color.map((channel) => channel * limb);
      const rim = smoothstep(0.82, 1, Math.sqrt(rr));
      color[0] += rim * (40 + 80 * light);
      color[1] += rim * (70 + 90 * light);
      color[2] += rim * (110 + 70 * light);
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
  ctx.clearRect(0, 0, size, size);
  ctx.putImageData(image, 0, 0);
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.86, cx, cy, radius * 1.12);
  glow.addColorStop(0, "rgba(150, 196, 226, 0)");
  glow.addColorStop(0.55, "rgba(176, 214, 236, 0.28)");
  glow.addColorStop(1, "rgba(176, 214, 236, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
  ctx.fill();
}

function skyName(altDeg, hourAngle) {
  if (altDeg < -7) return "night";
  if (altDeg < 5) return hourAngle < 0 ? "dawn" : "dusk";
  if (altDeg < 14) return "golden";
  return "day";
}

function paintSky(date, loc) {
  const sun = sunPosition(date);
  const moon = moonPhase(date);
  const view = solarView(loc.lat, loc.lon, sun);
  const altDeg = view.alt * 180 / Math.PI;
  const sky = skyName(altDeg, view.hourAngle);
  document.documentElement.dataset.sky = sky;

  const lunarLit = (1 - Math.cos(moon.phase * Math.PI * 2)) / 2;
  const dayAmount = clamp((altDeg + 8) / 30, 0, 1);
  const warmth = sky === "dawn" || sky === "dusk" || sky === "golden" ? 0.75 : 0;
  // The moon's own phase is the main light. Local time tints it and
  // lifts it a little during the visitor's day.
  const light = clamp(0.1 + lunarLit * 0.82 + dayAmount * 0.08, 0.1, 1);
  let ground = mixColor([118, 128, 148], [245, 243, 238], light);
  ground = mixColor(ground, [236, 196, 140], warmth * (0.35 + (1 - dayAmount) * 0.25));
  if (sky === "night") ground = mixColor(ground, [90, 102, 126], 0.34 * (1 - lunarLit));
  const hound = mixColor([245, 243, 238], warmth > 0 ? [247, 228, 196] : [236, 238, 242], warmth > 0 ? 0.22 : 0.06);

  const root = document.documentElement.style;
  root.setProperty("--ground", hex(ground));
  root.setProperty("--hound", hex(hound));
  root.setProperty("--star-opacity", String(clamp(1.05 - dayAmount * 1.2, 0.2, 1)));
  root.setProperty("--glow", warmth > 0 ? "#e7b56a" : "#9eb4c8");
  root.setProperty("--glow-opacity", String(warmth > 0 ? 0.55 : (1 - dayAmount) * 0.18));

  const length = 6 + (1 - lunarLit) * 10 + (1 - Math.max(0, Math.sin(view.alt))) * 16;
  const angle = view.hourAngle * 0.85 + (moon.phase - 0.5) * Math.PI;
  root.setProperty("--shadow-x", `${(Math.sin(angle) * length).toFixed(1)}px`);
  root.setProperty("--shadow-y", `${(Math.cos(angle) * length * 0.35 + 3).toFixed(1)}px`);

  const dark = 0.08 + (1 - lunarLit) * (0.78 + (1 - dayAmount) * 0.12);
  const fromRight = moon.phase <= 0.5;
  document.querySelectorAll(".phase-gradient").forEach((grad) => {
    grad.setAttribute("x1", fromRight ? "1" : "0");
    grad.setAttribute("x2", fromRight ? "0" : "1");
    const stops = grad.querySelectorAll("stop");
    if (stops[0]) stops[0].setAttribute("stop-opacity", dark.toFixed(3));
    if (stops[1]) {
      stops[1].setAttribute("offset", (0.05 + lunarLit * 0.9).toFixed(3));
      stops[1].setAttribute("stop-opacity", (dark * 0.15).toFixed(3));
    }
  });

  return { sun, moon, view, sky };
}

function setupDog(root) {
  if (!root) return;
  let state = root.dataset.state || "standing";
  function setState(next) {
    if (!POSES.includes(next) || next === state) return;
    state = next;
    root.dataset.state = next;
  }
  const scrub = params.get("scrub");
  if (scrub !== null && scrub !== "") {
    const ms = Number(scrub);
    if (Number.isFinite(ms)) {
      root.querySelectorAll(".breath, .wag, .twitch, .look, .lid, .z").forEach((el) => {
        el.style.animationDelay = `-${ms}ms`;
      });
    }
  }
  const forced = params.get("dog");
  if (POSES.includes(forced)) {
    setState(forced);
    return;
  }
  let last = Date.now();
  const wake = () => {
    last = Date.now();
    setState("standing");
  };
  ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"].forEach((type) => {
    window.addEventListener(type, wake, { passive: true });
  });
  window.setInterval(() => {
    const idle = Date.now() - last;
    if (idle >= SLEEP_MS) setState("sleeping");
    else if (idle >= LIE_MS) setState("lying");
    else if (idle >= SIT_MS) setState("sitting");
    else setState("standing");
  }, 400);
}

function horizonY(width, x) {
  const radius = width * 1.05;
  const cx = width / 2;
  const crest = Math.min(width * 0.16, 150);
  const cy = crest + radius;
  const dx = x - cx;
  return cy - Math.sqrt(Math.max(0, radius * radius - dx * dx));
}

function layoutHorizons() {
  document.querySelectorAll("[data-horizon]").forEach((horizon) => {
    const svg = horizon.querySelector(".lunar-svg");
    if (!svg) return;
    const width = Math.max(320, horizon.clientWidth);
    const height = Math.max(160, horizon.clientHeight);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const crest = horizonY(width, width / 2);
    const lift = height * 0.12;
    const point = (x) => horizonY(width, x) - crest + lift;
    const samples = 56;
    let curve = "";
    for (let i = 0; i <= samples; i += 1) {
      const x = -width * 0.06 + width * 1.12 * (i / samples);
      curve += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${point(x).toFixed(1)} `;
    }
    const clip = svg.querySelector(".horizon-path");
    const rim = svg.querySelector(".horizon-rim");
    if (clip) clip.setAttribute("d", `${curve}L ${width * 1.08} ${height + 80} L ${-width * 0.08} ${height + 80} Z`);
    if (rim) rim.setAttribute("d", curve.trim());
    const craters = svg.querySelector(".craters");
    if (craters) {
      craters.replaceChildren();
      const spots = [0.16, 0.3, 0.46, 0.58, 0.72, 0.84, 0.38];
      const sizes = [16, 30, 48, 20, 26, 14, 12];
      const ellipse = (cls, rx, ry) => {
        const node = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        node.setAttribute("class", cls);
        node.setAttribute("rx", String(rx));
        node.setAttribute("ry", String(ry));
        return node;
      };
      spots.forEach((t, index) => {
        const x = width * t;
        const y = point(x) + sizes[index] * 0.9;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "crater");
        g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        const rx = sizes[index];
        const ry = rx * 0.58;
        g.append(ellipse("crater-lip", rx + 5, ry + 3), ellipse("crater-pit", rx, ry), ellipse("crater-shadow", rx, ry));
        craters.appendChild(g);
      });
    }
    const dog = horizon.querySelector("[data-dog]");
    if (dog) {
      const footT = width < 720 ? 0.5 : 0.46;
      const x = width * footT;
      const y = point(x);
      const x2 = x + 28;
      const y2 = point(x2);
      const angle = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
      dog.style.left = `${x}px`;
      dog.style.top = `${y}px`;
      dog.style.transformOrigin = "64% 100%";
      dog.style.transform = `translate(-64%, -100%) rotate(${angle.toFixed(2)}deg)`;
    }
  });
}

function setupEarth(canvas) {
  if (!canvas) return () => {};
  let frame = 0;
  let textures = null;
  const draw = () => {
    const date = clock();
    const loc = viewerLocation(date);
    paintSky(date, loc);
    if (textures) paintEarth(canvas, loc, sunPosition(date), textures);
  };
  const schedule = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      layoutHorizons();
      draw();
    });
  };
  ensureMaps(canvas).then((loaded) => {
    textures = loaded;
    schedule();
  });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas.parentElement || canvas);
    document.querySelectorAll("[data-horizon]").forEach((node) => observer.observe(node));
  } else {
    window.addEventListener("resize", schedule);
  }
  layoutHorizons();
  schedule();
  return schedule;
}

const earthCanvas = document.querySelector("[data-earth] canvas");
setupDog(document.querySelector("[data-dog]"));
const redraw = setupEarth(earthCanvas);
if (!earthCanvas) layoutHorizons();
window.setInterval(() => {
  const date = clock();
  const loc = viewerLocation(date);
  paintSky(date, loc);
  if (earthCanvas && maps) paintEarth(earthCanvas, loc, sunPosition(date), maps);
}, 60000);

if (!earthCanvas) {
  const date = clock();
  paintSky(date, viewerLocation(date));
}

void redraw;
