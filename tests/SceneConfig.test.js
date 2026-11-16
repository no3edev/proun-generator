import { describe, it, expect, vi } from 'vitest';
import { createSceneConfig, migrateConfig, normalizeLocked, CONFIG_VERSION } from '../src/config/SceneConfig.js';
import { TIME, SHAPE_LIMITS } from '../src/config/defaults.js';

const ctx = () => ({
  shapeTypes: ['cube', 'rod'],
  paletteNames: ['A', 'B'],
  orientationNames: ['landscape', 'square'],
  defaultPalette: 'A',
  defaultOrientation: 'landscape',
  randomSeed: () => 1234,
  shapeDefaults: { rod: { count: 0 } }
});
const entry = (x = 0) => ({ position: [x, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], hex: '#AABBCC' });

describe('SceneConfig defaults and update()', () => {
  it('starts valid, versioned and deeply frozen; a shape\'s own default (rod: 0) applies', () => {
    const c = createSceneConfig(ctx());
    const s = c.get();
    expect(s.version).toBe(CONFIG_VERSION);
    expect(s.seed).toBe(1234);
    expect(s.shapes.cube.count).toBe(1);
    expect(s.shapes.rod.count).toBe(0);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.shapes.cube)).toBe(true);
    expect(Object.isFrozen(s.time)).toBe(true);
  });

  it('clamps counts, spread and size, rounds counts, and keeps sizeMin <= sizeMax', () => {
    const c = createSceneConfig(ctx());
    c.update({ shapes: { cube: { count: 99.4, spread: 9, sizeMin: 5, sizeMax: 1 } } });
    const cube = c.get().shapes.cube;
    expect(cube.count).toBe(SHAPE_LIMITS.count.max);
    expect(cube.spread).toBe(SHAPE_LIMITS.spread.max);
    expect(cube.sizeMin).toBe(1);
    expect(cube.sizeMax).toBe(5);
  });

  it('clamps timing to the documented ranges (a 5 minute transition and a 60 minute hold at most; a hold may be 0)', () => {
    const c = createSceneConfig(ctx());
    c.update({ time: { durationMs: 10 ** 9, holdMs: 10 ** 9 } });
    expect(c.get().time.durationMs).toBe(TIME.durationMs.max);
    expect(c.get().time.holdMs).toBe(TIME.holdMs.max);
    expect([TIME.durationMs.max, TIME.holdMs.max]).toEqual([300_000, 3_600_000]);
    c.update({ time: { durationMs: 1, holdMs: -5 } });
    expect(c.get().time.durationMs).toBe(TIME.durationMs.min);
    expect(c.get().time.holdMs).toBe(0);
  });

  describe('time migration (config v3 -> v4: the interval became a hold)', () => {
    const load = (time, version = 3) => {
      const c = createSceneConfig(ctx());
      c.replace({ version, seed: 7, palette: 'A', orientation: 'landscape', time, shapes: {} });
      return c.get().time;
    };

    it('keeps the cadence: hold = interval - duration', () => {
      expect(load({ durationMs: 1100, intervalMs: 4000, autoAdvance: true })).toMatchObject({ durationMs: 1100, holdMs: 2900, autoAdvance: true });
      expect(load({ durationMs: 500, intervalMs: 20000 })).toMatchObject({ durationMs: 500, holdMs: 19500 });
    });

    it('an interval shorter than the transition (it meant "change again mid-way") becomes a hold of 0', () => {
      expect(load({ durationMs: 6000, intervalMs: 4000 }).holdMs).toBe(0);
      expect(load({ durationMs: 1100, intervalMs: 500 }).holdMs).toBe(0);
    });

    it('a missing duration reads as the default, a missing interval leaves the default hold, junk is ignored', () => {
      expect(load({ intervalMs: 4000 })).toMatchObject({ durationMs: TIME.durationMs.default, holdMs: 4000 - TIME.durationMs.default });
      expect(load({ durationMs: 2000 }).holdMs).toBe(TIME.holdMs.default);
      expect(load({ durationMs: 'x', intervalMs: null }).holdMs).toBe(TIME.holdMs.default);
      expect(load(undefined).holdMs).toBe(TIME.holdMs.default);
    });

    it('a config with no version (the oldest format) and one already at v4 both load', () => {
      expect(load({ durationMs: 1100, intervalMs: 4000 }, undefined).holdMs).toBe(2900);
      expect(load({ durationMs: 60_000, holdMs: 900_000 }, 4)).toMatchObject({ durationMs: 60_000, holdMs: 900_000 });
    });

    it('a v4 config is not converted again, and its toJSON carries holdMs and no intervalMs', () => {
      const c = createSceneConfig(ctx());
      c.update({ time: { durationMs: 60_000, holdMs: 900_000 } });
      const j = c.toJSON();
      expect(j.version).toBe(CONFIG_VERSION);
      expect(j.time).toEqual({ durationMs: 60_000, holdMs: 900_000, autoAdvance: false, playlist: false });
      const d = createSceneConfig(ctx());
      d.replace(JSON.parse(JSON.stringify(j)));
      expect(d.get().time).toEqual(c.get().time);
    });

    it('the defaults keep the old 4 s cadence', () => {
      const t = createSceneConfig(ctx()).get().time;
      expect(t.durationMs + t.holdMs).toBe(4000);
    });
  });

  it('ignores unknown palettes, orientations and shape types', () => {
    const c = createSceneConfig(ctx());
    expect(c.update({ palette: 'nope', orientation: 'nope', shapes: { ghost: { count: 3 } } })).toBe(false);
    expect(c.get().palette).toBe('A');
    expect(c.get().shapes.ghost).toBeUndefined();
  });

  it('notifies once per update however many fields change, and not at all when nothing changed', () => {
    const c = createSceneConfig(ctx());
    const fn = vi.fn();
    c.subscribe(fn);
    expect(c.update({ palette: 'B', seed: 5, shapes: { cube: { count: 2 } } })).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][2]).toEqual({ replaced: false });
    expect(c.update({ palette: 'B' })).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('seeds are uint32', () => {
    const c = createSceneConfig(ctx());
    c.update({ seed: -1 });
    expect(c.get().seed).toBe(4294967295);
  });
});

