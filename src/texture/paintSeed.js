// @ts-check
import { hashSeed, mulberry32 } from '../generator/rng.js';

// Where in the paint field each shape instance samples. Keyed by the
// instance's slot (shape type + index), never by Math.random and never by
// the composition seed: the paint of a slot is the same through every
// composition change and every reload, and different between slots.

/**
 * @param {string} type
 * @param {number} index
 * @returns {[number, number]}
 */
export function paintSeed(type, index) {
  const rng = mulberry32(hashSeed('paint', type, index));
  return [rng() * 97, rng() * 97];
}
