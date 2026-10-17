import { describe, it, expect, beforeEach } from 'vitest';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { encodeShare, decodeShare, buildShareUrl } from '../src/config/share.js';
import { PresetStore } from '../src/presets/PresetStore.js';
import { loadSession, saveSession } from '../src/config/session.js';
import { createHistory } from '../src/config/History.js';
import { SHAPE_DEFAULTS } from '../src/config/defaults.js';
import { STRATEGY_NAMES } from '../src/generator/strategies/index.js';

// The composition strategy has to survive every way a scene is stored or
// handed on: presets, share links, the session, history. (Nothing tested these
// before the strategy work; they are the modules a new config field can
// silently fall out of.)

const ctx = () => ({
  shapeTypes: ['cube', 'rod'],
  paletteNames: ['A', 'B'],
  orientationNames: ['landscape', 'square'],
  defaultPalette: 'A',
  defaultOrientation: 'landscape',
  randomSeed: () => 1234,
  shapeDefaults: { rod: { count: 0 } },
  strategyNames: ['legacy', 'axis-thrust']
});
const withStrategy = (strategy) => {
  const c = createSceneConfig(ctx());
  c.update({ seed: 77, palette: 'B', composition: { strategy }, shapes: { cube: { count: 3 } } });
  return c;
};

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

