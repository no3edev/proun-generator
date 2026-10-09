import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { generateLayout, buildCandidate } from '../src/generator/generate.js';
import { mulberry32 } from '../src/generator/rng.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';

vi.mock('../src/texture/PigmentLayer.js', async () => {
  const T = await import('three');
  return { pickStructureTexture: () => new T.Texture() };
});
const rod = (await import('../src/shapes/rod.js')).default;
const { shapeRegistry } = await import('../src/shapes/registry.js');

const palette = { accents: ['#c1362b', '#8f8a7c', '#3a3a38'], ink: '#201d18' };
const view = { depthAxis: new THREE.Vector3(4.2, 3.4, 5.2).normalize(), billboard: new THREE.Quaternion() };
const settings = (over = {}) => ({ visible: true, count: 3, sizeMin: 1, sizeMax: 1, spread: 1, snapRotation: false, locked: null, ...over });
const box = (type, extra = {}) => ({
  type, facesCamera: false, localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
  randomScale: (rng) => new THREE.Vector3(0.6 + rng(), 0.6 + rng(), 0.6 + rng()), ...extra
});

describe('the rod shape', () => {
  it('is registered, and declares its three differences from the other shapes', () => {
    expect(shapeRegistry).toContain(rod);
    expect(rod.colorRole).toBe('ink');
    expect(rod.collides).toBe(false);
    expect(rod.defaults).toEqual({ count: 0 });
  });

  it('is long on exactly one axis and hair-thin on the other two', () => {
    const rng = mulberry32(3);
    const longAxes = new Set();
    for (let i = 0; i < 300; i++) {
      const s = rod.randomScale(rng).toArray();
      const long = s.filter((v) => v >= 2.2);
      const thin = s.filter((v) => v < 0.1);
      expect(long).toHaveLength(1);
      expect(thin).toHaveLength(2);
      expect(Math.max(...s)).toBeLessThanOrEqual(4.8);
      longAxes.add(s.indexOf(long[0]));
    }
    expect(longAxes.size).toBe(3); // horizontal, vertical and into-the-depth all occur
  });

  it('starts out off in the real defaults, so existing compositions are unchanged', () => {
    const c = createSceneConfig({
      shapeTypes: ['sphere', 'rod'], paletteNames: ['p'], orientationNames: ['landscape'],
      defaultPalette: 'p', defaultOrientation: 'landscape', shapeDefaults: { rod: rod.defaults }
    });
    expect(c.get().shapes.rod.count).toBe(0);
    expect(c.get().shapes.sphere.count).toBe(1);
  });
});

describe('colorRole "ink"', () => {
  const ink = box('line', { colorRole: 'ink' });
  const accent = box('thing');

  it('uses the palette ink, every time; other shapes keep drawing accents', () => {
    for (let seed = 0; seed < 30; seed++) {
      const layout = generateLayout({
        config: { seed, shapes: { line: settings(), thing: settings() } },
        palette, shapeDefs: [ink, accent], view
      });
      layout.filter((e) => e.type === 'line').forEach((e) => expect(e.hex).toBe(palette.ink));
      layout.filter((e) => e.type === 'thing').forEach((e) => expect(palette.accents).toContain(e.hex));
    }
  });

  it('does not change the rest of the shape\'s random stream (only its color)', () => {
    const args = { seed: 9, index: 0, settings: settings(), accents: palette.accents, ink: palette.ink, billboard: view.billboard };
    const asInk = buildCandidate({ ...args, shape: box('x', { colorRole: 'ink' }) });
    const asAccent = buildCandidate({ ...args, shape: box('x') });
    expect(asInk.position.toArray()).toEqual(asAccent.position.toArray());
    expect(asInk.scale.toArray()).toEqual(asAccent.scale.toArray());
    expect(asInk.hex).toBe(palette.ink);
    expect(palette.accents).toContain(asAccent.hex);
  });

  it('follows the palette (a palette without an ink falls back to an accent)', () => {
    const c = buildCandidate({ seed: 1, index: 0, settings: settings(), accents: ['#123456'], billboard: view.billboard, shape: box('x', { colorRole: 'ink' }) });
    expect(c.hex).toBe('#123456');
  });
});

describe('collides: false', () => {
  const solid = [box('a'), box('b')];
  const withRods = [...solid, box('line', { collides: false })];
  const cfg = (seed, rods) => ({ seed, shapes: { a: settings({ count: 3 }), b: settings({ count: 3 }), ...(rods === undefined ? {} : { line: settings({ count: rods }) }) } });

  it('adding rods never moves any other shape (they are not obstacles)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const without = generateLayout({ config: cfg(seed, 0), palette, shapeDefs: withRods, view });
      const withSome = generateLayout({ config: cfg(seed, 8), palette, shapeDefs: withRods, view });
      expect(withSome.filter((e) => e.type !== 'line')).toEqual(without);
    }
  });

  it('rods are not pushed either: they stay exactly where they were generated', () => {
    for (let seed = 0; seed < 10; seed++) {
      const layout = generateLayout({ config: cfg(seed, 5), palette, shapeDefs: withRods, view });
      layout.filter((e) => e.type === 'line').forEach((e) => {
        const raw = buildCandidate({
          seed, shape: withRods[2], index: e.index, settings: settings(), accents: palette.accents, ink: palette.ink, billboard: view.billboard
        });
        expect(e.position).toEqual(raw.position.toArray());
      });
    }
  });

  it('shapes without the flag still collide (default true)', () => {
    const noFlag = [box('a'), box('b')];
    const layout = generateLayout({ config: cfg(3, undefined), palette, shapeDefs: noFlag, view });
    expect(layout).toHaveLength(6);
  });
});
