import * as THREE from 'three';
import { makeGrainCanvas, hexToRgb, clamp8 } from './PaperTexture.js';

export function grainTexture(hex) {
  const c = makeGrainCanvas(128, 128, hex, { noiseStrength: 22, blotches: 3 });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function shadeHex(hex, mult) {
  const base = hexToRgb(hex);
  return `#${[base.r, base.g, base.b]
    .map((c) => clamp8(Math.round(c * mult)).toString(16).padStart(2, '0'))
    .join('')}`;
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
  const mats = shadeMultipliers.map((s) => {
    const shaded = shadeHex(hex, s);
    return new THREE.MeshBasicMaterial({ color: shaded, map: grainTexture(shaded) });
  });
  const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
  mesh.userData.baseHex = hex;
  mesh.userData.shadeMultipliers = shadeMultipliers;
  mesh.userData.shapeType = shapeType;
  return mesh;
}
