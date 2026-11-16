import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWatchdog, parseReloadHours, WATCHDOG, RELOAD_KEY } from '../src/core/watchdog.js';

// Stage 7.3: unattended recovery. A storm of uncaught errors, or the optional scheduled refresh, reloads the page (session saved
// first), only in exhibition mode, never inside a transition for the scheduled one, and never twice within 5 minutes.

const MIN = 60_000;

function env({ enabled = true, idle = true, stored = null, scheduledHours = null, storage } = {}) {
  let t = 1_000_000_000;
  const mem = new Map(stored ? [[RELOAD_KEY, JSON.stringify(stored)]] : []);
  const st = storage === undefined ? { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) } : storage;
  const target = new EventTarget();
  const calls = { flush: 0, reload: 0, order: [] };
  const state = { enabled, idle };
  const win = {
    addEventListener: (...a) => target.addEventListener(...a), removeEventListener: (...a) => target.removeEventListener(...a),
    setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id)
  };
  const wd = createWatchdog({
    win, storage: st, now: () => t, isEnabled: () => state.enabled, isIdle: () => state.idle,
    flushSession: () => { calls.flush++; calls.order.push('flush'); }, reload: () => { calls.reload++; calls.order.push('reload'); }, scheduledHours
  });
  return {
    wd, calls, state, mem, target,
    advance(ms) { t += ms; vi.advanceTimersByTime(ms); },
    set now(v) { t = v; }, get now() { return t; },
    error(n = 1, type = 'error') { for (let i = 0; i < n; i++) target.dispatchEvent(new Event(type)); }
  };
}

describe('?reload=<hours>', () => {
  it('reads hours, and ignores anything absent, junk or out of range (0.1 hours to 30 days)', () => {
    expect(parseReloadHours('?reload=24')).toBe(24);
    expect(parseReloadHours('?exhibition&auto&reload=0.5')).toBe(0.5);
    expect(parseReloadHours('?reload=720')).toBe(720);
    for (const bad of ['', '?exhibition', '?reload', '?reload=', '?reload=0', '?reload=-3', '?reload=abc', '?reload=0.05', '?reload=721', undefined]) expect(parseReloadHours(bad), String(bad)).toBeNull();
  });
});

