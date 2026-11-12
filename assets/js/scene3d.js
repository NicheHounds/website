/**
 * WebGL2 host for the lunar scene. Owns the canvas, the camera, the static
 * ground texture, and the per-frame hound pass.
 */
import { TERRAIN_FS, QUAD_VS, BLIT_FS } from './lunar.js';
import { dogShader } from './dogshader.js';
import { solve, pack } from './dog3d.js';

const R_MOON = 18;      // metres: a small sphere, so the horizon curves
const EYE = 0.85;       // camera height: an astronaut crouching

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

/**
 * Camera for a layout. Screen positions are fractions of the canvas.
 * crest: [x, y] where the horizon peaks; paws: [x, y] where the hound stands.
 */
export function makeCamera(W, H, { crest, paws, focal, heading }) {
  const f = focal * H;
  const dip = Math.acos(R_MOON / (R_MOON + EYE));
  const pp = [crest[0] * W, crest[1] * H - f * Math.tan(dip)];
  const cam = [0, EYE, 0];
  const S = [0, -R_MOON, 0];
  // ray through the paw point, onto the sphere
  const dir = norm([(paws[0] * W - pp[0]) / f, -(paws[1] * H - pp[1]) / f, -1]);
  const oc = [cam[0] - S[0], cam[1] - S[1], cam[2] - S[2]];
  const b = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
  const c = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - R_MOON * R_MOON;
  const t = -b - Math.sqrt(Math.max(0, b * b - c));
  const dog = cam.map((v, i) => v + dir[i] * t);
  const up = norm([dog[0] - S[0], dog[1] - S[1], dog[2] - S[2]]);
  // The hound faces right and a little away, as in the mark.
  const yaw = ((heading ?? 28) * Math.PI) / 180;
  let X = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const dp = X[0] * up[0] + X[1] * up[1] + X[2] * up[2];
  X = norm(X.map((v, i) => v - up[i] * dp));
  const Z = [X[1] * up[2] - X[2] * up[1], X[2] * up[0] - X[0] * up[2], X[0] * up[1] - X[1] * up[0]];
  const dogRotT = [X[0], up[0], Z[0], X[1], up[1], Z[1], X[2], up[2], Z[2]];
  const dogToWorld = (p) => [0, 1, 2].map((i) => dog[i] + X[i] * p[0] + up[i] * p[1] + Z[i] * p[2]);
  return { W, H, f, pp, cam, S, R: R_MOON, dog, up, dogRotT, dogToWorld, rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
}

export function project(camera, p) {
  const { f, pp, cam } = camera;
  const d = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
  const z = -d[2];
  return [pp[0] + (d[0] / z) * f, pp[1] - (d[1] / z) * f, z];
}

export function createScene(canvas) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const terrain = program(gl, QUAD_VS, TERRAIN_FS);
  const blit = program(gl, QUAD_VS, BLIT_FS);
  const dog = program(gl, QUAD_VS, dogShader());
  let tex = null;
  let gtex = null;
  let fbo = null;
  let size = [0, 0];
  const makeTex = (W, H) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  function common(prog, s) {
    const u = prog.u;
    const c = s.camera;
    gl.uniform2f(u.uRes, c.W, c.H);
    gl.uniform2f(u.uPP, c.pp[0], c.pp[1]);
    gl.uniform1f(u.uF, c.f);
    gl.uniform3fv(u.uCam, c.cam);
    gl.uniformMatrix3fv(u.uCamRot, false, c.rot);
    gl.uniform3fv(u.uS, c.S);
    gl.uniform1f(u.uR, c.R);
    gl.uniform3fv(u.uSun, s.sun);
    gl.uniform3fv(u.uSunCol, s.sunColor);
    gl.uniform3fv(u.uEarth, s.earth);
    gl.uniform1f(u.uShine, s.shine);
    gl.uniform3fv(u.uDog, c.dog);
  }

  // Render the ground into its texture. strip: [y0, y1] device px from the top,
  // so a slow GPU can spread the work over several frames.
  function renderGround(s, strip) {
    const { W, H } = s.camera;
    if (size[0] !== W || size[1] !== H) {
      if (tex) gl.deleteTexture(tex);
      if (gtex) gl.deleteTexture(gtex);
      if (fbo) gl.deleteFramebuffer(fbo);
      tex = makeTex(W, H);
      gtex = makeTex(W, H);
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, gtex, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      size = [W, H];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    if (strip) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, H - strip[1], W, strip[1] - strip[0]);
    }
    gl.useProgram(terrain.p);
    common(terrain, s);
    gl.uniform4f(terrain.u.uRect, -1, -1, 1, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function frame(s, extra) {
    const { W, H } = s.camera;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(blit.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(blit.u.uTex, 0);
    gl.uniform4f(blit.u.uRect, -1, -1, 1, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (extra) extra(gl, common);
  }

  function drawDog(s, pose, rect) {
    const c = s.camera;
    const { coneData, ellData, ellRot } = pack(solve(pose));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(dog.p);
    common(dog, s);
    gl.uniform4fv(dog.u.uC, coneData);
    gl.uniform3fv(dog.u.uE, ellData);
    gl.uniformMatrix3fv(dog.u.uER, false, ellRot);
    gl.uniformMatrix3fv(dog.u.uDogRotT, false, c.dogRotT);
    gl.uniform3fv(dog.u.uDogPos, c.dog);
    gl.uniform3fv(dog.u.uGroundCol, s.groundColor);
    gl.uniform1f(dog.u.uEyeOpen, pose.eyeOpen ?? 1);
    gl.uniform1f(dog.u.uDogAlpha, s.dogAlpha ?? 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gtex);
    gl.uniform1i(dog.u.uGround, 1);
    const r = rect || [-1, -1, 1, 1];
    gl.uniform4f(dog.u.uRect, r[0], r[1], r[2], r[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
  }

  return { gl, renderGround, frame, drawDog };
}
