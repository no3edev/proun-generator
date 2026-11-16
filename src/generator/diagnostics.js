// @ts-check
import * as THREE from 'three';
import { CAMERA } from '../config/defaults.js';
import { screenBasis } from './strategies/common.js';
import { makeVolume, volumesIntersect, volumeScreenBox, screenBoxesOverlap } from './volumes.js';

// What a layout does, measured on the layout itself: real 3D intersections
// (which are errors), projected overlaps on screen (which are not: overlap is
// the Proun look), and, for a composition strategy, how far the depth solver
// moved shapes from the depths the strategy planned and how often it changed
// which of two overlapping shapes is in front. Pure and read-only: it changes
// nothing. Used by the Layout diagnostics panel and by `npm run diagnose`.

/**
 * @typedef {Object} LayoutDiagnostics
 * @property {number} shapes
 * @property {number} solids              shapes that collide (a rod, frame or ring crosses others on purpose)
 * @property {number} trueIntersections   pairs of solids whose real volumes intersect (should be 0)
 * @property {number} anchorIntersections ... of those, pairs that involve the anchor
 * @property {number} projectedOverlaps   pairs of shapes (all) whose silhouettes overlap on screen: not an error
 * @property {boolean} hasPlan            the layout is a strategy's, so planned depths are known
 * @property {number} orderPairs          overlapping pairs whose planned depths differ (the pairs the plan ordered)
 * @property {number} orderFlips          ... of those, pairs the solver put in the opposite front/back order
 * @property {number[]} shifts            each solid's |final depth - planned depth| (empty without a plan)
 * @property {number} meanShift
 * @property {number} maxShift
 * @property {number} depthSpan           the spread of shape centres along the view axis
 * @property {number} outsideCamera       shapes whose centre is outside the camera's clip planes (should be 0)
 */

/**
 * @param {object} args
 * @param {import('../types.js').LayoutEntry[]} args.entries
 * @param {import('../types.js').ShapeDef[]} args.shapeDefs
 * @param {{ depthAxis: THREE.Vector3, billboard: THREE.Quaternion }} args.view
 * @returns {LayoutDiagnostics}
 */
export function diagnoseLayout({ entries, shapeDefs, view }) {
  const basis = screenBasis(view.depthAxis);
  const cameraDistance = new THREE.Vector3(...CAMERA.position).length();
  const defs = new Map(shapeDefs.map((s) => [s.type, s]));

  const items = entries.map((e) => {
    const shape = /** @type {import('../types.js').ShapeDef} */ (defs.get(e.type));
    const q = shape.facesCamera ? view.billboard : new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation));
    const volume = makeVolume(shape, new THREE.Vector3(...e.position), q, new THREE.Vector3(...e.scale));
    return {
      e, solid: shape.collides !== false, volume,
      screen: volumeScreenBox(volume, basis),
      depth: volume.center.dot(view.depthAxis)
    };
  });

  let trueIntersections = 0, anchorIntersections = 0, projectedOverlaps = 0, orderPairs = 0, orderFlips = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.solid && b.solid && volumesIntersect(a.volume, b.volume)) {
        trueIntersections++;
        if (a.e.role === 'anchor' || b.e.role === 'anchor') anchorIntersections++;
      }
      if (!screenBoxesOverlap(a.screen, b.screen)) continue;
      projectedOverlaps++;
      if (a.e.plannedDepth === undefined || b.e.plannedDepth === undefined) continue;
      const planned = Math.sign(a.e.plannedDepth - b.e.plannedDepth);
      if (planned === 0) continue;
      orderPairs++;
      if (Math.sign(a.depth - b.depth) !== planned) orderFlips++;
    }
  }

  const hasPlan = items.some((it) => it.e.plannedDepth !== undefined);
  const shifts = items.filter((it) => it.solid && it.e.plannedDepth !== undefined).map((it) => Math.abs(it.depth - /** @type {number} */ (it.e.plannedDepth)));
  const depths = items.map((it) => it.depth);
  return {
    shapes: items.length,
    solids: items.filter((it) => it.solid).length,
    trueIntersections, anchorIntersections, projectedOverlaps, hasPlan, orderPairs, orderFlips,
    shifts,
    meanShift: shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : 0,
    maxShift: shifts.length ? Math.max(...shifts) : 0,
    depthSpan: depths.length ? Math.max(...depths) - Math.min(...depths) : 0,
    outsideCamera: depths.filter((d) => d >= cameraDistance - CAMERA.near || d <= cameraDistance - CAMERA.far).length
  };
}
