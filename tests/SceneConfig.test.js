import { describe, it, expect, vi } from 'vitest';
import { createSceneConfig, CONFIG_VERSION, normalizeSeed } from '../src/config/SceneConfig.js';
import { SHAPE_LIMITS, SHAPE_DEFAULTS, TIME } from '../src/config/defaults.js';

const ctx = (extra = {}) => ({
  shapeTypes: ['cube', 'sphere'],
  paletteNames: ['warm', 'cool'],
  orientationNames: ['landscape', 'portrait'],
  defaultPalette: 'warm',
  defaultOrientation: 'landscape',
  randomSeed: () => 4242,
  ...extra
});
const make = (extra) => createSceneConfig(ctx(extra));

describe('defaults', () => {
  it('starts from the documented defaults', () => {
    const c = make().get();
    expect(c).toMatchObject({
      version: CONFIG_VERSION, seed: 4242, palette: 'warm', orientation: 'landscape',
      time: { durationMs: TIME.durationMs.default, intervalMs: TIME.intervalMs.default, autoAdvance: false }
    });
    expect(c.shapes.cube).toEqual(SHAPE_DEFAULTS);
    expect(Object.keys(c.shapes)).toEqual(['cube', 'sphere']);
  });
  it('is deeply frozen', () => {
    const c = make().get();
    expect(() => { c.seed = 1; }).toThrow();
    expect(() => { c.shapes.cube.count = 5; }).toThrow();
    expect(() => { c.time.durationMs = 5; }).toThrow();
  });
});

describe('update: validation and clamping', () => {
  it('clamps and rounds count', () => {
    const s = make();
    s.update({ shapes: { cube: { count: 999 } } });
    expect(s.get().shapes.cube.count).toBe(SHAPE_LIMITS.count.max);
    s.update({ shapes: { cube: { count: -3 } } });
    expect(s.get().shapes.cube.count).toBe(SHAPE_LIMITS.count.min);
    s.update({ shapes: { cube: { count: 2.6 } } });
    expect(s.get().shapes.cube.count).toBe(3);
  });
  it('clamps spread', () => {
    const s = make();
    s.update({ shapes: { cube: { spread: 50 } } });
    expect(s.get().shapes.cube.spread).toBe(SHAPE_LIMITS.spread.max);
    s.update({ shapes: { cube: { spread: -1 } } });
    expect(s.get().shapes.cube.spread).toBe(SHAPE_LIMITS.spread.min);
  });
  it('never leaves the size range inverted or out of limits', () => {
    const s = make();
    s.update({ shapes: { cube: { sizeMin: 3, sizeMax: 1 } } });
    expect(s.get().shapes.cube).toMatchObject({ sizeMin: 1, sizeMax: 3 });
    s.update({ shapes: { cube: { sizeMin: 0, sizeMax: 1000 } } });
    expect(s.get().shapes.cube).toMatchObject({ sizeMin: SHAPE_LIMITS.size.min, sizeMax: SHAPE_LIMITS.size.max });
  });
  it('a one-sided size patch combines with the other current bound', () => {
    const s = make();
    s.update({ shapes: { cube: { sizeMin: 0.5, sizeMax: 2 } } });
    s.update({ shapes: { cube: { sizeMin: 5 } } }); // above the current max -> ordered
    expect(s.get().shapes.cube).toMatchObject({ sizeMin: 2, sizeMax: 5 });
  });
  it('clamps time values (typed junk can never break transitions or the timer)', () => {
    const s = make();
    s.update({ time: { durationMs: -5, intervalMs: -100 } });
    expect(s.get().time.durationMs).toBe(TIME.durationMs.min);
    expect(s.get().time.intervalMs).toBe(TIME.intervalMs.min);
    s.update({ time: { durationMs: 1e9, intervalMs: 1e9 } });
    expect(s.get().time.durationMs).toBe(TIME.durationMs.max);
    expect(s.get().time.intervalMs).toBe(TIME.intervalMs.max);
  });
  it('ignores non-numeric / wrongly-typed fields', () => {
    const s = make();
    const before = s.get();
    expect(s.update({ shapes: { cube: { count: 'x', spread: NaN, visible: 'yes' } }, time: { durationMs: NaN, autoAdvance: 1 } })).toBe(false);
    expect(s.get()).toBe(before);
  });
  it('ignores unknown shape types, palettes and orientations', () => {
    const s = make();
    const before = s.get();
    expect(s.update({ shapes: { nope: { count: 3 } }, palette: 'nope', orientation: 'nope' })).toBe(false);
    expect(s.get()).toBe(before);
  });
  it('normalizes the seed to a uint32 and ignores junk', () => {
    const s = make();
    s.update({ seed: -1 });
    expect(s.get().seed).toBe(4294967295);
    s.update({ seed: 7.9 });
    expect(s.get().seed).toBe(7);
    s.update({ seed: NaN });
    expect(s.get().seed).toBe(7);
    expect(normalizeSeed('5')).toBeNull();
  });
});

