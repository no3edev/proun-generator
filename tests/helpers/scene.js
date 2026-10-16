// Shared test fixtures: the app's real shape registry, palettes and camera
// direction, without a DOM or a renderer. Mirrors what core/Composition.js
// passes to generateLayout() (the camera is fixed, so its depth axis and
// camera-facing orientation are constants of CAMERA.position).
import * as THREE from 'three';
import { shapeRegistry } from '../../src/shapes/registry.js';
import { palettes, DEFAULT_PALETTE } from '../../src/palette/palettes.js';
import { generateLayout } from '../../src/generator/generate.js';
import { SHAPE_DEFAULTS, CAMERA } from '../../src/config/defaults.js';

export const cameraPosition = new THREE.Vector3(...CAMERA.position);
export const depthAxis = cameraPosition.clone().normalize();
export const billboard = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), depthAxis);
export const view = { depthAxis, billboard };
export { shapeRegistry, palettes, DEFAULT_PALETTE };

/**
 * A generator config. `counts` maps shape type -> count (types not listed get
 * 0); `shape` overrides apply to every type, `perType` to one.
 * @param {number} seed
 * @param {Record<string, number>} counts
 * @param {{ shape?: object, perType?: Record<string, object> }} [opts]
 */
export function makeConfig(seed, counts, { shape = {}, perType = {} } = {}) {
  const shapes = {};
  shapeRegistry.forEach((s) => {
    shapes[s.type] = {
      ...SHAPE_DEFAULTS, ...(s.defaults || {}),
      count: counts[s.type] ?? 0,
      ...shape, ...(perType[s.type] || {})
    };
  });
  return { seed, shapes };
}

/**
 * `k` of every shape type except the two that start out off in the app (they
 * count 0 unless asked for: the rod, and the beam added in Stage 2.2).
 */
export function each(k, { rod = 0, beam = 0 } = {}) {
  return Object.fromEntries(shapeRegistry.map((s) => [s.type, s.type === 'rod' ? rod : s.type === 'beam' ? beam : k]));
}

export function layoutOf(config, paletteName = DEFAULT_PALETTE) {
  return generateLayout({ config, palette: palettes[paletteName], shapeDefs: shapeRegistry, view });
}

/** Position with the depth component removed: where the shape lands on screen. */
export function screenPos(position) {
  const p = new THREE.Vector3(...position);
  return p.addScaledVector(depthAxis, -p.dot(depthAxis)).toArray();
}
