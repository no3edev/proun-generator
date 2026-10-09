import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSceneConfig, normalizeLocked } from '../src/config/SceneConfig.js';
import { generateLayout, buildCandidate } from '../src/generator/generate.js';
import { computeAABB, resolveCollisions } from '../src/generator/CollisionResolver.js';
import { SHAPE_LIMITS } from '../src/config/defaults.js';

const entry = (over = {}) => ({ position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: [1, 1.5, 2], hex: '#c1362b', ...over });
const ctx = (extra = {}) => ({
  shapeTypes: ['a', 'b'], paletteNames: ['p'], orientationNames: ['landscape'],
  defaultPalette: 'p', defaultOrientation: 'landscape', randomSeed: () => 1, ...extra
});
const make = (extra) => createSceneConfig(ctx(extra));

describe('normalizeLocked (stored locks are validated like any other stored value)', () => {
  it('accepts a well-formed list and lowercases the hex', () => {
    expect(normalizeLocked([entry({ hex: '#C1362B' })])).toEqual([entry({ hex: '#c1362b' })]);
  });
  it('rejects anything that is not a non-empty list within the count limit', () => {
    for (const bad of [null, undefined, 5, 'x', {}, [], new Array(SHAPE_LIMITS.count.max + 1).fill(entry())]) {
      expect(normalizeLocked(bad)).toBeNull();
    }
    expect(normalizeLocked(new Array(SHAPE_LIMITS.count.max).fill(entry()))).toHaveLength(SHAPE_LIMITS.count.max);
  });
  it('is all-or-nothing: one bad entry voids the lock (count and instances can never disagree)', () => {
    expect(normalizeLocked([entry(), entry({ hex: 'red' })])).toBeNull();
    expect(normalizeLocked([entry(), null])).toBeNull();
    expect(normalizeLocked([entry(), entry({ position: [1, 2] })])).toBeNull();
    expect(normalizeLocked([entry(), entry({ scale: [1, NaN, 1] })])).toBeNull();
    expect(normalizeLocked([entry(), entry({ rotation: [1, '2', 3] })])).toBeNull();
    expect(normalizeLocked([entry({ hex: '#12345' })])).toBeNull();
    expect(normalizeLocked([entry({ hex: '#gggggg' })])).toBeNull();
  });
  it('clamps absurd numbers into sane bounds', () => {
    const [e] = normalizeLocked([entry({ position: [1e9, -1e9, 0], scale: [0, -5, 1e9], rotation: [1e9, 0, 0] })]);
    expect(e.position[0]).toBe(50);
    expect(e.position[1]).toBe(-50);
    expect(e.scale).toEqual([0.001, 0.001, 100]);
    expect(e.rotation[0]).toBe(1000);
  });
});

