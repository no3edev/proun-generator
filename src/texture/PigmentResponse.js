import * as THREE from 'three';
import { DYNAMICS } from '../config/defaults.js';
import { NOISE_GLSL } from './noiseGLSL.js';

// COLOR CHANGE AS OVERPAINTING.
//
// A painter changes a form's color by painting over it, and the coverage is
// broken: the new paint takes in patches, the old shows through the gaps,
// and the ground never does. That is what this does, so a change shows only
// the two colors involved (plus a small tonal shift of each) and never a
// third one.
//
// Core/Tween drives one number per mesh (`front`, 0 -> 1). The mesh already
// carries its NEW color in material.color from the first frame; the shader
// blends back toward the OLD one (uFrom) wherever the new paint has not yet
// arrived. The order of arrival is a sweep through the form's own space,
// eroded by the pigment grain: the grain map every material already carries
// (see PigmentLayer.js), read as a density field at the SAME coordinates as
// the base grain, so the surface keeps its identity and nothing slides. The
// edge of the coverage is narrow, so the two colors do not smear through an
// in-between hue.
//
// An interrupted change does not restart from a blended color: the layer
// in flight is kept (frozen where it was) under the new one, so patches
// that had already changed stay changed. (Interrupting a third time settles
// the oldest layer.)
//
// At front = 1 (rest, and after every transition) the injected code is
// skipped by a uniform branch, so a fragment takes exactly the original
// path. No render-path change, no new GPU resources; the program cache key
// is constant so shapes still share programs.
//
// THE PAINT. The grain a shape shows is a procedural field, computed here
// in the shader in each face's own plane, instead of the 256-pixel pattern
// stretched over the face (the pattern is still bound and is used when the
// lab's "Procedural paint" is off). Three bands, each with its own scale
// rule, after the reference works: fine tooth is physical (one size on every
// shape), strokes run along the face's long side at a roughly constant
// width, coarse stains belong to the form. No stretching on thin shapes, no
// tile seam, sharp at any export size, and reproducible: the field is a pure
// function of position and a per-slot seed (paintSeed.js).
//
// Meshes without a pigment map (the sphere's vertex colors) are not covered
// and keep the classic color lerp and no procedural paint.

// The coverage sweeps along this direction in each form's own (object)
// space; forms are placed at random rotations, so on screen it runs
// differently across the composition without drawing a random number.
const FRONT_DIR = new THREE.Vector3(0.62, 0.74, 0.27).normalize();

const shared = {
  uFrontSoft: { value: DYNAMICS.color.soft },
  uFrontGrain: { value: DYNAMICS.color.grain },
  uTone: { value: DYNAMICS.color.tone },
  uPaintOn: { value: 1 },
  uPaintVis: { value: DYNAMICS.paint.visibility },
  uPaintBase: { value: DYNAMICS.paint.base },
  uStrokeScale: { value: DYNAMICS.paint.strokeScale },
  uStrokeLen: { value: DYNAMICS.paint.strokeLength },
  uGammaMid: { value: DYNAMICS.paint.followStrokes },
  uGammaCoarse: { value: DYNAMICS.paint.followStains }
};

const f = (/** @type {number} */ n) => n.toFixed(4);

const VERTEX_DECLARATIONS = `
varying vec3 vFrontPos;
varying vec3 vPaintPos;
varying vec3 vPaintDim;
varying vec3 vPaintNrm;
uniform vec3 uBBMin;
uniform vec3 uBBMax;
`;
// position in world-size units along the object's own axes (so a face's
// coordinates are real lengths, whatever the shape's scale), and the face's
// world dimensions
const VERTEX_BODY = `
vFrontPos = position;
vec3 pScale = vec3( length( modelMatrix[0].xyz ), length( modelMatrix[1].xyz ), length( modelMatrix[2].xyz ) );
vPaintPos = position * pScale;
vPaintDim = ( uBBMax - uBBMin ) * pScale;
vPaintNrm = normal;
`;