describe('share links', () => {
  it('carry a non-legacy strategy and restore it', () => {
    const c = withStrategy('axis-thrust');
    const patch = decodeShare(new URL(buildShareUrl(c.get(), 'http://x.test/')).hash);
    expect(patch.composition).toEqual({ strategy: 'axis-thrust' });
    const d = createSceneConfig(ctx());
    d.update(patch);
    expect(d.get().composition.strategy).toBe('axis-thrust');
    expect(d.get().seed).toBe(77);
  });

  it('a legacy link is byte-for-byte what it was before strategies existed (no new key)', () => {
    const payload = JSON.parse(Buffer.from(encodeShare(withStrategy('legacy').get()).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    expect(Object.keys(payload)).not.toContain('c');
  });

  it('a link without a strategy means legacy, not the strategy the viewer has selected', () => {
    const link = decodeShare(new URL(buildShareUrl(withStrategy('legacy').get(), 'http://x.test/')).hash);
    expect(link.composition).toEqual({ strategy: 'legacy' });
    const viewer = withStrategy('axis-thrust');
    viewer.update(link);
    expect(viewer.get().composition.strategy).toBe('legacy');
  });
});

describe('presets', () => {
  beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

  it('save and load keep the strategy', () => {
    const c = withStrategy('axis-thrust');
    const rec = PresetStore.save('thrust', c.toJSON());
    expect(rec.composition).toEqual({ strategy: 'axis-thrust' });
    const d = createSceneConfig(ctx());
    d.replace(PresetStore.get(rec.id));
    expect(d.get().composition.strategy).toBe('axis-thrust');
    expect(d.get().seed).toBe(77);
  });

  it('a preset saved before strategies existed loads as legacy', () => {
    localStorage.setItem('proun-presets-v1', JSON.stringify([{
      id: 'old', version: 2, seed: 5, name: 'Old', createdAt: '2026-01-01T00:00:00.000Z',
      palette: 'A', orientation: 'landscape', time: {}, shapes: { cube: { ...SHAPE_DEFAULTS, count: 2 } }
    }]));
    const rec = PresetStore.get('old');
    expect(rec.composition).toBeUndefined();
    const d = createSceneConfig(ctx());
    d.update({ composition: { strategy: 'axis-thrust' } });
    d.replace(rec);
    expect(d.get().composition.strategy).toBe('legacy');
  });

  it('export and import keep the strategy', () => {
    const rec = PresetStore.save('thrust', withStrategy('axis-thrust').toJSON());
    const json = PresetStore.exportOne(rec.id);
    globalThis.localStorage = new MemoryStorage();
    expect(PresetStore.importJSON(json).imported).toBe(1);
    expect(PresetStore.list()[0].composition).toEqual({ strategy: 'axis-thrust' });
  });
});

describe('session and history', () => {
  it('a saved session restores the strategy', () => {
    const storage = new MemoryStorage();
    saveSession(storage, withStrategy('axis-thrust').toJSON());
    const d = createSceneConfig(ctx());
    d.replace(loadSession(storage));
    expect(d.get().composition.strategy).toBe('axis-thrust');
  });

  it('back and forward restore the strategy a composition was made with', () => {
    const c = createSceneConfig(ctx());
    const h = createHistory(c);
    h.start();
    c.update({ seed: 1 });
    c.update({ composition: { strategy: 'axis-thrust' }, seed: 2 });
    expect(c.get().composition.strategy).toBe('axis-thrust');
    expect(h.back()).toBe(true);
    expect(c.get().seed).toBe(1);
    expect(c.get().composition.strategy).toBe('legacy');
    expect(h.forward()).toBe(true);
    expect(c.get().seed).toBe(2);
    expect(c.get().composition.strategy).toBe('axis-thrust');
  });

  it('switching strategy on the same seed is a new step (it is a different picture)', () => {
    const c = createSceneConfig(ctx());
    const h = createHistory(c);
    h.start();
    expect(h.size()).toBe(1);
    c.update({ composition: { strategy: 'axis-thrust' } });
    expect(h.size()).toBe(2);
    h.back();
    expect(c.get().composition.strategy).toBe('legacy');
    expect(c.get().seed).toBe(1234);
  });

  it('recolouring the same composition is not a new step', () => {
    const c = createSceneConfig(ctx());
    const h = createHistory(c);
    h.start();
    c.update({ palette: 'B' });
    expect(h.size()).toBe(1);
  });
});

describe('shape types added after a preset or link was made (the beam)', () => {
  const enabled = () => {
    const c = createSceneConfig(ctx());
    c.update({ shapes: { rod: { count: 3 } } }); // a type that starts off, switched on by the viewer
    return c;
  };

  it('an older preset that never mentioned the type turns it off, so it restores its own composition', () => {
    const c = enabled();
    c.replace({ version: 2, seed: 5, palette: 'A', orientation: 'landscape', time: {}, shapes: { cube: { count: 2 } } });
    expect(c.get().shapes.rod.count).toBe(0);
  });

  it('an older share link that never listed the type turns it off for the viewer too', async () => {
    const { restoreConfig } = await import('../src/config/boot.js');
    const link = buildShareUrl(createSceneConfig(ctx()).get(), 'http://x.test/');
    // the link as it was before the rod existed: no `rod` entry
    const payload = JSON.parse(Buffer.from(new URL(link).hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    delete payload.h.rod;
    const old = '#s=' + Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const viewer = enabled();
    expect(viewer.get().shapes.rod.count).toBe(3);
    const r = restoreConfig(viewer, { storage: new MemoryStorage(), hash: old });
    expect(r.source).toBe('link');
    expect(viewer.get().shapes.rod.count).toBe(0);
  });
});

describe('every registered composition strategy', () => {
  // the real registry (not the fake one above): a new strategy must survive links, presets and history without more wiring
  it.each(STRATEGY_NAMES)('%s: survives a share link, a preset, and back/forward', (name) => {
    const real = () => ({ ...ctx(), strategyNames: STRATEGY_NAMES });
    const c = createSceneConfig(real());
    c.update({ seed: 31, composition: { strategy: name } });
    expect(c.get().composition.strategy).toBe(name);

    const viaLink = createSceneConfig(real());
    viaLink.update(decodeShare(new URL(buildShareUrl(c.get(), 'http://x.test/')).hash));
    expect(viaLink.get().composition.strategy).toBe(name);

    globalThis.localStorage = new MemoryStorage();
    const rec = PresetStore.save('p', c.toJSON());
    const viaPreset = createSceneConfig(real());
    viaPreset.replace(PresetStore.get(rec.id));
    expect(viaPreset.get().composition.strategy).toBe(name);

    const h = createHistory(c);
    h.start();
    c.update({ composition: { strategy: 'legacy' } });
    expect(c.get().composition.strategy).toBe('legacy');
    h.back();
    expect(c.get().composition.strategy).toBe(name);
  });
});
