/**
 * What the hound does: poses, how it moves between them, and the small life on
 * top (breath, tail, ears, blinks, looking at the pointer).
 *
 * Joint angles are degrees [roll, yaw, pitch]. Positive pitch swings a hanging
 * limb's lower end forward and lifts the nose; negative yaw turns toward us.
 */

const both = (l, r, v) => ({ [l]: v, [r]: v });
const legs = (tag, v) => both(`fl${tag}`, `fr${tag}`, v);
const hind = (tag, v) => both(`hl${tag}`, `hr${tag}`, v);

const STANDING = {
  // the mark: head up, turned a little toward us, looking up and out
  neck: [0, -4, 0], head: [0, -10, 6],
};

const SITTING = {
  offset: [0, -0.226, 0], root: [0, 0, 40],
  ...legs('Shoulder', [0, 0, -34]), ...legs('Wrist', [0, 0, -6]),
  ...hind('Hip', [0, 0, 12]), ...hind('Stifle', [0, 0, -69]), ...hind('Hock', [0, 0, 96]), ...hind('Toe', [0, 0, -79]),
  tail0: [0, 0, -40], tail1: [0, 0, -10],
  neck: [0, -4, -24], head: [0, -10, -6],
};

const LYING = {
  offset: [0.02, -0.185, 0],
  ...legs('Shoulder', [0, 0, 36]), ...legs('Elbow', [0, 0, 47]), ...legs('Wrist', [0, 0, -62]),
  ...hind('Hip', [0, 0, 26]), ...hind('Stifle', [0, 0, -48]), ...hind('Hock', [0, 0, 102]), ...hind('Toe', [0, 0, -80]),
  tail0: [0, 0, -35], tail1: [0, 8, -8],
  neck: [0, -6, -8], head: [0, -10, 2],
};

const SLEEPING = {
  ...LYING,
  neck: [0, -8, -34], head: [0, -6, -16],
  earL: [0, 0, -8], earR: [0, 0, -8],
  tail0: [0, -20, -38], tail1: [0, -25, -12], tail2: [0, -20, 0],
  eyeOpen: 0,
};

const PLAYBOW = {
  offset: [0.02, -0.07, 0], root: [0, 0, -16],
  ...legs('Shoulder', [0, 0, 52]), ...legs('Elbow', [0, 0, 30]), ...legs('Wrist', [0, 0, -66]),
  ...hind('Hip', [0, 0, 6]), ...hind('Stifle', [0, 0, 4]), ...hind('Hock', [0, 0, 4]),
  tail0: [0, 0, 55], tail1: [0, 0, 15],
  neck: [0, -12, 8], head: [0, -14, 10],
};

const SNIFF = {
  neck: [0, -4, -52], head: [0, -6, -30],
  ...legs('Shoulder', [0, 0, 4]),
  tail0: [0, 0, 18],
};

export const POSES = { standing: STANDING, sitting: SITTING, lying: LYING, sleeping: SLEEPING, playbow: PLAYBOW, sniff: SNIFF };

const JOINT_KEYS = ['root', 'pelvis', 'chest', 'neck', 'head', 'jaw', 'earL', 'earR',
  'flShoulder', 'flElbow', 'flWrist', 'frShoulder', 'frElbow', 'frWrist',
  'hlHip', 'hlStifle', 'hlHock', 'hlToe', 'hrHip', 'hrStifle', 'hrHock', 'hrToe', 'tail0', 'tail1', 'tail2'];

const GROUP = (k) => (k === 'offset' || k === 'root' || k === 'pelvis' || k === 'chest' ? 'body'
  : k.startsWith('f') ? 'front' : k.startsWith('h') && k !== 'head' ? 'hind'
  : k === 'neck' || k === 'head' || k === 'jaw' ? 'head' : k.startsWith('tail') ? 'tail' : k.startsWith('ear') ? 'ears' : 'eye');

