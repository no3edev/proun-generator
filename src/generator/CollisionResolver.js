// @ts-check
import * as THREE from 'three';
import { COLLISION } from '../config/defaults.js';

// Shapes are allowed to visually overlap on screen — that's the whole
// Proun look — but only when they're genuinely at different depths
// along the camera's line of sight. What must never happen is true 3D
// volume intersection. Each shape gets a cheap world-space AABB
// (approximate, but generous — that slack reads as intentional
// spacing rather than a bug); candidates are resolved largest-first,
// and any real overlap is fixed by sliding the smaller shape along
// the camera-forward axis, in whichever direction keeps the scene's
// net depth closest to centered.

/**
 * @typedef {Object} Candidate
 * @property {import('three').Vector3} position  mutated in place by resolveCollisions
 * @property {import('three').Box3} box          kept in sync with `position`
 * @property {boolean} [fixed]  immovable: an obstacle others are resolved against, never pushed itself
 */

/**
 * Builds a world-space AABB from a shape's local (unscaled) half
 * extents plus a candidate transform. Works for any shape type —
 * callers get `localHalfExtents` from that shape's own module, so
 * this file never needs to know what a "sphere" or "triangle" is.
 *
 * @param {{x: number, y: number, z: number}} localHalfExtents
 * @param {THREE.Vector3} position
 * @param {THREE.Quaternion} quaternion
 * @param {THREE.Vector3} scale
 */
export function computeAABB(localHalfExtents, position, quaternion, scale) {
  const sx = localHalfExtents.x * scale.x;
  const sy = localHalfExtents.y * scale.y;
  const sz = localHalfExtents.z * scale.z;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new THREE.Vector3();
  [-sx, sx].forEach((dx) => {
    [-sy, sy].forEach((dy) => {
      [-sz, sz].forEach((dz) => {
        corner.set(dx, dy, dz).applyQuaternion(quaternion).add(position);
        min.min(corner);
        max.max(corner);
      });
    });
  });
  return new THREE.Box3(min, max);
}

// min/max of a box's 8 corners projected onto an arbitrary axis
/**
 * @param {THREE.Box3} box
 * @param {THREE.Vector3} axis
 * @returns {[number, number]}
 */
export function projectBoxOntoAxis(box, axis) {
  let minP = Infinity, maxP = -Infinity;
  [box.min.x, box.max.x].forEach((x) => {
    [box.min.y, box.max.y].forEach((y) => {
      [box.min.z, box.max.z].forEach((z) => {
        const d = x * axis.x + y * axis.y + z * axis.z;
        if (d < minP) minP = d;
        if (d > maxP) maxP = d;
      });
    });
  });
  return [minP, maxP];
}

/** @param {THREE.Box3} box */
export function boxVolume(box) {
  return Math.max(0, box.max.x - box.min.x) *
    Math.max(0, box.max.y - box.min.y) *
    Math.max(0, box.max.z - box.min.z);
}

/**
 * Mutates each candidate's `position` (and `box`) in place so no two
 * end up genuinely intersecting in 3D. Each candidate must already
 * have a `box` (THREE.Box3) computed via computeAABB().
 *
 * @template {Candidate} T
 * @param {T[]} candidates
 * @param {THREE.Vector3} depthAxis normalized push direction (e.g. Billboard.direction())
 * @param {number} margin minimum gap left between resolved shapes
 */
export function resolveCollisions(candidates, depthAxis, margin = COLLISION.margin) {
  // fixed candidates (a locked shape type) are obstacles from the start;
  // everything else is placed around them, largest first
  const order = candidates.filter((c) => !c.fixed).sort((a, b) => boxVolume(b.box) - boxVolume(a.box));
  /** @type {T[]} */
  const resolved = candidates.filter((c) => c.fixed);
  let runningBalance = 0; // sum of signed depth pushes applied so far

  order.forEach((c) => {
    let collided = true;
    let iterations = 0;
    while (collided && iterations < COLLISION.maxIterations) {
      collided = false;
      for (const r of resolved) {
        if (!c.box.intersectsBox(r.box)) continue;
        collided = true;

        const [eMin, eMax] = projectBoxOntoAxis(r.box, depthAxis);
        const [cMin, cMax] = projectBoxOntoAxis(c.box, depthAxis);
        // two candidate fixes: slide the new shape fully beyond the
        // existing one's near side, or its far side
        const deltaAway = (eMin - margin) - cMax;
        const deltaToward = (eMax + margin) - cMin;
        // pick whichever keeps the scene's net depth offset closer to
        // zero, so shapes don't drift to one side of the camera over
        // many advances
        const delta = Math.abs(runningBalance + deltaAway) <= Math.abs(runningBalance + deltaToward)
          ? deltaAway : deltaToward;

        c.position.addScaledVector(depthAxis, delta);
        c.box.min.addScaledVector(depthAxis, delta);
        c.box.max.addScaledVector(depthAxis, delta);
        runningBalance += delta;
        break;
      }
      iterations++;
    }
    resolved.push(c);
  });

  return candidates;
}
