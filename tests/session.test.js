import { describe, it, expect, vi } from 'vitest';
import { loadSession, saveSession, startSessionAutosave, SESSION_KEY } from '../src/config/session.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
};

describe('loadSession', () => {
  it('returns the stored object', () => {
    const s = memStorage({ [SESSION_KEY]: JSON.stringify({ seed: 5, palette: 'x' }) });
    expect(loadSession(s)).toEqual({ seed: 5, palette: 'x' });
  });
  it('returns null when nothing is stored', () => {
    expect(loadSession(memStorage())).toBeNull();
  });
  it('returns null for unparseable or wrong-shaped values', () => {
    for (const bad of ['{nope', 'null', '5', '"s"', '[1,2]', 'true', '']) {
      expect(loadSession(memStorage({ [SESSION_KEY]: bad }))).toBeNull();
    }
  });
  it('returns null when storage is missing or throws', () => {
    expect(loadSession(null)).toBeNull();
    expect(loadSession(undefined)).toBeNull();
    expect(loadSession({ getItem: () => { throw new Error('blocked'); }, setItem() {} })).toBeNull();
  });
});

describe('saveSession', () => {
  it('stores JSON and reports success', () => {
    const s = memStorage();
    expect(saveSession(s, { seed: 9 })).toBe(true);
    expect(JSON.parse(s._m.get(SESSION_KEY))).toEqual({ seed: 9 });
  });
  it('reports failure (quota / blocked / no storage) without throwing', () => {
    expect(saveSession({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, {})).toBe(false);
    expect(saveSession(null, {})).toBe(false);
  });
});

describe('startSessionAutosave', () => {
  function setup(delayMs = 400) {
    vi.useFakeTimers();
    let state = { v: 0 };
    const listeners = new Set();
    const config = {
      get: () => state,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
    };
    const change = (v) => { state = { v }; [...listeners].forEach((fn) => fn(state)); };
    const storage = memStorage();
    const auto = startSessionAutosave(config, { storage, delayMs });
    const saved = () => (storage._m.has(SESSION_KEY) ? JSON.parse(storage._m.get(SESSION_KEY)) : null);
    return { change, auto, saved, storage, listeners };
  }

  it('saves after changes settle, once, with the latest value (debounced)', () => {
    const { change, saved } = setup();
    change(1); change(2); change(3);
    expect(saved()).toBeNull();           // not yet
    vi.advanceTimersByTime(399);
    expect(saved()).toBeNull();
    vi.advanceTimersByTime(2);
    expect(saved()).toEqual({ v: 3 });
    vi.useRealTimers();
  });

  it('keeps debouncing while changes keep arriving', () => {
    const { change, saved } = setup();
    change(1);
    vi.advanceTimersByTime(300);
    change(2);
    vi.advanceTimersByTime(300);          // 600ms since first, only 300 since last
    expect(saved()).toBeNull();
    vi.advanceTimersByTime(150);
    expect(saved()).toEqual({ v: 2 });
    vi.useRealTimers();
  });

  it('flush() saves immediately if a save is pending, and only then', () => {
    const { change, auto, saved, storage } = setup();
    auto.flush();
    expect(storage._m.has(SESSION_KEY)).toBe(false); // nothing pending: no write
    change(7);
    auto.flush();
    expect(saved()).toEqual({ v: 7 });
    vi.advanceTimersByTime(1000);                    // the timer was cancelled; no duplicate write
    expect(saved()).toEqual({ v: 7 });
    vi.useRealTimers();
  });

  it('stop() unsubscribes and cancels a pending save', () => {
    const { change, auto, saved, listeners } = setup();
    change(1);
    auto.stop();
    vi.advanceTimersByTime(1000);
    expect(saved()).toBeNull();
    expect(listeners.size).toBe(0);
    change(2);
    vi.advanceTimersByTime(1000);
    expect(saved()).toBeNull();
    vi.useRealTimers();
  });

  it('survives a storage that always fails', () => {
    vi.useFakeTimers();
    let state = { v: 0 };
    const listeners = new Set();
    const config = { get: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
    startSessionAutosave(config, { storage: { getItem: () => null, setItem: () => { throw new Error('full'); } } });
    state = { v: 1 };
    [...listeners].forEach((fn) => fn());
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    vi.useRealTimers();
  });
});