describe('SceneConfig.replace() (presets, links, restored sessions)', () => {
  it('always notifies, flagged as replaced, even when nothing differs', () => {
    const c = createSceneConfig(ctx());
    const fn = vi.fn();
    c.subscribe(fn);
    c.replace(c.toJSON());
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][2]).toEqual({ replaced: true });
  });

  it('turns garbage into a valid config and never throws', () => {
    const c = createSceneConfig(ctx());
    for (const junk of [null, undefined, 7, 'x', [], {}, { shapes: 5, time: 'x', palette: 3 }]) {
      expect(() => c.replace(junk)).not.toThrow();
      expect(['A', 'B']).toContain(c.get().palette);
      expect(c.get().version).toBe(CONFIG_VERSION);
    }
  });

  it('a v1 preset (no seed) loads with a fresh seed; unknown shapes are dropped', () => {
    const c = createSceneConfig(ctx());
    c.replace({ version: 1, palette: 'B', shapes: { cube: { count: 2 }, ghost: { count: 1 } } });
    const s = c.get();
    expect(s.seed).toBe(1234); // randomSeed()
    expect(s.palette).toBe('B');
    expect(s.shapes.cube.count).toBe(2);
    expect(s.shapes.ghost).toBeUndefined();
  });

  it('a shape type the record never mentioned takes its own default, not the current settings (an old preset has no beam)', () => {
    const c = createSceneConfig(ctx());
    c.update({ shapes: { rod: { count: 3 }, cube: { count: 4 } } });
    c.replace({ version: 2, seed: 5, palette: 'A', shapes: { cube: { count: 2 } } });
    expect(c.get().shapes.cube.count).toBe(2);
    expect(c.get().shapes.rod.count).toBe(0); // rod's own default (a type added after the preset)
  });

  it('options a preset does not mention are not inherited: autoAdvance off, snapRotation off, visible on, unlocked', () => {
    const c = createSceneConfig(ctx());
    c.update({ time: { autoAdvance: true }, shapes: { cube: { snapRotation: true, visible: false, locked: [entry()] } } });
    c.replace({ palette: 'A', shapes: { cube: { count: 1 } } });
    expect(c.get().time.autoAdvance).toBe(false);
    expect(c.get().shapes.cube).toMatchObject({ snapRotation: false, visible: true, locked: null });
  });

  it('round-trips through toJSON()', () => {
    const c = createSceneConfig(ctx());
    c.update({ seed: 99, palette: 'B', shapes: { cube: { count: 4, snapRotation: true, locked: [entry(1), entry(2)] } } });
    const saved = c.toJSON();
    const d = createSceneConfig(ctx());
    d.replace(saved);
    expect(d.toJSON()).toEqual(saved);
  });
});