const DECLARATIONS = `
varying vec3 vFrontPos;
varying vec3 vPaintPos;
varying vec3 vPaintDim;
varying vec3 vPaintNrm;
uniform vec2 uPaintSeed;
uniform vec2 uFaceSeed;
uniform float uPaintOn;
uniform float uPaintVis;
uniform float uPaintBase;
uniform float uStrokeScale;
uniform float uStrokeLen;
uniform float uGammaMid;
uniform float uGammaCoarse;
${NOISE_GLSL}
// z: zero-mean variation (about unit spread), d: pigment density 0..1.
// wc: coordinates in the face's plane, in world units; dm: the face's world size.
vec2 paintField( vec2 wc, vec2 dm, vec2 seed ) {
  float size = sqrt( max( dm.x * dm.y, 0.0001 ) );
  // each band's coordinates: world units (physical) -> relative to the form's size
  vec2 cC = wc / pow( size / 1.2, uGammaCoarse );
  vec2 cM = wc / pow( size / 1.2, uGammaMid );
  float zc = ( fbm( cC * 2.2 + seed ) - 0.5 ) * @WC@;
  // strokes run along the longer side of the face. The direction changes
  // smoothly, over a range of aspect ratios well away from square, so a
  // face whose proportions change during a transition never flips its
  // strokes in a single frame (and a square face, like the circle, is stable)
  float wx = smoothstep( 0.7, 0.9, dm.x / max( dm.y, 0.0001 ) );
  vec2 sb = seed * 1.7 + 3.1;
  float zmx = fbm( vec2( cM.x / uStrokeLen, cM.y ) * 7.0 * uStrokeScale + sb );
  float zmy = fbm( vec2( cM.x, cM.y / uStrokeLen ) * 7.0 * uStrokeScale + sb );
  float zm = ( mix( zmy, zmx, wx ) - 0.5 ) * @WM@;
  float zf = ( vnoise( wc * 70.0 + seed * 2.3 ) - 0.5 ) * @WF@;
  // pigment density, spread evenly over 0..1 (not clipped into two plateaus),
  // so the new color arrives gradually, patch by patch
  float d = smoothstep( -1.7, 1.7, ( zc + 0.8 * zm ) * @DS@ );
  return vec2( zc + zm + zf, d );
}

uniform float uFront;
uniform float uFrontA;
uniform vec3 uFrom;
uniform vec3 uMid;
uniform vec2 uProj;
uniform float uFrontSoft;
uniform float uFrontGrain;
uniform float uTone;
uniform float uShade;
`;

