import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stageSize, EXHIBITION_MAX_PIXELS } from '../src/core/stageFit.js';
import { parseExhibitionParams } from '../src/core/exhibitionParams.js';
import { createExhibitionMode, isExhibitionActive } from '../src/core/ExhibitionMode.js';
import { ORIENTATIONS } from '../src/config/defaults.js';

// Stage 7.2: exhibition mode. Pure stage fitting, the start flags, and the controller with a document, a window and a wake lock
// that are doubles.

const VIEWPORTS = [[1280, 800], [1920, 1080], [3840, 2160], [800, 1280], [1080, 1920], [500, 500], [2560, 1080], [320, 568]];

describe('stageSize in the normal mode (the panel next to the stage): exactly what it was', () => {
  it('fits 92% x 86% of the window, never above the base size, at the device pixel ratio', () => {
    for (const dims of Object.values(ORIENTATIONS)) for (const [vw, vh] of VIEWPORTS) for (const dpr of [1, 1.5, 2, 3]) {
      const scale = Math.min((vw * 0.92) / dims.w, (vh * 0.86) / dims.h, 1);
      const r = stageSize({ dims, viewportW: vw, viewportH: vh, dpr });
      expect(r.w).toBeCloseTo(dims.w * scale, 9);
      expect(r.h).toBeCloseTo(dims.h * scale, 9);
      expect(r.pixelRatio).toBe(dpr);
      expect(r.w).toBeLessThanOrEqual(dims.w + 1e-9);
    }
  });
});

describe('stageSize in exhibition mode (the picture fills the window)', () => {
  it('keeps the aspect ratio, never leaves the window, and touches it on one side', () => {
    for (const dims of Object.values(ORIENTATIONS)) for (const [vw, vh] of VIEWPORTS) {
      const r = stageSize({ dims, viewportW: vw, viewportH: vh, exhibition: true });
      expect(r.w).toBeLessThanOrEqual(vw); expect(r.h).toBeLessThanOrEqual(vh);
      expect(Number.isInteger(r.w) && Number.isInteger(r.h)).toBe(true);        // whole CSS pixels
      expect(r.w / r.h).toBeCloseTo(dims.w / dims.h, 1);                        // within a pixel of the aspect
      expect(Math.max(vw - r.w, vh - r.h) <= 1 || Math.min(vw - r.w, vh - r.h) <= 1).toBe(true);  // fills one side
    }
  });

  it('upscales beyond the base size (the normal mode never does)', () => {
    const r = stageSize({ dims: ORIENTATIONS.landscape, viewportW: 1920, viewportH: 1080, exhibition: true });
    expect(r.w).toBeGreaterThan(ORIENTATIONS.landscape.w * 1.5);
    expect(stageSize({ dims: ORIENTATIONS.landscape, viewportW: 1920, viewportH: 1080 }).w).toBeLessThanOrEqual(ORIENTATIONS.landscape.w);
  });

  it('holds the drawing buffer to its budget: a 4K screen at pixel ratio 3 is not 100 megapixels', () => {
    for (const [vw, vh, dpr] of [[3840, 2160, 1], [3840, 2160, 2], [3840, 2160, 3], [1920, 1080, 2], [1920, 1080, 1], [7680, 4320, 2]]) {
      const r = stageSize({ dims: ORIENTATIONS.landscape, viewportW: vw, viewportH: vh, dpr, exhibition: true });
      expect(r.w * r.h * r.pixelRatio * r.pixelRatio, `${vw}x${vh} @${dpr}`).toBeLessThanOrEqual(EXHIBITION_MAX_PIXELS * 1.0001);
      expect(r.pixelRatio).toBeLessThanOrEqual(dpr);
    }
    // within the budget it is the device's own ratio
    expect(stageSize({ dims: ORIENTATIONS.landscape, viewportW: 1920, viewportH: 1080, dpr: 1, exhibition: true }).pixelRatio).toBe(1);
  });

  it('never asks for a buffer side the GPU cannot give, and survives a nonsense pixel ratio', () => {
    const r = stageSize({ dims: ORIENTATIONS.square, viewportW: 3000, viewportH: 3000, dpr: 2, exhibition: true, maxSide: 4096 });
    expect(Math.max(r.w, r.h) * r.pixelRatio).toBeLessThanOrEqual(4096 + 1e-6);
    for (const bad of [0, -2, NaN, undefined]) expect(stageSize({ dims: ORIENTATIONS.landscape, viewportW: 1000, viewportH: 800, dpr: bad, exhibition: true }).pixelRatio).toBeGreaterThan(0);
  });
});