// When each part moves within a transition (fractions of its duration).
const TIMING = {
  sitting: { ms: 2000, hind: [0, 0.75], body: [0.1, 1], front: [0.15, 1], head: [0.2, 1] },
  lying: { ms: 2400, front: [0, 0.75], body: [0.15, 1], hind: [0.1, 1], head: [0.3, 1] },
  sleeping: { ms: 3000, head: [0, 1], eye: [0.5, 1], tail: [0.2, 1], ears: [0.3, 1] },
  standing: { ms: 1300, eye: [0, 0.1], head: [0, 0.5], body: [0, 0.65], front: [0, 0.7], hind: [0.2, 1], tail: [0.2, 1] },
  playbow: { ms: 900, front: [0, 0.8], body: [0, 0.9] },
  sniff: { ms: 1100, head: [0, 1] },
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function full(p) {
  const out = { offset: (p.offset || [0, 0, 0]).slice(), eyeOpen: p.eyeOpen ?? 1 };
  for (const k of JOINT_KEYS) out[k] = (p[k] || [0, 0, 0]).slice();
  return out;
}

function blend(a, b, target, t) {
  const A = full(a), B = full(b), out = {};
  const win = TIMING[target] || { ms: 1000 };
  const at = (k) => {
    const [s, e] = win[GROUP(k)] || [0, 1];
    return ease(clamp((t - s) / (e - s), 0, 1));
  };
  out.offset = A.offset.map((v, i) => v + (B.offset[i] - v) * at('offset'));
  out.eyeOpen = A.eyeOpen + (B.eyeOpen - A.eyeOpen) * at('eyeOpen');
  for (const k of JOINT_KEYS) out[k] = A[k].map((v, i) => v + (B[k][i] - v) * at(k));
  return out;
}

const IDLE_STEPS = [['sitting', 10], ['lying', 24], ['sleeping', 42]];
const RESTING = ['standing', 'sitting', 'lying', 'sleeping'];

/**
 * opts.reducedMotion: MediaQueryList; opts.hold: pose name; opts.idleScale.
 * look(): returns {x, y} pointer offset from the hound's head in px, or null.
 */
export function createBrain(opts = {}) {
  const still = () => !!(opts.reducedMotion && opts.reducedMotion.matches);
  const now = () => performance.now();
  const idleScale = opts.idleScale || 1;
  let state = opts.hold && POSES[opts.hold] ? opts.hold : 'standing';
  let current = full(POSES[state]);
  let tween = null;
  let lastActive = now();
  let nextAct = now() + 7000;
  let act = null; // {name, until}
  let blinkAt = now() + 2500;
  let lookYaw = 0, lookPitch = 0;
  let wagEnergy = 1;
  let twitch = { at: now() + 4000, side: 1 };

  function go(target, ms) {
    state = target;
    if (still()) { tween = null; current = full(POSES[target]); return; }
    tween = { from: current, target, start: now(), ms: ms || (TIMING[target] || {}).ms || 1000 };
  }

  function wake() {
    lastActive = now();
    wagEnergy = 1.6;
    if (opts.hold) return;
    if (state !== 'standing') { act = null; go('standing'); }
  }

  function step(look) {
    const t = now();
    const sec = t / 1000;
    if (!opts.hold) {
      const idle = ((t - lastActive) / 1000) * idleScale;
      const rank = RESTING.indexOf(state);
      let want = 0;
      IDLE_STEPS.forEach(([, s], i) => { if (idle >= s) want = i + 1; });
      if (!tween && !act && rank >= 0 && want > rank) go(RESTING[rank + 1]);
      // while standing and awake, now and then do something
      if (!tween && state === 'standing' && !act && t > nextAct && !still()) {
        const r = Math.random();
        const name = r < 0.38 ? 'sniff' : r < 0.6 ? 'playbow' : 'lookaround';
        act = { name, start: t, until: t + (name === 'sniff' ? 3600 : name === 'playbow' ? 2300 : 3000) };
        if (name !== 'lookaround') go(name);
      }
      if (act && t > act.until) {
        if (act.name !== 'lookaround') go('standing');
        act = null;
        nextAct = t + 6000 + Math.random() * 7000;
      }
    }

    let pose;
    if (tween) {
      const k = clamp((t - tween.start) / tween.ms, 0, 1);
      pose = blend(tween.from, POSES[tween.target], tween.target, k);
      if (k >= 1) tween = null;
    } else {
      pose = full(POSES[state]);
    }
    current = pose;
    if (still()) return pose;

    const shown = full(pose);
    const awake = state !== 'sleeping';
    // breathing: the chest rises a little, slower and deeper asleep
    const br = awake ? Math.sin(sec * 2 * Math.PI / 3.4) : Math.sin(sec * 2 * Math.PI / 5.5);
    shown.chest[2] += br * (awake ? 0.5 : 0.9);
    shown.neck[2] -= br * (awake ? 0.3 : 0.6);
    // tail: wag harder when just woken or playing; a slow sway when resting
    wagEnergy += (1 - wagEnergy) * 0.01;
    const wag = state === 'playbow' ? 26 : state === 'standing' ? 14 * wagEnergy : state === 'sitting' ? 8 : state === 'lying' ? 5 : 1.5;
    const hz = state === 'playbow' ? 3.2 : state === 'standing' ? 2.0 : state === 'sleeping' ? 0.2 : 1.0;
    shown.tail0[1] += wag * Math.sin(sec * hz * 2 * Math.PI);
    shown.tail1[1] += wag * 0.7 * Math.sin(sec * hz * 2 * Math.PI - 0.8);
    // ears: an occasional flick
    if (awake && t > twitch.at) {
      const k = (t - twitch.at) / 260;
      const e = twitch.side > 0 ? 'earL' : 'earR';
      if (k < 1) shown[e][2] += Math.sin(k * Math.PI) * 14;
      else twitch = { at: t + 2500 + Math.random() * 6000, side: Math.random() < 0.5 ? 1 : -1 };
    }
    // head: follow the pointer when there is one, otherwise glance around
    let ty = 0, tp = 0;
    if (awake && state !== 'sniff' && state !== 'playbow') {
      if (look) {
        ty = clamp(-look.x / 9, -30, 22) - 4;
        tp = clamp(-look.y / 14, -16, 18);
      }
      if (act && act.name === 'lookaround') {
        const k = (t - act.start) / (act.until - act.start);
        ty += -34 * Math.sin(k * Math.PI) * (k < 0.5 ? 1 : 0.6);
        tp += 6 * Math.sin(k * Math.PI * 2);
      }
      // a curious tilt now and then
      shown.head[0] += 7 * Math.max(0, Math.sin(sec * 0.31) - 0.7) / 0.3;
    }
    lookYaw += (ty - lookYaw) * 0.06;
    lookPitch += (tp - lookPitch) * 0.06;
    shown.head[1] += lookYaw * 0.65;
    shown.neck[1] += lookYaw * 0.35;
    shown.head[2] += lookPitch;
    if (state === 'sniff') {
      shown.head[1] += 9 * Math.sin(sec * 1.3);
      shown.head[2] += 2.5 * Math.max(0, Math.sin(sec * 22));   // little sniffs
    }
    // blink
    if (awake) {
      if (t > blinkAt + 170) blinkAt = t + 2400 + Math.random() * 4000;
      else if (t > blinkAt) shown.eyeOpen = Math.min(shown.eyeOpen, 1 - Math.sin(((t - blinkAt) / 170) * Math.PI));
    }
    return shown;
  }

  return {
    step,
    wake,
    get state() { return state; },
    get resting() { return !tween; },
  };
}
