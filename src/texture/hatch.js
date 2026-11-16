// @ts-check
// HATCHING (stage 5.2c): graphite-style parallel lines as a tonal field on flat surfaces, the way the lithographs treat a dark
// field and a soft plane.
//
//   who    the Mass strategy's backdrop when it is DARK (its great disc or large plane; a pale backdrop stays smooth, as in the
//          lithograph), and about half of the graphic shadow planes of a picture (picked by seed, so some stay flat)
//   where  in the surface's own plane, in world lengths along the form's own axes: the lines belong to the form and move, scale and
//          grow with it (nothing swims over it during a morph), and at an export scale they are the same lines, only sharper
//   look   one angle per picture from a small set of diagonals, shared by every hatched surface in it (they read as one hand); a
//          fixed spacing; lines go a little toward the ink on a light or mid surface and a little toward the paper on a dark one;
//          each line has its own strength, wanders a little and breaks now and then; no cross-hatching
//   scope  composition strategies only: a legacy composition has none
//
// The pigment shader (PigmentResponse.js) applies it to the Mass backdrop; the shadow planes, which are flat `MeshBasicMaterial`s,
// get the same lines from a small patch of their own (installShadowHatch).
import * as THREE from 'three';
import { DYNAMICS } from '../config/defaults.js';
import { LEGACY_STRATEGY } from '../config/SceneConfig.js';
import { createRng } from '../generator/rng.js';
import { NOISE_GLSL } from './noiseGLSL.js';

/** the angles one picture's hatching can take (degrees; rising and falling diagonals) */
export const HATCH_ANGLES = [35, 45, 55, -35, -45, -55];
/** a surface darker than this (linear luminance, about sRGB 0.5) gets lines toward the paper, a lighter one toward the ink */
export const HATCH_DARK_BELOW = 0.2;

/** Uniforms shared by every hatched surface: the lab's numbers and the palette's two colours. */
export const hatchShared = {
  uHatchOn: { value: 1 },
  uHatchSpacing: { value: DYNAMICS.hatch.spacing },
  uHatchWidth: { value: DYNAMICS.hatch.width },
  uHatchLight: { value: DYNAMICS.hatch.light },
  uHatchDark: { value: DYNAMICS.hatch.dark },
  uHatchWobble: { value: DYNAMICS.hatch.wobble },
  uHatchBreaks: { value: DYNAMICS.hatch.breaks },
  uHatchInk: { value: new THREE.Color('#201d18') },
  uHatchPaper: { value: new THREE.Color('#e9e4d8') }
};

