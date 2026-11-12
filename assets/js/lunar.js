/**
 * The lunar scene: a ray-marched patch of regolith on a small sphere, seen from
 * an astronaut's crouch, and the hound standing on it. One WebGL2 canvas.
 *
 * The ground is expensive and still, so it is rendered once into a texture
 * (again on resize or when the light changes). Each frame only copies that
 * texture and ray-marches the hound, plus the hound's shadow on the ground,
 * inside a box around it.
 */

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes;      // canvas size, device px
uniform vec2 uPP;       // principal point, device px from top-left
uniform float uF;       // focal length, device px
uniform vec3 uCam;      // camera position (world, metres)
uniform mat3 uCamRot;   // camera to world
uniform vec3 uS;        // moon sphere centre
uniform float uR;       // moon sphere radius
uniform vec3 uSun;      // direction to the sun
uniform vec3 uSunCol;
uniform vec3 uEarth;    // direction to Earth
uniform float uShine;   // earthshine strength
uniform vec3 uDog;      // hound ground point (world)
layout(location = 0) out vec4 outColor;

vec3 rayDir(vec2 fc) {
  vec2 px = vec2(fc.x, uRes.y - fc.y);
  vec3 d = vec3((px.x - uPP.x) / uF, -(px.y - uPP.y) / uF, -1.0);
  return normalize(uCamRot * d);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

// Value noise with analytic derivatives (x: value, yz: gradient).
vec3 vnoised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y,
              du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}

// Fine regolith relief as a slope only (no geometry): band-limited to the pixel.
vec2 regolithSlope(vec2 q, float fp) {
  vec2 g = vec2(0.0);
  float fr = 7.0, amp = 0.006;
  for (int i = 0; i < 5; i++) {
    float w = smoothstep(0.5, 0.15, fr * fp);   // fade octaves finer than ~3 px
    vec3 n = vnoised(q * fr + float(i) * 17.3);
    g += n.yz * fr * amp * w;
    q = mat2(0.8, -0.6, 0.6, 0.8) * q;
    fr *= 2.3; amp *= 0.5;
  }
  return g;
}

// Crater profile in units of the crater radius: bowl, raised rim, ejecta apron.
float craterProfile(float x) {
  float bowl = x * x - 1.0;
  float rim = exp(-pow((x - 1.0) * 3.2, 2.0));
  float apron = exp(-max(x - 1.0, 0.0) * 2.2) * step(1.0, x);
  return (x < 1.0 ? bowl * 0.24 + rim * 0.07 : rim * 0.07 + apron * 0.02);
}

// One octave of craters on a jittered grid of cell size s.
float craters(vec2 q, float s, float density, float seed) {
  vec2 c = floor(q / s);
  float h = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 cell = c + vec2(i, j);
    float pick = hash12(cell + seed);
    if (pick > density) continue;
    vec2 ctr = (cell + 0.2 + 0.6 * hash22(cell + seed * 1.7)) * s;
    float r = s * (0.12 + 0.3 * pow(hash12(cell + seed * 3.1), 2.0));
    vec2 dv = q - ctr;
    float x = length(dv) / r;
    if (x < 3.0) {
      // irregular rim and a crater age: old ones are shallow and soft
      float ang = atan(dv.y, dv.x);
      float wob = vnoise(vec2(ang * 1.6 + cell.x * 7.0, cell.y * 3.0)) - 0.5;
      x *= 1.0 + wob * 0.18;
      float age = hash12(cell + seed * 9.3);
      float depth = mix(1.0, 0.35, age);
      float px = mix(x, pow(x, 0.75), age * 0.6);
      h += craterProfile(px) * r * depth;
    }
  }
  return h;
}

