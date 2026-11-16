// @ts-check
import * as THREE from 'three';
import { COLLISION } from '../../config/defaults.js';
import { makeVolume, volumesIntersect } from '../volumes.js';

// The depth solver for composition strategies. Shapes are placed on screen by
// the strategy and never move there; this only settles their DEPTH (along the
// view axis, which leaves a shape exactly where it is on screen), so that no
// two solids really intersect.
//
// What it does differently from the legacy solver (CollisionResolver, which
// stays in use for the legacy generator, unchanged):
//  - it tests the shapes' REAL volumes (oriented boxes, balls), not their
//    world-axis boxes, which for a long rotated beam are over forty times its
//    volume and made visibly separate beams "collide";
//  - it places shapes by ROLE, then size: the anchor first and never moved
//    (except around a locked shape, which is immovable), then supports,
//    connectors, accents, details; a shape only ever yields to those placed
//    before it;
//  - it slides a shape the SMALLEST distance that clears the shape it hits, in
//    the direction that keeps the front/back order the strategy PLANNED
//    (unless that costs more than `orderSlack` extra), instead of balancing a
//    running total;
//  - it clears a shape by sliding it ONE way until nothing is hit (so it cannot
//    go back and forth between two shapes), both ways, and takes the better; never
//    farther than `maxShift` from the plan; it reports what it could not resolve.
// Pure and deterministic: every tie breaks by order.

/**
 * @typedef {Object} SolveItem
 * @property {import('../../types.js').ShapeDef} shape
 * @property {THREE.Quaternion} q        the orientation the volume has (the camera-facing one for a facesCamera shape)
 * @property {THREE.Vector3} scale
 * @property {THREE.Vector3} position    where the shape is; MOVED along the view axis by the solver
 * @property {boolean} [fixed]           immovable (a locked shape)
 * @property {boolean} collides          false for a shape that crosses others on purpose (rod, frame, ring): ignored
 * @property {string} [role]
 * @property {number} [planned]         the depth along the view axis the strategy planned (a fixed shape has none: its own depth is its plan)
 * @property {number} order              original position in the list (the final tie-break)
 */

const ROLE_RANK = /** @type {Record<string, number>} */ ({ anchor: 0, support: 1, connector: 2, accent: 3, detail: 4 });

/** @param {import('../volumes.js').Volume} v */
const measure = (v) => (v.kind === 'sphere' ? (4 / 3) * Math.PI * v.radius ** 3 : 8 * v.half[0] * v.half[1] * v.half[2]);

/**
 * @param {SolveItem[]} items
 * @param {THREE.Vector3} depthAxis unit vector from the origin toward the camera
 * @param {{ margin?: number, maxPasses?: number, maxShift?: number, orderSlack?: number }} [opts]
 * @returns {{ unresolved: number }} how many shapes still intersect another when the solver stopped
 */
