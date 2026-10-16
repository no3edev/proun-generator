import * as THREE from 'three';
import { pickStructureTexture } from './PigmentLayer.js';
import { installPigmentResponse } from './PigmentResponse.js';

// COLOR / SHADING CONTRACT
//
// Every mesh a shape's create() returns must carry, on `mesh.userData`:
//   shapeType   the shape's `type`
//   baseColor   THREE.Color — the un-shaded color currently applied
//   applyShade  (base: THREE.Color) => void — repaints the mesh from `base`
//               through that shape's own shading scheme
// Nothing outside this file (Tween, Composition) knows HOW a shape is
// shaded; they call paintMesh(mesh, color). materialSetMesh() installs the
// contract for material-based shapes (one tinted material per face group);
// a shape with unusual shading (the sphere's per-vertex colors) installs
// its own applyShade. Add a new shading scheme by following the contract —
// no other file needs to change.
//
// Every resting color and every tween frame goes through
// shadeColor()/clampColor()-equivalent math, so a transition's first frame
// is identical to the shape's resting appearance (no snap). Do not
// reintroduce a separate sRGB-integer path (there used to be one,
// `shadeHex`) — THREE.Color is linear internally, so mixing an sRGB-space
// multiply with a linear-space one gives two different colors for the same
// (hex, multiplier) pair.

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

// Structure (paper grain + pigment coverage + micro variation) comes from
// PigmentLayer's pool — a small set of grayscale, color-independent canvases
// built once and reused everywhere. All the color a material shows comes
// from materialSetMesh's `color: shadeColor(hex, mult)`; this only supplies
// the `map`.
export function grainTexture() {
  return pickStructureTexture();
}

// scratch color reused by every applyShade (calls are synchronous), so
// repainting a mesh each animation frame allocates nothing
const scratch = new THREE.Color();

/**
 * Builds a THREE.Mesh whose material(s) are grain-textured tints of
 * `hex`, one per entry in `shadeMultipliers`. A single multiplier
 * collapses to one plain (non-array) material; more than one produces
 * a material array matching the geometry's face groups (e.g. a cube's
 * 6 faces, or an extruded shape's sides + caps). Installs the shading
 * contract described at the top of this file.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {string} hex
 * @param {number[]} shadeMultipliers
 * @param {string} shapeType
 * @param {object} [materialOptions] extra MeshBasicMaterial options (e.g. { side })
 */
export function materialSetMesh(geo, hex, shadeMultipliers, shapeType, materialOptions = {}) {
  const mats = shadeMultipliers.map((mult) => new THREE.MeshBasicMaterial({
    ...materialOptions,
    color: shadeColor(hex, mult),
    map: grainTexture()
  }));
  // dynamic pigment response (see PigmentResponse.js): a no-op until a
  // composition change raises the shared energy
  // `front` is the mesh's color-front state (see PigmentResponse.js), shared
  // by all its materials; Tween drives it
  const front = {
    uFront: { value: 1 },       // the change in flight: 0 -> 1
    uFrontA: { value: 1 },      // the layer it interrupted, frozen where it was (1 = none)
    uFrom: { value: new THREE.Color(hex) },
    uMid: { value: new THREE.Color(hex) },
    uSeed: { value: new THREE.Vector2() }
  };
  mats.forEach((mat, i) => installPigmentResponse(mat, shadeMultipliers[i], geo, front, i));
  const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
  mesh.userData.shapeType = shapeType;
  mesh.userData.baseColor = new THREE.Color(hex);
  mesh.userData.front = front;
  mesh.userData.applyShade = (base) => {
    for (let i = 0; i < mats.length; i++) {
      mats[i].color.copy(clampColor(scratch.copy(base).multiplyScalar(shadeMultipliers[i])));
    }
  };
  return mesh;
}

/**
 * Paints `mesh` with `color` (the un-shaded base color) through the mesh's
 * own shading scheme, and records it as the mesh's current base color.
 * The one entry point for recoloring any shape.
 */
export function paintMesh(mesh, color) {
  mesh.userData.baseColor.copy(color);
  mesh.userData.applyShade(color);
}

/**
 * Frees a mesh's GPU resources. Call when an instance is removed for
 * good — three.js never releases geometry, materials or textures on its
 * own, so every removed instance used to leak. Safe because each material
 * owns its own texture (pickStructureTexture() returns a fresh
 * CanvasTexture per call); the shared pool canvases are not touched.
 */
export function disposeMesh(mesh) {
  if (mesh.geometry) mesh.geometry.dispose();
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => {
    if (!m) return;
    if (m.map) m.map.dispose();
    m.dispose();
  });
}

// Face shading shared by every BoxGeometry-based shape (cube-fixed,
// cube-variable, plane). Order matches BoxGeometry's default face
// groups: +x -x +y -y +z -z.
export const BOX_SHADE_MULTIPLIERS = [0.82, 0.82, 1.05, 0.62, 1.0, 0.7];

/** A unit box mesh with the standard face shading — the body of every box-based shape's create(). */
export function boxMesh(hex, shapeType) {
  return materialSetMesh(new THREE.BoxGeometry(1, 1, 1), hex, BOX_SHADE_MULTIPLIERS, shapeType);
}
