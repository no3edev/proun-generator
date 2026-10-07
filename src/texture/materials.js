import * as THREE from 'three';
import { pickStructureTexture } from './PigmentLayer.js';

// Every material's resting color, AND every tween frame's recomputed
// color (in Tween.js), goes through shadeColor()/clampColor() — using
// the exact same math in both places is what keeps a transition's
// starting appearance identical to the shape's resting appearance, so
// there's no snap the instant a tween begins. Do not reintroduce a
// separate sRGB-integer path here (there used to be one, `shadeHex`) —
// THREE.Color's internal representation is linear (color management
// converts sRGB hex -> linear on assignment), so mixing an sRGB-space
// multiply with a linear-space multiply produces two different colors
// for the same (hex, multiplier) pair.

/** Clamps a THREE.Color's channels to [0,1] in place and returns it. */
export function clampColor(color) {
  color.r = Math.min(1, color.r);
  color.g = Math.min(1, color.g);
  color.b = Math.min(1, color.b);
  return color;
}

/** Returns a new, clamped THREE.Color = hex tinted by `mult`. */
export function shadeColor(hex, mult) {
  return clampColor(new THREE.Color(hex).multiplyScalar(mult));
}

// Structure (paper grain + pigment coverage + micro variation) now
// comes from PigmentLayer's pool — a small set of grayscale, hex- and
// mult-independent canvases built once and reused everywhere. `hex`
// and `mult` are unused here (kept in the signature for call-site
// compatibility, and in case tier-specific structure is wanted down
// the line); all the color this material shows comes from
// materialSetMesh's `color: shadeColor(hex, mult)` below, exactly as
// it always did — this function only ever supplied the `map`.
export function grainTexture(hex, mult = 1) {
  return pickStructureTexture();
}

/**
 * Builds a THREE.Mesh whose material(s) are grain-textured tints of
 * `hex`, one per entry in `shadeMultipliers`. A single multiplier
 * collapses to one plain (non-array) material; more than one produces
 * a material array matching the geometry's face groups (e.g. a cube's
 * 6 faces, or an extruded shape's sides + caps).
 *
 * Tags the mesh's userData so Tween.js knows how to re-tint it as
 * color eases between states, and so CollisionResolver.js knows
 * which shape type it is.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {string} hex
 * @param {number[]} shadeMultipliers
 * @param {string} shapeType
 */
export function materialSetMesh(geo, hex, shadeMultipliers, shapeType) {
  const mats = shadeMultipliers.map((mult) => new THREE.MeshBasicMaterial({
    color: shadeColor(hex, mult),
    map: grainTexture(hex, mult)
  }));
  const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
  mesh.userData.baseHex = hex;
  mesh.userData.shadeMultipliers = shadeMultipliers;
  mesh.userData.shapeType = shapeType;
  return mesh;
}