describe('subscribe', () => {
  it('notifies once per update with (next, prev, meta), however many fields change', () => {
    const s = make();
    const fn = vi.fn();
    s.subscribe(fn);
    const prev = s.get();
    s.update({ palette: 'cool', seed: 9, shapes: { cube: { count: 3 }, sphere: { count: 2 } } });
    expect(fn).toHaveBeenCalledTimes(1);
    const [next, p, meta] = fn.mock.calls[0];
    expect(p).toBe(prev);
    expect(next).toBe(s.get());
    expect(next).toMatchObject({ palette: 'cool', seed: 9 });
    expect(meta).toEqual({ replaced: false });
  });
  it('does not notify when nothing changed', () => {
    const s = make();
    const fn = vi.fn();
    s.subscribe(fn);
    expect(s.update({ palette: 'warm' })).toBe(false);
    expect(s.update({})).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
  it('can unsubscribe', () => {
    const s = make();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.update({ seed: 5 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('replace (presets) and migration', () => {
  it('marks the notification as a replace', () => {
    const s = make();
    const fn = vi.fn();
    s.subscribe(fn);
    s.replace({ seed: 77 });
    expect(fn.mock.calls[0][2]).toEqual({ replaced: true });
  });

  it('migrates a legacy v1 preset (no seed): settings load, a fresh seed is assigned', () => {
    const s = make({ randomSeed: () => 999 });
    s.replace({
      version: 1, palette: 'cool', orientation: 'portrait',
      time: { durationMs: 2000, intervalMs: 5000, autoAdvance: true },
      shapes: { cube: { visible: false, count: 4, sizeMin: 0.5, sizeMax: 2, spread: 1.5 } }
    });
    const c = s.get();
    expect(c).toMatchObject({ version: CONFIG_VERSION, seed: 999, palette: 'cool', orientation: 'portrait' });
    expect(c.time).toEqual({ durationMs: 2000, intervalMs: 5000, autoAdvance: true });
    expect(c.shapes.cube).toEqual({ visible: false, count: 4, sizeMin: 0.5, sizeMax: 2, spread: 1.5, snapRotation: false, locked: null });
  });

  it('keeps the seed of a v2 preset (exact composition restore)', () => {
    const s = make();
    s.replace({ version: 2, seed: 31337 });
    expect(s.get().seed).toBe(31337);
  });

  it('keeps current values for missing/invalid fields, and leaves absent shapes alone', () => {
    const s = make();
    s.update({ palette: 'cool', shapes: { sphere: { count: 5 } } });
    s.replace({ palette: 'bogus', orientation: 7, shapes: { cube: { count: 2 } } });
    const c = s.get();
    expect(c.palette).toBe('cool');
    expect(c.orientation).toBe('landscape');
    expect(c.shapes.cube.count).toBe(2);
    expect(c.shapes.sphere.count).toBe(5); // preset predates / omits this shape
  });

  it('drops unknown shape types', () => {
    const s = make();
    s.replace({ shapes: { hexagon: { count: 3 } } });
    expect(Object.keys(s.get().shapes)).toEqual(['cube', 'sphere']);
  });

  it('treats a missing `visible` as visible and missing autoAdvance as off', () => {
    const s = make();
    s.update({ shapes: { cube: { visible: false } }, time: { autoAdvance: true } });
    s.replace({ shapes: { cube: { count: 2 } }, time: { durationMs: 1500 } });
    expect(s.get().shapes.cube.visible).toBe(true);
    expect(s.get().time.autoAdvance).toBe(false);
    expect(s.get().time.durationMs).toBe(1500);
  });

  it('clamps out-of-range values from a hand-edited preset', () => {
    const s = make();
    s.replace({ time: { durationMs: -50, intervalMs: 0 }, shapes: { cube: { count: 1e6, spread: -4 } } });
    expect(s.get().time.durationMs).toBe(TIME.durationMs.min);
    expect(s.get().time.intervalMs).toBe(TIME.intervalMs.min);
    expect(s.get().shapes.cube).toMatchObject({ count: SHAPE_LIMITS.count.max, spread: SHAPE_LIMITS.spread.min });
  });

  it('survives garbage without throwing', () => {
    for (const junk of [null, undefined, 'x', 5, [], { shapes: 5, time: 'x' }]) {
      const s = make();
      expect(() => s.replace(junk)).not.toThrow();
      expect(s.get().version).toBe(CONFIG_VERSION);
      expect(Object.keys(s.get().shapes)).toEqual(['cube', 'sphere']);
    }
  });

  it('round-trips through toJSON() exactly', () => {
    const a = make();
    a.update({ seed: 123, palette: 'cool', orientation: 'portrait', time: { autoAdvance: true }, shapes: { cube: { count: 3, sizeMin: 0.7, sizeMax: 1.9, spread: 0.4, visible: false } } });
    const b = make();
    expect(b.replace(a.toJSON())).toBe(true);
    expect(b.get()).toEqual(a.get());
  });

  it('always notifies, even when the result equals the current config', () => {
    const s = make();
    const fn = vi.fn();
    s.subscribe(fn);
    s.replace(s.toJSON());
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][2]).toEqual({ replaced: true });
  });

  it('toJSON returns a mutable copy that cannot affect the store', () => {
    const s = make();
    const j = s.toJSON();
    j.shapes.cube.count = 11;
    expect(s.get().shapes.cube.count).toBe(SHAPE_DEFAULTS.count);
  });
});
