// @ts-check
import { DYNAMICS } from '../config/defaults.js';

// The shared time model for visual dynamics. A composition change is an
// EVENT: Composition calls trigger() when one starts, the render loop calls
// update(dt) once per frame, and every visual system that wants to react
// just reads `energy` / `phase` — no subscriptions, no per-system timers.
//
//   energy  0..1 envelope of the event: rises quickly (attack), then settles
//           slowly (release), back to exactly 0 at rest
//   phase   0..1 linear progress through the transition itself (the same
//           duration the Tween uses), 1 at rest
//
// It runs on the loop's own clamped dt, exactly like Tween, so the two stay
// in step and both pause together in a hidden tab. All timing is relative to
// the transition duration (and capped by the auto-advance interval), so
// changing either setting changes the rhythm, not the shape of the response.
//
// A trigger that arrives mid-event does not reset energy to 0: the envelope
// continues from wherever it is, so there is no pop.
//
// `hold` is a lab aid: while set, the clock stands still at that many
// transition durations after the event, so a still can be inspected.

/**
 * The envelope parameters in force. Starts as the DYNAMICS defaults; the
 * material lab edits it live (lab/Lab.js). Tests pass their own.
 */
export const envelopeParams = { ...DYNAMICS.envelope };

/** @param {number} x */
export function smooth01(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
}

/**
 * Inverse of smooth01 on [0, 1].
 * @param {number} y
 */
export function unsmooth01(y) {
  return y <= 0 ? 0 : y >= 1 ? 1 : 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
}

/**
 * Attack and release lengths (ms) for a transition.
 * @param {number} duration transition duration, ms
 * @param {number} interval auto-advance interval, ms (0 = none)
 * @param {typeof envelopeParams} [p]
 */
export function envelopeTiming(duration, interval, p = envelopeParams) {
  const attack = Math.max(1, p.attack * duration);
  let release = p.release * duration;
  if (interval > 0) release = Math.min(release, p.releaseMaxOfInterval * interval);
  release = Math.max(release, p.releaseMin * duration, 1);
  return { attack, release };
}

/**
 * Energy `elapsed` ms after an event starts.
 * @param {number} elapsed
 * @param {number} duration
 * @param {number} interval
 * @param {typeof envelopeParams} [p]
 */
export function envelope(elapsed, duration, interval, p = envelopeParams) {
  if (elapsed <= 0) return 0;
  const { attack, release } = envelopeTiming(duration, interval, p);
  if (elapsed < attack) return smooth01(elapsed / attack);
  return smooth01(1 - (elapsed - attack) / release);
}

export const Rhythm = {
  /** 0..1, exactly 0 at rest */
  energy: 0,
  /** 0..1 through the transition; 1 at rest */
  phase: 1,
  /** number of events so far */
  events: 0,
  /** @type {number | null} dev: freeze at this many durations after the event */
  hold: null,

  active: false,
  elapsed: 0,
  origin: 0,
  duration: 1,
  interval: 0,

  /**
   * A composition change began.
   * @param {number} durationMs the transition duration
   * @param {number} [intervalMs] the auto-advance interval, 0 if none
   */
  trigger(durationMs, intervalMs = 0) {
    this.duration = Math.max(1, durationMs);
    this.interval = Math.max(0, intervalMs);
    const { attack } = envelopeTiming(this.duration, this.interval);
    // continue from the current energy (rising branch), not from zero
    this.elapsed = this.hold !== null
      ? this.hold * this.duration
      : this.energy > 0 ? unsmooth01(this.energy) * attack : 0;
    this.origin = this.hold !== null ? 0 : this.elapsed;
    this.active = true;
    this.events++;
    this.refresh();
  },

  /**
   * Freeze the clock at `h` transition durations after the event (null
   * releases it: the event then plays out from where it was held). Holding
   * at rest starts an event, so a still can be inspected without waiting
   * for a composition change.
   * @param {number | null} h
   * @param {number} durationMs transition duration to use if no event is running
   */
  setHold(h, durationMs) {
    this.hold = h;
    if (h === null) return;
    if (!this.active) {
      this.duration = Math.max(1, durationMs);
      this.interval = 0;
      this.origin = 0;
      this.active = true;
    }
    this.elapsed = h * this.duration;
    this.refresh();
  },

  /** @param {number} dt ms since the previous frame */
  update(dt) {
    if (this.hold === null && !this.active) return;
    if (this.hold !== null) {
      if (!this.active) return;
      this.elapsed = this.hold * this.duration;
    } else {
      this.elapsed += dt;
    }
    this.refresh();
    if (this.hold === null) {
      const { attack, release } = envelopeTiming(this.duration, this.interval);
      if (this.elapsed >= attack + release) {
        this.active = false;
        this.energy = 0;
        this.phase = 1;
      }
    }
  },

  refresh() {
    this.energy = envelope(this.elapsed, this.duration, this.interval);
    this.phase = Math.min(1, Math.max(0, (this.elapsed - this.origin) / this.duration));
  },

  /** Back to rest (tests, dev). */
  reset() {
    this.energy = 0;
    this.phase = 1;
    this.events = 0;
    this.hold = null;
    this.active = false;
    this.elapsed = 0;
    this.origin = 0;
  }
};
