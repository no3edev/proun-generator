import * as THREE from 'three';
import { DYNAMICS } from '../config/defaults.js';
import { NOISE_GLSL } from './noiseGLSL.js';
import { hashSeed, mulberry32 } from '../generator/rng.js';

// THE GROUND: the paper/canvas texture behind the shapes.
//
// In the reference works the ground texture is part of the support and is
// covered by paint — it never shows through a shape. So it lives here, as a
// full-screen layer drawn first, before every shape, instead of a DOM
// overlay multiplied over the whole image (which darkened the shapes too).
//
// It is procedural (no texture): cloud mottle, fine speckle and optional
// hairline cracks, computed from the picture's own coordinates with a fixed
// seed. So it is the same for every composition and palette (nothing
// re-rolls), resolution-independent (an export at 4x is sharper, not
// softer) and cheap. It varies the paper color around its mean, so raising
// its visibility adds texture without shifting the overall tone.
//
// The layer is a quad in clip space, so it covers the viewport at any size
// and ignores the camera; it writes no depth. The render path is unchanged.

const uniforms = {
  uPaper: { value: new THREE.Color('#ffffff') },
  uAspect: { value: 1 },
  uVis: { value: DYNAMICS.ground.visibility },
  uScale: { value: DYNAMICS.ground.scale },
  uCracks: { value: DYNAMICS.ground.cracks },
  uCrackScale: { value: DYNAMICS.ground.crackScale },
  uCrackStretch: { value: DYNAMICS.ground.crackStretch },
  uCrackVary: { value: DYNAMICS.ground.crackVary },
  uMotion: { value: 0 },
  uPhase: { value: 0 },
  uMorph: { value: 0 },
  uOffA: { value: new THREE.Vector2() },
  uOffB: { value: new THREE.Vector2() },
  uEvolve: { value: DYNAMICS.groundMotion.evolve },
  uWarp: { value: DYNAMICS.groundMotion.warp },
  uLift: { value: DYNAMICS.groundMotion.lift },
  uSeed: { value: new THREE.Vector2(DYNAMICS.ground.seed, DYNAMICS.ground.seed * 1.7) }
};

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

export const GROUND_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uPaper;
uniform float uAspect;
uniform float uVis;
uniform float uScale;
uniform float uCracks;
uniform float uCrackScale;
uniform float uCrackStretch;
uniform float uCrackVary;
uniform vec2 uSeed;
uniform float uMotion;
uniform float uPhase;
uniform float uMorph;
uniform vec2 uOffA;
uniform vec2 uOffB;
uniform float uEvolve;
uniform float uWarp;
uniform float uLift;

${NOISE_GLSL}
// distance to the nearest cell boundary of an irregular cell pattern (0 on the lines).
// The cell centres of pattern A drift to those of pattern B as w goes 0 -> 1, so
// the network rearranges continuously (the distance is continuous in the
// centres: lines slide, appear and fade, never pop).
float crackEdge( vec2 p, vec2 offA, vec2 offB, float w ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  float d1 = 8.0;
  float d2 = 8.0;
  for ( int y = -1; y <= 1; y++ ) {
    for ( int x = -1; x <= 1; x++ ) {
      vec2 g = vec2( float( x ), float( y ) );
      vec2 o = vec2( hash21( i + g + offA ), hash21( i + g + offA + 37.7 ) );
      if ( w > 0.0 ) {
        vec2 ob = vec2( hash21( i + g + offB ), hash21( i + g + offB + 37.7 ) );
        o = mix( o, ob, w );
      }
      vec2 r = g + o - f;
      float d = dot( r, r );
      if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
    }
  }
  return sqrt( d2 ) - sqrt( d1 );
}

// the deformation field at integer phase k: a different smooth field for every k
vec2 warpAt( vec2 p, float k ) {
  vec2 o = vec2( hash21( vec2( k, 1.7 ) ), hash21( vec2( k, 9.2 ) ) ) * 40.0;
  return vec2( vnoise( p * 3.1 + o ), vnoise( p * 3.1 + o.yx + 11.3 ) ) - 0.5;
}

