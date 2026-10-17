// @ts-check
import { pickWeighted, between, rad } from './common.js';

// Pieces the composition strategies have in common: the shape-type names,
// the size/spread settings every strategy honours, the world-extents -> scale
// conversion, and the thrust angle taken from the reference works.

/** @typedef {import('./run.js').PlanContext} PlanContext */

/** The thrust-angle families seen in the references, in degrees (+ rising to the right). */
export const ANGLE_FAMILIES = /** @type {const} */ ([
  [[12, 25], 0.25],
  [[38, 46], 0.45],
  [[54, 62], 0.30]
]);

/**
 * A thrust angle in radians: one of the families (weighted), uniform within
 * it, rising or falling. Draws: the family, the angle, the sense (in that order).
 * @param {() => number} rng
 */
export function thrustAngle(rng) {
  const [lo, hi] = /** @type {readonly [number, number]} */ (pickWeighted(rng, /** @type {any} */ (ANGLE_FAMILIES)) || [38, 46]);
  return rad(between(rng, lo, hi)) * (rng() < 0.5 ? -1 : 1);
}

/** shape type names, by their role in a composition */
export const T = {
  circle: 'circle', cube: 'cube-fixed', block: 'cube-variable',
  sphere: 'sphere', triangle: 'triangle', plane: 'plane', rod: 'rod', beam: 'beam',
  segment: 'segment', crescent: 'crescent', frame: 'frame', ring: 'ring'
};

/** A draw from a type's size setting (sizeMin..sizeMax). @param {PlanContext} ctx @param {string} type @param {() => number} rng */
export function sizeMult(ctx, type, rng) {
  const s = ctx.settings[type];
  return s.sizeMin + rng() * (s.sizeMax - s.sizeMin);
}

/** A type's spread setting. @param {PlanContext} ctx @param {string} type */
export const spreadOf = (ctx, type) => ctx.settings[type].spread;

/**
 * The scale that gives a shape the stated world-space extents along its local axes.
 * @param {PlanContext} ctx @param {string} type @param {number} x @param {number} y @param {number} z
 * @returns {[number, number, number]}
 */
export function scaleFor(ctx, type, x, y, z) {
  const he = /** @type {import('../../types.js').ShapeDef} */ (ctx.shapes.get(type)).localHalfExtents;
  return [x / (2 * he.x), y / (2 * he.y), z / (2 * he.z)];
}
