import { describe, it, expect } from 'vitest';
import { restoreConfig } from '../src/config/boot.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { encodeShare } from '../src/config/share.js';
import { SESSION_KEY } from '../src/config/session.js';

const ctx = () => ({
  shapeTypes: ['cube', 'sphere'],
  paletteNames: ['warm', 'cool'],
  orientationNames: ['landscape', 'portrait'],
  defaultPalette: 'warm',
  defaultOrientation: 'landscape',
  randomSeed: () => 111
});
const make = () => createSceneConfig(ctx());
const storageWith = (value) => ({
  getItem: (k) => (k === SESSION_KEY ? value : null),
  setItem() {}
});
const sessionOf = (patch) => {
  const c = make();
  c.update(patch);
  return storageWith(JSON.stringify(c.toJSON()));
};
const linkOf = (patch) => {
  const c = make();
  c.update(patch);
  return `#s=${encodeShare(c.get())}`;
};

describe('restoreConfig priority: link > session > defaults', () => {
  it('uses the defaults when there is neither', () => {
    const c = make();
    const before = c.get();
    expect(restoreConfig(c, { storage: storageWith(null), hash: '' })).toEqual({ source: 'default', hadLink: false });
    expect(c.get()).toBe(before);
  });

  it('restores the session, seed included (a reload brings back the same composition)', () => {
    const c = make();
    const r = restoreConfig(c, {
      storage: sessionOf({ seed: 777, palette: 'cool', orientation: 'portrait', shapes: { sphere: { count: 4 } }, time: { durationMs: 3000, autoAdvance: true } }),
      hash: ''
    });
    expect(r.source).toBe('session');
    expect(c.get()).toMatchObject({ seed: 777, palette: 'cool', orientation: 'portrait' });
    expect(c.get().shapes.sphere.count).toBe(4);
    expect(c.get().time).toMatchObject({ durationMs: 3000, autoAdvance: true });
  });

  it('a link wins over the session for the composition…', () => {
    const c = make();
    const r = restoreConfig(c, {
      storage: sessionOf({ seed: 777, palette: 'cool', shapes: { sphere: { count: 4 } } }),
      hash: linkOf({ seed: 999, palette: 'warm', orientation: 'portrait', shapes: { sphere: { count: 2 } } })
    });
    expect(r).toEqual({ source: 'link', hadLink: true });
    expect(c.get()).toMatchObject({ seed: 999, palette: 'warm', orientation: 'portrait' });
    expect(c.get().shapes.sphere.count).toBe(2);
  });

  it('…but the viewer keeps their own timing from the session', () => {
    const c = make();
    restoreConfig(c, {
      storage: sessionOf({ time: { durationMs: 4000, intervalMs: 9000, autoAdvance: true } }),
      hash: linkOf({ seed: 5 })
    });
    expect(c.get().time).toEqual({ durationMs: 4000, intervalMs: 9000, autoAdvance: true });
  });

  it('a link works with no session at all', () => {
    const c = make();
    expect(restoreConfig(c, { storage: null, hash: linkOf({ seed: 31337, palette: 'cool' }) }).source).toBe('link');
    expect(c.get()).toMatchObject({ seed: 31337, palette: 'cool' });
  });
});

describe('restoreConfig with bad input', () => {
  it('an invalid link is ignored, the session still applies, and hadLink is reported (so the URL gets cleaned)', () => {
    const c = make();
    const r = restoreConfig(c, { storage: sessionOf({ seed: 777 }), hash: '#s=garbage!!' });
    expect(r).toEqual({ source: 'session', hadLink: true });
    expect(c.get().seed).toBe(777);
  });

  it('a corrupt session is ignored', () => {
    for (const bad of ['{nope', '[]', '5', 'null']) {
      const c = make();
      const before = c.get();
      expect(restoreConfig(c, { storage: storageWith(bad), hash: '' }).source).toBe('default');
      expect(c.get()).toBe(before);
    }
  });

  it('a hash that is not a share link is left alone (hadLink false)', () => {
    const c = make();
    expect(restoreConfig(c, { storage: null, hash: '#section-2' })).toEqual({ source: 'default', hadLink: false });
  });

  it('a legacy v1 session (no seed) loads its settings with a fresh seed', () => {
    const c = make();
    const v1 = JSON.stringify({ version: 1, palette: 'cool', shapes: { cube: { count: 3 } } });
    expect(restoreConfig(c, { storage: storageWith(v1), hash: '' }).source).toBe('session');
    expect(c.get()).toMatchObject({ palette: 'cool', seed: 111 });
    expect(c.get().shapes.cube.count).toBe(3);
  });

  it('a hostile session cannot put the config out of range', () => {
    const c = make();
    restoreConfig(c, {
      storage: storageWith(JSON.stringify({ seed: 1, time: { durationMs: -9, intervalMs: 0 }, shapes: { cube: { count: 1e9, spread: -3 } } })),
      hash: ''
    });
    expect(c.get().time.durationMs).toBe(200);
    expect(c.get().time.intervalMs).toBe(500);
    expect(c.get().shapes.cube).toMatchObject({ count: 12, spread: 0 });
  });
});