void main() {
  // the picture's own coordinates (height = 1), plus the fixed seed
  vec2 p = vec2( vUv.x * uAspect, vUv.y ) + uSeed;
  // the ground's own motion (uMotion is 0 at rest and the code is skipped):
  // the patches deform (the field is sampled through a gentle warp) and
  // condense (soft clouds sharpen toward defined blotches at the same
  // spread). Only the mottle moves; the speckle and cracks are the paper's
  // fixed identity. Nothing here shifts the mean tone.
  vec2 pm = p;
  if ( uMotion > 0.0 ) {
    // uPhase is the ground's position along its list of patterns, so each
    // morph deforms the paper differently, and the field is continuous in it
    float pk = floor( uPhase );
    float pf = fract( uPhase );
    pf = pf * pf * ( 3.0 - 2.0 * pf );
    pm += uWarp * uMotion * 2.0 * mix( warpAt( p, pk ), warpAt( p, pk + 1.0 ), pf );
  }
  // the mottle: the pattern of this composition's seed (uOffA), or, while
  // the ground morphs, a blend toward the next one (uOffB) that keeps the
  // spread the same, so the paper never gets flatter mid-morph
  float mottle = fbm( pm * 14.0 * uScale + uOffA ) - 0.5;
  if ( uMorph > 0.0 ) {
    float mb = fbm( pm * 14.0 * uScale + uOffB ) - 0.5;
    mottle = ( mottle * ( 1.0 - uMorph ) + mb * uMorph ) * inversesqrt( ( 1.0 - uMorph ) * ( 1.0 - uMorph ) + uMorph * uMorph );
  }
  if ( uMotion > 0.0 ) {
    float cond = ( smoothstep( -0.08, 0.08, mottle ) - 0.5 ) * 0.26;
    mottle = mix( mottle, cond, uMotion * uEvolve );
  }
  float fine = vnoise( p * 260.0 ) - 0.5;
  float z = mottle * @KM@ + fine * @KF@;
  float vis = uVis * ( 1.0 + uLift * uMotion );
  // the sRGB-encoded variation is roughly 1/2.2 of the linear one
  float m = 1.0 + vis * 2.2 * z;
  if ( uCracks > 0.0 ) {
    // each seed has its own network; uCrackVary 0 pins it (the paper's fixed cracks)
    vec2 ca = uOffA * uCrackVary * 1.37;
    vec2 cb = uOffB * uCrackVary * 1.37;
    // fine, irregular, mostly vertical hairlines (cells taller than wide, wobbled)
    vec2 wob = mix( vec2( vnoise( p * 30.0 + ca ), vnoise( p * 30.0 + 9.3 + ca ) ),
                    vec2( vnoise( p * 30.0 + cb ), vnoise( p * 30.0 + 9.3 + cb ) ), uMorph );
    vec2 q = vec2( p.x * 120.0, p.y * 120.0 / max( uCrackStretch, 0.1 ) ) * uCrackScale + 0.45 * wob;
    float e = crackEdge( q, ca, cb, uMorph );
    // a fixed physical width (in cell units) with an anti-aliased edge about
    // a pixel wide: the same line weight on screen and at every export size
    float aa = fwidth( e ) * 0.5;
    float line = 1.0 - smoothstep( 0.065 - aa, 0.065 + aa, e );
    float patchy = 0.35 + 0.65 * smoothstep( 0.3, 0.7, mix( fbm( p * 7.0 + ca ), fbm( p * 7.0 + cb ), uMorph ) );
    m -= uCracks * 0.22 * line * patchy;
  }
  gl_FragColor = vec4( uPaper * max( m, 0.0 ), 1.0 );
  #include <colorspace_fragment>
}
`;

/** Normalizing weights: mottle and speckle contributions, tuned so `visibility` reads as std/mean. */
export const GROUND_WEIGHTS = { mottle: 7.0, fine: 3.0 };

let mesh = null;

/** Adds the ground to `scene`; drawn before everything else. */
export function initGround(/** @type {THREE.Scene} */ scene) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: GROUND_FRAGMENT
      .replace('@KM@', GROUND_WEIGHTS.mottle.toFixed(3))
      .replace('@KF@', GROUND_WEIGHTS.fine.toFixed(3)),
    depthTest: false,
    depthWrite: false
  });
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);
}

/** The paper the ground varies around (the active palette's). */
export function setGroundPaper(/** @type {string} */ hex) {
  uniforms.uPaper.value.set(hex);
}

/** Width / height of the picture, so the pattern keeps its proportions. */
export function setGroundAspect(/** @type {number} */ aspect) {
  uniforms.uAspect.value = aspect;
}

/**
 * Live tuning (lab). Uniforms only.
 * @param {{ on: boolean, visibility: number, scale: number, cracks: number, crackScale: number, crackStretch: number, crackVary: number }} p
 */
export function setGroundParams(p) {
  uniforms.uVis.value = p.visibility;
  uniforms.uScale.value = p.scale;
  uniforms.uCracks.value = p.cracks;
  uniforms.uCrackScale.value = p.crackScale;
  uniforms.uCrackStretch.value = p.crackStretch;
  uniforms.uCrackVary.value = p.crackVary;
  if (mesh) mesh.visible = p.on;
}

/**
 * The ground's change. Every composition seed has its own ground pattern.
 * When the seed changes, the ground MORPHS once, one way, from the old
 * pattern to the new and stays there; mid-morph the patches also deform,
 * condense and strengthen a little (`level`, 0 at both ends). A second change
 * mid-morph just retargets: the morph carries on from where it is, smoothly,
 * never back. At rest the pattern depends only on the current seed, not on
 * the history that led to it.
 */
export const groundMotion = {
  enabled: true,
  delay: DYNAMICS.groundMotion.delay,
  duration: DYNAMICS.groundMotion.duration,
  /** 0..1 bump, 0 at rest and at both ends of a morph */
  level: 0,
  /** position along the list of patterns: integer at rest */
  pos: 0,
  /** how many patterns have been dropped from the front of the list (pos + shifts only ever grows) */
  shifts: 0
};

/** @param {number} seed @returns {[number, number]} where in the field this seed's pattern lives */
export function groundOffset(seed) {
  const rng = mulberry32(hashSeed('ground', seed));
  return [rng() * 211, rng() * 211];
}

/** @type {Array<[number, number]>} */
let patterns = [];
let lastSeed = /** @type {number | null} */ (null);
let target = 0;            // index of the pattern the ground is heading for
let vel = 0;               // per ms
/** @type {number[]} */
let pending = [];          // ms until each queued change starts to take effect

const smooth = (/** @type {number} */ x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

/**
 * Follows the composition seed; call once per frame.
 * @param {{ duration: number, hold: number | null }} shared the shared event clock (Rhythm)
 * @param {number} dt ms since the previous frame
 * @param {number} seed the current composition seed
 */
export function updateGroundMotion(shared, dt, seed) {
  if (lastSeed === null) {
    lastSeed = seed;
    patterns = [groundOffset(seed)];
  } else if (seed !== lastSeed) {
    lastSeed = seed;
    patterns.push(groundOffset(seed));
    if (groundMotion.enabled) pending.push(groundMotion.delay * shared.duration);
    else target = patterns.length - 1;
  }

  const dur = Math.max(1, groundMotion.duration * shared.duration);
  if (!groundMotion.enabled) {
    pending = [];
    target = patterns.length - 1;
    groundMotion.pos = target;
    vel = 0;
  } else if (shared.hold !== null && patterns.length > 1) {
    // lab: freeze the latest morph at this many durations after the change
    const base = patterns.length - 2;
    groundMotion.pos = base + smooth((shared.hold - groundMotion.delay) / groundMotion.duration);
    target = patterns.length - 1;
    pending = [];
    vel = 0;
  } else {
    // queued changes take effect after the delay
    pending = pending.map((t) => t - dt).filter((t) => {
      if (t <= 0) { target = Math.min(target + 1, patterns.length - 1); return false; }
      return true;
    });
    // a critically damped follower: smooth, one way, continuous in position
    // and speed through retargeting; ~95% of the way in `dur`
    const omega = 4.74 / dur;
    const n = Math.max(1, Math.ceil(dt / 16));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      vel += (omega * omega * (target - groundMotion.pos) - 2 * omega * vel) * h;
      groundMotion.pos += vel * h;
    }
    if (Math.abs(target - groundMotion.pos) < 0.002 && Math.abs(vel) < 2e-5) {
      groundMotion.pos = target;
      vel = 0;
    }
  }

  // keep the list short: patterns the ground has fully left are dropped
  while (patterns.length > 1 && groundMotion.pos >= 1) {
    patterns.shift();
    groundMotion.pos -= 1;
    groundMotion.shifts += 1;
    target -= 1;
  }

  const last = patterns.length - 1;
  const pos = Math.min(Math.max(groundMotion.pos, 0), last);
  const idx = Math.min(Math.floor(pos), last);
  const f = pos - idx;
  const a = patterns[idx];
  const b = patterns[Math.min(idx + 1, last)];
  uniforms.uOffA.value.set(a[0], a[1]);
  uniforms.uOffB.value.set(b[0], b[1]);
  uniforms.uMorph.value = idx < last ? smooth(f) : 0;
  groundMotion.level = idx < last ? 4 * f * (1 - f) : 0;
  uniforms.uMotion.value = groundMotion.level;
  uniforms.uPhase.value = pos;
}

/** Back to a fresh state (tests). */
export function resetGroundMotion() {
  patterns = [];
  lastSeed = null;
  target = 0;
  vel = 0;
  pending = [];
  groundMotion.pos = 0;
  groundMotion.shifts = 0;
  groundMotion.level = 0;
}

/**
 * Live tuning of the motion's amounts (lab). Uniforms only.
 * @param {{ evolve: number, warp: number, lift: number }} p
 */
export function setGroundMotionParams(p) {
  uniforms.uEvolve.value = p.evolve;
  uniforms.uWarp.value = p.warp;
  uniforms.uLift.value = p.lift;
}
