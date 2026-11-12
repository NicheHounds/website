/**
 * The hound in 3D: a skeleton of joints, and smooth volumes riding on it.
 * Everything is in the dog's own space, in metres: x forward, y up, z toward
 * the dog's left side (the side we see). Ground is y = 0.
 *
 * A pose is a set of joint rotations. Every volume is defined in the standing
 * rest pose and carried by one joint, so the body bends continuously and the
 * shader blends neighbouring volumes into one skin.
 */

// ---------- tiny 3x4 matrix helpers (column-major rotation + translation) ----------
const I = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function mul(a, b) {
  // (a * b): rotation rows from a, apply to b
  const r = new Array(12);
  for (let c = 0; c < 3; c++) {
    for (let rr = 0; rr < 3; rr++) {
      r[c * 3 + rr] = a[rr] * b[c * 3] + a[3 + rr] * b[c * 3 + 1] + a[6 + rr] * b[c * 3 + 2];
    }
  }
  for (let rr = 0; rr < 3; rr++) r[9 + rr] = a[rr] * b[9] + a[3 + rr] * b[10] + a[6 + rr] * b[11] + a[9 + rr];
  return r;
}
function rotXYZ(rx, ry, rz) {
  // roll about x, yaw about y, pitch about z (degrees); applied z, then y, then x
  const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 180);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const Rx = [1, 0, 0, 0, ca, sa, 0, -sa, ca];
  const Ry = [cb, 0, -sb, 0, 1, 0, sb, 0, cb];
  const Rz = [cc, sc, 0, -sc, cc, 0, 0, 0, 1];
  const m3 = (p, q) => {
    const r = new Array(9);
    for (let c2 = 0; c2 < 3; c2++) for (let r2 = 0; r2 < 3; r2++) r[c2 * 3 + r2] = p[r2] * q[c2 * 3] + p[3 + r2] * q[c2 * 3 + 1] + p[6 + r2] * q[c2 * 3 + 2];
    return r;
  };
  return m3(Rx, m3(Ry, Rz)).concat([0, 0, 0]);
}
function about(pivot, rot) {
  // T(pivot) * R * T(-pivot)
  const t = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
  return mul(t(...pivot), mul(rot, t(-pivot[0], -pivot[1], -pivot[2])));
}
export function apply(m, p) {
  return [
    m[0] * p[0] + m[3] * p[1] + m[6] * p[2] + m[9],
    m[1] * p[0] + m[4] * p[1] + m[7] * p[2] + m[10],
    m[2] * p[0] + m[5] * p[1] + m[8] * p[2] + m[11],
  ];
}

// ---------- skeleton: joint -> parent, pivot in rest space ----------
const L = 1; // near (left) side
const R = -1; // far (right) side
const legs = (side, tag) => ({
  [`${tag}Shoulder`]: { parent: 'chest', pivot: [0.15, 0.34, side * 0.065] },
  [`${tag}Elbow`]: { parent: `${tag}Shoulder`, pivot: [0.13, 0.2, side * 0.074] },
  [`${tag}Wrist`]: { parent: `${tag}Elbow`, pivot: [0.145, 0.065, side * 0.076] },
});
const hind = (side, tag) => ({
  [`${tag}Hip`]: { parent: 'pelvis', pivot: [-0.19, 0.355, side * 0.058] },
  [`${tag}Stifle`]: { parent: `${tag}Hip`, pivot: [-0.11, 0.235, side * 0.07] },
  [`${tag}Hock`]: { parent: `${tag}Stifle`, pivot: [-0.235, 0.105, side * 0.066] },
  [`${tag}Toe`]: { parent: `${tag}Hock`, pivot: [-0.225, 0.032, side * 0.066] },
});

