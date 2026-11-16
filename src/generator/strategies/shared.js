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

/** A hairline's planned depth range: behind the anchor (depth 0) down to HAIRLINE_BACK, in front of it up to HAIRLINE_FRONT. */
export const HAIRLINE_BACK = -1.0;
export const HAIRLINE_FRONT = 3.0;
/** The share of hairlines that run in front of the anchor (about 80%; the rest keep the interlaced "behind" look of the references). */
export const HAIRLINE_FRONT_SHARE = 0.8;

/**
 * Bias a hairline's depth toward the front. `d` is the ONE draw a hairline already took,
 * uniform on [HAIRLINE_BACK, HAIRLINE_FRONT] (it used to put 25% behind the anchor, where a
 * thin line is hidden by it). The draw is remapped piecewise, so no extra random number is
 * taken and every other property of the hairline (place, angle, roll, colour) stays exactly
 * as it was: 20% of the range maps onto behind the anchor, the other 80% onto in front.
 * @param {number} d a depth drawn uniformly from [HAIRLINE_BACK, HAIRLINE_FRONT]
 */
export function frontBiasedDepth(d) {
  const u = (d - HAIRLINE_BACK) / (HAIRLINE_FRONT - HAIRLINE_BACK);
  const back = 1 - HAIRLINE_FRONT_SHARE;
  return u < back ? HAIRLINE_BACK * (1 - u / back) : HAIRLINE_FRONT * ((u - back) / HAIRLINE_FRONT_SHARE);
}

/** every shape type a strategy could place */
export const ALL_TYPES = Object.values(T);