/** What a hatched shader needs declared, and the one function that applies the lines. Needs NOISE_GLSL before it. */
export const HATCH_GLSL = `
uniform float uHatchAmt;
uniform float uHatchAng;
uniform float uHatchSeed;
// what the surface had before the last change (amount, angle, seed): it fades out as the new one fades in
uniform float uHatchFromAmt;
uniform float uHatchFromAng;
uniform float uHatchFromSeed;
uniform float uHatchOn;
uniform float uHatchSpacing;
uniform float uHatchWidth;
uniform float uHatchLight;
uniform float uHatchDark;
uniform float uHatchWobble;
uniform float uHatchBreaks;
uniform vec3 uHatchInk;
uniform vec3 uHatchPaper;
// col: the surface's colour; p: the position in the surface's plane (world lengths along the form's own axes)
vec3 hatchApplyW( vec3 col, vec2 p, float ang, float seed, float weight ) {
  float c = cos( ang );
  float s = sin( ang );
  vec2 q = vec2( c * p.x + s * p.y, -s * p.x + c * p.y );   // q.x across the lines, q.y along them
  float u0 = q.x / uHatchSpacing;
  float id = floor( u0 );
  // the line wanders a little along its length
  float u = u0 + uHatchWobble * ( vnoise( vec2( q.y * 2.2, id * 1.7 + seed ) ) - 0.5 );
  float d = abs( fract( u ) - 0.5 );
  float w = 0.5 * uHatchWidth;
  float aa = max( fwidth( u ) * 0.75, 0.0001 );
  float line = 1.0 - smoothstep( w - aa, w + aa, d );
  // it breaks now and then, and each line has its own strength
  float gap = smoothstep( uHatchBreaks, uHatchBreaks + 0.2, vnoise( vec2( q.y * 7.0 + id * 5.3, id * 3.1 + seed + 11.0 ) ) );
  float k = line * gap * ( 0.55 + 0.45 * hash21( vec2( id, seed ) ) );
  float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  bool dark = lum < ${HATCH_DARK_BELOW.toFixed(3)};
  return mix( col, dark ? uHatchPaper : uHatchInk, weight * k * ( dark ? uHatchDark : uHatchLight ) );
}
// The surface's hatching as a change goes through it: m is how far the change has got (0 at its start, 1 at rest, where only the new
// hatching is drawn, exactly as a still would have it). The old hatching fades out as the new one fades in, so a surface whose
// hatching comes, goes or turns does not jump in the first frame.
vec3 hatchBlend( vec3 col, vec2 p, float m ) {
  vec3 c = col;
  if ( uHatchFromAmt > 0.5 && m < 1.0 ) c = hatchApplyW( c, p, uHatchFromAng, uHatchFromSeed, 1.0 - m );
  if ( uHatchAmt > 0.5 ) c = hatchApplyW( c, p, uHatchAng, uHatchSeed, m );
  return c;
}
`;

/** Live tuning of the hatching (lab). @param {{ on: boolean, spacing: number, width: number, light: number, dark: number, wobble: number, breaks: number }} p */
export function setHatchParams(p) {
  hatchShared.uHatchOn.value = p.on ? 1 : 0;
  hatchShared.uHatchSpacing.value = Math.max(0.005, p.spacing);
  hatchShared.uHatchWidth.value = p.width;
  hatchShared.uHatchLight.value = p.light;
  hatchShared.uHatchDark.value = p.dark;
  hatchShared.uHatchWobble.value = p.wobble;
  hatchShared.uHatchBreaks.value = p.breaks;
}

/** The two colours of the lines: the palette's ink (a light surface) and paper (a dark one). @param {string} paper @param {string} ink */
export function setHatchColors(paper, ink) {
  hatchShared.uHatchPaper.value.set(paper);
  hatchShared.uHatchInk.value.set(ink);
}

/** One picture's hatching angle, in radians: the same for every surface in it. @param {number} seed */
export function hatchAngle(seed) {
  const r = createRng('hatch-angle', seed)();
  return (HATCH_ANGLES[Math.floor(r * HATCH_ANGLES.length) % HATCH_ANGLES.length] * Math.PI) / 180;
}

/** @typedef {{ type: string, role?: string, hex: string, position: number[] }} HatchEntry */
/** @typedef {{ seed: number, composition: { strategy: string } }} HatchConfig */

