// @ts-check
// Seeded randomness. The generator never touches Math.random: every
// random draw comes from an rng built here, so (seed + settings) fully
// determines a composition. DOM-free and three.js-free.
//
// An "rng" is just a function returning a float in [0, 1) — the same
// contract as Math.random — so shape modules can use it as a drop-in.

/**
 * Hashes any number of string/number parts to a uint32 (FNV-1a). Used to
 * derive independent streams, e.g. hashSeed(seed, 'sphere', 2).
 * @param {...(string | number)} parts
 */
export function hashSeed(...parts) {
  const s = parts.join('\u001f');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32: small, fast, well-distributed 32-bit PRNG.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An rng for the stream identified by `parts` (see hashSeed).
 * @param {...(string | number)} parts
 * @returns {() => number}
 */
export function createRng(...parts) {
  return mulberry32(hashSeed(...parts));
}

/**
 * A fresh uint32 seed. This is the ONLY place the app draws real entropy:
 * advancing the composition means "pick a new seed".
 */
export function randomSeed() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296);
}
