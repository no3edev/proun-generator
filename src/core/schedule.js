// @ts-check
import { createRng } from '../generator/rng.js';
import { MOTION_PROFILES, DYNAMICS } from '../config/defaults.js';

// Per-object motion scheduling (Stage 6.2). A transition has one WINDOW (time.durationMs); inside it each shape gets its own
// schedule: a delay before it starts, a span it takes to get there and an easing. All three are drawn from the seed and the shape's
// (type, role, index), so a composition always moves the same way, and from its ROLE's profile (config/defaults.js
// MOTION_PROFILES): anchors start first, take nearly the whole window and ease gently; details start last, take a third to a
// half and ease crisply. Every shape starts within the first 25% of the window and has arrived by its end, so they overlap heavily.
//
// Only WHEN and HOW SHARPLY a shape moves changes. Its path stays straight and its end is the target, exactly: there is no overshoot,
// no curve and no extra travel to jump back from (a smaller "amplitude" of distance is not possible without missing the target).
// What the profiles vary is the strength of the movement, the peak speed of the easing: sine 1.57, cubic 3, quart 4 (x distance / span).
//
// DOM-free, so the tests and the tools read it directly.

/** @typedef {'sine' | 'cubic' | 'quart'} EaseName */
/** @typedef {{ delay: number, span: number, ease: EaseName, mix: number }} Track
 *  one timeline inside the window: delay, span: shares of the window (delay + span <= 1); mix: how much of `ease` replaces the plain cubic (0..1) */
/** @typedef {Track & { color: Track, material: Track }} Schedule
 *  the geometry's track, and the colour's and the material's own (Stage 6.3): when the new colour sweeps in, and when the highlight,
 *  the shadow's colour and the hatching change, each independent of when the shape moves */

/** The lab's strength of the whole effect, 0 (one cubic over the whole window for everything: the motion before 6.2) to 1. */
export const stagger = { amount: DYNAMICS.motion.stagger };

/** @param {{ amount: number }} p */
export function setStagger(p) {
  stagger.amount = Math.min(1, Math.max(0, Number.isFinite(p.amount) ? p.amount : DYNAMICS.motion.stagger));
}

/** @param {number} t */
const sine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
/** @param {number} t */
const cubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** @param {number} t */
const quart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
/** @type {Record<EaseName, (t: number) => number>} */
export const EASES = { sine, cubic, quart };

/**
 * The eased progress for a linear progress `t` (0..1) under a schedule: the role's ease blended with the plain cubic by `mix`.
 * @param {Pick<Schedule, 'ease' | 'mix'>} s
 * @param {number} t
 */
export function easeAt(s, t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return s.mix >= 1 ? EASES[s.ease](t) : cubic(t) + (EASES[s.ease](t) - cubic(t)) * s.mix;
}

/**
 * The schedule of one shape in a change. Deterministic in its inputs.
 * @param {{ seed: number, type: string, role?: string, index: number }} who
 * @param {number} [amount] the strength (default: the lab's)
 * @returns {Schedule}
 */
export function scheduleFor(who, amount = stagger.amount) {
  const a = Math.min(1, Math.max(0, amount));
  const profile = (who.role && /** @type {any} */ (MOTION_PROFILES)[who.role]) || MOTION_PROFILES.other;
  const rng = createRng('motion', who.seed, who.type, who.role || '-', who.index);
  /** @param {{ delay: number[], span: number[], ease: EaseName }} r @returns {Track} */
  const track = (r) => {
    const d = r.delay[0] + (r.delay[1] - r.delay[0]) * rng();
    const sp = r.span[0] + (r.span[1] - r.span[0]) * rng();
    const delay = Math.min(MOTION_PROFILES.maxStart, d) * a;
    // at strength 0 the span is the whole window; at 1 it is the profile's
    return { delay, span: Math.min(1 - delay, 1 - (1 - sp) * a), ease: r.ease, mix: a };
  };
  const geometry = track(profile);
  // colour and material draw AFTER the geometry, so the geometry's schedule is the one of Stage 6.2, number for number; their delay is
  // not held to the 25% of the geometry (a late recolour is the point), only to the window
  const late = (/** @type {{ delay: number[], span: number[], ease: EaseName }} */ r) => {
    const d = r.delay[0] + (r.delay[1] - r.delay[0]) * rng();
    const sp = r.span[0] + (r.span[1] - r.span[0]) * rng();
    const delay = d * a;
    return /** @type {Track} */ ({ delay, span: Math.min(1 - delay, 1 - (1 - sp) * a), ease: r.ease, mix: a });
  };
  return { ...geometry, color: late(profile.color), material: late(profile.material) };
}
