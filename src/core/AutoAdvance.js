// @ts-check
import { SceneConfig } from '../config/store.js';
import { Composition } from './Composition.js';

// Drives time.autoAdvance / time.intervalMs from the SceneConfig: while
// auto-advance is on, calls Composition.advance() every intervalMs. The
// panel only edits the config; this is the one place a timer exists.
export function initAutoAdvance() {
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  /** @param {import('../types.js').TimeSettings} time */
  function apply(time) {
    if (timer) clearInterval(timer);
    timer = time.autoAdvance
      ? setInterval(() => Composition.advance(), time.intervalMs)
      : null;
  }

  apply(SceneConfig.get().time);
  SceneConfig.subscribe((next, prev) => {
    if (next.time.autoAdvance !== prev.time.autoAdvance || next.time.intervalMs !== prev.time.intervalMs) {
      apply(next.time);
    }
  });
}