describe('locking and migration', () => {
  it('a lock makes the stored instances the count; unlocking (null) releases them', () => {
    const c = createSceneConfig(ctx());
    c.update({ shapes: { cube: { locked: [entry(1), entry(2), entry(3)] } } });
    expect(c.get().shapes.cube.count).toBe(3);
    expect(c.get().shapes.cube.locked[0].hex).toBe('#aabbcc'); // lower-cased
    c.update({ shapes: { cube: { locked: null } } });
    expect(c.get().shapes.cube.locked).toBeNull();
  });

  it('normalizeLocked is all-or-nothing', () => {
    expect(normalizeLocked([entry(), { ...entry(), hex: 'red' }])).toBeNull();
    expect(normalizeLocked([entry(), { ...entry(), position: [1, 2] }])).toBeNull();
    expect(normalizeLocked([])).toBeNull();
    expect(normalizeLocked('x')).toBeNull();
    expect(normalizeLocked(Array.from({ length: SHAPE_LIMITS.count.max + 1 }, () => entry()))).toBeNull();
    expect(normalizeLocked([{ ...entry(), position: [999, 0, 0] }])[0].position[0]).toBe(50); // clamped
  });

  it('migrateConfig stamps the current version, leaves newer configs alone, and survives junk', () => {
    expect(migrateConfig({ version: 1, a: 1 })).toMatchObject({ version: CONFIG_VERSION, a: 1 });
    expect(migrateConfig({ version: CONFIG_VERSION + 5, a: 1 }).version).toBe(CONFIG_VERSION + 5);
    expect(migrateConfig(null)).toEqual({});
    expect(migrateConfig([1, 2])).toEqual({});
    expect(migrateConfig({ version: 'x' }).version).toBe(CONFIG_VERSION);
  });
});

describe('composition strategy (schema v3)', () => {
  const sctx = () => ({ ...ctx(), strategyNames: ['legacy', 'axis-thrust'] });

  it('defaults to legacy, with or without strategies registered', () => {
    expect(createSceneConfig(ctx()).get().composition).toEqual({ strategy: 'legacy' });
    expect(createSceneConfig(sctx()).get().composition).toEqual({ strategy: 'legacy' });
    expect(Object.isFrozen(createSceneConfig(sctx()).get().composition)).toBe(true);
  });

  it('update() accepts a known strategy and ignores an unknown one', () => {
    const c = createSceneConfig(sctx());
    expect(c.update({ composition: { strategy: 'axis-thrust' } })).toBe(true);
    expect(c.get().composition.strategy).toBe('axis-thrust');
    expect(c.update({ composition: { strategy: 'nope' } })).toBe(false);
    expect(c.update({ composition: { strategy: 7 } })).toBe(false);
    expect(c.get().composition.strategy).toBe('axis-thrust');
    // without strategies registered, only legacy exists
    const d = createSceneConfig(ctx());
    expect(d.update({ composition: { strategy: 'axis-thrust' } })).toBe(false);
  });

  it('a config that does not mention a strategy loads as legacy, never inheriting the current one', () => {
    const c = createSceneConfig(sctx());
    c.update({ composition: { strategy: 'axis-thrust' } });
    c.replace({ version: 2, seed: 9, palette: 'A', shapes: { cube: { count: 2 } } }); // a v2 preset
    expect(c.get().composition.strategy).toBe('legacy');
  });

  it('a stored strategy that no longer exists falls back to legacy', () => {
    const c = createSceneConfig(sctx());
    c.replace({ version: 3, composition: { strategy: 'retired' } });
    expect(c.get().composition.strategy).toBe('legacy');
  });

  it('round-trips through toJSON(), and changing it notifies once', () => {
    const c = createSceneConfig(sctx());
    const fn = vi.fn();
    c.subscribe(fn);
    c.update({ composition: { strategy: 'axis-thrust' } });
    expect(fn).toHaveBeenCalledTimes(1);
    const saved = c.toJSON();
    expect(saved.composition).toEqual({ strategy: 'axis-thrust' });
    const d = createSceneConfig(sctx());
    d.replace(saved);
    expect(d.get().composition.strategy).toBe('axis-thrust');
  });
});