describe('the start flags', () => {
  it('?exhibition starts the mode, &auto adds Exhibition timing; 0 and false are off', () => {
    expect(parseExhibitionParams('')).toEqual({ active: false, auto: false, playlist: false });
    expect(parseExhibitionParams('?exhibition')).toEqual({ active: true, auto: false, playlist: false });
    expect(parseExhibitionParams('?exhibition=1&auto')).toEqual({ active: true, auto: true, playlist: false });
    expect(parseExhibitionParams('?exhibition=0&auto')).toEqual({ active: false, auto: false, playlist: false });   // auto means nothing without it
    expect(parseExhibitionParams('?auto')).toEqual({ active: false, auto: false, playlist: false });
    expect(parseExhibitionParams('?exhibition&auto=false')).toEqual({ active: true, auto: false, playlist: false });
    expect(parseExhibitionParams(undefined)).toEqual({ active: false, auto: false, playlist: false });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
function fakeEnv({ wakeLock = true, fullscreen = true } = {}) {
  const listeners = {};
  const classes = new Set();
  const doc = {
    body: { classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) } },
    documentElement: {},
    fullscreenElement: null,
    visibilityState: 'visible',
    exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; fire('fullscreenchange'); }),
    addEventListener: (t, fn) => { (listeners[t] ||= new Set()).add(fn); },
    removeEventListener: (t, fn) => { listeners[t]?.delete(fn); }
  };
  if (fullscreen) doc.documentElement.requestFullscreen = vi.fn(async () => { doc.fullscreenElement = doc.documentElement; fire('fullscreenchange'); });
  const lock = { released: false, release: vi.fn(async () => { lock.released = true; }), addEventListener: vi.fn() };
  const win = {
    navigator: wakeLock ? { wakeLock: { request: vi.fn(async () => lock) } } : {},
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id)
  };
  function fire(type) { [...(listeners[type] || [])].forEach((fn) => fn({ type })); }
  return { doc, win, fire, classes, lock, listeners };
}