const BODY = `
#ifdef USE_MAP
// the grain: the old pattern, or the procedural field
vec3 pGrain = sampledDiffuseColor.rgb;
float pDens = clamp( ( sampledDiffuseColor.g - ${f(DYNAMICS.grainMap.low)} ) / ${f(DYNAMICS.grainMap.high - DYNAMICS.grainMap.low)}, 0.0, 1.0 );
if ( uPaintOn > 0.5 ) {
  vec3 pAn = abs( vPaintNrm );
  vec2 pWc;
  vec2 pDm;
  if ( pAn.z >= pAn.x && pAn.z >= pAn.y ) { pWc = vPaintPos.xy; pDm = vPaintDim.xy; }
  else if ( pAn.x >= pAn.y ) { pWc = vPaintPos.yz; pDm = vPaintDim.yz; }
  else { pWc = vPaintPos.xz; pDm = vPaintDim.xz; }
  vec2 pf = paintField( pWc, pDm, uPaintSeed + uFaceSeed );
  // the sRGB-encoded variation is roughly 1/2.2 of the linear one
  pGrain = vec3( clamp( uPaintBase + uPaintVis * 2.2 * pf.x, 0.0, 1.0 ) );
  pDens = pf.y;
  diffuseColor = vec4( diffuse * pGrain, opacity );
}
if ( uFront < 1.0 ) {
  // where, along the sweep, this fragment sits (0..1 over the form)
  float fGrad = clamp( ( dot( vFrontPos, vec3( ${f(FRONT_DIR.x)}, ${f(FRONT_DIR.y)}, ${f(FRONT_DIR.z)} ) ) - uProj.x ) / max( uProj.y - uProj.x, 0.0001 ), 0.0, 1.0 );
  // the order of arrival: the sweep, eroded by the grain
  float fOrder = mix( fGrad, pDens, uFrontGrain );
  float fSoft = max( uFrontSoft, 0.001 );
  float fArrived = smoothstep( 0.0, 1.0, ( uFront * ( 1.0 + fSoft ) - fOrder ) / fSoft );
  // A change that interrupts another keeps what the first had done: the
  // earlier layer stays frozen where it was (uFrontA) under the new one.
  // Uninterrupted, uFrom = uMid and uFrontA = 1, so this is just the old color.
  float fArrivedA = smoothstep( 0.0, 1.0, ( uFrontA * ( 1.0 + fSoft ) - fOrder ) / fSoft );
  vec3 fBase = mix( min( uFrom * uShade, vec3( 1.0 ) ), min( uMid * uShade, vec3( 1.0 ) ), fArrivedA ) * pGrain;
  // each patch a little lighter or darker than its own color — strongest
  // mid-change, nil at both ends — never a different hue; the earlier
  // layer's shift fades out as the new one covers it
  float fBump = 4.0 * uFront * ( 1.0 - uFront ) + 4.0 * uFrontA * ( 1.0 - uFrontA ) * ( 1.0 - fArrived );
  float fTone = 1.0 + uTone * fBump * ( 2.0 * pDens - 1.0 );
  diffuseColor.rgb = min( mix( fBase, diffuseColor.rgb, fArrived ) * fTone, vec3( 1.0 ) );
}
#endif
`;

/** Band weights of the paint field (see paintField): unit-ish spread per band, tuned against the references. */
export const PAINT_WEIGHTS = { coarse: 15.0, mid: 13.0, fine: 2.4 };

const MAIN = 'void main() {';
const ANCHOR = '#include <map_fragment>';
let warned = false;

/**
 * Returns `src` (a MeshBasicMaterial fragment shader) with the overpaint
 * injected, or `src` unchanged if three's shader no longer has the anchors
 * (the change is then simply the new color, at once). Exported for tests.
 * @param {string} src
 */
export function patchFragment(src) {
  if (!src.includes(MAIN) || !src.includes(ANCHOR)) {
    if (!warned) {
      warned = true;
      console.warn('PigmentResponse: shader anchors not found; overpaint disabled');
    }
    return src;
  }
  const decl = DECLARATIONS
    .replace('@WC@', PAINT_WEIGHTS.coarse.toFixed(3))
    .replace('@WM@', PAINT_WEIGHTS.mid.toFixed(3))
    .replace('@WF@', PAINT_WEIGHTS.fine.toFixed(3))
    .replace('@DS@', (1 / (0.124 * Math.hypot(PAINT_WEIGHTS.coarse, 0.8 * PAINT_WEIGHTS.mid))).toFixed(4));
  return src
    .replace(MAIN, decl + MAIN)
    .replace(ANCHOR, ANCHOR + '\n' + BODY);
}

const VERTEX_MAIN = 'void main() {';
const VERTEX_ANCHOR = '#include <begin_vertex>';

/**
 * The vertex-shader half (passes the object-space position on). Unchanged
 * if the anchors are gone. Exported for tests.
 * @param {string} src
 */
export function patchVertex(src) {
  if (!src.includes(VERTEX_MAIN) || !src.includes(VERTEX_ANCHOR)) return src;
  return src
    .replace(VERTEX_MAIN, VERTEX_DECLARATIONS + VERTEX_MAIN)
    .replace(VERTEX_ANCHOR, VERTEX_ANCHOR + '\n' + VERTEX_BODY);
}

