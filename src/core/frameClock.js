// @ts-check
import { MAX_FRAME_MS, STALL_MS } from '../config/defaults.js';

// The animation clock. Everything that moves or counts down (Tween, Rhythm, the
// ground, the hold timer of auto-advance) is advanced by the SAME number of
// milliseconds per frame, so they run, stall and resume together, and none of
// them reads the wall clock on its own.
//
// A frame that took up to STALL_MS counts in full, whatever the frame rate: a
// 1-minute transition lasts a minute at 30, 60 or 144 fps and on a machine that
// only manages 4 frames a second. A longer frame is a suspension (a hidden tab,
// a debugger, a lid closed), not a slow frame: it advances the clock by
// MAX_FRAME_MS only, so everything picks up exactly where it stopped.
//
// DOM-free, so the tests drive the very function the loop uses.

/**
 * @param {number} rawMs real time since the previous frame
 * @returns {number} animation time to advance by (ms)
 */
export function frameDt(rawMs) {
  if (!Number.isFinite(rawMs) || rawMs <= 0) return 0;
  return rawMs >= STALL_MS ? MAX_FRAME_MS : rawMs;
}
