// @ts-check
// Step history: back / forward through the compositions you've seen.
//
// A composition is identified by its seed (and the palette it was shown in).
// Going back doesn't restore a snapshot of everything — it asks the config
// for that seed again, with your CURRENT settings. So history never rewrites
// your sliders or counts, locked shapes stay locked, and "back" is just
// "show me the seed I was on before" — the same rule as every other change
// (settings apply when the composition is regenerated).
//
// Like a browser's history: moving to a new composition after stepping back
// drops the "forward" entries. Held in memory only (a reload starts a fresh
// history from the restored composition). DOM-free.

/** @typedef {import('../types.js').SceneConfigState} SceneConfigState */
/** @typedef {{ seed: number, palette: string }} HistoryEntry */

/**
 * @param {{
 *   get(): SceneConfigState,
 *   update(patch: unknown): unknown,
 *   subscribe(fn: (next: SceneConfigState, prev: SceneConfigState) => void): () => void
 * }} config
 * @param {{ limit?: number }} [options]  limit: most entries kept (oldest dropped)
 */
export function createHistory(config, { limit = 100 } = {}) {
  /** @type {HistoryEntry[]} */
  let entries = [];
  let index = -1;
  let navigating = false;
  /** @type {(() => void) | null} */
  let unsubscribe = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();

  function notify() {
    [...listeners].forEach((fn) => fn());
  }

  /**
   * @param {SceneConfigState} next
   * @param {SceneConfigState} prev
   */
  function record(next, prev) {
    if (navigating) return; // our own back()/forward()
    if (next.seed !== prev.seed) {
      entries = entries.slice(0, index + 1); // new branch: drop "forward"
      entries.push({ seed: next.seed, palette: next.palette });
      if (entries.length > limit) entries = entries.slice(entries.length - limit);
      index = entries.length - 1;
      notify();
    } else if (next.palette !== prev.palette && entries[index]) {
      entries[index].palette = next.palette; // same composition, recolored
    }
  }

  /** @param {number} target */
  function goTo(target) {
    const entry = entries[target];
    if (!entry) return false;
    navigating = true;
    try {
      config.update({ seed: entry.seed, palette: entry.palette });
    } finally {
      navigating = false;
    }
    index = target;
    notify();
    return true;
  }

  return {
    /**
     * Begins recording, with the current composition as the first entry.
     * Call it once the starting config is settled (after restoring a
     * session / link), so the throwaway default isn't in the history.
     * Calling it again starts over.
     */
    start() {
      if (unsubscribe) unsubscribe();
      const c = config.get();
      entries = [{ seed: c.seed, palette: c.palette }];
      index = 0;
      unsubscribe = config.subscribe(record);
      notify();
    },
    back() { return index > 0 && goTo(index - 1); },
    forward() { return index >= 0 && index < entries.length - 1 && goTo(index + 1); },
    canBack() { return index > 0; },
    canForward() { return index >= 0 && index < entries.length - 1; },
    /** how many compositions are remembered, and which one is showing (1-based) */
    size() { return entries.length; },
    position() { return index + 1; },
    /** called when back/forward availability or position changes */
    subscribe(/** @type {() => void} */ fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