export const JOINTS = {
  root: { parent: null, pivot: [-0.19, 0.36, 0] },
  pelvis: { parent: 'root', pivot: [-0.19, 0.36, 0] },
  chest: { parent: 'pelvis', pivot: [-0.04, 0.36, 0] },
  neck: { parent: 'chest', pivot: [0.15, 0.39, 0] },
  head: { parent: 'neck', pivot: [0.262, 0.505, 0] },
  jaw: { parent: 'head', pivot: [0.3, 0.505, 0] },
  earL: { parent: 'head', pivot: [0.268, 0.6, 0.05] },
  earR: { parent: 'head', pivot: [0.268, 0.6, -0.05] },
  ...legs(L, 'fl'), ...legs(R, 'fr'),
  ...hind(L, 'hl'), ...hind(R, 'hr'),
  tail0: { parent: 'pelvis', pivot: [-0.27, 0.37, 0] },
  tail1: { parent: 'tail0', pivot: [-0.325, 0.315, 0] },
  tail2: { parent: 'tail1', pivot: [-0.365, 0.245, 0] },
};
const ORDER = Object.keys(JOINTS); // parents always come first above

// ---------- volumes ----------
// cone: [joint, a, ra, b, rb, group]   ellipsoid: [joint, centre, radii, rot(deg xyz), group, material]
// groups: 0 body, 1 head, 2..5 legs (fl, fr, hl, hr), 6 tail, 7 ears; materials: 0 coat, 1 nose, 2 eye
const C = [];
const E = [];
const cone = (j, a, ra, b, rb, g) => C.push({ j, a, ra, b, rb, g });
const ell = (j, c, r, rot, g, m = 0) => E.push({ j, c, r, rot: rot || [0, 0, 0], g, m });