/** Does this entry's own surface carry hatching: the Mass strategy's backdrop, when it is dark. @param {HatchEntry} entry @param {HatchConfig | null} config */
export function hatchesSurface(entry, config) {
  if (!config || config.composition.strategy !== 'mass') return false;
  // the backdrop is the great disc or the large box the strategy puts behind everything (its anchor), or the large dark plane on a
  // pale one (a 'support' plane); the assembled blocks in front of it are 'support' blocks and stay flat
  const backdrop = (entry.role === 'anchor' && (entry.type === 'circle' || entry.type === 'plane' || entry.type === 'cube-variable'))
    || (entry.role === 'support' && entry.type === 'plane');
  if (!backdrop) return false;
  const c = new THREE.Color(entry.hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < HATCH_DARK_BELOW;
}

/** Does this entry's shadow plane carry hatching: about half of them, by seed. @param {HatchEntry} entry @param {HatchConfig | null} config */
export function hatchesShadow(entry, config) {
  if (!config || config.composition.strategy === LEGACY_STRATEGY) return false;
  return createRng('hatch-shadow', config.seed, entry.type, Math.round(entry.position[0] * 100), Math.round(entry.position[1] * 100))() < DYNAMICS.hatch.shadowShare;
}

/** The per-mesh numbers of a hatched surface: amount (0 or 1), angle (radians), and a seed that gives its lines their own wander. */
export function newHatchState() {
  return {
    uHatchAmt: { value: 0 }, uHatchAng: { value: 0 }, uHatchSeed: { value: 0 },
    uHatchFromAmt: { value: 0 }, uHatchFromAng: { value: 0 }, uHatchFromSeed: { value: 0 },
    uHatchMix: { value: 1 }   // a shadow plane's progress through its change (Tween.js); a pigment mesh uses its colour front
  };
}

/** What a surface has now becomes what it had, before it is given what it is about to have (the old hatching fades out). @param {any} f */
function rememberHatch(f) {
  if (!f.uHatchFromAmt) return;
  f.uHatchFromAmt.value = f.uHatchAmt.value;
  f.uHatchFromAng.value = f.uHatchAng.value;
  f.uHatchFromSeed.value = f.uHatchSeed.value;
}

/**
 * Gives a mesh (and its shadow plane) their hatching as the composition `config` wants: at once, being a quality of the surface.
 * @param {THREE.Mesh} mesh @param {HatchEntry} entry @param {HatchConfig | null} config
 */
export function setHatchNow(mesh, entry, config) {
  const f = mesh.userData && mesh.userData.front;
  const ang = config ? hatchAngle(config.seed) : 0;
  const seedOf = (/** @type {string} */ tag) => (config ? createRng('hatch-line', config.seed, tag, entry.type, Math.round(entry.position[0] * 100), Math.round(entry.position[1] * 100))() * 100 : 0);
  if (f && f.uHatchAmt) {
    rememberHatch(f);
    const on = hatchesSurface(entry, config);
    f.uHatchAmt.value = on ? 1 : 0;
    f.uHatchAng.value = ang;
    f.uHatchSeed.value = seedOf('surface');
  }
  const sh = mesh.userData && mesh.userData.shadow && mesh.userData.shadow.mesh;
  if (sh && sh.userData.hatch) {
    rememberHatch(sh.userData.hatch);
    sh.userData.hatch.uHatchAmt.value = hatchesShadow(entry, config) ? 1 : 0;
    sh.userData.hatch.uHatchAng.value = ang;
    sh.userData.hatch.uHatchSeed.value = seedOf('shadow');
  }
}

/**
 * Lets a shadow plane (a flat MeshBasicMaterial on its parent's geometry) take the hatching. The lines lie in the plane of the face
 * the vertex belongs to, in world lengths along the parent's own axes, like the pigment shader's.
 * @param {THREE.Mesh} child
 */
export function installShadowHatch(child) {
  const state = newHatchState();
  child.userData.hatch = state;
  const mat = /** @type {THREE.MeshBasicMaterial} */ (child.material);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, hatchShared, state);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vHatchP;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 hScale = vec3( length( modelMatrix[0].xyz ), length( modelMatrix[1].xyz ), length( modelMatrix[2].xyz ) );
vec3 hP = position * hScale;
vec3 hN = abs( normal );
if ( hN.z >= hN.x && hN.z >= hN.y ) vHatchP = hP.xy;
else if ( hN.x >= hN.y ) vHatchP = hP.yz;
else vHatchP = hP.xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec2 vHatchP;\nuniform float uHatchMix;\n${NOISE_GLSL}\n${HATCH_GLSL}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if ( uHatchOn > 0.5 ) diffuseColor.rgb = hatchBlend( diffuseColor.rgb, vHatchP, uHatchMix );`);
  };
  mat.customProgramCacheKey = () => 'shadow-hatch-1';
}
