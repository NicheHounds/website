/**
 * Fragment shader for the hound pass: ray-marches the hound's smooth body and
 * darkens the ground where the hound shades it.
 */
import { COMMON } from './lunar.js';
import { CONES, ELLS } from './dog3d.js';

// Smooth-blend radii between groups (metres).
const K = { body: 0.03, head: 0.014, leg: 0.016, legBody: 0.028, tail: 0.016, ear: 0.012, headBody: 0.03 };

export function dogShader() {
  const nc = CONES.length;
  const ne = ELLS.length;
  const lines = [];
  const groupOf = (g) => ({ 0: 'body', 1: 'head', 2: 'l0', 3: 'l1', 4: 'l2', 5: 'l3', 6: 'tail', 7: 'ear' }[g]);
  for (const g of ['body', 'head', 'l0', 'l1', 'l2', 'l3', 'tail', 'ear']) lines.push(`  float ${g} = 1e3;`);
  lines.push('  float nose = 1e3; float eye = 1e3;');
  CONES.forEach((c, i) => {
    const g = groupOf(c.g);
    const k = c.g === 0 ? K.body : c.g === 1 ? K.head : c.g >= 2 && c.g <= 5 ? K.leg : K.tail;
    lines.push(`  ${g} = smin(${g}, sdRoundCone(p, uC[${i * 2}].xyz, uC[${i * 2 + 1}].xyz, uC[${i * 2}].w, uC[${i * 2 + 1}].w), ${k.toFixed(3)});`);
  });
  ELLS.forEach((e, i) => {
    const expr = `sdEllipsoid(uER[${i}] * (p - uE[${i * 2}]), uE[${i * 2 + 1}])`;
    if (e.m === 3) lines.push(`  ear = smin(ear, sdEarTri(uER[${i}] * (p - uE[${i * 2}]), uE[${i * 2 + 1}]), ${K.ear});`);
    else if (e.m === 1) lines.push(`  nose = min(nose, ${expr});`);
    else if (e.m === 2) lines.push(`  eye = min(eye, sdEllipsoid(uER[${i}] * (p - uE[${i * 2}]), uE[${i * 2 + 1}] * vec3(1.0, max(uEyeOpen, 0.12), 1.0)));`);
    else {
      const g = groupOf(e.g);
      const k = e.g === 0 ? K.body : e.g === 1 ? K.head : e.g >= 2 && e.g <= 5 ? K.leg : K.ear;
      lines.push(`  ${g} = smin(${g}, ${expr}, ${k.toFixed(3)});`);
    }
  });
  const rim = ELLS.map((e, i) => (e.m === 2 ? `  r = min(r, sdEllipsoid(uER[${i}] * (p - uE[${i * 2}]), uE[${i * 2 + 1}] * vec3(1.25, max(uEyeOpen, 0.12) * 1.5, 1.15)));` : '')).filter(Boolean).join('\n');
  const sdf = `
uniform vec4 uC[${nc * 2}];
uniform vec3 uE[${ne * 2}];
uniform mat3 uER[${ne}];
uniform float uEyeOpen;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// A thin rounded triangle: base on local y = 0 from -r.x to r.x, apex at y = r.y.
float sdEarTri(vec3 p, vec3 r) {
  vec2 q = vec2(abs(p.x), p.y);
  vec2 a = vec2(r.x, 0.0), b = vec2(0.0, r.y);
  vec2 e = b - a, w = q - a;
  vec2 d1 = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
  vec2 d2 = vec2(q.x - clamp(q.x, 0.0, r.x), q.y);
  float s = (e.x * w.y - e.y * w.x) > 0.0 && q.y > 0.0 ? -1.0 : 1.0;
  float d = sqrt(min(dot(d1, d1), dot(d2, d2))) * s;
  vec2 w2 = vec2(d + 0.007, abs(p.z) - r.z);
  return min(max(w2.x, w2.y), 0.0) + length(max(w2, 0.0)) - 0.007;
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
float eyeRim(vec3 p) {
  float r = 1e3;
${rim}
  return r;
}
// x: distance, y: material (0 coat, 1 nose, 2 eye)
vec2 dogSDF(vec3 p) {
${lines.join('\n')}
  float hb = smin(body, smin(head, ear, ${K.ear}), ${K.headBody});
  float d = smin(hb, tail, ${K.tail});
  d = min(d, smin(hb, l0, ${K.legBody}));
  d = min(d, smin(hb, l1, ${K.legBody}));
  d = min(d, smin(hb, l2, ${K.legBody}));
  d = min(d, smin(hb, l3, ${K.legBody}));
  vec2 res = vec2(d, 0.0);
  if (nose < res.x) res = vec2(nose, 1.0);
  if (eye < res.x) res = vec2(eye, 2.0);
  return res;
}
`;
  return COMMON + sdf + `
uniform mat3 uDogRotT;   // world -> dog
uniform vec3 uDogPos;    // dog origin (world)
uniform sampler2D uGround; // rg: ground distance (16 bit), b: sunlit share, a: ground
uniform vec3 uGroundCol; // lit regolith colour, for bounce light
uniform float uDogAlpha;  // fades the hound in after the logo

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0007, -0.0007);
  return normalize(e.xyy * dogSDF(p + e.xyy).x + e.yyx * dogSDF(p + e.yyx).x +
                   e.yxy * dogSDF(p + e.yxy).x + e.xxx * dogSDF(p + e.xxx).x);
}
float softShadow(vec3 p, vec3 l) {
  float res = 1.0, t = 0.006;
  for (int i = 0; i < 40; i++) {
    float h = dogSDF(p + l * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.004, 0.06);
    if (res < 0.001 || t > 0.9) break;
  }
  return clamp(res, 0.0, 1.0);
}
float ambientOcc(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.03 * float(i);
    occ += (h - dogSDF(p + n * h).x) * sca;
    sca *= 0.75;
  }
  return clamp(1.0 - 3.5 * occ, 0.0, 1.0);
}
float fur(vec3 p) {
  return vnoise(p.xy * 900.0 + p.z * 300.0) * 0.5 + vnoise(p.zy * 700.0 + p.x * 200.0) * 0.5;
}

void main() {
  vec3 rdW = rayDir(gl_FragCoord.xy);
  vec3 ro = uDogRotT * (uCam - uDogPos);
  vec3 rd = uDogRotT * rdW;
  vec3 sun = uDogRotT * uSun;
  vec3 earth = uDogRotT * uEarth;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 gt = texture(uGround, uv);
  float gDist = gt.a > 0.5 ? (gt.r * 255.0 * 256.0 + gt.g * 255.0) / 65535.0 * 32.0 : 0.0;
  vec2 g = vec2(gDist, gt.b);
  float tGround = g.x > 0.0 ? g.x : 1e9;

  // bounding sphere around the hound
  vec3 bc = vec3(0.0, 0.32, 0.0);
  vec3 oc = ro - bc;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - 0.62 * 0.62;
  float disc = b * b - c;
  float t = 1e9;
  vec2 hit = vec2(1e3, 0.0);
  if (disc > 0.0) {
    float t0 = max(0.0, -b - sqrt(disc));
    float t1 = -b + sqrt(disc);
    float tt = t0;
    for (int i = 0; i < 110; i++) {
      vec2 h = dogSDF(ro + rd * tt);
      if (h.x < 0.00025 * tt) { t = tt; hit = h; break; }
      tt += h.x * 0.9;
      if (tt > t1 || tt > tGround) break;
    }
  }

  if (t < tGround) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    // short coat: break up the clay look a little
    float f = fur(p);
    float near = smoothstep(4.0, 1.5, length(uDogRotT * (uCam - uDogPos) - p));
    n = normalize(n + (vec3(f, fur(p.yzx), fur(p.zxy)) - 0.5) * 0.1 * near);
    vec3 alb = vec3(0.6, 0.565, 0.51) * (0.97 + 0.05 * vnoise(p.xy * 18.0 + p.z * 7.0));
    float face = smoothstep(0.06, 0.0, length((p - vec3(0.37, 0.53, 0.0)) * vec3(1.0, 1.4, 0.8)));
    alb = mix(alb, vec3(0.62, 0.48, 0.45), face * 0.35);
    // dark pigment rimming the eyes, as on a white pit bull
    alb = mix(alb, vec3(0.05, 0.04, 0.04), (1.0 - smoothstep(0.0, 0.0035, eyeRim(p))) * float(hit.y < 0.5));
    float spec = 0.06, gloss = 18.0;
    if (hit.y > 1.5) { alb = vec3(0.02, 0.014, 0.01); spec = 0.45; gloss = 140.0; }
    else if (hit.y > 0.5) { alb = vec3(0.035, 0.028, 0.026); spec = 0.35; gloss = 60.0; }
    float ndl = dot(n, sun);
    float wrap = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
    float sh = ndl > -0.25 ? softShadow(p + n * 0.003, sun) : 0.0;
    float ao = ambientOcc(p, n);
    ao = ao * ao;
    vec3 col = alb * uSunCol * wrap * sh * 1.7;
    // warm light bleeding through the skin at the shadow edge
    col += alb * vec3(0.5, 0.18, 0.1) * smoothstep(0.3, 0.0, abs(ndl)) * sh * 0.35 * float(hit.y < 0.5);
    // bounce from the lit regolith below, earthshine from Earth
    col += alb * uGroundCol * (0.5 - 0.5 * n.y) * 0.6 * ao;
    col += alb * vec3(0.55, 0.68, 1.0) * uShine * (0.5 + 0.5 * max(dot(n, earth), 0.0)) * ao;
    col += alb * 0.015 * ao;
    vec3 hv = normalize(sun + v);
    col += uSunCol * spec * pow(max(dot(n, hv), 0.0), gloss) * sh;
    // soft sheen of short fur at grazing angles
    col += alb * uSunCol * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25 * sh * float(hit.y < 0.5);
    col = col / (1.0 + col * 0.35);
    outColor = vec4(toSRGB(col), 1.0) * uDogAlpha;
    return;
  }

  // ground: the hound's shadow and a touch of contact darkness
  if (g.x <= 0.0) { outColor = vec4(0.0); return; }
  vec3 p = ro + rd * g.x;
  float s = 1.0;
  if (g.y > 0.01) s = softShadow(p + vec3(0.0, 0.002, 0.0), sun);
  float dd = dogSDF(p).x;
  float contact = (1.0 - smoothstep(0.0, 0.06, dd)) * 0.45;
  float a = max((1.0 - s) * g.y * 0.92, contact);
  outColor = vec4(0.0, 0.0, 0.0, a * uDogAlpha);
}
`;
}