// torso: withers ~0.42 m, brisket ~0.215 m, as in the mark
ell('chest', [0.07, 0.315, 0], [0.152, 0.098, 0.09], [0, 0, -5], 0);             // ribcage, deep
ell('chest', [0.175, 0.29, 0], [0.06, 0.085, 0.085], [0, 0, 16], 0);           // prosternum
ell('chest', [0.19, 0.27, 0.035], [0.045, 0.06, 0.045], [0, 0, 20], 0);        // pectorals
ell('chest', [0.19, 0.27, -0.035], [0.045, 0.06, 0.045], [0, 0, 20], 0);
cone('chest', [0.12, 0.36, 0], 0.064, [-0.04, 0.356, 0], 0.062, 0);           // back over the ribs
ell('chest', [0.03, 0.33, 0.06], [0.11, 0.06, 0.05], [0, 0, 8], 0);           // lats / ribs flank
ell('chest', [0.03, 0.33, -0.06], [0.11, 0.06, 0.05], [0, 0, 8], 0);
cone('pelvis', [-0.03, 0.362, 0], 0.05, [-0.17, 0.366, 0], 0.062, 0);         // loin, tucked up
ell('pelvis', [-0.195, 0.356, 0], [0.078, 0.066, 0.078], [0, 0, 14], 0);         // croup
ell('chest', [0.13, 0.35, 0.058], [0.055, 0.08, 0.03], [0, 0, 30], 0);        // shoulder blades
ell('chest', [0.13, 0.35, -0.058], [0.055, 0.08, 0.03], [0, 0, 30], 0);
// neck: short, thick, slightly arched, flaring into the shoulders
cone('neck', [0.13, 0.37, 0], 0.08, [0.245, 0.49, 0], 0.062, 0);
ell('neck', [0.17, 0.43, 0], [0.055, 0.07, 0.062], [0, 0, -40], 0);           // crest
ell('neck', [0.21, 0.4, 0], [0.048, 0.066, 0.056], [0, 0, -45], 0);           // throat
// head: broad flat skull, big cheeks, a strong square muzzle with a clear stop
ell('head', [0.283, 0.556, 0], [0.082, 0.058, 0.07], [0, 0, -4], 1);           // skull, flat-topped
ell('head', [0.258, 0.585, 0], [0.05, 0.026, 0.048], [0, 0, 6], 1);            // occiput
ell('head', [0.318, 0.524, 0.045], [0.05, 0.043, 0.031], [0, 0, -14], 1);      // cheeks (masseter)
ell('head', [0.318, 0.524, -0.045], [0.05, 0.043, 0.031], [0, 0, -14], 1);
ell('head', [0.347, 0.567, 0.024], [0.02, 0.014, 0.019], [0, 0, -22], 1);      // brows
ell('head', [0.347, 0.567, -0.024], [0.02, 0.014, 0.019], [0, 0, -22], 1);
cone('head', [0.358, 0.545, 0], 0.027, [0.44, 0.537, 0], 0.022, 1);           // muzzle bridge, long and flat
ell('head', [0.405, 0.522, 0.02], [0.042, 0.022, 0.016], [0, 0, -3], 1);       // flews / upper lips
ell('head', [0.405, 0.522, -0.02], [0.042, 0.022, 0.016], [0, 0, -3], 1);
cone('jaw', [0.315, 0.5, 0], 0.026, [0.41, 0.503, 0], 0.016, 1);              // lower jaw
ell('head', [0.452, 0.538, 0], [0.015, 0.0145, 0.02], [0, 0, 12], 1, 1);      // nose
ell('head', [0.395, 0.505, 0.024], [0.04, 0.003, 0.0035], [0, -18, -4], 1, 1); // mouth line
ell('head', [0.395, 0.505, -0.024], [0.04, 0.003, 0.0035], [0, 18, -4], 1, 1);
ell('head', [0.343, 0.566, 0.038], [0.0125, 0.0062, 0.01], [0, 42, -12], 1, 2); // eyes, almond, set in
ell('head', [0.343, 0.566, -0.038], [0.0125, 0.0062, 0.01], [0, -42, -12], 1, 2);
// ears as in the mark: set high, standing at the base, the tips folding forward
// (material 3: a thin rounded triangle; radii = half-base, height, thickness)
ell('earL', [0.262, 0.598, 0.052], [0.026, 0.036, 0.0035], [-28, 0, 4], 7, 3);
ell('earL', [0.27, 0.632, 0.06], [0.02, 0.026, 0.0035], [-34, 0, -128], 7, 3);
ell('earR', [0.262, 0.598, -0.052], [0.026, 0.036, 0.0035], [28, 0, 4], 7, 3);
ell('earR', [0.27, 0.632, -0.06], [0.02, 0.026, 0.0035], [34, 0, -128], 7, 3);
// legs
for (const [side, tag, g] of [[L, 'fl', 2], [R, 'fr', 3]]) {
  const z = (v) => side * v;
  ell(`${tag}Shoulder`, [0.165, 0.29, z(0.068)], [0.04, 0.05, 0.034], [0, 0, 0], g);       // deltoid
  ell(`${tag}Shoulder`, [0.138, 0.258, z(0.066)], [0.036, 0.06, 0.032], [0, 0, -19], g);  // triceps
  cone(`${tag}Shoulder`, [0.165, 0.3, z(0.068)], 0.04, [0.13, 0.2, z(0.072)], 0.03, g);
  cone(`${tag}Elbow`, [0.13, 0.2, z(0.072)], 0.028, [0.143, 0.07, z(0.074)], 0.0175, g);  // forearm
  ell(`${tag}Elbow`, [0.14, 0.165, z(0.074)], [0.026, 0.05, 0.024], [0, 0, 4], g);      // forearm muscle
  cone(`${tag}Wrist`, [0.143, 0.066, z(0.074)], 0.018, [0.155, 0.026, z(0.074)], 0.016, g); // pastern
  ell(`${tag}Wrist`, [0.163, 0.015, z(0.074)], [0.026, 0.014, 0.021], [0, 0, 0], g);      // paw
  for (const dz of [-0.012, -0.004, 0.004, 0.012]) ell(`${tag}Wrist`, [0.181, 0.009, z(0.074) + dz], [0.009, 0.009, 0.0058], [0, 0, 0], g);
}
for (const [side, tag, g] of [[L, 'hl', 4], [R, 'hr', 5]]) {
  const z = (v) => side * v;
  ell(`${tag}Hip`, [-0.165, 0.3, z(0.062)], [0.07, 0.095, 0.046], [0, 0, 32], g);          // thigh
  ell(`${tag}Hip`, [-0.215, 0.29, z(0.055)], [0.038, 0.075, 0.038], [0, 0, 12], g);       // back of thigh
  cone(`${tag}Hip`, [-0.19, 0.345, z(0.058)], 0.05, [-0.11, 0.235, z(0.068)], 0.032, g);
  ell(`${tag}Stifle`, [-0.188, 0.19, z(0.064)], [0.026, 0.055, 0.024], [0, 0, -44], g);   // gaskin muscle
  cone(`${tag}Stifle`, [-0.11, 0.235, z(0.068)], 0.028, [-0.235, 0.105, z(0.064)], 0.016, g);
  cone(`${tag}Hock`, [-0.24, 0.108, z(0.064)], 0.016, [-0.226, 0.026, z(0.064)], 0.015, g); // rear pastern
  ell(`${tag}Toe`, [-0.213, 0.014, z(0.064)], [0.024, 0.013, 0.02], [0, 0, 0], g);        // paw
  for (const dz of [-0.011, -0.004, 0.004, 0.011]) ell(`${tag}Toe`, [-0.196, 0.008, z(0.064) + dz], [0.0085, 0.0085, 0.0055], [0, 0, 0], g);
}
// tail: hangs, then sweeps back
cone('tail0', [-0.255, 0.375, 0], 0.023, [-0.325, 0.315, 0], 0.017, 6);
cone('tail1', [-0.325, 0.315, 0], 0.016, [-0.365, 0.245, 0], 0.011, 6);
cone('tail2', [-0.365, 0.245, 0], 0.0105, [-0.42, 0.19, 0], 0.004, 6);