describe('locking in the config', () => {
  it('a lock sets the instances and forces count to their number', () => {
    const c = make();
    c.update({ shapes: { a: { locked: [entry(), entry({ hex: '#222222' })] } } });
    expect(c.get().shapes.a.locked).toHaveLength(2);
    expect(c.get().shapes.a.count).toBe(2);
  });

  it('count patches are ignored while locked', () => {
    const c = make();
    c.update({ shapes: { a: { locked: [entry(), entry()] } } });
    c.update({ shapes: { a: { count: 9 } } });
    expect(c.get().shapes.a.count).toBe(2);
    c.update({ shapes: { a: { count: 0 } } });
    expect(c.get().shapes.a.count).toBe(2);
  });

  it('null unlocks and the count then follows the user again', () => {
    const c = make();
    c.update({ shapes: { a: { locked: [entry(), entry()] } } });
    c.update({ shapes: { a: { locked: null } } });
    expect(c.get().shapes.a.locked).toBeNull();
    expect(c.get().shapes.a.count).toBe(2); // stays 2 until changed
    c.update({ shapes: { a: { count: 5 } } });
    expect(c.get().shapes.a.count).toBe(5);
  });

  it('an invalid lock patch changes nothing (it does not unlock, nor half-lock)', () => {
    const c = make();
    expect(c.update({ shapes: { a: { locked: [entry({ hex: 'nope' })] } } })).toBe(false);
    expect(c.get().shapes.a.locked).toBeNull();
    c.update({ shapes: { a: { locked: [entry()] } } });
    const before = c.get();
    expect(c.update({ shapes: { a: { locked: [{ junk: true }] } } })).toBe(false);
    expect(c.get()).toBe(before);
  });

  it('locking one type leaves the others alone', () => {
    const c = make();
    c.update({ shapes: { a: { locked: [entry()] } } });
    expect(c.get().shapes.b.locked).toBeNull();
  });

  it('is deeply frozen like the rest of the config', () => {
    const c = make();
    c.update({ shapes: { a: { locked: [entry()] } } });
    expect(() => { c.get().shapes.a.locked[0].position[0] = 9; }).toThrow();
    expect(() => { c.get().shapes.a.locked.push(entry()); }).toThrow();
  });

  it('survives a JSON round trip exactly (presets, session, history)', () => {
    const a = make();
    a.update({ shapes: { a: { locked: [entry(), entry({ position: [0.123456789, -4.5, 7] })] } } });
    const b = make();
    b.replace(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.get().shapes.a.locked).toEqual(a.get().shapes.a.locked);
    expect(b.get().shapes.a.count).toBe(2);
  });

  describe('loading presets (replace)', () => {
    it('a preset that predates locks (or says nothing) UNlocks — it never inherits the current lock', () => {
      const c = make();
      c.update({ shapes: { a: { locked: [entry()] } } });
      c.replace({ shapes: { a: { count: 3 } } });
      expect(c.get().shapes.a.locked).toBeNull();
      expect(c.get().shapes.a.count).toBe(3);
    });

    it('a preset with a corrupt lock loads unlocked rather than failing or keeping the old one', () => {
      const c = make();
      c.update({ shapes: { a: { locked: [entry()] } } });
      c.replace({ shapes: { a: { count: 2, locked: [{ position: 'x' }] } } });
      expect(c.get().shapes.a.locked).toBeNull();
      expect(c.get().shapes.a.count).toBe(2);
    });

    it('a preset with a valid lock restores it', () => {
      const c = make();
      c.replace({ shapes: { a: { locked: [entry(), entry()] } } });
      expect(c.get().shapes.a.locked).toHaveLength(2);
      expect(c.get().shapes.a.count).toBe(2);
    });
  });
});

// ---------------------------------------------------------------- generator
const boxShape = (type, extra = {}) => ({
  type, facesCamera: false, localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
  randomScale: (rng) => new THREE.Vector3(0.6 + rng(), 0.6 + rng(), 0.6 + rng()), ...extra
});
const view = { depthAxis: new THREE.Vector3(4.2, 3.4, 5.2).normalize(), billboard: new THREE.Quaternion() };
const palette = { accents: ['#111111', '#222222', '#333333'], ink: '#000001' };
const settings = (over = {}) => ({ visible: true, count: 3, sizeMin: 1, sizeMax: 1, spread: 1, snapRotation: false, locked: null, ...over });
const gen = (config, shapeDefs) => generateLayout({ config, palette, shapeDefs, view });

