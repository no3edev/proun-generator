// @ts-check
import { SceneConfig } from '../config/store.js';
import { Composition } from './Composition.js';
import { Rhythm } from './Rhythm.js';
import { cycleMs } from '../config/defaults.js';
import { LIBRARY } from '../presets/library.js';
import { applyPreset } from '../presets/applyPreset.js';
import { createPlaylist } from './Playlist.js';

// Auto-advance on the animation clock (core/frameClock.js). There is no timer
// of its own: the render loop calls update(dt) with the same dt it gives Tween
// and Rhythm, so the hold counts down exactly as long as the animation runs and
// stops with it (a hidden tab, the lab's pause). The cycle is the transition
// plus the hold, counted from the moment a change STARTS (a click, the key, a
// preset, this timer: anything that raises a Rhythm event), so a manual change
// is followed by a full hold. At most one advance per update: a long frame
// never makes it catch up.

/** The curated sequence: the Library's presets, shuffled (core/Playlist.js). */
const playlist = createPlaylist({ items: LIBRARY });

let sinceChange = 0;
let seenEvents = Rhythm.events;
let seenAuto = false;

/**
 * Advances the cycle clock by `dt` ms; starts the next change when the cycle is over.
 * @param {number} dt animation ms since the last frame
 * @returns {boolean} whether it started a change
 */
function update(dt) {
  const time = SceneConfig.get().time;
  // a change that started some other way restarts the cycle (and so does turning Auto on)
  if (Rhythm.events !== seenEvents) { seenEvents = Rhythm.events; sinceChange = 0; }
  if (time.autoAdvance !== seenAuto) { seenAuto = time.autoAdvance; sinceChange = 0; }
  // the lab's pause stands the event clock still; the cycle stands still with it
  if (!time.autoAdvance || Rhythm.hold !== null) return false;
  sinceChange += dt;
  if (sinceChange < cycleMs(time)) return false;
  sinceChange = 0;
  advanceOnce(time.playlist);
  seenEvents = Rhythm.events;
  return true;
}

/**
 * The change Auto makes: a new random composition, or, with the curated sequence on, the next Library preset. A preset is applied as
 * a composition at the DISPLAY's orientation (a physical screen does not turn), and the viewer's timing stays (applyPreset).
 * @param {boolean} curated
 */
function advanceOnce(curated) {
  const preset = curated ? playlist.next() : null;
  if (!preset) { Composition.advance(); return; }
  applyPreset(SceneConfig, { ...preset.config, orientation: SceneConfig.get().orientation });
}

/** Time since the last change started, ms (shown by tests and diagnostics). */
function elapsed() { return sinceChange; }

/** Back to the start of a cycle (tests). */
function reset() {
  sinceChange = 0;
  seenEvents = Rhythm.events;
  seenAuto = SceneConfig.get().time.autoAdvance;
}

export const AutoAdvance = { update, elapsed, reset };

/** Kept for main.js: the cycle clock needs no timer to start, only a clean state. */
export function initAutoAdvance() {
  reset();
}