// Angular clasts: a few random facets, a flat-ish top, steep sides.
float rocks(vec2 q, float s, float seed) {
  vec2 c = floor(q / s);
  float h = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 cell = c + vec2(i, j);
    if (hash12(cell + seed) > 0.5) continue;
    vec2 ctr = (cell + hash22(cell + seed * 2.3)) * s;
    float r = s * (0.05 + 0.2 * pow(hash12(cell + seed * 5.7), 3.0));
    vec2 d = (q - ctr) / r;
    if (dot(d, d) > 2.0) continue;
    float a0 = hash12(cell + seed * 7.7) * 6.2832;
    float m = 0.0;
    for (int k = 0; k < 5; k++) {
      float a = a0 + float(k) * 1.2566 + (hash12(cell + float(k) * 3.3) - 0.5) * 0.7;
      float w = 0.8 + 0.4 * hash12(cell + float(k) * 5.1);
      m = max(m, dot(d, vec2(cos(a), sin(a))) * w);
    }
    float e = clamp(1.0 - m, 0.0, 1.0);
    float tall = 0.3 + 0.45 * hash12(cell + seed * 1.9);
    h = max(h, r * tall * pow(e, 0.55));
  }
  return h;
}

// Height of the regolith above the sphere at tangent position q (metres).
// fp: metres per pixel at this distance; detail below ~2 px is dropped.
float terrainH(vec2 q, float fp) {
  float dd = length(q - uDog.xz);
  float flat0 = smoothstep(0.35, 0.9, dd);           // keep the hound's spot level
  float flat1 = mix(0.35, 1.0, flat0);
  float h = 0.0;
  h += craters(q, 9.0, 0.5, 1.0) * smoothstep(1.2, 3.5, dd);
  h += craters(q, 3.1, 0.5, 7.0) * smoothstep(0.8, 2.0, dd);
  h += craters(q + 1.3, 1.05, 0.5, 13.0) * flat0;
  if (fp < 0.02) h += craters(q + 0.7, 0.36, 0.55, 19.0) * flat1 * smoothstep(0.02, 0.008, fp);
  if (fp < 0.008) h += craters(q + 0.3, 0.12, 0.5, 23.0) * flat1 * smoothstep(0.008, 0.003, fp);
  // gentle swell and soft undulation
  h += (vnoise(q * 0.16) - 0.5) * 0.22;
  h += (vnoise(q * 0.9) - 0.5) * 0.04 * flat1;
  if (fp < 0.012) h += rocks(q, 0.42, 3.0) * flat0 * smoothstep(0.012, 0.005, fp);
  if (fp < 0.006) h += rocks(q + 0.9, 0.16, 11.0) * flat1 * smoothstep(0.006, 0.0025, fp);
  if (fp < 0.03) h += rocks(q + 2.1, 1.7, 8.0) * smoothstep(0.03, 0.012, fp) * smoothstep(1.0, 2.0, dd);
  return h;
}

float terrainSDF(vec3 p, float fp) {
  return length(p - uS) - uR - terrainH(p.xz, fp);
}

