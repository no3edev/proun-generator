import { describe, it, expect } from 'vitest';
import beam, { BEAM_SHADE_MULTIPLIERS } from '../src/shapes/beam.js';
import { getShape } from '../src/shapes/registry.js';
import { createRng } from '../src/generator/rng.js';
import { each, makeConfig, layoutOf, shapeRegistry } from './helpers/scene.js';

const axisCfg = (seed, counts, opts) => ({ ...makeConfig(seed, counts, opts), composition: { strategy: 'axis-thrust' }, orientation: 'landscape' });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const without = (counts, ...types) => ({ ...counts, ...Object.fromEntries(types.map((t) => [t, 0])) });

describe('beam: the shape', () => {
  it('is registered, with the documented contract', () => {
    expect(getShape('beam')).toBe(beam);
    expect(beam.label).toBe('Beam');
    expect(beam.facesCamera).toBe(false);
    expect(beam.localHalfExtents).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
    // starts off, like the rod, so existing compositions are unchanged
    expect(beam.defaults).toEqual({ count: 0 });
    expect(beam.collides).toBeUndefined(); // a beam is a solid: it pushes and is pushed
    expect(beam.colorRole).toBeUndefined(); // and takes an accent like any solid
  });

  it('is always a beam: local x is the length, 5+ times the section, section 0.11-0.30 by 0.7-1.6 of it', () => {
    for (let i = 0; i < 300; i++) {
      const s = beam.randomScale(createRng(7, 'beam', 'scale', i));
      expect(s.x).toBeGreaterThanOrEqual(2.6);
      expect(s.x).toBeLessThanOrEqual(5.0);
      expect(s.y).toBeGreaterThanOrEqual(0.11);
      expect(s.y).toBeLessThanOrEqual(0.3);
      expect(s.z / s.y).toBeGreaterThanOrEqual(0.7);
      expect(s.z / s.y).toBeLessThanOrEqual(1.6);
      expect(s.x / Math.max(s.y, s.z)).toBeGreaterThan(5);
      expect(s.x / Math.min(s.y, s.z)).toBeLessThan(70);
    }
  });

  it('draws only from the rng it is given (seeds reproduce)', () => {
    const a = beam.randomScale(createRng(3, 'beam', 'x', 0)).toArray();
    const b = beam.randomScale(createRng(3, 'beam', 'x', 0)).toArray();
    expect(a).toEqual(b);
  });

  it('shades its ends darkest and spreads its long faces more than a plain box does', () => {
    // BoxGeometry face order: +x -x +y -y +z -z; local x is the length
    const [px, nx, py, ny, pz, nz] = BEAM_SHADE_MULTIPLIERS;
    const longFaces = [py, ny, pz, nz];
    expect(Math.min(px, nx)).toBeLessThanOrEqual(Math.min(...longFaces));
    expect(Math.max(...BEAM_SHADE_MULTIPLIERS) / Math.min(...BEAM_SHADE_MULTIPLIERS)).toBeGreaterThanOrEqual(1.8);
    expect(py).toBe(Math.max(...BEAM_SHADE_MULTIPLIERS)); // top is the light face
  });
});

describe('beam: in the legacy generator (off by default, usable when enabled)', () => {
  it('adding the beam type leaves every other type\'s generated candidate alone', () => {
    const base = layoutOf(makeConfig(9, each(1)));
    const withBeams = layoutOf(makeConfig(9, each(1, { beam: 3 })));
    expect(withBeams.filter((e) => e.type === 'beam')).toHaveLength(3);
    // independent streams: the beam does not consume anyone else's draws
    expect(withBeams.filter((e) => e.type !== 'beam').map((e) => `${e.type}:${e.index}:${e.hex}`))
      .toEqual(base.map((e) => `${e.type}:${e.index}:${e.hex}`));
  });

  it('a legacy beam gets beam proportions from randomScale, times the size setting', () => {
    const L = layoutOf(makeConfig(4, { beam: 4 }, { shape: { sizeMin: 1.5, sizeMax: 1.5 } }));
    L.forEach((e) => {
      expect(e.scale[0]).toBeGreaterThanOrEqual(2.6 * 1.5 - 1e-9);
      expect(e.scale[0]).toBeLessThanOrEqual(5.0 * 1.5 + 1e-9);
    });
  });

  it('is reproducible', () => {
    expect(layoutOf(makeConfig(5, each(1, { beam: 2 })))).toEqual(layoutOf(makeConfig(5, each(1, { beam: 2 }))));
  });
});