describe('a storm of errors (7.3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('19 errors in a minute do nothing; the 20th saves the session and then reloads, once', () => {
    const e = env();
    e.error(19);
    expect(e.calls.reload).toBe(0);
    e.error(1);
    expect(e.calls.order).toEqual(['flush', 'reload']);
    e.error(30);                                                         // the page is going away: no second reload
    expect(e.calls.reload).toBe(1);
    expect(JSON.parse(e.mem.get(RELOAD_KEY))).toMatchObject({ reason: 'errors', count: 1 });
  });

  it('counts unhandled promise rejections too, and only errors that are close together', () => {
    const e = env();
    e.error(10); e.error(9, 'unhandledrejection');
    expect(e.calls.reload).toBe(0);
    e.advance(61_000);                                                   // the earlier ones are too old to count now
    e.error(19);
    expect(e.calls.reload).toBe(0);
    e.error(1, 'unhandledrejection');
    expect(e.calls.reload).toBe(1);
  });

  it('errors spread over minutes never add up', () => {
    const e = env();
    for (let i = 0; i < 200; i++) { e.error(1); e.advance(10_000); }    // 6 a minute for over half an hour
    expect(e.calls.reload).toBe(0);
    expect(e.wd.stats().recentErrors).toBeLessThan(20);
  });

  it('does not act outside exhibition mode (someone is editing), and acts as soon as the mode is on', () => {
    const e = env({ enabled: false });
    e.error(100);
    expect(e.calls.reload).toBe(0);
    e.state.enabled = true;
    e.error(1);                                                          // the storm is still in progress
    expect(e.calls.reload).toBe(1);
  });

  it('never reloads twice within 5 minutes, even across page loads (the time is kept in storage), and may again after', () => {
    const e = env();
    e.error(20);
    expect(e.calls.reload).toBe(1);
    // the page came back (a new watchdog, same storage) and the fault is still there
    const again = env({ stored: JSON.parse(e.mem.get(RELOAD_KEY)) });
    again.now = e.now + 60_000;                                          // one minute later
    again.error(50);
    expect(again.calls.reload).toBe(0);
    expect(again.wd.stats().suppressed).toBeGreaterThan(0);          // it tried, and was held back
    again.now = e.now + WATCHDOG.minReloadGapMs + 1_000;
    again.error(50);
    expect(again.calls.reload).toBe(1);
    expect(JSON.parse(again.mem.get(RELOAD_KEY)).count).toBe(2);
  });

  it('does not reload at all when storage cannot be used (it could not promise there is no loop)', () => {
    for (const storage of [null, { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, { getItem: () => null, setItem() { throw new Error('full'); } }]) {
      const e = env({ storage });
      e.error(40);
      expect(e.calls.reload).toBe(0);
    }
  });

  it('still reloads when saving the session fails', () => {
    const e = env();
    e.wd.dispose();
    let reloads = 0;
    const target = new EventTarget(); const mem = new Map();
    const wd = createWatchdog({
      win: { addEventListener: (...a) => target.addEventListener(...a), removeEventListener: () => {}, setInterval: () => 0, clearInterval: () => {} },
      storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }, now: () => 5e9, isEnabled: () => true, isIdle: () => true,
      flushSession: () => { throw new Error('quota'); }, reload: () => { reloads++; }
    });
    for (let i = 0; i < 20; i++) target.dispatchEvent(new Event('error'));
    expect(reloads).toBe(1);
    wd.dispose();
  });
});

describe('the scheduled refresh (7.3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for its hours, then for a moment nothing is moving, then saves and reloads once', () => {
    const e = env({ scheduledHours: 1 });
    e.state.idle = false;                                                // a transition is running
    e.advance(59 * MIN);
    expect(e.calls.reload).toBe(0);
    e.advance(2 * MIN);                                                  // due, but busy
    expect(e.calls.reload).toBe(0);
    e.advance(10 * MIN);
    expect(e.calls.reload).toBe(0);
    e.state.idle = true;                                                 // the transition ended
    e.advance(WATCHDOG.checkEveryMs);
    expect(e.calls.order).toEqual(['flush', 'reload']);
    expect(JSON.parse(e.mem.get(RELOAD_KEY)).reason).toBe('scheduled');
    e.advance(10 * MIN);
    expect(e.calls.reload).toBe(1);
  });

  it('is not started by a page that is not in exhibition mode, nor without the parameter', () => {
    const a = env({ scheduledHours: 1, enabled: false });
    a.advance(5 * 60 * MIN);
    expect(a.calls.reload).toBe(0);
    const b = env({ scheduledHours: null });
    b.advance(5 * 60 * MIN);
    expect(b.calls.reload).toBe(0);
  });

  it('respects the 5-minute gap and counts its hours from when the page started', () => {
    const e = env({ scheduledHours: 0.1, stored: { at: 1_000_000_000 - 2 * MIN, count: 4 } });
    e.advance(WATCHDOG.checkEveryMs * 14);                               // 7 minutes: due, but the last reload was 9 minutes ago
    expect(e.calls.reload).toBe(1);                                      // 9 > 5: allowed
    const f = env({ scheduledHours: 0.1, stored: { at: 1_000_000_000 + 5 * MIN, count: 1 } });
    f.advance(WATCHDOG.checkEveryMs * 14);                               // 7 minutes in, the last reload "was" 2 minutes ago
    expect(f.calls.reload).toBe(0);
  });

  it('dispose stops everything', () => {
    const e = env({ scheduledHours: 0.1 });
    e.wd.dispose();
    e.error(50);
    e.advance(10 * 60 * MIN);
    expect(e.calls.reload).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
