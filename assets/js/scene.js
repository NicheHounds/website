import { LAND, browserLocation, locationFromTimezone, moonPhase, solarView, sunPosition } from "./astro.js";

const params = new URLSearchParams(location.search);
const POSES = ["standing", "sitting", "lying", "sleeping"];
const SIT_MS = 8000;
const LIE_MS = 20000;
const SLEEP_MS = 40000;

const OCEAN_DAY = [26, 78, 112];
const OCEAN_NIGHT = [12, 20, 34];
const LAND_DAY = [226, 216, 196];
const LAND_NIGHT = [36, 46, 64];

let mask;

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

function landMask() {
  if (mask) return mask;
  const width = 720;
  const height = 360;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  for (const ring of LAND) {
    ctx.beginPath();
    ring.forEach(([lat, lon], index) => {
      const x = ((lon + 180) / 360) * width;
      const y = ((90 - lat) / 180) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  mask = ctx.getImageData(0, 0, width, height);
  return mask;
}

function isLand(lat, lon) {
  const image = landMask();
  let x = Math.floor(((lon + 180) / 360) * image.width);
  let y = Math.floor(((90 - lat) / 180) * image.height);
  x = clamp(x, 0, image.width - 1);
  y = clamp(y, 0, image.height - 1);
  return image.data[(y * image.width + x) * 4] > 128;
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

function paintEarth(canvas, loc, sun) {
  const css = canvas.clientWidth || 320;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.max(32, Math.round(css * dpr));
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const radius = size / 2 - dpr;
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
      const lat = Math.asin(clamp(pz, -1, 1)) * 180 / Math.PI;
      const lon = Math.atan2(py, px) * 180 / Math.PI;
      const incidence = sx * dx + sy * dy + sz * dz;
      const light = smoothstep(-0.15, 0.22, incidence);
      const land = isLand(lat, lon);
      let color = mixColor(land ? LAND_NIGHT : OCEAN_NIGHT, land ? LAND_DAY : OCEAN_DAY, light);
      const limb = 0.62 + 0.38 * dz;
      color = color.map((channel) => channel * limb);
      const rim = smoothstep(0.93, 1, Math.sqrt(rr)) * (0.05 + 0.16 * light);
      color[0] += rim * 186;
      color[1] += rim * 206;
      color[2] += rim * 220;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(245, 243, 238, 0.55)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
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
  const hound = mixColor([245, 243, 238], warmth > 0 ? [246, 220, 180] : [206, 214, 226], warmth > 0 ? 0.4 : (1 - dayAmount) * 0.22);

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
  const nodes = {};
  root.querySelectorAll(".dog-pose").forEach((el) => {
    nodes[el.dataset.pose] = el;
  });
  let state = "standing";
  function setState(next) {
    if (!nodes[next] || next === state) return;
    state = next;
    root.dataset.state = next;
    Object.entries(nodes).forEach(([name, el]) => {
      el.classList.toggle("is-active", name === next);
    });
  }
  requestAnimationFrame(() => root.classList.add("is-live"));
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

function setupEarth(canvas) {
  if (!canvas) return () => {};
  let frame = 0;
  const draw = () => {
    const date = clock();
    const loc = viewerLocation(date);
    paintSky(date, loc);
    paintEarth(canvas, loc, sunPosition(date));
  };
  const schedule = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(draw);
  };
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas.parentElement || canvas);
  } else {
    window.addEventListener("resize", schedule);
  }
  schedule();
  return schedule;
}

const earthCanvas = document.querySelector("[data-earth] canvas");
setupDog(document.querySelector("[data-dog]"));
const redraw = setupEarth(earthCanvas);
window.setInterval(() => {
  const date = clock();
  const loc = viewerLocation(date);
  paintSky(date, loc);
  if (earthCanvas) paintEarth(earthCanvas, loc, sunPosition(date));
}, 60000);

if (!earthCanvas) {
  const date = clock();
  paintSky(date, viewerLocation(date));
}

void redraw;