describe('beam: in Axis thrust', () => {
  const beamOnly = (seed) => axisCfg(seed, without(each(1, { beam: 1 }), 'cube-variable', 'plane'));

  it('when enabled, the bars are beams: 2-3 of them, one possibly crossing the axis', () => {
    SEEDS.forEach((seed) => {
      const bars = layoutOf(beamOnly(seed)).filter((e) => e.role === 'support' || e.role === 'connector');
      expect(bars.length).toBeGreaterThanOrEqual(2);
      expect(bars.length).toBeLessThanOrEqual(3);
      bars.forEach((e) => expect(e.type).toBe('beam'));
    });
    expect(SEEDS.some((seed) => layoutOf(beamOnly(seed)).some((e) => e.role === 'support'))).toBe(true);
  });

  it('they are real beams: 6-40 times as long as thick', () => {
    SEEDS.forEach((seed) => layoutOf(beamOnly(seed)).filter((e) => e.role === 'support').forEach((e) => {
      const aspect = e.scale[0] / Math.max(e.scale[1], e.scale[2]);
      expect(aspect, `seed ${seed}`).toBeGreaterThan(6);
      expect(aspect, `seed ${seed}`).toBeLessThan(40);
    }));
  });

  it('they are chunkier than the stand-in boxes (a beam is not a stripe)', () => {
    const section = (e) => Math.max(e.scale[1], e.scale[2]);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const beams = SEEDS.flatMap((seed) => layoutOf(beamOnly(seed)).filter((e) => e.role === 'support').map(section));
    const boxes = SEEDS.flatMap((seed) => layoutOf(axisCfg(seed, without(each(1), 'plane'))).filter((e) => e.role === 'support').map(section));
    expect(mean(beams)).toBeGreaterThan(mean(boxes) * 1.1);
  });

  it('without the beam type enabled, the strategy composes exactly as before (boxes and planks stand in)', () => {
    SEEDS.forEach((seed) => {
      const L = layoutOf(axisCfg(seed, each(1)));
      expect(L.some((e) => e.type === 'beam')).toBe(false);
    });
  });

  it('stays one dominant axis, one anchor and one saturated hue with beams on', () => {
    SEEDS.slice(0, 20).forEach((seed) => {
      const L = layoutOf(beamOnly(seed));
      expect(L.filter((e) => e.role === 'anchor')).toHaveLength(1);
    });
  });

  it('with only beams enabled it still composes (no anchor type: the beams carry the scene)', () => {
    const L = layoutOf(axisCfg(3, { beam: 1 }));
    expect(L.length).toBeGreaterThan(0);
    L.forEach((e) => expect(e.type).toBe('beam'));
  });
});

describe('beam: registry-wide', () => {
  it('every registered shape still satisfies the contract', () => {
    shapeRegistry.forEach((s) => {
      expect(typeof s.type).toBe('string');
      expect(typeof s.label).toBe('string');
      ['x', 'y', 'z'].forEach((a) => expect(s.localHalfExtents[a]).toBeGreaterThan(0));
      const sc = s.randomScale(createRng(1, s.type, 'contract', 0));
      [sc.x, sc.y, sc.z].forEach((v) => { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThan(0); });
    });
    expect(new Set(shapeRegistry.map((s) => s.type)).size).toBe(shapeRegistry.length);
  });
});

describe('beam: hairlines when only beams are enabled', () => {
  it('a very thin beam stands in for the hairline, so the details are not lost', () => {
    SEEDS.slice(0, 20).forEach((seed) => {
      const L = layoutOf(axisCfg(seed, { beam: 1, circle: 1 }));
      const details = L.filter((e) => e.role === 'detail');
      expect(details.length).toBeGreaterThanOrEqual(1);
      details.forEach((d) => {
        expect(d.type).toBe('beam');
        expect(Math.max(d.scale[1], d.scale[2])).toBeLessThan(0.15); // hairline-thin
      });
    });
  });
});