export const COUNTS = { cones: C.length, ells: E.length };
export const CONES = C;
export const ELLS = E;

// ---------- pose -> joint matrices -> uniform arrays ----------
// pose: { root: {x,y,z, rx,ry,rz}, <joint>: [rx, ry, rz] }
export function solve(pose) {
  const M = {};
  for (const name of ORDER) {
    const j = JOINTS[name];
    const r = pose[name] || [0, 0, 0];
    let local = about(j.pivot, rotXYZ(r[0] || 0, r[1] || 0, r[2] || 0));
    if (name === 'root') {
      const o = pose.offset || [0, 0, 0];
      local = mul([1, 0, 0, 0, 1, 0, 0, 0, 1, o[0], o[1], o[2]], local);
    }
    M[name] = j.parent ? mul(M[j.parent], local) : local;
  }
  return M;
}

const coneData = new Float32Array(C.length * 8);
const ellData = new Float32Array(E.length * 6);
const ellRot = new Float32Array(E.length * 9);

export function pack(M) {
  C.forEach((c, i) => {
    const m = M[c.j];
    const a = apply(m, c.a);
    const b = apply(m, c.b);
    coneData.set([a[0], a[1], a[2], c.ra, b[0], b[1], b[2], c.rb], i * 8);
  });
  E.forEach((e, i) => {
    const m = M[e.j];
    const c = apply(m, e.c);
    ellData.set([c[0], c[1], c[2], e.r[0], e.r[1], e.r[2]], i * 6);
    // world-to-ellipsoid rotation = (jointRot * restRot)^T
    const rr = mul(m, rotXYZ(...e.rot));
    // transpose of the 3x3
    ellRot.set([rr[0], rr[3], rr[6], rr[1], rr[4], rr[7], rr[2], rr[5], rr[8]], i * 9);
  });
  return { coneData, ellData, ellRot };
}
