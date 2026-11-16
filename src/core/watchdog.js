// @ts-check

// Unattended recovery (Stage 7.3). A display that runs for days will, sooner or later, hit something the code did not foresee. Two
// things bring it back, both ending in a page reload that restores the session (the autosave is flushed first, so the picture and the
// timing come back as they were):
//   - a storm of uncaught errors: ERROR_LIMIT of them within ERROR_WINDOW_MS
//   - an optional scheduled refresh (?reload=<hours>) for a fresh GPU and JS state, taken at a moment nothing is moving
// Neither acts unless the page is in exhibition mode (someone editing in the panel must not be reloaded under their hands), and a
// reload is never repeated within MIN_RELOAD_GAP_MS of the last one, so a persistent fault cannot become a reload loop. The time of
// the last reload lives in storage, because a reload throws every variable away; if storage cannot be used, the watchdog does not
// reload at all (it could not promise there is no loop).
//
// The window, the clock, the storage and the reload itself are injected, so the tests drive all of it with doubles.

export const WATCHDOG = {
  errorLimit: 20,
  errorWindowMs: 60_000,
  minReloadGapMs: 300_000,
  checkEveryMs: 30_000,
  fadeMs: 700,
  minScheduledHours: 0.1,
  maxScheduledHours: 720
};

export const RELOAD_KEY = 'proun-reload';

/**
 * `?reload=<hours>` : refresh the page after that many hours, at the first moment nothing is moving.
 * @param {string} search window.location.search
 * @returns {number | null} hours, or null (absent or out of range: 0.1 hours to 30 days)
 */
export function parseReloadHours(search) {
  const raw = new URLSearchParams(String(search || '')).get('reload');
  if (raw === null || raw.trim() === '') return null;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < WATCHDOG.minScheduledHours || hours > WATCHDOG.maxScheduledHours) return null;
  return hours;
}

/**
 * @param {{
 *   win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>,
 *   storage: { getItem(k: string): string | null, setItem(k: string, v: string): void } | null,
 *   now?: () => number,
 *   isEnabled: () => boolean,
 *   isIdle: () => boolean,
 *   flushSession?: () => void,
 *   reload: () => void,
 *   scheduledHours?: number | null,
 *   limits?: Partial<typeof WATCHDOG>
 * }} o
 *   isEnabled: whether the page is in exhibition mode; isIdle: nothing is moving (no transition, no lab pause);
 *   reload: does the reload (the page fades out first); limits: overrides of WATCHDOG, for the tests
 */
export function createWatchdog({ win, storage, now = () => Date.now(), isEnabled, isIdle, flushSession = () => {}, reload, scheduledHours = null, limits = {} }) {
  const L = { ...WATCHDOG, ...limits };
  const startedAt = now();
  /** @type {number[]} */
  let errors = [];
  let suppressed = 0;
  let reloading = false;
  /** @type {string | null} */
  let lastReason = null;

  function readState() {
    try {
      const text = storage && storage.getItem(RELOAD_KEY);
      if (!text) return { at: 0, count: 0, ok: !!storage };
      const v = JSON.parse(text);
      return { at: Number(v.at) || 0, count: Number(v.count) || 0, ok: true };
    } catch { return { at: 0, count: 0, ok: false }; }
  }

  /** @param {string} reason @returns {boolean} whether it reloaded */
  function tryReload(reason) {
    if (reloading) return false;
    const state = readState();
    if (!state.ok) { suppressed++; return false; }                       // cannot promise "no loop": stay put
    if (now() - state.at < L.minReloadGapMs) { suppressed++; return false; }
    try { flushSession(); } catch { /* a failed save must not keep the display from recovering */ }
    try { storage && storage.setItem(RELOAD_KEY, JSON.stringify({ at: now(), reason, count: state.count + 1 })); } catch { suppressed++; return false; }
    reloading = true;
    lastReason = reason;
    reload();
    return true;
  }

  function onError() {
    const t = now();
    errors.push(t);
    errors = errors.filter((e) => t - e <= L.errorWindowMs);
    if (errors.length >= L.errorLimit && isEnabled()) tryReload('errors');
  }

  function check() {
    if (scheduledHours === null || !isEnabled()) return;
    if (now() - startedAt < scheduledHours * 3_600_000) return;
    if (!isIdle()) return;                                               // never in the middle of a transition
    tryReload('scheduled');
  }

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onError);
  const timer = scheduledHours === null ? null : win.setInterval(check, L.checkEveryMs);

  return {
    /** Counters for the console (`__proun.watchdog.stats()`). */
    stats() {
      const s = readState();
      const t = now();
      return { recentErrors: errors.filter((e) => t - e <= L.errorWindowMs).length, reloads: s.count, lastReloadAt: s.at || null, suppressed, lastReason, scheduledHours };
    },
    dispose() {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onError);
      if (timer !== null) win.clearInterval(timer);
    }
  };
}
