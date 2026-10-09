// @ts-check
// Session autosave: the current SceneConfig is kept in localStorage so a
// reload brings back the same composition (seed included) and settings.
// DOM-free: storage and timers are passed in, so it's testable in node and
// tolerant of storage being missing, full or blocked (a privacy mode can
// make even *reading* window.localStorage throw — callers pass null then).

/** @typedef {import('../types.js').SceneConfigState} SceneConfigState */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} StorageLike */

export const SESSION_KEY = 'proun-session';

/**
 * The raw stored config, or null if there isn't a usable one. Not
 * validated here: it goes through SceneConfig.replace(), which migrates,
 * clamps and fills in anything missing.
 * @param {StorageLike | null | undefined} storage
 * @returns {Record<string, unknown> | null}
 */
export function loadSession(storage) {
  try {
    const text = storage && storage.getItem(SESSION_KEY);
    if (!text) return null;
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (err) {
    return null;
  }
}

/**
 * @param {StorageLike | null | undefined} storage
 * @param {SceneConfigState} config
 * @returns {boolean} whether it was stored
 */
export function saveSession(storage, config) {
  try {
    if (!storage) return false;
    storage.setItem(SESSION_KEY, JSON.stringify(config));
    return true;
  } catch (err) {
    return false; // quota / blocked: autosave is best-effort
  }
}

/**
 * Saves the config shortly after it stops changing (an auto-advance tick
 * or a slider drag can fire many changes). `flush()` saves immediately if a
 * save is pending — wire it to pagehide / visibilitychange so the last
 * change isn't lost.
 *
 * @param {{ get(): SceneConfigState, subscribe(fn: () => void): () => void }} config
 * @param {{ storage: StorageLike | null | undefined, delayMs?: number,
 *           timers?: { setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout } }} options
 */
export function startSessionAutosave(config, { storage, delayMs = 400, timers = globalThis }) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pending = null;

  function flush() {
    if (pending === null) return;
    timers.clearTimeout(pending);
    pending = null;
    saveSession(storage, config.get());
  }

  const unsubscribe = config.subscribe(() => {
    if (pending !== null) timers.clearTimeout(pending);
    pending = timers.setTimeout(flush, delayMs);
  });

  return {
    flush,
    stop() {
      unsubscribe();
      if (pending !== null) timers.clearTimeout(pending);
      pending = null;
    }
  };
}