/**
 * The extent of a geometry along the sweep direction, for normalizing the
 * sweep to 0..1 over the form.
 * @param {THREE.BufferGeometry} geo
 * @returns {THREE.Vector2}
 */
export function frontProjection(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = /** @type {THREE.Box3} */ (geo.boundingBox);
  let lo = Infinity, hi = -Infinity;
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    const d = c.dot(FRONT_DIR);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return new THREE.Vector2(lo, hi);
}

/**
 * Makes `material` (a MeshBasicMaterial with a `map`) take part in the
 * overpaint. `shade` is the material's face shade multiplier.
 * @param {THREE.MeshBasicMaterial} material
 * @param {number} shade
 * @param {THREE.BufferGeometry} geo  the mesh's geometry (extent for the sweep)
 * @param {{ uFront: { value: number }, uFrontA: { value: number }, uFrom: { value: THREE.Color }, uMid: { value: THREE.Color }, uSeed: { value: THREE.Vector2 } }} front  the mesh's state, shared by all its materials
 * @param {number} faceIndex  which material of the mesh this is (decorrelates the faces)
 */
export function installPigmentResponse(material, shade, geo, front, faceIndex = 0) {
  const proj = { value: frontProjection(geo) };
  const bb = /** @type {THREE.Box3} */ (geo.boundingBox);
  const bbMin = { value: bb.min.clone() };
  const bbMax = { value: bb.max.clone() };
  const faceSeed = { value: new THREE.Vector2(faceIndex * 13.7, faceIndex * 5.3) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFront = front.uFront;
    shader.uniforms.uFrontA = front.uFrontA;
    shader.uniforms.uFrom = front.uFrom;
    shader.uniforms.uMid = front.uMid;
    shader.uniforms.uProj = proj;
    shader.uniforms.uFrontSoft = shared.uFrontSoft;
    shader.uniforms.uFrontGrain = shared.uFrontGrain;
    shader.uniforms.uTone = shared.uTone;
    shader.uniforms.uBBMin = bbMin;
    shader.uniforms.uBBMax = bbMax;
    shader.uniforms.uPaintSeed = front.uSeed;
    shader.uniforms.uFaceSeed = faceSeed;
    shader.uniforms.uPaintOn = shared.uPaintOn;
    shader.uniforms.uPaintVis = shared.uPaintVis;
    shader.uniforms.uPaintBase = shared.uPaintBase;
    shader.uniforms.uStrokeScale = shared.uStrokeScale;
    shader.uniforms.uStrokeLen = shared.uStrokeLen;
    shader.uniforms.uGammaMid = shared.uGammaMid;
    shader.uniforms.uGammaCoarse = shared.uGammaCoarse;
    shader.uniforms.uShade = { value: shade };
    shader.vertexShader = patchVertex(shader.vertexShader);
    shader.fragmentShader = patchFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => 'pigment-response-5';
}

/**
 * Live tuning (lab). Uniforms only — no recompile.
 * @param {{ soft: number, grain: number, tone: number }} p
 */
export function setFrontParams(p) {
  shared.uFrontSoft.value = Math.max(0.001, p.soft);
  shared.uFrontGrain.value = p.grain;
  shared.uTone.value = p.tone;
}

/**
 * Live tuning of the procedural paint (lab). Uniforms only.
 * @param {{ on: boolean, visibility: number, strokeScale: number, strokeLength: number, followStrokes: number, followStains: number }} p
 */
export function setPaintParams(p) {
  shared.uPaintOn.value = p.on ? 1 : 0;
  shared.uPaintVis.value = p.visibility;
  shared.uStrokeScale.value = Math.max(0.05, p.strokeScale);
  shared.uStrokeLen.value = Math.max(1, p.strokeLength);
  shared.uGammaMid.value = p.followStrokes;
  shared.uGammaCoarse.value = p.followStains;
}
