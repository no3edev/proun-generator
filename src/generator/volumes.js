// @ts-check
import * as THREE from 'three';

// The real volume of a shape, as the solver and the diagnostics see it: an
// oriented box (the shape's own half extents, scaled and turned), or a ball
// for the sphere. The world-axis-aligned box the legacy solver uses
// (CollisionResolver.computeAABB) is a loose stand-in: for a long rotated
// beam it is, on average, over forty times the beam's real volume, so two
// beams that are visibly apart "collide". This module tests the shapes
// themselves. It is pure: no scene, no camera, no randomness.

/**
 * @typedef {{ kind: 'box', center: THREE.Vector3, axes: THREE.Vector3[], half: number[] }
 *         | { kind: 'sphere', center: THREE.Vector3, radius: number }} Volume
 */

const PARALLEL = 1e-9; // below this, two box axes are parallel and their cross product is no axis

/**
 * @param {{ localHalfExtents: {x: number, y: number, z: number}, volumeKind?: string }} shape
 * @param {THREE.Vector3} position
 * @param {THREE.Quaternion} quaternion
 * @param {THREE.Vector3} scale
 * @returns {Volume}
 */
export function makeVolume(shape, position, quaternion, scale) {
  const he = shape.localHalfExtents;
  const half = [he.x * scale.x, he.y * scale.y, he.z * scale.z];
  if (shape.volumeKind === 'sphere') return { kind: 'sphere', center: position.clone(), radius: Math.max(...half) };
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => a.applyQuaternion(quaternion));
  return { kind: 'box', center: position.clone(), axes, half };
}

/** The radius of the smallest ball around a volume's centre that contains it (a quick reject for far-apart pairs). @param {Volume} v */
export function boundingRadius(v) {
  return v.kind === 'sphere' ? v.radius : Math.hypot(v.half[0], v.half[1], v.half[2]);
}

/**
 * Whether two volumes intersect, or come closer than `margin` (a gap to
 * keep). Touching counts as intersecting. Separating-axis test for two boxes
 * (the 3 face axes of each and the 9 edge-edge cross axes); closest-point
 * tests when a ball is involved.
 * @param {Volume} a
 * @param {Volume} b
 * @param {number} [margin]
 */
export function volumesIntersect(a, b, margin = 0) {
  const reach = boundingRadius(a) + boundingRadius(b) + margin;
  if (a.center.distanceToSquared(b.center) > reach * reach) return false; // too far apart to touch
  if (a.kind === 'sphere' && b.kind === 'sphere') {
    const r = a.radius + b.radius + margin;
    return a.center.distanceToSquared(b.center) <= r * r;
  }
  if (a.kind === 'sphere') return sphereTouchesBox(a, /** @type {any} */ (b), margin);
  if (b.kind === 'sphere') return sphereTouchesBox(b, a, margin);
  return boxesIntersect(a, b, margin);
}

/**
 * @param {{ center: THREE.Vector3, radius: number }} s
 * @param {{ center: THREE.Vector3, axes: THREE.Vector3[], half: number[] }} box
 * @param {number} margin
 */
function sphereTouchesBox(s, box, margin) {
  const d = s.center.clone().sub(box.center);
  const closest = box.center.clone();
  for (let i = 0; i < 3; i++) {
    const t = Math.max(-box.half[i], Math.min(box.half[i], d.dot(box.axes[i])));
    closest.addScaledVector(box.axes[i], t);
  }
  const r = s.radius + margin;
  return closest.distanceToSquared(s.center) <= r * r;
}

/**
 * @param {{ center: THREE.Vector3, axes: THREE.Vector3[], half: number[] }} a
 * @param {{ center: THREE.Vector3, axes: THREE.Vector3[], half: number[] }} b
 * @param {number} margin
 */
function boxesIntersect(a, b, margin) {
  const t = b.center.clone().sub(a.center);
  /** @param {THREE.Vector3} L a unit axis */
  const separated = (L) => {
    let ra = 0, rb = 0;
    for (let k = 0; k < 3; k++) {
      ra += a.half[k] * Math.abs(a.axes[k].dot(L));
      rb += b.half[k] * Math.abs(b.axes[k].dot(L));
    }
    return Math.abs(t.dot(L)) > ra + rb + margin;
  };
  for (const L of a.axes) if (separated(L)) return false;
  for (const L of b.axes) if (separated(L)) return false;
  const cross = new THREE.Vector3();
  for (const u of a.axes) {
    for (const v of b.axes) {
      cross.crossVectors(u, v);
      const len = cross.length();
      if (len < PARALLEL) continue;
      if (separated(cross.divideScalar(len))) return false;
    }
  }
  return true;
}

/**
 * The volume's silhouette box on screen (exact for a box: the extent of a box along a direction is
 * the sum of its half extents' components).
 * @param {Volume} v
 * @param {{ right: THREE.Vector3, up: THREE.Vector3 }} basis the screen basis (strategies/common.screenBasis)
 */
export function volumeScreenBox(v, basis) {
  const cx = v.center.dot(basis.right), cy = v.center.dot(basis.up);
  let rx, ry;
  if (v.kind === 'sphere') { rx = v.radius; ry = v.radius; } else {
    rx = 0; ry = 0;
    for (let k = 0; k < 3; k++) {
      rx += v.half[k] * Math.abs(v.axes[k].dot(basis.right));
      ry += v.half[k] * Math.abs(v.axes[k].dot(basis.up));
    }
  }
  return { x0: cx - rx, x1: cx + rx, y0: cy - ry, y1: cy + ry };
}

/**
 * Whether two silhouette boxes overlap by more than `min` in both directions (the overlap a viewer sees).
 * @param {{ x0: number, x1: number, y0: number, y1: number }} a
 * @param {{ x0: number, x1: number, y0: number, y1: number }} b
 * @param {number} [min]
 */
export function screenBoxesOverlap(a, b, min = 0.05) {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > min && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > min;
}