describe('generating with locked shape types', () => {
  const defs = [boxShape('a'), boxShape('b')];
  const frozen = [
    entry({ position: [0.5, 0.5, 0.5], scale: [1, 1, 1], hex: '#abcdef' }),
    entry({ position: [-1, 0.2, 1], scale: [0.7, 0.9, 1.1], rotation: [0, 1, 0], hex: '#fedcba' })
  ];
  const cfg = (seed, lockA = frozen) => ({ seed, shapes: { a: settings({ count: lockA ? lockA.length : 3, locked: lockA }), b: settings({ count: 4 }) } });

  it('emits the stored instances verbatim, whatever the seed', () => {
    [1, 2, 3, 99, 4242].forEach((seed) => {
      const a = gen(cfg(seed), defs).filter((e) => e.type === 'a');
      expect(a).toHaveLength(2);
      a.forEach((e, i) => {
        expect(e.position).toEqual(frozen[i].position);
        expect(e.rotation).toEqual(frozen[i].rotation);
        expect(e.scale).toEqual(frozen[i].scale);
        expect(e.hex).toBe(frozen[i].hex);
        expect(e.index).toBe(i);
      });
    });
  });

  it('ignores the type\'s own size / spread / palette while locked', () => {
    const base = gen(cfg(5), defs).filter((e) => e.type === 'a');
    const changed = generateLayout({
      config: { seed: 5, shapes: { a: settings({ locked: frozen, count: 2, spread: 0, sizeMin: 9, sizeMax: 9 }), b: settings({ count: 4 }) } },
      palette: { accents: ['#ffffff'], ink: '#ffffff' }, shapeDefs: defs, view
    }).filter((e) => e.type === 'a');
    expect(changed).toEqual(base);
  });

  it('the unlocked types still re-roll with the seed', () => {
    const b1 = gen(cfg(1), defs).filter((e) => e.type === 'b');
    const b2 = gen(cfg(2), defs).filter((e) => e.type === 'b');
    expect(b1).not.toEqual(b2);
  });

  it('is deterministic', () => {
    expect(gen(cfg(7), defs)).toEqual(gen(cfg(7), defs));
  });

  it('the others are placed around the locked shapes (fixed obstacles)', () => {
    // A huge locked box at the origin that nearly every other shape starts inside.
    // The resolver is capped (8 attempts per shape — a documented limit), so it
    // isn't a guarantee of zero overlap; what must hold is that the locked box
    // really is treated as an obstacle and most of the overlap goes away.
    const big = [entry({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [3, 3, 3] })];
    const lockedBox = computeAABB(defs[0].localHalfExtents, new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(3, 3, 3));
    const hitsLocked = (e) => computeAABB(
      defs[1].localHalfExtents, new THREE.Vector3(...e.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...e.rotation)), new THREE.Vector3(...e.scale)
    ).intersectsBox(lockedBox);

    let before = 0;
    let after = 0;
    for (let seed = 0; seed < 40; seed++) {
      const config = { seed, shapes: { a: settings({ count: 1, locked: big }), b: settings({ count: 3 }) } };
      for (let i = 0; i < 3; i++) {
        const raw = buildCandidate({ seed, shape: defs[1], index: i, settings: config.shapes.b, accents: palette.accents, billboard: view.billboard });
        if (hitsLocked({ position: raw.position.toArray(), rotation: [raw.rotation.x, raw.rotation.y, raw.rotation.z], scale: raw.scale.toArray() })) before++;
      }
      after += gen(config, defs).filter((e) => e.type === 'b' && hitsLocked(e)).length;
    }
    expect(before).toBeGreaterThan(90);          // the scenario really is crowded
    expect(after).toBeLessThan(before * 0.3);    // and the locked shape is respected
  });
});

describe('CollisionResolver with fixed candidates', () => {
  const cand = (pos, scale, fixed) => {
    const position = new THREE.Vector3(...pos);
    const s = new THREE.Vector3(scale, scale, scale);
    return { position, fixed, box: computeAABB({ x: 0.5, y: 0.5, z: 0.5 }, position, new THREE.Quaternion(), s) };
  };
  const axis = new THREE.Vector3(4.2, 3.4, 5.2).normalize();

  it('never moves a fixed candidate, even a small one that a larger shape lands on', () => {
    const small = cand([0, 0, 0], 0.5, true);
    const big = cand([0, 0, 0], 3, false);
    const before = small.position.clone();
    resolveCollisions([small, big], axis);
    expect(small.position.equals(before)).toBe(true);
    expect(big.position.length()).toBeGreaterThan(0); // the big one yielded
    expect(big.box.intersectsBox(small.box)).toBe(false);
  });

  it('without any fixed candidate, behaves as before (largest placed first)', () => {
    const small = cand([0, 0, 0], 0.5, false);
    const big = cand([0, 0, 0], 3, false);
    resolveCollisions([small, big], axis);
    expect(big.position.length()).toBe(0);      // the biggest keeps its place
    expect(small.position.length()).toBeGreaterThan(0);
  });

  it('several fixed candidates all stay put', () => {
    const f = [cand([0, 0, 0], 1, true), cand([0.2, 0, 0], 1, true)]; // overlapping each other: still fixed
    const free = cand([0.1, 0, 0], 1, false);
    const snap = f.map((c) => c.position.clone());
    resolveCollisions([...f, free], axis);
    f.forEach((c, i) => expect(c.position.equals(snap[i])).toBe(true));
  });
});
