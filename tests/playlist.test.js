import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPlaylist } from '../src/core/Playlist.js';
import { LIBRARY } from '../src/presets/library.js';
import { TIMING_PRESETS } from '../src/config/defaults.js';

// Stage 7.4: the curated sequence. With Auto on and `time.playlist` set, each change is the next Library preset (shuffled, none twice
// before all were shown, never the same twice in a row) instead of a new random composition. A preset is a composition: it is shown at
// the DISPLAY's orientation and the viewer's timing stays.

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('Playlist: shuffled, no repeats before all were shown', () => {
  it('every round shows every item exactly once, for many shuffles', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const p = createPlaylist({ items, rng: mulberry32(seed) });
      for (let round = 0; round < 6; round++) {
        const seen = Array.from({ length: items.length }, () => p.next());
        expect([...seen].sort(), `seed ${seed} round ${round}`).toEqual([...items].sort());
      }
    }
  });

  it('never shows the same item twice in a row, across rounds too (even with a random source that always gives the same shuffle)', () => {
    for (const rng of [mulberry32(7), () => 0, () => 0.999999, () => 0.5]) {
      const p = createPlaylist({ items: [1, 2, 3, 4, 5], rng });
      let prev = null;
      for (let i = 0; i < 200; i++) { const x = p.next(); expect(x).not.toBe(prev); prev = x; }
    }
  });

  it('the order really is shuffled (not the list order every time) and differs between seeds', () => {
    const order = (seed) => { const p = createPlaylist({ items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng: mulberry32(seed) }); return Array.from({ length: 11 }, () => p.next()).join(','); };
    expect(order(1)).not.toBe('0,1,2,3,4,5,6,7,8,9,10');
    expect(new Set([1, 2, 3, 4, 5, 6].map(order)).size).toBeGreaterThan(4);
  });

  it('copes with one item (always it), none (null), and reset (a new shuffle, still no immediate repeat)', () => {
    const one = createPlaylist({ items: ['x'] });
    expect([one.next(), one.next(), one.next()]).toEqual(['x', 'x', 'x']);
    expect(createPlaylist({ items: [] }).next()).toBeNull();
    const p = createPlaylist({ items: [1, 2, 3], rng: mulberry32(3) });
    const first = p.next();
    expect(p.remaining()).toBe(2);
    p.reset();
    expect(p.remaining()).toBe(0);
    expect(p.next()).not.toBe(first);
  });
});

describe('Auto with the curated sequence (AutoAdvance)', () => {
  let advance, SceneConfig, AutoAdvance, Rhythm;
  beforeEach(async () => {
    vi.resetModules();
    advance = vi.fn();
    vi.doMock('../src/core/Composition.js', () => ({ Composition: { advance } }));
    ({ SceneConfig } = await import('../src/config/store.js'));
    ({ AutoAdvance } = await import('../src/core/AutoAdvance.js'));
    ({ Rhythm } = await import('../src/core/Rhythm.js'));
    Rhythm.reset();
    SceneConfig.update({ orientation: 'landscape', time: { durationMs: 60_000, holdMs: 900_000, autoAdvance: true, playlist: true } });
    AutoAdvance.reset();
  });
  afterEach(() => { vi.doUnmock('../src/core/Composition.js'); });

  const fire = () => { expect(AutoAdvance.update(960_000 + 1)).toBe(true); };

  it('each change is the next Library preset, as a composition, and Composition.advance is not used', () => {
    const before = SceneConfig.get().seed;
    fire();
    const c = SceneConfig.get();
    expect(advance).not.toHaveBeenCalled();
    const hit = LIBRARY.find((p) => p.config.seed === c.seed);
    expect(hit, 'the config now holds one of the Library presets').toBeTruthy();
    expect(c.seed).not.toBe(before);
    for (const [type, shape] of Object.entries(hit.config.shapes)) expect(c.shapes[type].count, type).toBe(shape.count);   // its shapes too
    expect(c.palette).toBe(hit.config.palette);
    expect(c.composition.strategy).toBe(hit.config.composition.strategy);
  });

  it('keeps the display\'s orientation and the viewer\'s timing, Auto and curated switch, whatever the preset was saved with', () => {
    for (let i = 0; i < 22; i++) {
      fire();
      const c = SceneConfig.get();
      expect(c.orientation).toBe('landscape');                          // 9 of the 11 presets were saved portrait or square
      expect(c.time).toEqual({ durationMs: TIMING_PRESETS.exhibition.durationMs, holdMs: TIMING_PRESETS.exhibition.holdMs, autoAdvance: true, playlist: true });
    }
  });

  it('shows all 11 presets once each before any is repeated, then goes round again, never the same twice in a row', () => {
    const seeds = [];
    for (let i = 0; i < 33; i++) { fire(); seeds.push(SceneConfig.get().seed); }
    for (let round = 0; round < 3; round++) expect(new Set(seeds.slice(round * 11, round * 11 + 11)).size, `round ${round}`).toBe(LIBRARY.length);
    for (let i = 1; i < seeds.length; i++) expect(seeds[i]).not.toBe(seeds[i - 1]);
  });

  it('with the curated sequence off, Auto is what it was: a new random composition, the config untouched by any preset', () => {
    SceneConfig.update({ time: { playlist: false } });
    const seed = SceneConfig.get().seed;
    fire();
    expect(advance).toHaveBeenCalledTimes(1);
    expect(SceneConfig.get().seed).toBe(seed);
  });

  it('restarts the cycle after it, like any change', () => {
    fire();
    expect(AutoAdvance.update(1000)).toBe(false);
    expect(AutoAdvance.elapsed()).toBeCloseTo(1000, 6);
  });
});

describe('the curated switch in the config', () => {
  let SceneConfig, createSceneConfig, appConfigContext, applyPreset;
  beforeEach(async () => {
    vi.resetModules();
    ({ SceneConfig, appConfigContext } = await import('../src/config/store.js'));
    ({ createSceneConfig } = await import('../src/config/SceneConfig.js'));
    ({ applyPreset } = await import('../src/presets/applyPreset.js'));
  });

  it('is off by default, takes a boolean and nothing else, and round-trips', () => {
    const c = createSceneConfig(appConfigContext);
    expect(c.get().time.playlist).toBe(false);
    c.update({ time: { playlist: true } });
    expect(c.get().time.playlist).toBe(true);
    for (const junk of ['yes', 1, null, undefined, {}]) { c.update({ time: { playlist: junk } }); expect(c.get().time.playlist).toBe(true); }
    c.update({ time: { playlist: false } });
    expect(c.get().time.playlist).toBe(false);
    c.update({ time: { playlist: true } });
    const d = createSceneConfig(appConfigContext);
    d.replace(JSON.parse(JSON.stringify(c.toJSON())));
    expect(d.get().time.playlist).toBe(true);
  });

  it('a config saved before it existed loads with it off, and a preset never switches it on or off (it is the viewer\'s)', () => {
    const c = createSceneConfig(appConfigContext);
    const old = JSON.parse(JSON.stringify(c.toJSON()));
    delete old.time.playlist;
    c.update({ time: { playlist: true } });
    c.replace(old);
    expect(c.get().time.playlist).toBe(false);
    c.update({ time: { playlist: true } });
    applyPreset(c, { ...LIBRARY[0].config, time: { ...LIBRARY[0].config.time, playlist: false } });
    expect(c.get().time.playlist).toBe(true);
    c.update({ time: { playlist: false } });
    applyPreset(c, { ...LIBRARY[1].config, time: { ...LIBRARY[1].config.time, playlist: true } });
    expect(c.get().time.playlist).toBe(false);
  });
});