describe('exhibition mode (the controller)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('enter hides the interface (a class), asks for fullscreen and the wake lock, and tells the stage to refit; exit undoes it all', async () => {
    const env = fakeEnv(); const changes = [];
    const m = createExhibitionMode({ doc: env.doc, win: env.win, onChange: (a) => changes.push(a) });
    expect(m.isActive()).toBe(false);
    m.enter();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.isActive()).toBe(true);
    expect(isExhibitionActive(env.doc)).toBe(true);
    expect(env.doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(env.win.navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(changes).toEqual([true]);
    m.exit();
    await vi.advanceTimersByTimeAsync(0);
    expect(isExhibitionActive(env.doc)).toBe(false);
    expect(env.lock.release).toHaveBeenCalled();
    expect(env.doc.exitFullscreen).toHaveBeenCalled();
    expect(changes).toEqual([true, false]);
  });

  it('is idempotent: entering twice or leaving twice changes nothing more', () => {
    const env = fakeEnv(); const changes = [];
    const m = createExhibitionMode({ doc: env.doc, win: env.win, onChange: (a) => changes.push(a) });
    m.enter(); m.enter(); m.exit(); m.exit();
    expect(changes).toEqual([true, false]);
  });

  it('toggle switches; a start flag enters without asking for fullscreen (no gesture)', async () => {
    const env = fakeEnv();
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    m.toggle(); expect(m.isActive()).toBe(true);
    m.toggle(); expect(m.isActive()).toBe(false);
    m.enter({ fullscreen: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.isActive()).toBe(true);
    expect(env.doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);   // only the first toggle's
  });

  it('the cursor goes after 2 s idle and comes back on movement or a touch, then goes again', () => {
    const env = fakeEnv();
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    m.enter({ fullscreen: false });
    expect(env.classes.has('exhibition-idle')).toBe(false);
    vi.advanceTimersByTime(1999); expect(env.classes.has('exhibition-idle')).toBe(false);
    vi.advanceTimersByTime(2); expect(env.classes.has('exhibition-idle')).toBe(true);
    env.fire('mousemove'); expect(env.classes.has('exhibition-idle')).toBe(false);
    vi.advanceTimersByTime(2001); expect(env.classes.has('exhibition-idle')).toBe(true);
    env.fire('pointerdown'); expect(env.classes.has('exhibition-idle')).toBe(false);
    vi.advanceTimersByTime(2001); expect(env.classes.has('exhibition-idle')).toBe(true);
    m.exit();                                                         // leaving while the cursor is hidden must give it back
    expect(env.classes.has('exhibition-idle')).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(env.classes.has('exhibition-idle')).toBe(false);          // no stray timer after leaving
    expect(env.classes.has('exhibition')).toBe(false);
  });

  it('Esc out of real fullscreen (the browser exits it) brings the interface back; a mode entered without fullscreen is not tied to it', async () => {
    const env = fakeEnv();
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    m.enter(); await vi.advanceTimersByTimeAsync(0);
    expect(env.doc.fullscreenElement).not.toBeNull();
    env.doc.fullscreenElement = null; env.fire('fullscreenchange');     // the user pressed Esc
    expect(m.isActive()).toBe(false);
    const k = createExhibitionMode({ doc: env.doc, win: env.win });
    k.enter({ fullscreen: false });
    env.fire('fullscreenchange');
    expect(k.isActive()).toBe(true);
  });

  it('asks for the wake lock again when the page comes back to the front, and not after leaving', async () => {
    const env = fakeEnv();
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    m.enter({ fullscreen: false }); await vi.advanceTimersByTimeAsync(0);
    expect(env.win.navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    // the browser released it (a hidden tab): the sentinel says so
    const release = env.lock.addEventListener.mock.calls.find((c) => c[0] === 'release')[1];
    release();
    env.fire('visibilitychange'); await vi.advanceTimersByTimeAsync(0);
    expect(env.win.navigator.wakeLock.request).toHaveBeenCalledTimes(2);
    m.exit(); env.fire('visibilitychange'); await vi.advanceTimersByTimeAsync(0);
    expect(env.win.navigator.wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it('works where there is no fullscreen API and no wake lock (and when they refuse): the interface is still hidden', async () => {
    const env = fakeEnv({ wakeLock: false, fullscreen: false });
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    expect(() => m.enter()).not.toThrow();
    expect(isExhibitionActive(env.doc)).toBe(true);
    m.exit();
    const refusing = fakeEnv();
    refusing.doc.documentElement.requestFullscreen = vi.fn(async () => { throw new Error('denied'); });
    refusing.win.navigator.wakeLock.request = vi.fn(async () => { throw new Error('denied'); });
    const r = createExhibitionMode({ doc: refusing.doc, win: refusing.win });
    r.enter(); await vi.advanceTimersByTimeAsync(0);
    expect(r.isActive()).toBe(true);
    r.exit(); expect(r.isActive()).toBe(false);
  });

  it('a lock that arrives after the mode was left is released at once', async () => {
    const env = fakeEnv();
    let resolve; env.win.navigator.wakeLock.request = vi.fn(() => new Promise((r) => { resolve = r; }));
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    m.enter({ fullscreen: false }); m.exit();
    resolve(env.lock); await vi.advanceTimersByTimeAsync(0);
    expect(env.lock.release).toHaveBeenCalled();
  });

  it('dispose leaves the mode and removes its listeners', () => {
    const env = fakeEnv();
    const m = createExhibitionMode({ doc: env.doc, win: env.win });
    m.enter({ fullscreen: false });
    m.dispose();
    expect(isExhibitionActive(env.doc)).toBe(false);
    for (const set of Object.values(env.listeners)) expect(set.size).toBe(0);
  });
});
