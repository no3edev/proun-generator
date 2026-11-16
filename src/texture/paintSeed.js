// @ts-check
import { hashSeed, mulberry32 } from '../generator/rng.js';

// Where in the paint field each shape instance samples. Keyed by the
// instance's slot (shape type + slot), never by Math.random and never by
// the composition seed: the paint of a slot is the same through every
// composition change and every reload, and different between slots.
//
// What a slot is depends on the generator. Legacy shapes have none but their
// index. A composition strategy's shapes have a ROLE, and their slot is
// (role, ordinal among the shapes of that type and role): the "second support
// beam" has the same paint in every composition and after every reload, and a
// shape that glides from one composition to the next as the same part already
// has the right paint, so nothing flickers when it moves.

/**
 * @param {string} type
 * @param {number} index
 * @returns {[number, number]}
 */
export function paintSeed(type, index) {
  const rng = mulberry32(hashSeed('paint', type, index));
  return [rng() * 97, rng() * 97];
}

/**
 * Whether the surface patterns that follow a form's slot stay as they are through every composition change (false: "fixed to the
 * slot", the default) or are re-drawn with each new composition seed (true: "evolve"), crossfading under the colour front like any
 * change of paint. A lab switch (stage 5.4); it takes effect at the next change.
 */
export const surfaceMode = { evolve: false };

/**
 * The paint seed of a slot under a composition: the slot's own (paintSeed) when patterns are fixed, shifted by an offset that
 * depends on the composition seed only when they evolve, so the same composition seed always draws the same surface.
 * @param {string} type @param {number} slot @param {number | null | undefined} compositionSeed null: not a strategy, never evolves
 * @returns {[number, number]}
 */
export function paintSeedFor(type, slot, compositionSeed) {
  const base = paintSeed(type, slot);
  if (!surfaceMode.evolve || compositionSeed === null || compositionSeed === undefined) return base;
  const rng = mulberry32(hashSeed('paint-evolve', compositionSeed));
  return [(base[0] + rng() * 97) % 97, (base[1] + rng() * 97) % 97];
}

const ROLE_CODES = /** @type {Record<string, number>} */ ({ anchor: 1, support: 2, connector: 3, accent: 4, detail: 5 });

/**
 * The slot of each entry of a layout, in layout order, for paintSeed(): its index for a legacy entry (no role), else a number
 * made of its role and its ordinal among the entries of the same type and role.
 * @param {Array<{ type: string, index: number, role?: string }>} entries
 * @returns {number[]}
 */
export function paintSlots(entries) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return entries.map((e) => {
    const code = e.role ? ROLE_CODES[e.role] : undefined;
    if (!code) return e.index;
    const k = `${e.type}|${e.role}`;
    const ordinal = seen.get(k) || 0;
    seen.set(k, ordinal + 1);
    return 1000 * code + ordinal;
  });
}
