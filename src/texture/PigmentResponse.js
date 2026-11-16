import * as THREE from 'three';
import { DYNAMICS } from '../config/defaults.js';
import { NOISE_GLSL } from './noiseGLSL.js';
import { emptyField } from './edgeField.js';
import { HATCH_GLSL, hatchShared } from './hatch.js';
import { HIGHLIGHT } from './highlight.js';

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
  uHiStrength: { value: HIGHLIGHT.strength },
  uPaintOn: { value: 1 },
  uPaintVis: { value: DYNAMICS.paint.visibility },
  uPaintBase: { value: DYNAMICS.paint.base },
  uStrokeScale: { value: DYNAMICS.paint.strokeScale },
  uStrokeLen: { value: DYNAMICS.paint.strokeLength },
  uGammaMid: { value: DYNAMICS.paint.followStrokes },
  uGammaCoarse: { value: DYNAMICS.paint.followStains },
  uEdgeW: { value: DYNAMICS.edge.width },
  uEdgeThin: { value: DYNAMICS.edge.thinning },
  uEdgePool: { value: DYNAMICS.edge.pooling },
  uEdgeOn: { value: 1 },
  uEnergy: { value: 0 },
  uRespOn: { value: 1 },
  uRespEdge: { value: DYNAMICS.response.edge },
  uRespSoft: { value: DYNAMICS.response.softness },
  uRespTooth: { value: DYNAMICS.response.tooth },
  uSilOn: { value: 1 },
  uSoftW: { value: DYNAMICS.silhouette.softness },
  uIrrA: { value: DYNAMICS.silhouette.irregularity },
  uEdgePaper: { value: new THREE.Color('#e9e4d8') }
};

const f = (/** @type {number} */ n) => n.toFixed(4);

const VERTEX_DECLARATIONS = `
varying vec3 vFrontPos;
varying vec3 vPaintPos;
varying vec3 vPaintDim;
varying vec3 vPaintNrm;
varying vec3 vPaintScale;
varying vec3 vToCamObj;
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
vPaintScale = pScale;
// the way to the camera (orthographic: the same everywhere) in the shape's own axes, the rotation only: for the silhouette test
vec3 toCamW = vec3( viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2] );
vToCamObj = vec3( dot( modelMatrix[0].xyz, toCamW ) / pScale.x, dot( modelMatrix[1].xyz, toCamW ) / pScale.y, dot( modelMatrix[2].xyz, toCamW ) / pScale.z );
`;

const DECLARATIONS = `
varying vec3 vFrontPos;
varying vec3 vPaintPos;
varying vec3 vPaintDim;
varying vec3 vPaintNrm;
varying vec3 vPaintScale;
uniform vec2 uPaintSeed;
uniform vec2 uPaintSeedFrom;
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
uniform float uShadeFrom;
uniform float uShadeMid;
// the selective highlight (highlight.js): amount 0..1, the strip's direction in object space (a dot with it is world distance along
// the direction), the edge and width of the strip along it, the tint it mixes toward
uniform float uHiAmt;
uniform vec3 uHiN;
uniform vec2 uHiBand;
uniform vec3 uHiTint;
uniform float uHiStrength;
// the edge character of box-like faces (edge.js): amount 0..1 per mesh, the lab's switch, band width (world units), thinning and
// pooling strengths, the paper the thinned paint shows
uniform float uEdgeAmt;
uniform vec3 uBBMin;
uniform vec3 uBBMax;
uniform float uEdgeKind;
uniform sampler2D uEdgeSdf;
uniform float uEdgeR;
uniform float uSilOn;
// the materials' response to the event clock: Rhythm's energy (0 at rest), the lab's switch, the strength of each response, and this
// mesh's share (1 under a strategy, 0 under the legacy generator)
uniform float uEnergy;
uniform float uRespOn;
uniform float uRespEdge;
uniform float uRespSoft;
uniform float uRespTooth;
uniform float uRespAmt;
uniform float uSoftW;
uniform float uIrrA;
varying vec3 vToCamObj;
uniform float uEdgeOn;
uniform float uEdgeW;
uniform float uEdgeThin;
uniform float uEdgePool;
uniform vec3 uEdgePaper;
${HATCH_GLSL}
// How much of an edge's coverage is left at distance d from it (stage 5.3). nb: the way the face on the other side of the edge lies,
// in the shape's own axes; pw: the position in the face's plane. The edge is on the outline when the face beyond it looks away from
// the camera (orthographic, the forms convex): a crease between two faces we can see keeps full coverage. The distance is eroded a
// little by a slow and a fine noise, so the outline is irregular, and the last softW is a ramp.
float silCover( float d, vec3 nb, vec2 pw ) {
  if ( uSilOn < 0.5 ) return 1.0;
  float sil = 1.0 - smoothstep( -0.12, 0.12, dot( normalize( nb / vPaintScale ), vToCamObj ) );
  float irr = 0.65 * vnoise( pw * ${f(DYNAMICS.silhouette.slowFreq)} + uPaintSeed * 1.9 + uFaceSeed ) + 0.35 * vnoise( pw * ${f(DYNAMICS.silhouette.fineFreq)} + uPaintSeed * 2.7 + uFaceSeed );
  float soft = uSoftW * ( 1.0 + uRespOn * uRespAmt * uRespSoft * uEnergy );
  float a = smoothstep( 0.0, max( soft, 0.0005 ), d - uIrrA * irr );
  return mix( 1.0, a, sil );
}
`;