vec3 toSRGB(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
`;

const TERRAIN_FS = COMMON + `
layout(location = 1) out vec4 outGround; // rg: distance (16 bit), b: sunlit share

float sunShadow(vec3 p, float fp) {
  float res = 1.0;
  float t = 0.015;
  for (int i = 0; i < 48; i++) {
    float h = terrainSDF(p + uSun * t, fp * 2.0);
    res = min(res, 70.0 * h / t);
    if (res < 0.0) break;
    t += clamp(h * 0.7, 0.01, 0.6);
    if (t > 14.0) break;
  }
  return smoothstep(0.0, 1.0, res);
}

void main() {
  vec3 ro = uCam;
  vec3 rd = rayDir(gl_FragCoord.xy);
  // start at the sphere that bounds all relief
  vec3 oc = ro - uS;
  float Rb = uR + 0.6;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - Rb * Rb;
  float disc = b * b - c;
  outGround = vec4(0.0);
  if (disc < 0.0) { outColor = vec4(0.0); return; }
  float t = max(0.0, -b - sqrt(disc));
  float tEnd = -b + sqrt(disc);
  float pxAngle = 1.0 / uF;
  bool hit = false;
  float d = 0.0;
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    float fp = t * pxAngle / max(dot(normalize(p - uS), -rd), 0.45);
    d = terrainSDF(p, fp);
    if (d < t * pxAngle * 0.5) { hit = true; break; }
    t += max(d * 0.55, t * pxAngle * 0.5);
    if (t > tEnd) break;
  }
  if (!hit) { outColor = vec4(0.0); return; }
  // refine
  for (int i = 0; i < 4; i++) {
    vec3 p = ro + rd * t;
    t += terrainSDF(p, t * pxAngle / max(dot(normalize(p - uS), -rd), 0.45)) * 0.5;
  }
  vec3 p = ro + rd * t;
  float fp = t * pxAngle / max(dot(normalize(p - uS), -rd), 0.45);
  vec2 q = p.xz;
  float e = max(0.003, fp * 0.9);
  float hx = (terrainH(q + vec2(e, 0), fp) - terrainH(q - vec2(e, 0), fp)) / (2.0 * e);
  float hz = (terrainH(q + vec2(0, e), fp) - terrainH(q - vec2(0, e), fp)) / (2.0 * e);
  vec3 ns = normalize(p - uS);
  vec2 g = regolithSlope(q, fp);
  vec3 n = normalize(ns - vec3(hx + g.x, 0.0, hz + g.y));

  // regolith albedo: grey with a faint brown, mottled; fresh rims a touch brighter
  float mott = vnoise(q * 0.35) * 0.55 + vnoise(q * 2.2) * 0.3 + vnoise(q * 9.0) * 0.15;
  vec3 alb = vec3(0.44, 0.43, 0.41) * (0.78 + 0.38 * mott);
  // pebbles and grains: tiny bright and dark specks
  float speck = vnoise(q * 140.0);
  alb *= 1.0 + (speck - 0.5) * 0.35 * smoothstep(0.004, 0.0015, fp);

  float mu0 = max(dot(n, uSun), 0.0);
  float mu = max(dot(n, -rd), 0.05);
  // Lommel-Seeliger with a little Lambert: the flat, dusty lunar look
  float ls = 2.0 * mu0 / (mu0 + mu);
  float diff = mix(mu0, ls * 0.62, 0.72);
  float sh = mu0 > 0.0 ? sunShadow(p + n * 0.004, fp) : 0.0;
  vec3 col = alb * uSunCol * diff * sh * 1.9;
  float sunPart = dot(col, vec3(0.3, 0.6, 0.1));
  // earthshine and a whisper of skylight-free ambient
  col += alb * vec3(0.55, 0.68, 1.0) * uShine * (0.4 + 0.6 * max(dot(n, uEarth), 0.0));
  col += alb * 0.012;
  // the far ground falls off a touch toward the limb so the curve reads
  float limb = clamp(dot(ns, -rd) * 6.0, 0.0, 1.0);
  col *= mix(0.78, 1.0, limb);
  float sunShare = sunPart / max(dot(col, vec3(0.3, 0.6, 0.1)), 1e-4);
  float v = clamp(t / 32.0, 0.0, 1.0) * 65535.0;
  float hi = floor(v / 256.0);
  outGround = vec4(hi / 255.0, (v - hi * 256.0) / 255.0, sunShare, 1.0);
  // filmic-ish shoulder so the sunlit dust never clips
  col = col / (1.0 + col * 0.35);
  outColor = vec4(toSRGB(col), 1.0);
}
`;

const QUAD_VS = `#version 300 es
in vec2 aPos;
uniform vec4 uRect; // x0, y0, x1, y1 in clip space
out vec2 vUv;
void main() {
  vec2 p = mix(uRect.xy, uRect.zw, aPos);
  vUv = aPos;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const BLIT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }
`;

export { COMMON, TERRAIN_FS, QUAD_VS, BLIT_FS };