export function resolveVolumes(items, depthAxis, opts = {}) {
  const margin = opts.margin ?? COLLISION.margin;
  const maxPasses = opts.maxPasses ?? COLLISION.maxPasses;
  const maxShift = opts.maxShift ?? COLLISION.maxShift;
  const orderSlack = opts.orderSlack ?? COLLISION.orderSlack;

  const solids = items.filter((it) => it.collides);
  /** @type {Map<SolveItem, { base: import('../volumes.js').Volume, depth0: number, offset: number }>} */
  const state = new Map(solids.map((it) => {
    const base = makeVolume(it.shape, it.position, it.q, it.scale);
    return [it, { base, depth0: it.position.dot(depthAxis), offset: 0 }];
  }));

  /** the item's volume slid `offset` along the view axis from where it started */
  const volumeAt = (/** @type {SolveItem} */ it, /** @type {number} */ offset) => {
    const { base } = /** @type {NonNullable<ReturnType<typeof state.get>>} */ (state.get(it));
    return { ...base, center: base.center.clone().addScaledVector(depthAxis, offset) };
  };
  const current = (/** @type {SolveItem} */ it) => volumeAt(it, /** @type {NonNullable<ReturnType<typeof state.get>>} */ (state.get(it)).offset);
  const depthOf = (/** @type {SolveItem} */ it) => {
    const st = /** @type {NonNullable<ReturnType<typeof state.get>>} */ (state.get(it));
    return st.depth0 + st.offset;
  };

  const rank = (/** @type {SolveItem} */ it) => (it.fixed ? -1 : (it.role !== undefined && it.role in ROLE_RANK ? ROLE_RANK[it.role] : 5));
  const order = [...solids].sort((a, b) =>
    rank(a) - rank(b)
    || measure(/** @type {any} */ (state.get(b)).base) - measure(/** @type {any} */ (state.get(a)).base)
    || a.order - b.order);

  /**
   * The distance `it`, now at `from`, must slide in direction `sign` (+1 toward the camera) to clear `other` (a margin apart). The set
   * of slides along a line at which two convex volumes intersect is one interval, so the far end of it is found by doubling and bisection.
   */
  const reachFrom = (/** @type {SolveItem} */ it, /** @type {number} */ from, /** @type {import('../volumes.js').Volume} */ other, /** @type {number} */ sign) => {
    const free = (/** @type {number} */ s) => !volumesIntersect(volumeAt(it, from + sign * s), other, margin);
    let hi = 0.25;
    while (!free(hi) && hi < 80) hi *= 2;
    if (!free(hi)) return Infinity;
    let lo = hi === 0.25 ? 0 : hi / 2;
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      if (free(mid)) hi = mid; else lo = mid;
    }
    return hi;
  };

  /**
   * Slides `it` in one direction (`sign`: +1 toward the camera) until it clears every placed shape, one blocking shape after another.
   * Always the same direction, so it cannot go back and forth between two shapes, and it ends: each jump passes one blocking
   * shape's far side. Returns the total offset it ends at, or null if it cannot get clear.
   */
  const sweep = (/** @type {SolveItem} */ it, /** @type {SolveItem[]} */ placed, /** @type {number} */ sign) => {
    const st = /** @type {NonNullable<ReturnType<typeof state.get>>} */ (state.get(it));
    let offset = st.offset;
    for (let jump = 0; jump < maxPasses; jump++) {
      const mine = volumeAt(it, offset);
      const blocker = placed.find((p) => volumesIntersect(mine, current(p), margin));
      if (!blocker) return offset;
      const dist = reachFrom(it, offset, current(blocker), sign);
      if (!Number.isFinite(dist)) return null;
      offset += sign * dist;
    }
    return null;
  };

  /** @type {SolveItem[]} */
  const placed = [];
  let unresolved = 0;

  for (const it of order) {
    if (!it.fixed) {
      const st = /** @type {NonNullable<ReturnType<typeof state.get>>} */ (state.get(it));
      const first = placed.find((p) => volumesIntersect(current(it), current(p), margin));
      if (first) {
        // clear every placed shape by sliding one way, either way; take the way that keeps the planned order if it costs no more
        // than `orderSlack` extra, else the nearer; never farther than `maxShift` from the plan
        const wanted = Math.sign((it.planned ?? st.depth0) - (first.planned ?? depthOf(first)));
        const options = [1, -1].map((sign) => ({ sign, offset: sweep(it, placed, sign) }))
          .filter((o) => o.offset !== null && Math.abs(/** @type {number} */ (o.offset)) <= maxShift)
          .map((o) => ({ sign: o.sign, offset: /** @type {number} */ (o.offset), cost: Math.abs(/** @type {number} */ (o.offset) - st.offset) }));
        if (options.length) {
          const nearest = options.reduce((a, b) => (b.cost < a.cost ? b : a));
          const keeps = options.find((o) => o.sign === wanted);
          const chosen = keeps && wanted !== 0 && keeps.cost <= nearest.cost + orderSlack ? keeps : nearest;
          st.offset = chosen.offset;
        } else {
          unresolved++; // nowhere within reach is clear: left where it was, and reported
        }
      }
      it.position.copy(current(it).center);
    }
    placed.push(it);
  }
  return { unresolved };
}