const BODY = `
#ifdef USE_MAP
// the grain: the old pattern, or the procedural field
vec3 pGrain = sampledDiffuseColor.rgb;
vec3 pGrainFrom = pGrain;
float pDens = clamp( ( sampledDiffuseColor.g - ${f(DYNAMICS.grainMap.low)} ) / ${f(DYNAMICS.grainMap.high - DYNAMICS.grainMap.low)}, 0.0, 1.0 );
// the face's own plane: coordinates and size in world lengths
vec3 pAn = abs( vPaintNrm );
vec2 pWc;
vec2 pDm;
if ( pAn.z >= pAn.x && pAn.z >= pAn.y ) { pWc = vPaintPos.xy; pDm = vPaintDim.xy; }
else if ( pAn.x >= pAn.y ) { pWc = vPaintPos.yz; pDm = vPaintDim.yz; }
else { pWc = vPaintPos.xz; pDm = vPaintDim.xz; }
if ( uPaintOn > 0.5 ) {
  vec2 pf = paintField( pWc, pDm, uPaintSeed + uFaceSeed );
  // the sRGB-encoded variation is roughly 1/2.2 of the linear one
  // the paint's tooth lifts a little with the event clock's energy (stage 5.4)
  float pVisE = uPaintVis * ( 1.0 + uRespOn * uRespAmt * uRespTooth * uEnergy );
  pGrain = vec3( clamp( uPaintBase + pVisE * 2.2 * pf.x, 0.0, 1.0 ) );
  pDens = pf.y;
  diffuseColor = vec4( diffuse * pGrain, opacity );
  pGrainFrom = pGrain;
  // a form that took another part's paint keeps the grain of the paint it had, under the colour that is still arriving
  if ( uFront < 1.0 && ( uPaintSeedFrom.x != uPaintSeed.x || uPaintSeedFrom.y != uPaintSeed.y ) ) {
    vec2 pfOld = paintField( pWc, pDm, uPaintSeedFrom + uFaceSeed );
    pGrainFrom = vec3( clamp( uPaintBase + pVisE * 2.2 * pfOld.x, 0.0, 1.0 ) );
  }
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
  vec3 fBase = mix( min( uFrom * uShadeFrom, vec3( 1.0 ) ), min( uMid * uShadeMid, vec3( 1.0 ) ), fArrivedA ) * pGrainFrom;
  // each patch a little lighter or darker than its own color — strongest
  // mid-change, nil at both ends — never a different hue; the earlier
  // layer's shift fades out as the new one covers it
  float fBump = 4.0 * uFront * ( 1.0 - uFront ) + 4.0 * uFrontA * ( 1.0 - uFrontA ) * ( 1.0 - fArrived );
  float fTone = 1.0 + uTone * fBump * ( 2.0 * pDens - 1.0 );
  diffuseColor.rgb = min( mix( fBase, diffuseColor.rgb, fArrived ) * fTone, vec3( 1.0 ) );
}
if ( uHiAmt > 0.0 ) {
  // the light edge strip: within uHiBand.y (world units) of the form's edge along uHiN, mixed toward the tint, grain kept
  float hiBand = smoothstep( uHiBand.x - uHiBand.y - 0.003, uHiBand.x - uHiBand.y, dot( vFrontPos, uHiN ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, min( uHiTint * pGrain, vec3( 1.0 ) ), hiBand * uHiAmt * uHiStrength );
}
if ( uEdgeAmt > 0.0 && uEdgeOn > 0.5 ) {
  // the edge band widens with the event clock's energy (stage 5.4)
  float edgeWR = uEdgeW * ( 1.0 + uRespOn * uRespAmt * uRespEdge * uEnergy );
  float eD;
  float eW;
  // the coverage the silhouette leaves (stage 5.3): every edge of the face counts, so a corner is as soft as the sides
  float sCover = 1.0;
  if ( uEdgeKind > 0.5 ) {
    // an extruded outline: the distance field of the outline, on the two caps; a distance in the shape's own units is a world
    // distance times |scale * direction|
    if ( abs( vPaintNrm.z ) > 0.9 ) {
      vec2 eUv = ( vFrontPos.xy - uBBMin.xy ) / max( uBBMax.xy - uBBMin.xy, vec2( 0.0001 ) );
      vec4 eF = texture2D( uEdgeSdf, eUv );
      vec2 eDir = 2.0 * eF.gb - 1.0;
      eD = eF.r * length( vPaintScale.xy * eDir );
      sCover = silCover( eD, vec3( eDir, 0.0 ), pWc );   // the side wall there looks along the outline's normal
    } else {
      // a side wall of the extrusion keeps flat edges for the band; for the silhouette its edges are the two caps
      eD = 1.0e4;
      float zF = ( uBBMax.z - vFrontPos.z ) * vPaintScale.z;
      float zB = ( vFrontPos.z - uBBMin.z ) * vPaintScale.z;
      sCover = min( silCover( zF, vec3( 0.0, 0.0, 1.0 ), pWc ), silCover( zB, vec3( 0.0, 0.0, -1.0 ), pWc ) );
    }
    // never wider than a third of the shape's thinnest part (a ring's width, not its diameter)
    eW = max( min( edgeWR, 0.3 * uEdgeR * min( vPaintScale.x, vPaintScale.y ) ), 0.0005 );
  } else {
    // a box centred on its origin: what is left of half the face's size
    vec2 eIn = 0.5 * pDm - abs( pWc );
    eD = max( min( eIn.x, eIn.y ), 0.0 );
    // a face too narrow for the band (a thin plane's side) gets a band that fits
    eW = max( min( edgeWR, 0.22 * min( pDm.x, pDm.y ) ), 0.0005 );
    // each of the face's edges, and the face beyond it: the plane's two axes are these of the shape's own
    vec3 eAx1;
    vec3 eAx2;
    if ( pAn.z >= pAn.x && pAn.z >= pAn.y ) { eAx1 = vec3( 1.0, 0.0, 0.0 ); eAx2 = vec3( 0.0, 1.0, 0.0 ); }
    else if ( pAn.x >= pAn.y ) { eAx1 = vec3( 0.0, 1.0, 0.0 ); eAx2 = vec3( 0.0, 0.0, 1.0 ); }
    else { eAx1 = vec3( 1.0, 0.0, 0.0 ); eAx2 = vec3( 0.0, 0.0, 1.0 ); }
    sCover = min( silCover( eIn.x, eAx1 * ( pWc.x < 0.0 ? -1.0 : 1.0 ), pWc ), silCover( eIn.y, eAx2 * ( pWc.y < 0.0 ? -1.0 : 1.0 ), pWc ) );
  }
  float eT = 1.0 - smoothstep( 0.0, eW, eD );
  // thinning: the paper tooth shows through at the edge where the grain lets it, so the edge is broken, not an outline
  float eN = vnoise( pWc * ${f(DYNAMICS.edgeGrain.scale)} + uPaintSeed * 3.7 + uFaceSeed );
  float eThin = eT * eT * ( ${f(DYNAMICS.edgeGrain.floor)} + ${f(1 - DYNAMICS.edgeGrain.floor)} * eN );
  diffuseColor.rgb = mix( diffuseColor.rgb, uEdgePaper * pGrain, clamp( eThin * uEdgeThin * uEdgeAmt, 0.0, 1.0 ) );
  // pooling: a ridge a little inside the band, a little darker
  float eR = ( eD - 1.1 * eW ) / ( 0.6 * eW );
  diffuseColor.rgb *= 1.0 - uEdgePool * uEdgeAmt * exp( -eR * eR );
  diffuseColor.a *= mix( 1.0, sCover, uEdgeAmt );
}
if ( uHatchOn > 0.5 ) diffuseColor.rgb = hatchBlend( diffuseColor.rgb, pWc, uFront );
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
  // The face's tone: `shade` is the multiplier in force, and the overpaint shows the tone of the layers beneath the new colour
  // (uShadeFrom under the colour that came before, uShadeMid under an interrupted change), so a change of tone rides the colour
  // front. At rest all three are the same number. materials.js (setShade / shiftShade) drives them.
  // the highlight state lives on the mesh's `front` (materials.js); a state without it (test doubles) is inert
  const hi = front.uHiAmt ? front : { uHiAmt: { value: 0 }, uHiN: { value: new THREE.Vector3() }, uHiBand: { value: new THREE.Vector2() }, uHiTint: { value: new THREE.Color() } };
  const tone = { shade, uShadeFrom: { value: shade }, uShadeMid: { value: shade } };
  material.userData.tone = tone;
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
    shader.uniforms.uPaintSeedFrom = front.uSeedFrom || front.uSeed; // test doubles without the old-seed state: no old grain
    shader.uniforms.uFaceSeed = faceSeed;
    shader.uniforms.uPaintOn = shared.uPaintOn;
    shader.uniforms.uPaintVis = shared.uPaintVis;
    shader.uniforms.uPaintBase = shared.uPaintBase;
    shader.uniforms.uStrokeScale = shared.uStrokeScale;
    shader.uniforms.uStrokeLen = shared.uStrokeLen;
    shader.uniforms.uGammaMid = shared.uGammaMid;
    shader.uniforms.uGammaCoarse = shared.uGammaCoarse;
    shader.uniforms.uHiAmt = hi.uHiAmt;
    shader.uniforms.uHiN = hi.uHiN;
    shader.uniforms.uHiBand = hi.uHiBand;
    shader.uniforms.uHiTint = hi.uHiTint;
    shader.uniforms.uHiStrength = shared.uHiStrength;
    shader.uniforms.uEdgeAmt = (front.uEdgeAmt || { value: 0 });
    shader.uniforms.uEdgeKind = (front.uEdgeKind || { value: 0 });
    shader.uniforms.uEdgeSdf = (front.uEdgeSdf || { value: emptyField });
    shader.uniforms.uEdgeR = (front.uEdgeR || { value: 0 });
    Object.assign(shader.uniforms, hatchShared);
    shader.uniforms.uHatchAmt = (front.uHatchAmt || { value: 0 });
    shader.uniforms.uHatchAng = (front.uHatchAng || { value: 0 });
    shader.uniforms.uHatchSeed = (front.uHatchSeed || { value: 0 });
    shader.uniforms.uHatchFromAmt = (front.uHatchFromAmt || { value: 0 });
    shader.uniforms.uHatchFromAng = (front.uHatchFromAng || { value: 0 });
    shader.uniforms.uHatchFromSeed = (front.uHatchFromSeed || { value: 0 });
    shader.uniforms.uEdgeOn = shared.uEdgeOn;
    shader.uniforms.uEnergy = shared.uEnergy;
    shader.uniforms.uRespOn = shared.uRespOn;
    shader.uniforms.uRespEdge = shared.uRespEdge;
    shader.uniforms.uRespSoft = shared.uRespSoft;
    shader.uniforms.uRespTooth = shared.uRespTooth;
    shader.uniforms.uRespAmt = (front.uRespAmt || { value: 0 });
    shader.uniforms.uSilOn = shared.uSilOn;
    shader.uniforms.uSoftW = shared.uSoftW;
    shader.uniforms.uIrrA = shared.uIrrA;
    shader.uniforms.uEdgeW = shared.uEdgeW;
    shader.uniforms.uEdgeThin = shared.uEdgeThin;
    shader.uniforms.uEdgePool = shared.uEdgePool;
    shader.uniforms.uEdgePaper = shared.uEdgePaper;
    shader.uniforms.uShadeFrom = tone.uShadeFrom;
    shader.uniforms.uShadeMid = tone.uShadeMid;
    shader.vertexShader = patchVertex(shader.vertexShader);
    shader.fragmentShader = patchFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => 'pigment-response-13';
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

/**
 * Live tuning of the edge character (lab). Uniforms only.
 * @param {{ on: boolean, width: number, thinning: number, pooling: number, softness: number, irregularity: number }} p
 */
export function setEdgeParams(p) {
  shared.uEdgeOn.value = p.on ? 1 : 0;
  shared.uSoftW.value = p.softness;
  shared.uIrrA.value = p.irregularity;
  shared.uSilOn.value = p.softness > 0 || p.irregularity > 0 ? 1 : 0;
  shared.uEdgeW.value = Math.max(0.0005, p.width);
  shared.uEdgeThin.value = p.thinning;
  shared.uEdgePool.value = p.pooling;
}

/** The paper the thinned paint shows at the edges: the palette's (SceneManager.updateBackground). @param {string} hex */
export function setEdgePaper(hex) {
  shared.uEdgePaper.value.set(hex);
}

/** The shared event clock's energy, once per frame (SceneManager): 0 at rest, so a still is unchanged. @param {number} e */
export function setMaterialEnergy(e) {
  shared.uEnergy.value = e;
}

/**
 * Live tuning of the materials' response to the event clock (lab). Uniforms only.
 * @param {{ on: boolean, edge: number, softness: number, tooth: number }} p
 */
export function setResponseParams(p) {
  shared.uRespOn.value = p.on ? 1 : 0;
  shared.uRespEdge.value = p.edge;
  shared.uRespSoft.value = p.softness;
  shared.uRespTooth.value = p.tooth;
}
