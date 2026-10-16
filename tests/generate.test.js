import { describe, it, expect } from 'vitest';
import { buildCandidate } from '../src/generator/generate.js';
import { computeAABB } from '../src/generator/CollisionResolver.js';
import { ROTATION_SNAP, SHAPE_DEFAULTS } from '../src/config/defaults.js';
import { each, makeConfig, layoutOf, screenPos, shapeRegistry, palettes, billboard, DEFAULT_PALETTE } from './helpers/scene.js';

const byType = (layout, type) => layout.filter((e) => e.type === type);
const shapeOf = (type) => shapeRegistry.find((s) => s.type === type);

describe('generateLayout: seeds and structure', () => {
  it('is a pure function of its inputs', () => {
    const cfg = makeConfig(42, each(3, { rod: 2 }));
    expect(layoutOf(cfg)).toEqual(layoutOf(cfg));
  });

  it('different seeds give different compositions', () => {
    expect(layoutOf(makeConfig(1, each(1)))).not.toEqual(layoutOf(makeConfig(2, each(1))));
  });

  it('is ordered by registry order, then index, and honours counts (0 = none)', () => {
    const layout = layoutOf(makeConfig(9, { circle: 2, 'cube-fixed': 3 }));
    expect(layout.map((e) => `${e.type}:${e.index}`)).toEqual([
      'cube-fixed:0', 'cube-fixed:1', 'cube-fixed:2', 'circle:0', 'circle:1'
    ]);
  });

  it('does not read `visible`: hidden shapes keep evolving underneath', () => {
    const shown = makeConfig(4, each(1));
    const hidden = makeConfig(4, each(1), { shape: { visible: false } });
    expect(layoutOf(hidden)).toEqual(layoutOf(shown));
  });

  it('draws colours from the palette: accents, and the ink for ink-role shapes', () => {
    const pal = palettes[DEFAULT_PALETTE];
    const layout = layoutOf(makeConfig(21, each(3, { rod: 3 })));
    layout.forEach((e) => {
      if (shapeOf(e.type).colorRole === 'ink') expect(e.hex).toBe(pal.ink);
      else expect(pal.accents).toContain(e.hex);
    });
  });

  it('an instance\'s raw candidate depends only on (seed, type, index), not on other types', () => {
    const args = { seed: 5, shape: shapeOf('triangle'), index: 0, settings: SHAPE_DEFAULTS, accents: ['#111111', '#222222'], ink: '#000000', billboard };
    const a = buildCandidate(args);
    const b = buildCandidate({ ...args });
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.scale.toArray()).toEqual(b.scale.toArray());
    expect(a.hex).toBe(b.hex);
  });

  it('collision resolution only ever moves a shape along the depth axis: its place on screen is its generated place', () => {
    const base = layoutOf(makeConfig(5, each(1)));
    const crowded = layoutOf(makeConfig(5, { ...each(1), sphere: 4, 'cube-variable': 4 }));
    for (const type of ['cube-fixed', 'triangle', 'plane']) {
      const a = screenPos(byType(base, type)[0].position);
      const b = screenPos(byType(crowded, type)[0].position);
      a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
    }
  });
});

describe('generateLayout: options', () => {
  it('snapRotation rounds every angle to a multiple of 45 degrees and changes nothing else (before resolution)', () => {
    const make = (snapRotation) => buildCandidate({
      seed: 77, shape: shapeOf('plane'), index: 1, settings: { ...SHAPE_DEFAULTS, snapRotation },
      accents: ['#aaaaaa', '#bbbbbb', '#cccccc'], billboard
    });
    const free = make(false), snapped = make(true);
    for (const a of [snapped.rotation.x, snapped.rotation.y, snapped.rotation.z]) {
      expect(Math.abs(a / ROTATION_SNAP - Math.round(a / ROTATION_SNAP))).toBeLessThan(1e-9);
    }
    expect(snapped.position.toArray()).toEqual(free.position.toArray());
    expect(snapped.scale.toArray()).toEqual(free.scale.toArray());
    expect(snapped.hex).toBe(free.hex);
  });

  it('size and spread scale a candidate: sizeMin..sizeMax multiplies the scale, spread bounds the position', () => {
    const cube = shapeOf('cube-fixed');
    const mk = (settings) => buildCandidate({ seed: 3, shape: cube, index: 0, settings: { ...SHAPE_DEFAULTS, ...settings }, accents: ['#999999'], billboard });
    const one = mk({}), big = mk({ sizeMin: 2, sizeMax: 2 });
    expect(big.scale.x / one.scale.x).toBeCloseTo(2, 9);
    expect(mk({ spread: 0 }).position.toArray().map((v) => v + 0)).toEqual([0, 0, 0]); // `+ 0`: -0 -> 0
  });

  it('a locked type is replayed verbatim, its count is the number of stored instances, and others are resolved around it', () => {
    const locked = [
      { position: [0, 0, 0], rotation: [0, 0, 0], scale: [3, 3, 3], hex: '#123456' },
      { position: [1, 1, 1], rotation: [0.1, 0.2, 0.3], scale: [1, 2, 1], hex: '#654321' }
    ];
    const cfg = makeConfig(8, each(2), { perType: { 'cube-fixed': { locked, count: 99 } } });
    const layout = layoutOf(cfg);
    const cubes = byType(layout, 'cube-fixed');
    expect(cubes).toHaveLength(2);
    cubes.forEach((c, i) => {
      expect(c.position).toEqual(locked[i].position);
      expect(c.rotation).toEqual(locked[i].rotation);
      expect(c.scale).toEqual(locked[i].scale);
      expect(c.hex).toBe(locked[i].hex);
    });
    // seed no longer affects a locked type
    expect(byType(layoutOf({ ...cfg, seed: 9 }), 'cube-fixed')).toEqual(cubes);
  });

  it('a rod (collides: false) is never pushed: it keeps its raw generated position', () => {
    const cfg = makeConfig(14, each(3, { rod: 3 }));
    const rods = byType(layoutOf(cfg), 'rod');
    rods.forEach((r) => {
      const raw = buildCandidate({
        seed: 14, shape: shapeOf('rod'), index: r.index, settings: cfg.shapes.rod,
        accents: palettes[DEFAULT_PALETTE].accents, ink: palettes[DEFAULT_PALETTE].ink, billboard
      });
      expect(r.position).toEqual(raw.position.toArray());
    });
  });

  it('a camera-facing shape (circle) is bounded with the billboard orientation, whatever rotation was drawn', () => {
    const circle = shapeOf('circle');
    const c = buildCandidate({ seed: 6, shape: circle, index: 0, settings: SHAPE_DEFAULTS, accents: ['#999999'], billboard });
    const expected = computeAABB(circle.localHalfExtents, c.position, billboard, c.scale);
    expect(c.box.min.distanceTo(expected.min)).toBeLessThan(1e-9);
    expect(c.box.max.distanceTo(expected.max)).toBeLessThan(1e-9);
  });
});
